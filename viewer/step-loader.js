/** Exact STEP B-Rep reader + writer. No lossy mesh-to-STEP conversion.
 * OCCT shapes are kept alongside their display-only tessellations. When the
 * user deletes hidden objects the surviving shapes are written as STEP.
 */
import * as THREE from 'three';
import { OccSession } from 'occt.ts';

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
