import assert from 'node:assert/strict';
import { OccSession } from 'occt.ts';
import { analyzeExtrudedPolygon, worldExtrudedPolygon } from '../viewer/step-prisms.js';

// A nonrectangular, notched L-profile panel with closed top/bottom and sides.
// This must not pass the ordinary box-only recognition.
const polygon=[[0,0],[300,0],[300,60],[60,60],[60,220],[0,220]];
const height=18;
const points=[...polygon.map(p=>[...p,0]),...polygon.map(p=>[...p,height])];
const caps=[[0,1,3],[1,2,3],[0,3,5],[3,4,5]];
const index=[];
for(const tri of caps){
 index.push(...[...tri].reverse());
 index.push(...tri.map(i=>i+6));
}
for(let i=0;i<polygon.length;i++){
 const next=(i+1)%polygon.length;
 index.push(i,next,next+6,i,next+6,i+6);
}
const flatten=points.flat();
const geometry={attributes:{position:{array:new Float32Array(flatten),itemSize:3,count:points.length}},
 index:{array:new Uint16Array(index)}};
const found=analyzeExtrudedPolygon(geometry);
assert.ok(found,'The L-shaped, 18mm-thick panel must be recognized');
assert.equal(found.outline.length,6);
assert.equal(found.holes.length,0);
assert.deepEqual(found.extrusion,[0,0,18]);
const opened={...geometry,index:{array:new Uint16Array(index.slice(0,-6))}};
assert.equal(analyzeExtrudedPolygon(opened),null,'Do not convert open meshes to false solids');

const matrix={elements:[-1,0,0,0,0,1,0,0,0,0,1,0,700,40,15,1]};
const placed=worldExtrudedPolygon(matrix,found,1);
assert.ok(placed);
assert.deepEqual(placed.outline[0],[700,40,15]);

const occ=await OccSession.create();
try{
 const boundary=occ.makePolygon(placed.outline);
 const face=occ.makeFace(boundary);
 const solid=occ.extrude(face,placed.extrusion);
 assert.ok(solid.isValid(),'The L-shaped panel must be a valid CAD B-Rep');
 assert.equal(occ.solids(solid).length,1,'Result must be a solid rather than surfaces');
 const expectedVolume=(300*60+60*(220-60))*height;
 assert.ok(Math.abs(Math.abs(solid.volume())-expectedVolume)<1);
 const step=occ.writeStepDocument([{name:'Selected furniture',children:[{name:'Notched L-panel',shape:solid}]}],{unit:'mm'});
 assert.match(new TextDecoder().decode(step.subarray(0,80)),/ISO-10303-21/);
 occ.readStepDocument(step,{unit:'mm'});
 assert.equal(occ.documentShapeCount,1);
 assert.ok(Math.abs(Math.abs(occ.documentShape(0).volume())-expectedVolume)<1);
 console.log('OK: notched extruded L-panel writes a valid STEP solid after reflection');
}finally{occ.dispose();}
