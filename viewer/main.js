import { decodeScn } from './scn-parser.js';
import { classifyScnRecord, discoverScnRegions } from './scn-layout.js';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { TDSLoader } from 'three/addons/loaders/TDSLoader.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const $ = (id) => document.getElementById(id);
const viewport = $('viewport');
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 1e8);
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
// A very high-DPI screen otherwise multiplies the shaded pixel count.
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.35));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;
viewport.prepend(renderer.domElement);
renderer.domElement.style.width = '100%';
renderer.domElement.style.height = '100%';
renderer.domElement.style.touchAction = 'none';
// OrbitControls caches a quaternion from camera.up *at construction time*.
// v1.3 changed camera.up after construction (Y -> Z): this made the CAD
// camera rotate around the wrong axis and invert close to the poles.
camera.up.set(0, 0, 1);
let controls;
function rebuildControls() {
 if (controls) controls.dispose();
 controls = new OrbitControls(camera, renderer.domElement);
 controls.enableDamping = false; // direct, predictable Tinkercad-like movement
 controls.rotateSpeed = .65;
 controls.zoomSpeed = 1.1;
 controls.panSpeed = .8;
 controls.zoomToCursor = true;
 controls.screenSpacePanning = true;
 controls.minPolarAngle = .008;
 controls.maxPolarAngle = Math.PI - .008;
 controls.mouseButtons = {LEFT: null, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.ROTATE};
 controls.addEventListener('change', invalidate);
}
rebuildControls();
renderer.domElement.addEventListener('contextmenu', event => event.preventDefault());
camera.position.set(1500, -2300, 1600);
camera.up.set(0, 0, 1);
controls.target.set(0, 0, 0);
controls.update();
scene.add(new THREE.HemisphereLight(0xf5f7f5, 0x667480, 1.4));
const sun = new THREE.DirectionalLight(0xfff6e9, 2.0);
sun.position.set(350, -450, 900);
scene.add(sun);
const fill = new THREE.DirectionalLight(0xc6defb, .7);
fill.position.set(-300, 250, 500);
scene.add(fill);

let model = null;
let modelBox = null;
let originName = '';
let measureEnabled = false;
let selectedMesh = null;
let selectionBox = null;
let meshNumbers = new WeakMap();
let boundsCache = new WeakMap();
let partSizeCache = new WeakMap();
let meshCountCache = new WeakMap();
let snapPoints = [];
let line = null;
let markers = [];
let modelEdges = [];
let mmPerUnit = 1;
let upAxis = 'Z';
let activePointer = null;
let toastHandle = null;
let scnLayout = null;
let scnRecordMeshes = new Map();
let scnRegionGroups = new Map();
let scnMaterials = null;
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
const tempVec = new THREE.Vector3();
const eps = 1e-9;

