/** Exact STEP B-Rep reader + writer. No lossy mesh-to-STEP conversion.
 * OCCT shapes are kept alongside their display-only tessellations. When the
 * user deletes hidden objects the surviving shapes are written as STEP.
 */
import * as THREE from 'three';
import { OccSession } from 'occt.ts';
import { analyzeRectangularPrism, boxWorldPrism } from './step-boxes.js';
import { analyzeExtrudedPolygon, worldExtrudedPolygon } from './step-prisms.js';

let activeSession = null;
const wasmPath = new URL('./occtjs.wasm', import.meta.url).href;
const modulePath = new URL('./occtjs.js', import.meta.url).href;
function leafNames(tree, names=[]) {
 for(const node of tree||[]) {
  if(node.children?.length) leafNames(node.children,names);
  else names.push(node.name||'');
 }
 return names;
}

export async function readStep(buffer) {
 if(!(buffer instanceof ArrayBuffer) || buffer.byteLength<32)
  throw new Error('Üres vagy hibás STEP fájl.');
 // One document per opened model. Handles are not disposed until replaced.
 const session=await OccSession.create({moduleUrl:modulePath,wasmUrl:wasmPath});
 try {
  const doc=session.readStepDocument(new Uint8Array(buffer),{unit:'mm'});
  const count=session.documentShapeCount;
  if(!count) throw new Error('A STEP fájlban nincs megjeleníthető CAD-alkatrész.');
  const labels=leafNames(doc.tree);
  const group=new THREE.Group();
  group.name='STEP CAD szerelés';
  const shapes=[];
  for(let i=0;i<count;i++){
   const shape=session.documentShape(i);
   const data=session.tessellate(shape,{linearDeflection:0.12,angularDeflection:15});
   if(!data.positions?.length||!data.indices?.length)
    throw new Error(`A ${i+1}. CAD-test nem háromszögelhető biztonságosan.`);
   const geo=new THREE.BufferGeometry();
   geo.setAttribute('position',new THREE.BufferAttribute(data.positions,3));
   geo.setIndex(new THREE.BufferAttribute(data.indices,1));
   geo.computeVertexNormals();
   const mesh=new THREE.Mesh(geo,new THREE.MeshStandardMaterial({
    color:0xabc5d6,roughness:.72,side:THREE.DoubleSide
   }));
   mesh.name=labels[i]||`STEP CAD-alkatrész ${i+1}`;
   mesh.userData.stepShapeIndex=i;
   mesh.userData.partName=mesh.name;
   group.add(mesh);
   shapes.push(shape);
  }
  group.userData.nativeStep={session,shapes,sourceUnit:'mm'};
  activeSession=session;
  return {scene:group,meshCount:count};
 } catch(error) {
  session.dispose();
  throw error;
 }
}

// Called only when a model is actually being disposed, not on a checkbox hide.
export function disposeStepSession(model){
 const state=model?.userData?.nativeStep;
 if(state?.session) {
  state.session.dispose();
  if(activeSession===state.session)activeSession=null;
 }
}
export function writeFilteredStep(model, visible){
 const state=model?.userData?.nativeStep;
 if(!state) throw new Error('Pontos STEP-mentés csak eredetileg STEP/STP fájlból lehetséges.');
 const parts=[];
 for(const mesh of visible) {
  const idx=mesh.userData?.stepShapeIndex;
  if(!Number.isInteger(idx) || !state.shapes[idx])
   throw new Error('Nem található az eredeti CAD-test; STEP helyett ne mentsünk pontatlan hálót.');
  parts.push({name:mesh.name||`Alkatrész ${idx+1}`,shape:state.shapes[idx]});
 }
 if(!parts.length) throw new Error('Nincs menthető CAD-test.');
 const bytes=state.session.writeStepDocument([{name:'JOB Viewer – kiválogatott alkatrészek',children:parts}],{unit:'mm'});
 if(!bytes?.length)throw new Error('A STEP-író nem hozott létre fájlt.');
 return bytes;
}

/** Rebuild verified rectangular boards as analytic OCC box solids.
 * Unlike mesh-to-STEP tricks, each exported item is a true B-Rep solid.
 * Rejects ANY unverified part: never lose or silently alter CAD geometry.
 */
export async function writeReconstructedBoxStep(model,visible,mmPerUnit) {
 if(!visible.length) throw new Error('Nincs látható alkatrész a STEP-mentéshez.');
 model.updateWorldMatrix(true,true);
 const validated=[];
 for(const mesh of visible) {
  if(mesh.userData?.scnApproximate || ['reference','catalog-part','fitting'].includes(mesh.userData?.scnRole))
   throw new Error(`A(z) "${mesh.name||'ismeretlen'}" csak becsült katalógusgeometria, ezért nem alakítható hiteles STEP-testté.`);
  const box=analyzeRectangularPrism(mesh.geometry);
  if(box){
   const prism=boxWorldPrism(mesh.matrixWorld,box,mmPerUnit);
   if(!prism)throw new Error(`A(z) "${mesh.name||'ismeretlen'}" degenerált térfogatú transzformációjú.`);
   validated.push({name:mesh.userData.partName||mesh.name||'Alkatrész',type:'box',...prism});
   continue;
  }
  // Not all furniture boards are six-sided boxes: a verified closed and
  // linearly extruded polygon may include L corners, notches and through-holes.
  const local=analyzeExtrudedPolygon(mesh.geometry);
  const prism=local && worldExtrudedPolygon(mesh.matrixWorld,local,mmPerUnit);
  if(!prism)
   throw new Error(`A(z) "${mesh.name||'ismeretlen'}" nem igazolt zárt téglatest vagy kihúzott poligon. Az eredeti alkatrész geometriai vizsgálata szükséges; a hibás STEP mentést leállítottam.`);
  validated.push({name:mesh.userData.partName||mesh.name||'Alkatrész',type:'polygon',...prism});
 }
 const session=await OccSession.create({moduleUrl:modulePath,wasmUrl:wasmPath});
 try {
  const children=validated.map(part=>{
   let solid;
   if(part.type==='box'){
    const profile=session.makePolygon(part.base);
    solid=session.extrude(profile,part.extrusion);
   }else{
    const outline=session.makePolygon(part.outline);
    const holes=part.holes.map(loop=>session.makePolygon(loop));
    const face=session.makeFace(outline,holes);
    solid=session.extrude(face,part.extrusion);
   }
   if(!solid.isValid() || session.solids(solid).length===0 || Math.abs(solid.volume())<1e-8)
    throw new Error(`A(z) "${part.name}" nem állítható elő érvényes STEP-szilárdtestként.`);
   return {name:part.name,shape:solid};
  });
  const bytes=session.writeStepDocument([{name:'JOB Viewer – kiválogatott CAD-alkatrészek',children}],{unit:'mm'});
  if(!bytes?.length)throw new Error('A STEP motor nem hozott létre fájlt.');
  return bytes;
 } finally {session.dispose();}
}
