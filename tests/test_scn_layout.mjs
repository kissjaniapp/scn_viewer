import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { decodeScn } from '../viewer/scn-parser.js';
import {classifyScnRecord,discoverScnRegions} from '../viewer/scn-layout.js';
const panel=(id,x,y)=>({id,name:'FÜGG. DECO PANEL vsz. sz. ir.',size:[500,18,2000],position:[x,y,0]});
const shell={id:3,name:'PULT SZEKRÉNY',size:[800,500,900],position:[40,0,0]};
assert.equal(classifyScnRecord(shell),'reference');
assert.equal(classifyScnRecord({name:'CUBE',size:[5640,500,500]}),'solid');
assert.equal(classifyScnRecord({name:'CUBE',size:[600,5,180]}),'solid');
assert.equal(classifyScnRecord({name:'Sik (tex)',size:[961,2470,220]}),'solid');
assert.equal(classifyScnRecord({name:'Sík (szin)',size:[1021,1500,36]}),'solid');
assert.equal(classifyScnRecord({name:'SURF2D',type:'plane2d',size:[470,1180,0]}),'surface');
assert.equal(classifyScnRecord({name:'CIRC322D',type:'circle2d',size:[150,150,0]}),'surface');
assert.equal(classifyScnRecord({name:'CYL H',size:[440,35,35]}),'fitting');
const synthetic=discoverScnRegions([panel(1,0,0),panel(2,600,0),shell,panel(4,20000,0)]);
assert.deepEqual(synthetic.regions.map(x=>x.panelCount),[2,1]);
assert.equal(synthetic.idToRegion.get(3),synthetic.idToRegion.get(1));
if(process.env.SCN_TEST_FILE) {
 const scn=decodeScn(readFileSync(process.env.SCN_TEST_FILE));
 const structural=scn.entries.filter(x=>classifyScnRecord(x)==='panel');
 const zones=discoverScnRegions(scn.entries);
 assert.equal(structural.length,108);
 assert.deepEqual(zones.regions.slice(0,2).map(x=>x.panelCount),[62,44]);
 assert(zones.regions.length >= 2);
 console.log(`OK: saját SCN lapok=${structural.length}, területek=${zones.regions.map(x=>x.panelCount).join('/')}`);
}
console.log('OK: katalógus-befoglalók elkülönítése és térbeli bútoregyüttesek');