function notify(message) {
 const element = $('toast');
 element.textContent = message;
 element.style.display = 'block';
 clearTimeout(toastHandle);
 toastHandle = setTimeout(() => { element.style.display = 'none'; }, 5500);
}
function format(number, digits = 2) { return Number(number).toLocaleString('hu-HU', { maximumFractionDigits: digits, minimumFractionDigits: digits }); }
function formatPoint(point) { return point ? [point.x, point.y, point.z].map(v => format(v * mmPerUnit, 1)).join('; ') + ' mm' : 'Nincs'; }
function getModelBounds() {
 if (!model) return null;
 model.updateWorldMatrix(true, true);
 const box = new THREE.Box3();
 if(model.userData.nativeScn) {
  for(const mesh of scnRecordMeshes.values()) {
   if(mesh.visible && mesh.userData.scnRole==='panel') box.expandByObject(mesh);
  }
 } else box.setFromObject(model);
 return box.isEmpty() ? null : box;
}
function updateStats() {
 if (!modelBox) { $('modelStats').textContent = 'Nincs modell'; return; }
 const size = modelBox.getSize(new THREE.Vector3());
 $('modelStats').textContent = `${format(size.x * mmPerUnit, 1)} × ${format(size.y * mmPerUnit, 1)} × ${format(size.z * mmPerUnit, 1)} mm`;
 updateSelectionStats();
}
function setAxis(axis) {
 upAxis = axis;
 const wanted = axis === 'Z' ? new THREE.Vector3(0,0,1) : new THREE.Vector3(0,1,0);
 if (!camera.up.equals(wanted)) {
  const oldTarget = controls.target.clone();
  camera.up.copy(wanted);
  rebuildControls();
  controls.target.copy(oldTarget);
 }
 grid.rotation.set(0, 0, 0);
 grid.rotation.x = axis === 'Z' ? Math.PI / 2 : 0;
 const center = modelBox ? modelBox.getCenter(new THREE.Vector3()) : new THREE.Vector3();
 sun.position.copy(center).add(axis === 'Z' ? new THREE.Vector3(350, -450, 900) : new THREE.Vector3(350, 900, 450));
 controls.update();
 setView('iso');
}
const grid = new THREE.GridHelper(1000, 20, 0x425d76, 0x2b4055);
// Three GridHelper is XZ by default. For CAD Z-up, rotate it into XY.
grid.rotation.x = Math.PI / 2;
scene.add(grid);
const axes = new THREE.AxesHelper(200);
scene.add(axes);
function updateGrid() {
 const center = modelBox ? modelBox.getCenter(new THREE.Vector3()) : new THREE.Vector3();
 const s = modelBox ? Math.max(...modelBox.getSize(new THREE.Vector3()).toArray()) : 1000;
 const size = Math.max(s * 2, 1);
 grid.scale.setScalar(size / 1000);
 axes.scale.setScalar(size / 1000);
 grid.position.copy(center);
 if (upAxis === 'Z') grid.position.z = modelBox ? modelBox.min.z - s * 0.02 : 0;
 else grid.position.y = modelBox ? modelBox.min.y - s * 0.02 : 0;
 axes.position.copy(center);
 grid.visible = $('showGrid').checked;
 invalidate();
}
function fitView() {
 modelBox = getModelBounds();
 if (!modelBox) return;
 const size = modelBox.getSize(new THREE.Vector3());
 const center = modelBox.getCenter(new THREE.Vector3());
 const radius = Math.max(size.length() * 0.5, .1);
 camera.near = Math.max(radius / 1000, .0001);
 camera.far = Math.max(radius * 1000, 10000);
 camera.updateProjectionMatrix();
 controls.target.copy(center);
 controls.minDistance = Math.max(radius * .002, .001);
 controls.maxDistance = radius * 150;
 updateGrid();
 setView('iso');
 updateStats();
}
function setView(type) {
 const target = modelBox ? modelBox.getCenter(new THREE.Vector3()) : controls.target.clone();
 const size = modelBox ? modelBox.getSize(new THREE.Vector3()).length() : 1000;
 const dist = Math.max(size * 1.25, 10);
 const vec = upAxis === 'Z' ? {
  iso: [1, -1.45, .95], top: [0, .0001, 1], front: [0, -1, .0001], right: [1, 0, .0001]
 } : {
  iso: [1, .95, 1.45], top: [0, 1, .0001], front: [0, .0001, 1], right: [1, .0001, 0]
 };
 const dir = new THREE.Vector3(...vec[type]).normalize();
 camera.position.copy(target).addScaledVector(dir, dist);
 controls.target.copy(target);
 controls.update();
 for (const button of document.querySelectorAll('[data-view]')) button.classList.toggle('selected', button.dataset.view === type);
 invalidate();
 $('coordStatus').textContent = type === 'iso' ? '3D nézet' : ({top:'Felülnézet', front:'Elölnézet', right:'Oldalnézet'})[type];
}
function clearEdges() {
 for (const edge of modelEdges) { edge.parent?.remove(edge); edge.geometry.dispose(); edge.material.dispose(); }
 modelEdges = [];
 invalidate();
}
function toggleEdges(enabled) {
 clearEdges();
 if (!enabled || !model) return;
 model.traverse(obj => {
  if (!obj.isMesh || !obj.geometry?.attributes?.position || (model.userData.nativeScn && obj.userData.scnRole !== 'panel')) return;
  const g = new THREE.EdgesGeometry(obj.geometry, 30);
  const lines = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0x132b42, transparent: true, opacity: .65 }));
  obj.add(lines);
  modelEdges.push(lines);
 });
 invalidate();
}
function disposeModel() {
 clearSelection();
 clearMeasure();
 clearEdges();
 if (model) {
  scene.remove(model);
  model.traverse(obj => {
   if (obj.geometry) obj.geometry.dispose();
   if (obj.material) (Array.isArray(obj.material) ? obj.material : [obj.material]).forEach(m => m.dispose());
  });
 }
 if(scnMaterials?.wood) scnMaterials.wood.dispose();
 scnMaterials=null;
 model = null;
 modelBox = null;
}
function prepareModel(group, name) {
 disposeModel();
 boundsCache = new WeakMap();
 partSizeCache = new WeakMap();
 meshCountCache = new WeakMap();
 model = group;
 const native = model.userData.scnState;
 scnLayout = native ? {data:native.data,layout:native.layout} : null;
 scnRecordMeshes = native?.meshes || new Map();
 scnRegionGroups = native?.groups || new Map();
 scnMaterials = native?.palette || null;
 if(!native) $('scnExplorer').hidden=true;
 originName = name;
 model.traverse(obj => {
  if (!obj.isMesh) return;
  obj.material ??= new THREE.MeshStandardMaterial({color: 0xaabaca, roughness: .8, side: THREE.DoubleSide});
  // Avoid black faces on poorly-oriented CAD exports.
  const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
  for (const material of materials) { if (material.side !== undefined) material.side = THREE.DoubleSide; }
 });
 scene.add(model);
 fitView();
 invalidate();
 toggleEdges($('showEdges').checked);
 $('filename').textContent = name;
 $('fileHint').textContent = 'A modell betöltve. Méréshez kapcsold be a mérőeszközt.';
 $('emptyState').style.display = 'none';
 const meshes = [];
 model.traverse(obj => { if (obj.isMesh) meshes.push(obj); });
 meshNumbers = new WeakMap(meshes.map((mesh, index) => [mesh, index + 1]));
 updateSelectionStats();
 $('modelStats').title = `${meshes.length} háló`;
 notify(`Modell megnyitva: ${name} (${meshes.length} objektum)`);
}

