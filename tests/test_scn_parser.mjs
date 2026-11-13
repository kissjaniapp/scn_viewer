import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { decodeScn } from '../viewer/scn-parser.js';
import {scnWorldBounds,scnWorldPoint} from '../viewer/scn-transform.js';

function testRecord({ catalog='@FORMES', name='CUBE', size=[600,400,18], position=[1200,-350,720], rotationRad=0 }={}) {
  const b = Buffer.alloc(1226);
  b.write(catalog, 0, 'ascii');
  b.write(name, 16, 'latin1');
  for (const [i, at] of [74,80,86].entries()) { b.writeUInt16LE(1, at); b.writeUInt16LE(size[i], at+2); }
  for (const [i, at] of [106,112,118].entries()) { b.writeUInt16LE(1, at); b.writeInt16LE(position[i], at+2); }
  b.writeDoubleLE(rotationRad,164);
  b.write('mm', 256, 'ascii');
  return b;
}
const synthetic = decodeScn(testRecord());
assert.equal(synthetic.entries.length, 1);
assert.deepEqual(synthetic.entries[0].size, [600,400,18]);
assert.deepEqual(synthetic.entries[0].position, [1200,-350,720]);
assert.equal(synthetic.entries[0].rotationRad,0);
const turned = decodeScn(testRecord({size:[600,700,900],position:[2600,3900,0],rotationRad:Math.PI}));
assert.equal(turned.entries[0].rotationRad,Math.PI);
const rb = scnWorldBounds(turned.entries[0]);
assert(Math.abs(rb.min[0]-2000)<1e-7 && Math.abs(rb.max[0]-2600)<1e-7);
assert(Math.abs(rb.min[1]-3200)<1e-7 && Math.abs(rb.max[1]-3900)<1e-7);
assert.deepEqual(rb.size.map(Math.round),[600,700,900]);
assert.deepEqual(scnWorldPoint(turned.entries[0],[18,0,0]).map(Math.round),[2582,3900,0]);
assert.deepEqual(synthetic.boundsMm.size, [600,400,18]);
const second = testRecord({catalog:'@DK02',name:'PANEL', size:[800,18,720],position:[0,0,0]});
const joined = decodeScn(Buffer.concat([testRecord(),second]));
assert.equal(joined.entries.length, 2);
assert.deepEqual(joined.entries[1].size, [800,18,720]);
const plane = decodeScn(testRecord({name:'SURF2D',size:[470,1180,0]}));
assert.equal(plane.entries.length,1);
assert.equal(plane.entries[0].type,'plane2d');
assert.deepEqual(plane.boundsMm.size,[470,1180,0]);
const circle = decodeScn(testRecord({name:'CIRC322D',size:[150,150,0]}));
assert.equal(circle.entries[0].type,'circle2d');
assert.equal(circle.entries[0].size[2],0);
const invalidZero = testRecord({name:'CUBE',size:[600,400,0]});
assert.throws(()=>decodeScn(invalidZero),/Nem találtam/);
const invalid = testRecord(); invalid.writeUInt16LE(0,74);
assert.throws(() => decodeScn(invalid), /Nem találtam/);
// Optional offline regression against user's own private SCN.
const privateFile = process.env.SCN_TEST_FILE;
if (privateFile) {
  const actual = decodeScn(readFileSync(privateFile));
  assert.equal(actual.entries.length, 463);
  assert.deepEqual(actual.boundsMm.size.map(Math.round), [28517,18641,2996]);
  const counter = actual.entries.find(e => e.name === 'EK PULT SZIMPLA, normal' && Math.abs(e.rotationRad-Math.PI) < 0.01);
  assert(counter, 'Expected actual 180-degree counter rotation');
  const counterBounds = scnWorldBounds(counter);
  assert(Math.abs(counterBounds.max[0]-counter.position[0])<0.01);
  assert(Math.abs(counterBounds.min[0]-(counter.position[0]-counter.size[0]))<0.01);
  assert(actual.entries.filter(e=>Math.abs(e.rotationRad) > .01).length > 300);
  assert(actual.entries.some(e => e.name === 'CUBE' && e.size.join(',') === '5640,500,500'));
  assert(actual.entries.some(e => e.name.includes('PANEL') && e.size.includes(18)));
  console.log(`OK: valódi SCN (${actual.entries.length} 3D objektum, méretek mm-ben)`);
}
console.log('OK: natív SCN dekóder, koordináták, tengelyek, mm és hibakezelés');
