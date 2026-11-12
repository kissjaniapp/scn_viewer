import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { decodeScn } from '../viewer/scn-parser.js';

function testRecord({ catalog='@FORMES', name='CUBE', size=[600,400,18], position=[1200,-350,720] }={}) {
  const b = Buffer.alloc(1226);
  b.write(catalog, 0, 'ascii');
  b.write(name, 16, 'latin1');
  for (const [i, at] of [74,80,86].entries()) { b.writeUInt16LE(1, at); b.writeUInt16LE(size[i], at+2); }
  for (const [i, at] of [106,112,118].entries()) { b.writeUInt16LE(1, at); b.writeInt16LE(position[i], at+2); }
  b.write('mm', 256, 'ascii');
  return b;
}
const synthetic = decodeScn(testRecord());
assert.equal(synthetic.entries.length, 1);
assert.deepEqual(synthetic.entries[0].size, [600,400,18]);
assert.deepEqual(synthetic.entries[0].position, [1200,-350,720]);
assert.deepEqual(synthetic.boundsMm.size, [600,400,18]);
const second = testRecord({catalog:'@DK02',name:'PANEL', size:[800,18,720],position:[0,0,0]});
const joined = decodeScn(Buffer.concat([testRecord(),second]));
assert.equal(joined.entries.length, 2);
assert.deepEqual(joined.entries[1].size, [800,18,720]);
const invalid = testRecord(); invalid.writeUInt16LE(0,74);
assert.throws(() => decodeScn(invalid), /Nem találtam/);
// Optional offline regression against user's own private SCN.
const privateFile = process.env.SCN_TEST_FILE;
if (privateFile) {
  const actual = decodeScn(readFileSync(privateFile));
  assert.equal(actual.entries.length, 463);
  assert.deepEqual(actual.boundsMm.size, [33697,19341,2996]);
  assert(actual.entries.some(e => e.name === 'CUBE' && e.size.join(',') === '5640,500,500'));
  assert(actual.entries.some(e => e.name.includes('PANEL') && e.size.includes(18)));
  console.log(`OK: valódi SCN (${actual.entries.length} 3D objektum, méretek mm-ben)`);
}
console.log('OK: natív SCN dekóder, koordináták, tengelyek, mm és hibakezelés');