// Independent SCN reconstruction. We draw real thin panel records as separate
// board-sized meshes. The catalog envelopes are never mistaken for solids.
function createWoodTexture() {
 const canvas = document.createElement('canvas');
 canvas.width = 192; canvas.height = 512;
 const ctx = canvas.getContext('2d');
 const image = ctx.createImageData(canvas.width, canvas.height);
 let seed = 94331;
 const rand = () => {seed = (1664525*seed+1013904223)>>>0;return seed/0x100000000;};
 const streaks = Array.from({length:canvas.width},(_,x)=>
   Math.sin(x*.09) * 7 + Math.sin(x*.44)*2 + (rand()-.5)*8);
 for(let y=0;y<canvas.height;y++) for(let x=0;x<canvas.width;x++) {
  const i=(y*canvas.width+x)*4;
  const grain = streaks[x] + Math.sin(y*.018+x*.045)*2 + (rand()-.5)*2;
  image.data[i]=Math.max(0,Math.min(255,216+grain));
  image.data[i+1]=Math.max(0,Math.min(255,182+grain*.9));
  image.data[i+2]=Math.max(0,Math.min(255,142+grain*.7));
  image.data[i+3]=255;
 }
 ctx.putImageData(image,0,0);
 const texture = new THREE.CanvasTexture(canvas);
 texture.colorSpace=THREE.SRGBColorSpace;
 texture.anisotropy=Math.min(renderer.capabilities.getMaxAnisotropy(),8);
 return texture;
}
function makeScnMaterials(finish) {
 const wood = createWoodTexture();
 const faceColors = {
  oak: 0xffffff,
  white: 0xf0f2f0,
  graphite: 0x667783,
 };
 const color = faceColors[finish] || faceColors.oak;
 const painted = finish !== 'oak';
 const face = new THREE.MeshStandardMaterial({color, map:painted?null:wood, roughness:painted?.76:.82, metalness:0, side:THREE.DoubleSide});
 const side = new THREE.MeshStandardMaterial({color:finish==='oak'?0xb68b61:finish==='white'?0xd4d8d7:0x40515c,roughness:.82,side:THREE.DoubleSide});
 const metal = new THREE.MeshStandardMaterial({color:0xa9b6bd,roughness:.34,metalness:.55,side:THREE.DoubleSide});
 const reference = new THREE.MeshBasicMaterial({color:0x8ec7d8,transparent:true,opacity:.075,depthWrite:false,side:THREE.DoubleSide});
 const edge = new THREE.LineBasicMaterial({color:0x82bdcb,transparent:true,opacity:.42,depthTest:true,depthWrite:false});
 return {wood, face,side,metal,reference,edge,
   board:[side,side,face,face,face,face]};
}
function applyScnFinish() {
 if (!model?.userData.nativeScn) return;
 const old = scnMaterials;
 scnMaterials = makeScnMaterials($('finishStyle').value);
 for(const mesh of scnRecordMeshes.values()) {
  const role = mesh.userData.scnRole;
  mesh.material = role==='panel'?scnMaterials.board:
    role==='fitting'?scnMaterials.metal:scnMaterials.reference;
 }
 if(old) {
  for(const item of [old.face,old.side,old.metal,old.reference,old.edge,old.wood]) item?.dispose();
 }
 invalidate();
}
function buildScnModel(data) {
 const root = new THREE.Group();
 root.name = 'SCN – önálló mérethelyes jelenet';
 root.userData.nativeScn=true;
 const layout = discoverScnRegions(data.entries);
 const groups = new Map();
 const meshes = new Map();
 for(const region of layout.regions) {
  const group=new THREE.Group();
  group.name=region.name + ' (térbeli csoport, becslés)';
  group.userData.scnRegionId=region.id;
  group.userData.scnRegion=region;
  group.userData.cabinetName=group.name;
  root.add(group);
  groups.set(region.id,group);
 }
 const detached=new THREE.Group();
 detached.name='Különálló SCN objektumok';
 detached.userData.scnRegionId=0;
 root.add(detached);
 groups.set(0,detached);
 const unitBox = new THREE.BoxGeometry(1,1,1);
 const cylinderX = new THREE.CylinderGeometry(.5,.5,1,12);
 cylinderX.rotateZ(Math.PI/2);
 const cylinderZ = new THREE.CylinderGeometry(.5,.5,1,12);
 cylinderZ.rotateX(Math.PI/2);
 const palette=makeScnMaterials($('finishStyle').value);
 for(const record of data.entries) {
  const role=classifyScnRecord(record);
  if(role==='invalid') continue;
  const geometry=record.type==='cylinderX'?cylinderX:record.type==='cylinderZ'?cylinderZ:unitBox;
  const mesh = new THREE.Mesh(geometry,role==='panel'?palette.board:
    role==='fitting'?palette.metal:palette.reference);
  mesh.name=`${record.name} #${record.id}`;
  mesh.scale.set(...record.size);
  mesh.position.set(...record.position.map((v,i)=>v+record.size[i]/2));
  mesh.userData.partName = record.name + ` (SCN #${record.id})`;
  mesh.userData.scnRole=role;
  mesh.userData.scnRecord=record;
  mesh.userData.scnApproximate=role!=='panel';
  const regionId=layout.idToRegion.get(record.id) ?? 0;
  mesh.userData.scnRegionId=regionId;
  groups.get(regionId)?.add(mesh);
  if(role==='reference') {
   // Named catalog objects get a pale outline instead of an opaque rectangle.
   // This outline does not claim to reproduce any KitchenDraw geometry.
   const outline = new THREE.LineSegments(new THREE.EdgesGeometry(unitBox),palette.edge);
   outline.userData.scnOutline=true;
   mesh.add(outline);
  }
  meshes.set(record.id,mesh);
 }
 root.userData.scnState={data,layout,groups,meshes,palette};
 return root;
}
function setScnVisible() {
 if (!model?.userData.nativeScn) return;
 const chosen=$('scnArea').value;
 const area = chosen==='all' ? null : Number(chosen);
 let panels=0, references=0;
 for(const mesh of scnRecordMeshes.values()) {
  const role=mesh.userData.scnRole;
  const inArea=area===null || mesh.userData.scnRegionId===area;
  const isVisible=inArea && (role==='panel' ||
    (role==='fitting' && $('showFittings').checked) ||
    (role==='reference' && $('showCatalogShapes').checked));
  // Generic CUBE proxy volumes deliberately stay hidden; even enabling
  // outlines must not cover assembled panel geometry with massive boxes.
  mesh.visible=isVisible;
  if(isVisible && role==='panel') panels++;
  if(isVisible && role==='reference') references++;
 }
 if(selectedMesh && !selectedMesh.visible) clearSelection();
 $('visibleScnCount').textContent=`${panels} különálló lap · ${references} referenciakörvonal`;
 boundsCache=new WeakMap();
 partSizeCache=new WeakMap();
 fitView();
 updateScnItemList();
 invalidate();
}
function updateScnItemList() {
 const list=$('scnItemList');
 list.replaceChildren();
 if(!model?.userData.nativeScn) return;
 const area=$('scnArea').value;
 const entries=scnLayout.data.entries.filter(record=>
  classifyScnRecord(record)==='reference' &&
  (area==='all'||String(scnLayout.layout.idToRegion.get(record.id)??0)===area));
 for(const record of entries.slice(0,50)) {
  const btn=document.createElement('button');
  btn.className='scn-item';
  const label=document.createElement('span');label.textContent=record.name;
  const size=document.createElement('small');size.textContent=record.size.join(' × ')+' mm';
  btn.append(label,size);
  btn.title='Katalógushivatkozás – nem feltétlenül alkatrész vagy önálló szekrény';
  btn.addEventListener('click',()=>{
   $('showCatalogShapes').checked=true;
   const areaId=scnLayout.layout.idToRegion.get(record.id)??0;
   if($('scnArea').value!=='all' && String(areaId)!==$('scnArea').value) $('scnArea').value='all';
   setScnVisible();
   const target=scnRecordMeshes.get(record.id);
   if(!target) return;
   setSelection(target);
   focusOnObject(target);
  });
  list.append(btn);
 }
 if(entries.length>50) {
  const note=document.createElement('p'); note.className='hint'; note.textContent=`További ${entries.length-50} bejegyzés nem látható a listában.`;list.append(note);
 }
}
function focusOnObject(object) {
 const box = new THREE.Box3().setFromObject(object);
 if(box.isEmpty()) return;
 const center=box.getCenter(new THREE.Vector3());
 const size=box.getSize(new THREE.Vector3());
 const radius=Math.max(size.length()*.5,50);
 controls.target.copy(center);
 const dir=camera.position.clone().sub(controls.target).normalize();
 if(dir.lengthSq()<.1) dir.set(1,-1,1).normalize();
 camera.position.copy(center).addScaledVector(dir,radius*3.1);
 camera.near=Math.max(radius/2000,.01);
 camera.far=Math.max(radius*2000,10000);
 camera.updateProjectionMatrix();
 controls.update();invalidate();
}
function updateScnExplorer() {
 if(!scnLayout) return;
 $('scnExplorer').hidden=false;
 const chooser=$('scnArea');
 chooser.replaceChildren();
 for(const [value,label] of [['all','Összes terület'],...scnLayout.layout.regions.map(z=>[String(z.id),z.label])]) {
  const option=document.createElement('option');option.value=value;option.textContent=label;chooser.append(option);
 }
 const best=scnLayout.layout.regions.find(x=>x.panelCount>=3);
 chooser.value=best?String(best.id):'all';
 setScnVisible();
}
async function openScn(file) {
 try {
  if (file.size > 50 * 1024 * 1024) throw new Error('Legfeljebb 50 MB-os SCN nyitható meg.');
  $('fileHint').textContent = 'SCN bináris objektumadatok feldolgozása…';
  const decoded = decodeScn(await file.arrayBuffer());
  const sceneGroup = buildScnModel(decoded);
  $('upAxis').value = 'Z';
  $('mmPerUnit').value = '1';
  mmPerUnit = 1;
  setAxis('Z');
  prepareModel(sceneGroup, file.name);
  updateScnExplorer();
  $('fileHint').textContent = `${decoded.entries.length} SCN-rekord. A különálló lapok előtérben; a katalógusobjektumok csak opcionális körvonalak. A pontos gyártói formák hiányozhatnak.`;
  $('scnInfo').textContent = `${decoded.entries.length} rekord · ${scnLayout.layout.regions.length} elkülönülő szerkezeti terület. A lapok méretei az SCN-ből származnak; csoportosításuk térbeli becslés.`;
  notify(`SCN megnyitva: ${decoded.entries.length} rekord · lapokra bontott nézet.`);
 } catch (error) {
  console.error(error);
  $('fileHint').textContent = 'Nem támogatott SCN változat vagy sérült fájl: ' + (error?.message || String(error));
  notify('SCN beolvasási hiba: ' + (error?.message || String(error)));
 }
}
async function openFiles(files) {
 const all = Array.from(files);
 const file = all.find(f => /\.(obj|3ds|stl|glb|gltf|scn)$/i.test(f.name));
 if (!file) return notify('OBJ, 3DS, STL, GLB, GLTF vagy SCN fájlt válassz.');
 const extension = file.name.split('.').pop().toLowerCase();
 if (extension === 'scn') { await openScn(file); return; }
 try {
  let result;
  if (extension === 'obj') {
   const data = await file.text();
   result = new OBJLoader().parse(data);
  } else if (extension === '3ds') {
   const data = await file.arrayBuffer();
   result = new TDSLoader().parse(data);
  } else if (extension === 'stl') {
   const data = await file.arrayBuffer();
   const geometry = new STLLoader().parse(data);
   geometry.computeVertexNormals();
   result = new THREE.Group();
   result.add(new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: 0xa5c9e8, side: THREE.DoubleSide, roughness: .8 })));
  } else {
   const data = extension === 'glb' ? await file.arrayBuffer() : await file.text();
   const gltf = await new Promise((resolve, reject) => new GLTFLoader().parse(data, '', resolve, reject));
   result = gltf.scene;
  }
  if (!result || new THREE.Box3().setFromObject(result).isEmpty()) throw new Error('Nem található 3D geometria a fájlban.');
  $('upAxis').value = ['glb', 'gltf'].includes(extension) ? 'Y' : 'Z';
  setAxis($('upAxis').value);
  prepareModel(result, file.name);
  $('manifestSection').hidden=true;
 } catch(error) { console.error(error); notify('Nem sikerült megnyitni: ' + (error?.message || String(error))); }
}

