// savepull: tiny internal helper for the XP Hero Builder backend.
// Pulls the game's save files from the Android VM over adb and returns them as
// one uncompressed zip. Runs with host networking (the VM is only reachable
// from the host) but binds to the Docker bridge gateway, so only containers on
// that network can reach it, and every request must carry SAVEPULL_TOKEN.
// Uses its own adb server port (ANDROID_ADB_SERVER_PORT) so it never disturbs
// any adb server already running on the host.
import http from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const run = promisify(execFile);
const { SAVEPULL_TOKEN, ADB_TARGET = '192.168.122.34:5555', BIND = '172.20.0.1', PORT = '8099' } = process.env;
const REMOTE = '/sdcard/Android/data/io.supercent.weaponrpg/files/';
if (!SAVEPULL_TOKEN || SAVEPULL_TOKEN.length < 24) { console.error('SAVEPULL_TOKEN missing/too short'); process.exit(1); }

const CRC = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = b => { let c = 0xffffffff; for (const x of b) c = CRC[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };

function zipStored(entries) { // [{name, data:Buffer}]
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

function decodeName(f) {
  try { const n = Buffer.from(f, 'base64').toString('utf16le'); if (/^save_\w+_1\.[01]$/.test(n)) return n; } catch {}
  return null;
}

let busy = false;
async function pull() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'saves-'));
  try {
    await run('adb', ['connect', ADB_TARGET], { timeout: 15000 });
    await run('adb', ['-s', ADB_TARGET, 'pull', REMOTE, dir], { timeout: 60000 });
    const root = path.join(dir, 'files');
    const entries = [];
    for (const f of await fs.readdir(root)) {
      const name = decodeName(f);
      if (name) entries.push({ name, data: await fs.readFile(path.join(root, f)) });
    }
    if (!entries.length) throw new Error('no save files found on device');
    return zipStored(entries.sort((a, b) => a.name.localeCompare(b.name)));
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
}

http.createServer(async (req, res) => {
  if (req.headers['x-savepull-token'] !== SAVEPULL_TOKEN) { res.writeHead(403).end(); return; }
  if (req.method !== 'GET' || req.url !== '/saves.zip') { res.writeHead(404).end(); return; }
  if (busy) { res.writeHead(429).end('busy'); return; }
  busy = true;
  try {
    const zip = await pull();
    res.writeHead(200, { 'Content-Type': 'application/zip', 'Content-Length': zip.length }).end(zip);
  } catch (err) {
    console.error(new Date().toISOString(), 'pull failed:', err.message);
    res.writeHead(502, { 'Content-Type': 'text/plain' }).end('could not pull saves from the VM');
  } finally { busy = false; }
}).listen(+PORT, BIND, () => console.log(`savepull listening on ${BIND}:${PORT} -> ${ADB_TARGET}`));
