// savepull: tiny internal helper for the XP Hero Builder backend.
// Pulls the game's save files from the Android VM over adb and returns them as
// one uncompressed zip. Runs with host networking (the VM is only reachable
// from the host) but binds to the Docker bridge gateway, so only containers on
// that network can reach it, and every request must carry SAVEPULL_TOKEN.
// Uses its own adb server port (ANDROID_ADB_SERVER_PORT) so it never disturbs
// any adb server already running on the host.
import http from 'node:http';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { logicalSaveName, zipStored, savesFromZip } from './saves.js';

function runAllow(args, timeout) {
  return new Promise((resolve, reject) => {
    execFile('adb', args, { timeout }, (err, stdout, stderr) => {
      if (err && (err.killed || err.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER')) return reject(err);
      resolve({ code: err && err.code ? err.code : 0, stdout: stdout || '', stderr: stderr || '' });
    });
  });
}
const { SAVEPULL_TOKEN, ADB_TARGET = '192.168.122.34:5555', BIND = '172.20.0.1', PORT = '8099' } = process.env;
const REMOTE = '/sdcard/Android/data/io.supercent.weaponrpg/files/';
const PKG = 'io.supercent.weaponrpg';
const MAX_BODY = 8 * 1024 * 1024;
if (!SAVEPULL_TOKEN || SAVEPULL_TOKEN.length < 24) { console.error('SAVEPULL_TOKEN missing/too short'); process.exit(1); }

function decodeName(f) {
  return logicalSaveName(f);
}

let busy = false;

function sendJson(res, status, body) {
  const raw = Buffer.from(JSON.stringify(body));
  res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': raw.length }).end(raw);
}

async function connectAdb() {
  const connected = await runAllow(['connect', ADB_TARGET], 15000);
  if (connected.code !== 0) throw Object.assign(new Error('Could not reach the game VM'), { status: 502 });
}

async function gameIsRunning() {
  const pid = await runAllow(['-s', ADB_TARGET, 'shell', 'pidof', PKG], 15000);
  if (pid.code === 0) return pid.stdout.trim().length > 0;
  if (pid.code === 1) return false;
  const ps = await runAllow(['-s', ADB_TARGET, 'shell', 'ps', '-A'], 15000);
  if (ps.code !== 0) throw Object.assign(new Error('Could not check whether the game is running'), { status: 502 });
  return ps.stdout.includes(PKG);
}

async function pull() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'saves-'));
  try {
    await connectAdb();
    const pulled = await runAllow(['-s', ADB_TARGET, 'pull', REMOTE, dir], 60000);
    if (pulled.code !== 0) throw new Error(pulled.stderr.trim() || 'adb pull failed');
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

// Replace only the save files in the zip. Other files on the device stay.
async function applyZip(buf) {
  let saves;
  try { saves = savesFromZip(buf); }
  catch (err) { throw Object.assign(new Error(err.message), { status: 400 }); }
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'save-apply-'));
  try {
    await connectAdb();
    if (await gameIsRunning()) {
      throw Object.assign(new Error('The game is still running on the VM. Close it, then apply the save again.'), { status: 409 });
    }
    for (const save of saves) {
      const local = path.join(dir, save.logical);
      await fs.writeFile(local, save.data);
      const pushed = await runAllow(['-s', ADB_TARGET, 'push', local, REMOTE + save.device], 20000);
      if (pushed.code !== 0) throw Object.assign(new Error(pushed.stderr.trim() || `Could not write ${save.logical}`), { status: 502 });
    }
    return saves.map(s => s.logical).sort();
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let settled = false;
    const fail = err => { if (settled) return; settled = true; reject(err); };
    req.on('data', c => {
      size += c.length;
      if (size > limit) { fail(Object.assign(new Error('The zip is too large'), { status: 413 })); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => { if (!settled) { settled = true; resolve(Buffer.concat(chunks)); } });
    req.on('error', fail);
  });
}

http.createServer(async (req, res) => {
  if (req.headers['x-savepull-token'] !== SAVEPULL_TOKEN) { res.writeHead(403).end(); return; }
  const apply = req.method === 'POST' && req.url === '/saves.zip';
  const get = req.method === 'GET' && req.url === '/saves.zip';
  if (!apply && !get) { res.writeHead(404).end(); return; }
  if (busy) { sendJson(res, 429, { error: 'A save transfer is already running, try again in a moment' }); return; }
  busy = true;
  try {
    if (get) {
      const zip = await pull();
      res.writeHead(200, { 'Content-Type': 'application/zip', 'Content-Length': zip.length }).end(zip);
      return;
    }
    const body = await readBody(req, MAX_BODY);
    const names = await applyZip(body);
    console.log(new Date().toISOString(), 'applied', names.length, 'save files');
    sendJson(res, 200, { ok: true, count: names.length });
  } catch (err) {
    console.error(new Date().toISOString(), apply ? 'apply failed:' : 'pull failed:', err.message);
    const status = err.status || 502;
    const error = status === 400 || status === 409 || status === 413
      ? err.message
      : (apply ? 'Could not apply the save to the game VM' : 'Could not pull saves from the game VM');
    sendJson(res, status, { error });
  } finally { busy = false; }
}).listen(+PORT, BIND, () => console.log(`savepull listening on ${BIND}:${PORT} -> ${ADB_TARGET}`));