// Cabinet/part selection. Part sizes are from the part's local geometry,
// preserving measurements when a panel is rotated in the exported CAD model.
// Cabinet exterior is a WORLD axis-aligned bounding box of its group.
function getLocalPartSize(mesh) {
 const cached = partSizeCache.get(mesh);
 if (cached) return cached.clone();
 const geometry = mesh.geometry;
 if (!geometry.boundingBox) geometry.computeBoundingBox();
 const localSize = geometry.boundingBox.getSize(new THREE.Vector3());
 const scale = mesh.getWorldScale(new THREE.Vector3());
 const size = new THREE.Vector3(localSize.x * Math.abs(scale.x), localSize.y * Math.abs(scale.y), localSize.z * Math.abs(scale.z));
 partSizeCache.set(mesh, size);
 return size.clone();
}
function getSelectionBounds(object) {
 let box = boundsCache.get(object);
 if (!box) { box = new THREE.Box3().setFromObject(object); boundsCache.set(object, box); }
 return box.clone();
}
function meshCount(group) {
 if (meshCountCache.has(group)) return meshCountCache.get(group);
 let count = 0;
 group.traverse(object => { if (object.isMesh) count++; });
 meshCountCache.set(group, count);
 return count;
}
function isCabinetName(name) {
 return /szekr[eé]ny|cabinet|cupboard|wardrobe|kitchen.unit|furniture|korpusz|b[uú]tor/i.test(name || '');
}
function findCabinetGroup(mesh) {
 if (!model) return { object: null, inferred: false };
 const hierarchy = [];
 for (let p = mesh.parent; p && p !== model; p = p.parent) hierarchy.push(p);
 // A CAD scene with explicit named group(s) takes precedence.
 const named = hierarchy.find(p => p.userData?.scnRegionId || p.userData?.cabinetId || p.userData?.cabinet || isCabinetName(p.name));
 if (named) return { object: named, inferred: true };
 // Separate root-level branches that contain multiple meshes usually mean a cabinet.
 const branch = hierarchy.at(-1);
 if (branch && model.children.length > 1 && meshCount(branch) > 1) return { object: branch, inferred: true };
 // When cabinet boundaries were lost in export, never call an arbitrary mesh a cabinet.
 if (model.userData?.nativeScn) return {object: mesh, inferred: true};
 return { object: model, inferred: false };
}
function selectionDetails() {
 if (!selectedMesh || !model) return null;
 const mode = $('selectionType').value;
 if (mode === 'part' || (model.userData?.nativeScn && selectedMesh.userData.scnRole === 'reference')) {
  const size = getLocalPartSize(selectedMesh);
  const name = selectedMesh.userData?.partName || selectedMesh.name || `Alkatrész ${meshNumbers.get(selectedMesh) || ''}`;
  const kind = model.userData?.nativeScn ?
    (selectedMesh.userData.scnRole === 'panel' ? 'Különálló szerkezeti lap' : 'Katalógusobjektum (befoglaló)') : 'Alkatrész';
  return { object: selectedMesh, box: getSelectionBounds(selectedMesh), name,
    size, kind,
    notice: model.userData?.nativeScn ? (selectedMesh.userData.scnRole === 'panel' ?
     'A méret a fájlban tárolt különálló SCN lapból származik (mm). A pontos elforgatás nem mindig ismert.' :
     'Ez a méret a KitchenDraw-katalógusra hivatkozó objektum befoglalója, NEM bizonyított alkatrészméret vagy eredeti 3D test.') :
     'Az alkatrész saját geometriájának méretei. Több alkatrész összevont 3D hálóját a Viewer nem tudja különválasztani.' };
 }
 const { object, inferred } = findCabinetGroup(selectedMesh);
 let box = getSelectionBounds(object);
 if(model.userData.nativeScn && object.userData?.scnRegion) {
  const region=object.userData.scnRegion;
  box = new THREE.Box3(new THREE.Vector3(...region.min), new THREE.Vector3(...region.max));
 }
 const name = inferred ? (object.userData?.cabinetName || object.name || 'SCN objektum') : 'Teljes betöltött modell';
 return { object, box, name, size: box.getSize(new THREE.Vector3()), kind: (model.userData?.nativeScn) ? (object.isMesh ? 'SCN objektum' : 'Bútoregyüttes (becsült)') : 'Szekrény',
   notice: inferred
     ? (model.userData?.nativeScn ? 'A látható lapok térbeli csoportjának külső mérete; ez nem bizonyított egyedi KitchenDraw szekrényhatár.' : 'A csoport befoglaló külmérete (X × Y × Z); az exportban szereplő elforgatás is befolyásolhatja.')
     : 'A fájl nem tartalmaz felismerhető szekrénycsoportokat: ezért a teljes modell külmérete látható, nem egy külön szekrényé.' };
}
function clearSelection() {
 selectedMesh = null;
 if (selectionBox) {
  scene.remove(selectionBox);
  selectionBox.geometry.dispose();
  selectionBox.material.dispose();
  selectionBox = null;
 }
 updateSelectionStats();
 invalidate();
}
function updateSelectionStats() {
 const details = selectionDetails();
 $('selectedName').textContent = details ? details.name : 'Nincs kijelölve';
 $('selectedKind').textContent = details ? details.kind : '–';
 $('selectedNote').textContent = details ? details.notice : 'Bal kattintással válassz ki egy látható elemet.';
 const zUp = upAxis === 'Z';
 $('labelSizeY').textContent = zUp ? 'Y – mélység' : 'Z – mélység';
 $('labelSizeZ').textContent = zUp ? 'Z – magasság' : 'Y – magasság';
 for (const [id, axis] of [['sizeX','x'], ['sizeY',zUp ? 'y' : 'z'], ['sizeZ',zUp ? 'z' : 'y']]) {
  $(id).textContent = details ? `${format(details.size[axis] * mmPerUnit, 1)} mm` : '–';
 }
}
function setSelection(mesh) {
 clearSelection();
 if (!mesh) return;
 selectedMesh = mesh;
 const details = selectionDetails();
 if (!details || details.box.isEmpty()) return;
 selectionBox = new THREE.Box3Helper(details.box, 0x50e6a7);
 selectionBox.material.depthTest = false;
 selectionBox.renderOrder = 15;
 scene.add(selectionBox);
 updateSelectionStats();
 invalidate();
}
function refreshSelection() {
 const mesh = selectedMesh;
 clearSelection();
 if (mesh) setSelection(mesh);
}

