import assert from 'node:assert/strict';
import { analyzeRectangularPrism, boxWorldTransform } from '../viewer/step-boxes.js';
import { OccSession } from 'occt.ts';

// Every plane is covered by two triangles; no cutouts or missing faces.
const xyz=[0,0,0,100,0,0,100,80,0,0,80,0,0,0,30,100,0,30,100,80,30,0,80,30];
const triangles=[
  0,2,1,0,3,2, 4,5,6,4,6,7,
  0,1,5,0,5,4, 1,2,6,1,6,5,
  2,3,7,2,7,6, 3,0,4,3,4,7
];
const geo={attributes:{position:{array:new Float32Array(xyz),itemSize:3,count:8}},index:{array:new Uint16Array(triangles)}};
const box=analyzeRectangularPrism(geo);
assert.deepEqual(box?.min,[0,0,0]);
assert.deepEqual(box?.size,[100,80,30]);
assert.equal(analyzeRectangularPrism({...geo,index:{array:new Uint16Array(triangles.slice(0,-6))}}),null,
  'Incomplete box shell must not be fabricated as a solid STEP body');
// Introduce a corner moved into the box: this is NOT a precise six-face prism.
const damaged=new Float32Array(xyz);
damaged[5*3+2]=12;
assert.equal(analyzeRectangularPrism({...geo,attributes:{position:{array:damaged,itemSize:3,count:8}}}),null);
const matrix={elements:[1,0,0,0,0,1,0,0,0,0,1,0,240,120,60,1]};
const placed=boxWorldTransform(matrix,box,1);
assert.deepEqual(placed?.size,[100,80,30]);
assert.deepEqual(placed?.transform,[1,0,0,240,0,1,0,120,0,0,1,60]);
const session=await OccSession.create();
try {
 const cad=session.makeBox(...placed.size);
 const bytes=session.writeStepDocument([{name:'JOB Viewer selected boards',children:[{name:'Bútorlap',shape:cad,transform:placed.transform}]}],{unit:'mm'});
 assert.match(new TextDecoder().decode(bytes.subarray(0,60)),/ISO-10303-21/);
 const next=session.readStepDocument(bytes,{unit:'mm'});
 assert.equal(session.documentShapeCount,1);
 assert.ok(session.documentShape(0).volume()>239999,'Volume preserved as analytic solid');
 assert.ok(next.tree.length);
} finally {session.dispose();}
console.log('OK: verified cuboid only, STEP solid reconstruction and exact location');
