// Pure save-zip helpers for savepull. A zip may name files the way the game
// stores them (Base64 of UTF-16LE) or with the decoded save_* names the
// downloader writes. Anything else is rejected.
import zlib from 'node:zlib';

// Same shape the game and the save importer use. Keys may contain
// underscores (save_boss_raid_1.0); dots and slashes stay out.
const SAVE_NAME = /^save_\w+_1\.[01]$/;
const MAX_ENTRY = 2 * 1024 * 1024;
const MAX_TOTAL = 8 * 1024 * 1024;

export function deviceFileName(logical) {
  const name = Buffer.from(logical, 'utf16le').toString('base64');
  if (!name || /[/\\\0]/.test(name)) throw new Error(`Cannot write ${logical} on the device`);
  return name;
}

export function logicalSaveName(entryName) {
  if (typeof entryName !== 'string' || entryName.includes('..')) return null;
  const base = entryName.split(/[/\\]/).pop();
  if (SAVE_NAME.test(base)) return base;
  try {
    const n = Buffer.from(base, 'base64').toString('utf16le');
    if (SAVE_NAME.test(n) && deviceFileName(n) === base) return n;
  } catch { /* not a device file name */ }
  return null;
}

// Stored or deflate entries. Sizes come from the central directory.
export function readZip(buf) {
  if (!Buffer.isBuffer(buf)) buf = Buffer.from(buf);
  let eocd = -1;
  const min = Math.max(0, buf.length - 22 - 65535);
  for (let i = buf.length - 22; i >= min; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('Not a zip file');
  const count = buf.readUInt16LE(eocd + 10);
  if (count > 500) throw new Error('The zip has too many files');
  let p = buf.readUInt32LE(eocd + 16);
  const out = [];
  let total = 0;
  for (let n = 0; n < count; n++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== 0x02014b50) throw new Error('Corrupt zip');
    const flags = buf.readUInt16LE(p + 8);
    const method = buf.readUInt16LE(p + 10);
    const csize = buf.readUInt32LE(p + 20);
    const usize = buf.readUInt32LE(p + 24);
    const nlen = buf.readUInt16LE(p + 28);
    const xlen = buf.readUInt16LE(p + 30);
    const clen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.subarray(p + 46, p + 46 + nlen).toString('utf8');
    p += 46 + nlen + xlen + clen;
    if (name.endsWith('/')) continue;
    if (flags & 1) throw new Error('Encrypted zip entries are not supported');
    if (method !== 0 && method !== 8) throw new Error('Unsupported zip compression');
    if (usize > MAX_ENTRY) throw new Error('A file in the zip is too large');
    total += usize;
    if (total > MAX_TOTAL) throw new Error('The zip is too large');
    if (local + 30 > buf.length) throw new Error('Corrupt zip');
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const comp = buf.subarray(start, start + csize);
    if (comp.length !== csize) throw new Error('Corrupt zip');
    const data = method === 0 ? Buffer.from(comp) : zlib.inflateRawSync(comp);
    if (usize && data.length !== usize) throw new Error('Zip entry size does not match');
    out.push({ name, data });
  }
  return out;
}

// The game's save bodies carry this marker (Base64 of '{"' in UTF-16LE).
export function isSaveBody(data) {
  return Buffer.isBuffer(data) && data.includes(Buffer.from('ewAi'));
}

export function zipStored(entries) {
  const CRC = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc32 = b => { let c = 0xffffffff; for (const x of b) c = CRC[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const parts = [], central = []; let off = 0;
  for (const { name, data } of entries) {
    const n = Buffer.from(name), crc = crc32(data);
    const h = Buffer.alloc(30); h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt32LE(crc, 14);
    h.writeUInt32LE(data.length, 18); h.writeUInt32LE(data.length, 22); h.writeUInt16LE(n.length, 26);
    parts.push(h, n, data);
    const c = Buffer.alloc(46); c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt32LE(crc, 16);
    c.writeUInt32LE(data.length, 20); c.writeUInt32LE(data.length, 24); c.writeUInt16LE(n.length, 28); c.writeUInt32LE(off, 42);
    central.push(c, n); off += 30 + n.length + data.length;
  }
  const cd = Buffer.concat(central), e = Buffer.alloc(22);
  e.writeUInt32LE(0x06054b50, 0); e.writeUInt16LE(entries.length, 8); e.writeUInt16LE(entries.length, 10);
  e.writeUInt32LE(cd.length, 12); e.writeUInt32LE(off, 16);
  return Buffer.concat([...parts, cd, e]);
}

// Files this zip is allowed to write. Throws if any entry is not a save.
export function savesFromZip(buf) {
  const entries = readZip(buf);
  const saves = [];
  const seen = new Set();
  for (const entry of entries) {
    const logical = logicalSaveName(entry.name);
    if (!logical) throw new Error(`Refusing ${entry.name.split(/[/\\]/).pop() || 'an entry'}: only game save files can be applied`);
    if (!isSaveBody(entry.data)) throw new Error(`${logical} is not a game save file`);
    if (seen.has(logical)) throw new Error(`${logical} is listed more than once`);
    seen.add(logical);
    saves.push({ logical, device: deviceFileName(logical), data: entry.data });
  }
  if (!saves.length) throw new Error('The zip has no save files');
  return saves;
}
