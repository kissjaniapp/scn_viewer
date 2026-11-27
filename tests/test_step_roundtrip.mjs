import assert from 'node:assert/strict';
import { OccSession } from 'occt.ts';

// This checks genuine analytic STEP B-Rep writing, not a renamed triangle mesh.
const occ=await OccSession.create();
try {
 const board=occ.makeBox(600,400,18);
 const block=occ.makeBox(80,70,30);
 const bytes=occ.writeStepDocument([{
  name:'JOB Viewer selected bodies',
  children:[
   {name:'Munkalap',shape:board},
   {name:'Alkatresz',shape:block,transform:[1,0,0,720,0,1,0,0,0,0,1,0]}
  ]
 }],{unit:'mm'});
 assert.ok(bytes.length>1000,'STEP must contain proper B-Rep entities');
 const text=new TextDecoder().decode(bytes.subarray(0,180));
 assert.match(text,/ISO-10303-21/i,'File must be STEP Part 21, not GLB/STL');
 const roundtrip=occ.readStepDocument(bytes,{unit:'mm'});
 assert.equal(occ.documentShapeCount,2,'Selection must export precisely two CAD parts');
 const volume=occ.documentShape(0).volume();
 assert.ok(volume>4_000_000,'Exact CAD B-Rep volume survives STEP serialization');
 assert.ok(roundtrip.tree.length>0,'Assembly metadata survives STEP');
 console.log('STEP B-Rep two-body write/read test passed');
} finally {occ.dispose();}
