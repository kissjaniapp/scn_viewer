import assert from 'node:assert/strict';
import { analyzeRectangularPrism, boxWorldTransform, boxWorldPrism } from '../viewer/step-boxes.js';
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

// A negative determinant is a valid mirrored cabinet component, not an error.
// Two mirrored axis signs and nested rotations must also preserve placement.
const identityPrism=boxWorldPrism(matrix,box,1);
assert.deepEqual(identityPrism.base[0],[240,120,60]);
assert.deepEqual(identityPrism.extrusion,[0,0,30]);
assert.equal(identityPrism.volume,240000);
const mirrorMatrix={elements:[-2,0,0,0, 0,1,0,0, 0,0,1.5,0, 600,15,20,1]};
const mirrorPrism=boxWorldPrism(mirrorMatrix,box,1);
assert.ok(mirrorPrism,'Negative X scaling must be supported');
assert.deepEqual(mirrorPrism.base[0],[600,15,20]);
assert.deepEqual(mirrorPrism.base[1],[400,15,20]);
assert.deepEqual(mirrorPrism.extrusion,[0,0,45]);
assert.equal(mirrorPrism.volume,720000);
const shearedMatrix={elements:[1,0,0,0, 0.15,1,0,0, 0,0.2,1,0, 50,70,10,1]};
const shearedPrism=boxWorldPrism(shearedMatrix,box,1);
assert.ok(shearedPrism,'Nested affine transforms may contain shear');
assert.ok(Math.abs(shearedPrism.volume-240000)<1e-6);
assert.equal(boxWorldPrism({elements:Array(16).fill(0)},box,1),null);
const session=await OccSession.create();
try {
 const prisms=[identityPrism,mirrorPrism,shearedPrism];
 const items=prisms.map((prism,i)=>({
  name:['Alap téglatest','Tükrözött bútorlap','Nyírt komponens'][i],
  shape:session.extrude(session.makePolygon(prism.base),prism.extrusion)
 }));
 const bytes=session.writeStepDocument([{name:'JOB Viewer selected boards',children:items}],{unit:'mm'});
 assert.match(new TextDecoder().decode(bytes.subarray(0,60)),/ISO-10303-21/);
 const next=session.readStepDocument(bytes,{unit:'mm'});
 assert.equal(session.documentShapeCount,3);
 for(let i=0;i<prisms.length;i++) {
  const volume=Math.abs(session.documentShape(i).volume());
  assert.ok(Math.abs(volume-prisms[i].volume)<1,
    `STEP solid volume mismatch for transformed component ${i}: ${volume}`);
 }
 assert.ok(next.tree.length);
} finally {session.dispose();}
console.log('OK: verified cuboid only, STEP solid reconstruction and exact location');
