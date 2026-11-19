/** Offline STEP/STP importer through the OpenCascade WebAssembly runtime.
 * The runtime is copied from the pinned npm package into the desktop bundle.
 * There is no upload and no network dependency after installation.
 */
import * as THREE from 'three';

let kernelPromise = null;
async function loadKernel() {
 if (typeof globalThis.occtimportjs !== 'function') {
  throw new Error('A STEP CAD motor nem töltődött be. Telepítsd újra a JOB Viewert.');
 }
 kernelPromise ||= globalThis.occtimportjs({
  locateFile: name => new URL('./' + name, import.meta.url).href
 });
 return kernelPromise;
}
export async function readStep(buffer) {
 if (!(buffer instanceof ArrayBuffer) || buffer.byteLength < 32) throw new Error('Üres vagy érvénytelen STEP fájl.');
 const occt = await loadKernel();
 const parsed = occt.ReadStepFile(new Uint8Array(buffer), {
  linearUnit: 'millimeter',
  linearDeflectionType: 'bounding_box_ratio',
  linearDeflection: 0.002,
  angularDeflection: 0.5
 });
 if (!parsed?.success || !parsed.meshes?.length) throw new Error('A STEP fájl nem tartalmaz megjeleníthető szilárdtest-geometriát.');
 const geometries=parsed.meshes.map((mesh,index)=>{
  const coords=mesh.attributes?.position?.array;
  const indices=mesh.index?.array;
  if (!coords?.length || !indices?.length) return null;
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(coords,3));
  if (mesh.attributes?.normal?.array?.length===coords.length) {
   geometry.setAttribute('normal',new THREE.Float32BufferAttribute(mesh.attributes.normal.array,3));
  } else geometry.computeVertexNormals();
  geometry.setIndex(indices);
  geometry.computeBoundingBox();
  const color=Array.isArray(mesh.color) && mesh.color.length===3
   ? new THREE.Color().setRGB(...mesh.color) : new THREE.Color(0xa8cbd8);
  const solid=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color,roughness:0.7,metalness:0.08,side:THREE.DoubleSide}));
  solid.name=mesh.name||`STEP alkatrész ${index+1}`;
  solid.userData.partName=solid.name;
  return solid;
 });
 const root=new THREE.Group();
 root.name=parsed.root?.name||'STEP modell';
 const addNode=(node,parent)=>{
  const group=new THREE.Group();
  group.name=node.name||'Szerelési egység';
  group.userData.cabinet=true;
  parent.add(group);
  for(const idx of node.meshes||[]) if(geometries[idx]) group.add(geometries[idx]);
  for(const child of node.children||[]) addNode(child,group);
 };
 if(parsed.root) addNode(parsed.root,root);
 else for(const mesh of geometries) if(mesh) root.add(mesh);
 // Some STEP files expose a partial hierarchy. Keep any unreferenced meshes visible.
 const used=new Set();
 root.traverse(obj=>{if(obj.isMesh) used.add(obj);});
 for(const mesh of geometries) if(mesh&&!used.has(mesh)) root.add(mesh);
 if(!root.children.length) throw new Error('A STEP fájl nem tartalmaz megjeleníthető felületet.');
 return { scene:root, meshCount:geometries.filter(Boolean).length };
}
