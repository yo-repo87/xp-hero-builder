import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import { deviceFileName, logicalSaveName, savesFromZip, zipStored } from './saves.js';

const body = Buffer.from('xxewAiyy');
const names = ['save_currency_1.0', 'save_weap_1.1', 'save_player_1.0', 'save_ability_1.0', 'save_weaponpass_1.0'];
for (const name of names) {
  const device = deviceFileName(name);
  assert.equal(device.includes('/'), false, name);
  assert.equal(logicalSaveName(device), name);
  assert.equal(logicalSaveName(name), name);
}

const decoded = savesFromZip(zipStored([{ name: 'save_currency_1.0', data: body }]));
assert.equal(decoded.length, 1);
assert.equal(decoded[0].logical, 'save_currency_1.0');
assert.equal(decoded[0].device, deviceFileName('save_currency_1.0'));

const encoded = savesFromZip(zipStored([{ name: deviceFileName('save_weap_1.0'), data: body }]));
assert.equal(encoded[0].logical, 'save_weap_1.0');

const nested = savesFromZip(zipStored([{ name: 'folder/save_player_1.0', data: body }]));
assert.equal(nested[0].logical, 'save_player_1.0');

assert.throws(() => savesFromZip(zipStored([{ name: 'notes.txt', data: body }])), /only game save files/);
assert.throws(() => savesFromZip(zipStored([{ name: '../save_currency_1.0', data: body }])), /only game save files/);
assert.throws(() => savesFromZip(zipStored([{ name: 'save_currency_1.0', data: Buffer.from('nope') }])), /not a game save file/);
assert.throws(() => savesFromZip(zipStored([
  { name: 'save_currency_1.0', data: body },
  { name: deviceFileName('save_currency_1.0'), data: body },
])), /more than once/);

const raw = Buffer.from('ewAi');
const comp = zlib.deflateRawSync(raw);
const n = Buffer.from('save_soul_1.0');
const local = Buffer.alloc(30);
local.writeUInt32LE(0x04034b50, 0);
local.writeUInt16LE(8, 8);
local.writeUInt32LE(comp.length, 18);
local.writeUInt32LE(raw.length, 22);
local.writeUInt16LE(n.length, 26);
const central = Buffer.alloc(46);
central.writeUInt32LE(0x02014b50, 0);
central.writeUInt16LE(20, 4);
central.writeUInt16LE(20, 6);
central.writeUInt16LE(8, 10);
central.writeUInt32LE(comp.length, 20);
central.writeUInt32LE(raw.length, 24);
central.writeUInt16LE(n.length, 28);
const eocd = Buffer.alloc(22);
eocd.writeUInt32LE(0x06054b50, 0);
eocd.writeUInt16LE(1, 8);
eocd.writeUInt16LE(1, 10);
eocd.writeUInt32LE(central.length + n.length, 12);
eocd.writeUInt32LE(local.length + n.length + comp.length, 16);
const deflated = savesFromZip(Buffer.concat([local, n, comp, central, n, eocd]));
assert.equal(deflated[0].logical, 'save_soul_1.0');
assert.equal(deflated[0].data.toString(), 'ewAi');

console.log('savepull zip tests ok');
