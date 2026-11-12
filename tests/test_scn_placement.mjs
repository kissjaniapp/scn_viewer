import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { decodeScn } from '../viewer/scn-parser.js';
import { correctedPosition, correctedBounds, envelopeWarnings, normaliseAdjustment } from '../viewer/scn-placement.js';
import { classifyScnRecord } from '../viewer/scn-layout.js';

const cabinet = {id:1,name:'BÚTOR',position:[1000,2000,500],size:[600,700,900],rotationRad:Math.PI};
assert.deepEqual(correctedPosition(cabinet,[120,-80,55]),[1120,1920,555]);
const bounds = correctedBounds(cabinet,[120,-80,55]);
assert.deepEqual(bounds.size.map(Math.round),[600,700,900]);
assert(Math.abs(bounds.min[0]-520)<.00001 && Math.abs(bounds.max[0]-1120)<.00001);
assert(Math.abs(bounds.min[1]-1220)<.00001 && Math.abs(bounds.max[1]-1920)<.00001);
assert.deepEqual(bounds.min[2],555);
assert.deepEqual(correctedPosition(cabinet),cabinet.position);
assert.deepEqual(normaliseAdjustment([0,5,'abc']),[0,0,0]);
assert.deepEqual(normaliseAdjustment([Infinity,5,0]),[0,0,0]);

const a={id:2,name:'A',position:[0,0,0],size:[600,400,900],rotationRad:0};
const b={id:3,name:'B',position:[540,0,0],size:[600,400,900],rotationRad:0};
assert.equal(envelopeWarnings([a,b]).length,1);
assert.equal(envelopeWarnings([a,b],{3:[60,0,0]}).length,0);
assert.equal(envelopeWarnings([a,b],{3:[0,0,900]}).length,0);
if(process.env.SCN_TEST_FILE) {
  const data=decodeScn(readFileSync(process.env.SCN_TEST_FILE));
  const references=data.entries.filter(x=>classifyScnRecord(x)==='reference');
  const warnings=envelopeWarnings(references);
  assert(warnings.some(({a,b})=>[a,b].includes(223)&&[a,b].includes(224)),
    'A mintafájlban ismert két katalógusobjektum átfedése megőrzendő a diagnosztikában');
  // A controlled correction can remove the computed AABB intersection without
  // mutating the original SCN positions or any other object.
  const corrections={223:[0,-60,0]};
  const shifted=envelopeWarnings(references,corrections);
  assert(!shifted.some(({a,b})=>[a,b].includes(223)&&[a,b].includes(224)));
  assert.equal(data.entries[222].position[1],11556);
}
console.log('OK: X/Y/Z adjustments, original anchors intact, catalog overlap warning and correction.');
