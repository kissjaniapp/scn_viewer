import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {catalogPreviewType,makeCatalogPreview,isCoveringWall} from '../viewer/scn-structure.js';
import {decodeScn} from '../viewer/scn-parser.js';
import {classifyScnRecord, discoverScnRegions} from '../viewer/scn-layout.js';

const cabinet={name:'EK PULT SZIMPLA, normal',size:[600,700,900],position:[2000,3000,0]};
assert.equal(catalogPreviewType(cabinet),'cabinet');
const sketch=makeCatalogPreview(cabinet);
assert.equal(sketch.kind,'cabinet');
assert.equal(sketch.parts.length,5);
assert(sketch.parts.every(x=>x.isInferred === true));
assert(sketch.parts.every(x=>x.size.every(v=>v>0)));
assert.equal(sketch.parts[0].name,'Bal oldallap (becsült)');
assert.deepEqual(sketch.parts[0].size,[18,700,900]);
assert.deepEqual(sketch.parts[1].position,[582,0,0]);
assert.deepEqual(sketch.parts[4].position,[18,696,18]);
const high={name:'Magas szekrény',size:[800,600,2100]};
assert.equal(makeCatalogPreview(high).parts.length,6,'High cabinet illustrative shelf');
assert.equal(makeCatalogPreview({name:'ND_1300_400_l',size:[1300,520,400]}).parts.length,6,'Wide cabinet divider');
const oven={name:'DUPLA UNOX ND_U4',size:[600,910,1460]};
assert.equal(catalogPreviewType(oven),'appliance');
assert.equal(makeCatalogPreview(oven).parts.length,2,'Appliances never receive arbitrary shelves');
assert.equal(isCoveringWall({name:'FÜGG. DECO PANEL',size:[5155,18,2380]}),true);
assert.equal(isCoveringWall({name:'FÜGG. DECO PANEL',size:[318,36,2280]}),false);
assert.equal(classifyScnRecord({name:'VÍZSZ. DECO PANEL',size:[850,450,18]}),'panel');
assert.equal(classifyScnRecord({name:'FÜGG. DECO PANEL',size:[5900,18,2380]}),'wall');

if(process.env.SCN_TEST_FILE){
  const decoded=decodeScn(readFileSync(process.env.SCN_TEST_FILE));
  const reference=decoded.entries.filter(e=>classifyScnRecord(e)==='reference');
  const panels=decoded.entries.filter(e=>classifyScnRecord(e)==='panel');
  const walls=decoded.entries.filter(e=>classifyScnRecord(e)==='wall');
  assert.equal(reference.length,34);
  assert.equal(panels.length,108);
  assert.equal(walls.length,2);
  assert.equal(reference.filter(e=>catalogPreviewType(e)==='cabinet').length,24);
  assert.equal(reference.filter(e=>catalogPreviewType(e)==='appliance').length,10);
  const areas=discoverScnRegions(decoded.entries);
  assert.deepEqual(areas.regions.slice(0,2).map(r=>r.panelCount),[62,44]);
  console.log('OK: SCN mintafájl 108 valódi lap + 2 rejtett takarófal + 24 vázlatos bútor + 10 berendezés.');
}
console.log('OK: katalógusvázlatok nem eredeti szerkezeti alkatrészek; méret és padlószint ellenőrizve.');