// Geometry measurement – raycast onto real triangles, with screen-space
// endpoint and edge snapping. Local vertex positions are transformed to world.
function closestPointOnSegment(p, a, b) {
 const v = b.clone().sub(a), denom = v.lengthSq();
 const t = denom < eps ? 0 : THREE.MathUtils.clamp(p.clone().sub(a).dot(v) / denom, 0, 1);
 return a.clone().addScaledVector(v, t);
}
function toCanvasPixels(world) {
 const projected = world.clone().project(camera);
 const rect = renderer.domElement.getBoundingClientRect();
 return new THREE.Vector2((projected.x + 1) * rect.width / 2, (1 - projected.y) * rect.height / 2);
}
function pickHit(event) {
 if (!model) return null;
 const rect = renderer.domElement.getBoundingClientRect();
 const px = event.clientX - rect.left, py = event.clientY - rect.top;
 mouse.set(px / rect.width * 2 - 1, -(py / rect.height) * 2 + 1);
 raycaster.setFromCamera(mouse, camera);
 // Geometry only, not the grid, axes, measurement markers or selection outline.
 const valid = raycaster.intersectObject(model, true).filter(h => h.object.isMesh && h.object.visible &&
   (!model.userData.nativeScn || h.object.userData.scnRole !== 'proxy'));
 return model.userData.nativeScn ? (valid.find(h=>h.object.userData.scnRole==='panel') || valid[0] || null) : (valid[0] || null);
}
function pickPoint(event) {
 const hit = pickHit(event);
 if (!hit) return null;
 const rect = renderer.domElement.getBoundingClientRect();
 const px = event.clientX - rect.left, py = event.clientY - rect.top;
 let point = hit.point.clone();
 const geometry = hit.object.geometry;
 const face = hit.face;
 if (geometry && face && geometry.attributes.position) {
  const position = geometry.attributes.position;
  const p = [face.a, face.b, face.c].map(i => tempVec.fromBufferAttribute(position, i).clone().applyMatrix4(hit.object.matrixWorld));
  // First choose a vertex within 13 screen pixels; otherwise an edge within 9px.
  const click = new THREE.Vector2(px, py);
  let bestVertex = null, bestDist = 13;
  for (const v of p) { const d = toCanvasPixels(v).distanceTo(click); if (d < bestDist) { bestVertex = v; bestDist = d; } }
  if (bestVertex) point = bestVertex.clone();
  else {
   let bestEdge = null, bestEdgeDist = 9;
   for (const [a,b] of [[0,1],[1,2],[2,0]]) {
    const va = toCanvasPixels(p[a]), vb = toCanvasPixels(p[b]);
    const projected = closestPointOnSegment(click, va, vb);
    const dist = projected.distanceTo(click);
    if (dist < bestEdgeDist) {
     bestEdgeDist = dist;
     const len = vb.distanceToSquared(va);
     const t = len < eps ? 0 : THREE.MathUtils.clamp(projected.clone().sub(va).dot(vb.clone().sub(va)) / len, 0, 1);
     bestEdge = p[a].clone().lerp(p[b], t);
    }
   }
   if (bestEdge) point = bestEdge;
  }
 }
 return point;
}
function clearPointGraphics() {
 if (line) { scene.remove(line); line.geometry.dispose(); line.material.dispose(); line = null; }
 for (const marker of markers) { scene.remove(marker); marker.geometry.dispose(); marker.material.dispose(); }
 markers = [];
}
function renderMeasure() {
 clearPointGraphics();
 const [a, b] = snapPoints;
 $('pointA').textContent = formatPoint(a);
 $('pointB').textContent = formatPoint(b);
 $('distance').textContent = (a && b) ? `${format(a.distanceTo(b) * mmPerUnit)} mm` : '– mm';
 for (const [id, component] of [['dx','x'], ['dy','y'], ['dz','z']]) $(''+id).textContent = a && b ? `${format(Math.abs(b[component]-a[component])*mmPerUnit)} mm` : '–';
 if (!a) return;
 const size = modelBox ? modelBox.getSize(new THREE.Vector3()).length() : 1000;
 const r = Math.max(size * .005, .001);
 snapPoints.forEach((point, index) => {
  const sphere = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 8), new THREE.MeshBasicMaterial({color:index === 0 ? 0x00d8ff : 0xffcb5f, depthTest:false}));
  sphere.position.copy(point);
  sphere.renderOrder = 10;
  scene.add(sphere);
  markers.push(sphere);
 });
 if (b) {
  line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([a,b]), new THREE.LineBasicMaterial({color:0xffec79,depthTest:false}));
  line.renderOrder = 9;
  scene.add(line);
 }
 invalidate();
}
function clearMeasure() { snapPoints = []; clearPointGraphics(); renderMeasure(); }
function toggleMeasure(force) {
 measureEnabled = typeof force === 'boolean' ? force : !measureEnabled;
 $('measureToggle').classList.toggle('active', measureEnabled);
 $('measureToggle').textContent = measureEnabled ? '✓ Mérés bekapcsolva' : '📏 Mérés bekapcsolása';
 $('modeStatus').classList.toggle('active', measureEnabled);
 $('modeStatus').textContent = measureEnabled ? 'Méretezés: 2 pont' : 'Kijelölés: ' + ($('selectionType').value === 'part' ? 'alkatrész' : 'szekrény');
 renderer.domElement.style.cursor = measureEnabled ? 'crosshair' : 'pointer';
 invalidate();
}
renderer.domElement.addEventListener('pointerdown', event => {
 activePointer = { x: event.clientX, y: event.clientY, button: event.button };
});
renderer.domElement.addEventListener('pointerup', event => {
 if (event.button !== 0 || !activePointer || activePointer.button !== 0) return;
 const distance = Math.hypot(event.clientX - activePointer.x, event.clientY - activePointer.y);
 activePointer = null;
 if (distance > 5) return;
 if (!measureEnabled) {
  const hit = pickHit(event);
  setSelection(hit?.object || null);
  if (!hit) notify('Nincs kijelölt elem. Kattints egy látható szekrényre vagy alkatrészre.');
  return;
 }
 const point = pickPoint(event);
 if (!point) { notify('Kattints a modell látható felületére.'); return; }
 if (snapPoints.length >= 2) snapPoints = [];
 snapPoints.push(point);
 renderMeasure();
 if (snapPoints.length === 2) notify('Távolság: ' + format(snapPoints[0].distanceTo(snapPoints[1]) * mmPerUnit) + ' mm');
});
$('selectionType').addEventListener('change', () => { refreshSelection(); toggleMeasure(false); });
$('clearSelection').addEventListener('click', clearSelection);
$('fileInput').addEventListener('change', e => { openFiles(e.target.files); e.target.value = ''; });
$('measureToggle').addEventListener('click', () => toggleMeasure());
$('resetView').addEventListener('click', fitView);
$('clearMeasure').addEventListener('click', clearMeasure);
$('undoPoint').addEventListener('click', () => { snapPoints.pop(); renderMeasure(); });
$('mmPerUnit').addEventListener('input', e => {
 const n = Number(e.target.value);
 if (Number.isFinite(n) && n > 0) { mmPerUnit = n; renderMeasure(); updateStats(); }
});
$('upAxis').addEventListener('change', e => { setAxis(e.target.value); updateGrid(); updateSelectionStats(); });
$('showGrid').addEventListener('change', updateGrid);
$('showEdges').addEventListener('change', e => toggleEdges(e.target.checked));
$('scnArea').addEventListener('change', setScnVisible);
$('showCatalogShapes').addEventListener('change', setScnVisible);
$('showFittings').addEventListener('change', setScnVisible);
$('finishStyle').addEventListener('change', applyScnFinish);
$('copyMeasure').addEventListener('click', async () => {
 if (snapPoints.length !== 2) return notify('Előbb jelölj ki két pontot!');
 const [a,b] = snapPoints;
 const content = `SCN Viewer mérés\nA: ${formatPoint(a)}\nB: ${formatPoint(b)}\nTávolság: ${format(a.distanceTo(b)*mmPerUnit)} mm\nΔX: ${format(Math.abs(a.x-b.x)*mmPerUnit)} mm\nΔY: ${format(Math.abs(a.y-b.y)*mmPerUnit)} mm\nΔZ: ${format(Math.abs(a.z-b.z)*mmPerUnit)} mm`;
 try { await navigator.clipboard.writeText(content); notify('Mérési adatok másolva.'); }
 catch { notify('Másolás nem támogatott ezen a címen (használj localhost-ot vagy HTTPS-t).'); }
});
document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => setView(button.dataset.view)));
viewport.addEventListener('dragover', e => { e.preventDefault(); viewport.style.outline = '2px dashed #4ec5ff'; });
viewport.addEventListener('dragleave', () => viewport.style.outline = 'none');
viewport.addEventListener('drop', e => { e.preventDefault(); viewport.style.outline = 'none'; openFiles(e.dataTransfer.files); });
const resize = () => {
 const w = Math.max(viewport.clientWidth, 1), h = Math.max(viewport.clientHeight, 1);
 camera.aspect = w/h; camera.updateProjectionMatrix(); renderer.setSize(w,h,false);
};
let renderRequested = false;
function invalidate() {
 if (renderRequested) return;
 renderRequested = true;
 requestAnimationFrame(() => {
  renderRequested = false;
  controls.update();
  renderer.render(scene, camera);
 });
}
new ResizeObserver(() => { resize(); invalidate(); }).observe(viewport);
resize();
invalidate();

