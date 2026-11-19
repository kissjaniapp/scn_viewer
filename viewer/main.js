import { decodeScn } from './scn-parser.js';
import { decodeSkpToGlb } from './skp-loader.js';
import { classifyScnRecord } from './scn-layout.js';
import { discoverScnScenes } from './scn-scenes.js';
import { catalogPreviewType, makeCatalogPreview } from './scn-structure.js';
import { scnWorldBounds } from './scn-transform.js';
import { correctedPosition, correctedBounds, envelopeWarnings, normaliseAdjustment } from './scn-placement.js';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { TDSLoader } from 'three/addons/loaders/TDSLoader.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const $ = (id) => document.getElementById(id);
const viewport = $('viewport');
let modelOnlyMode = false;
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
let savedMeasures = [];
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
let scnFileHash = null;
let scnCorrections = {};
let positionSaveFailed = false;
const hiddenObjects = new Set();
// Identity-based references remain stable when the scene tree is redrawn.
let treeNodeElements = new Map();
let treeExpanded = new WeakMap();
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
function isVisibleInHierarchy(object) {
 for(let item=object; item; item=item.parent) {
  if(!item.visible || hiddenObjects.has(item)) return false;
  if(item===model) break;
 }
 return true;
}
function getModelBounds() {
 if (!model) return null;
 model.updateWorldMatrix(true, true);
 const box = new THREE.Box3();
 if(model.userData.nativeScn) {
  for(const object of scnRecordMeshes.values()) {
   if(!isVisibleInHierarchy(object)) continue;
   object.traverse(mesh => {
    if(mesh.isMesh && isVisibleInHierarchy(mesh)) box.expandByObject(mesh);
   });
  }
 } else model.traverse(obj => { if(obj.isMesh && isVisibleInHierarchy(obj)) box.expandByObject(obj); });
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
 grid.visible = !modelOnlyMode && $('showGrid').checked;
 axes.visible = !modelOnlyMode && $('showAxes').checked;
 document.querySelector('.axis-label').hidden = modelOnlyMode || !$('showAxes').checked;
 invalidate();
}
// Recompute the orbit pivot and zoom limits from ONLY the currently visible
// meshes. Keep the user's viewing angle; never orbit around a hidden cabinet.
function refitCameraToVisibleObjects() {
 if (!model) return;
 modelBox = getModelBounds();
 if (!modelBox) {
  // All objects are hidden: do not jump to a phantom origin.
  updateGrid();
  updateStats();
  invalidate();
  return;
 }
 const center = modelBox.getCenter(new THREE.Vector3());
 const diagonal = modelBox.getSize(new THREE.Vector3()).length();
 const radius = Math.max(diagonal * .5, .00001);
 const direction = camera.position.clone().sub(controls.target);
 if (direction.lengthSq() < 1e-16) {
  direction.set(upAxis === 'Z' ? 1 : 1, upAxis === 'Z' ? -1 : 1, upAxis === 'Z' ? .95 : 1);
 }
 direction.normalize();
 // SKP coordinates are metres, SCN coordinates are mm: no fixed 10-unit
 // zoom floor, which would make small SketchUp components disappear.
 const fov = THREE.MathUtils.degToRad(camera.fov);
 const halfVertical = Math.max(fov / 2, .001);
 const halfHorizontal = Math.atan(Math.tan(halfVertical) * Math.max(camera.aspect, .01));
 const limitingHalfAngle = Math.min(halfVertical, halfHorizontal);
 const distance = Math.max(radius * 1.2 / Math.sin(limitingHalfAngle), .0001);
 controls.target.copy(center);
 camera.position.copy(center).addScaledVector(direction, distance);
 camera.near = Math.max(radius / 2000, .0000001);
 camera.far = Math.max(radius * 2000, distance * 5, 10);
 camera.updateProjectionMatrix();
 controls.minDistance = Math.max(radius * .002, .00000001);
 controls.maxDistance = Math.max(radius * 150, distance * 4);
 controls.update();
 updateGrid();
 updateStats();
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
  iso: [1, -1.45, .95], top: [0, .0001, 1], bottom: [0, -.0001, -1], front: [0, -1, .0001], back: [0, 1, .0001], right: [1, 0, .0001]
 } : {
  iso: [1, .95, 1.45], top: [0, 1, .0001], bottom: [0, -1, -.0001], front: [0, .0001, 1], back: [0, .0001, -1], right: [1, .0001, 0]
 };
 const dir = new THREE.Vector3(...vec[type]).normalize();
 camera.position.copy(target).addScaledVector(dir, dist);
 controls.target.copy(target);
 controls.update();
 for (const button of document.querySelectorAll('[data-view]')) button.classList.toggle('selected', button.dataset.view === type);
 invalidate();
 $('coordStatus').textContent = type === 'iso' ? '3D nézet' : ({top:'Felülnézet', bottom:'Alulnézet', front:'Elölnézet', back:'Hátulnézet', right:'Oldalnézet'})[type];
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
  if (!obj.isMesh || !obj.geometry?.attributes?.position || (model.userData.nativeScn && !['panel','catalog-part'].includes(obj.userData.scnRole))) return;
  const g = new THREE.EdgesGeometry(obj.geometry, 30);
  const lines = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0x132b42, transparent: true, opacity: .65 }));
  obj.add(lines);
  modelEdges.push(lines);
 });
 invalidate();
}
function disposeModel() {
 clearSelection();
 savedMeasures = [];
 refreshSavedMeasureList();
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
 hiddenObjects.clear();
 treeNodeElements = new Map();
 treeExpanded = new WeakMap();
 // The document root stays open so the top-level, collapsed groups are visible.
 treeExpanded.set(model,true);
 refreshHiddenObjects();
 scnRecordMeshes = native?.meshes || new Map();
 scnRegionGroups = native?.groups || new Map();
 renderStructureTree();
 scnMaterials = native?.palette || null;
 if(!native) { $('scnExplorer').hidden=true; scnFileHash=null; scnCorrections={}; }
 refreshPositionPanel();
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
 // A visibly different palette for *schematic* catalog elements. Do not mistake
 // their panels for real cut-list parts read from the SCN file.
 const previewBoard = new THREE.MeshStandardMaterial({
  color:finish==='oak'?0xd6b38d:finish==='white'?0xe7ecea:0x718693,
  transparent:true,opacity:.94,roughness:.81,side:THREE.DoubleSide,
 });
 const previewBack = new THREE.MeshStandardMaterial({
  color:finish==='oak'?0xb9ae96:finish==='white'?0xc1cfd1:0x536976,
  roughness:.87,side:THREE.DoubleSide,
 });
 const applianceBody = new THREE.MeshStandardMaterial({color:0x8d9aa4,roughness:.39,metalness:.45});
 const applianceFront = new THREE.MeshStandardMaterial({color:0x2e4354,roughness:.40,metalness:.2});
 const solid = new THREE.MeshStandardMaterial({color:0xe6e9e7,roughness:.78,side:THREE.DoubleSide});
 const surface = new THREE.MeshStandardMaterial({color:0xbfcad2,roughness:.85,side:THREE.DoubleSide});
 return {wood, face,side,metal,reference,edge,previewBoard,previewBack,applianceBody,applianceFront,solid,surface,
   board:[side,side,face,face,face,face]};
}
function applyScnFinish() {
 if (!model?.userData.nativeScn) return;
 const old = scnMaterials;
 scnMaterials = makeScnMaterials($('finishStyle').value);
 for (const entry of scnRecordMeshes.values()) {
  entry.traverse(object => {
   if (object.isMesh) {
    const slot = object.userData.scnMaterialType;
    object.material = slot === 'board' ? scnMaterials.board :
      slot === 'metal' ? scnMaterials.metal :
      slot === 'reference' ? scnMaterials.reference :
      scnMaterials[slot] || scnMaterials.reference;
   } else if(object.isLineSegments && object.userData.scnOutline) object.material = scnMaterials.edge;
  });
 }
 if (old) {
  for (const item of [old.face,old.side,old.metal,old.reference,old.edge,old.wood,
    old.previewBoard,old.previewBack,old.applianceBody,old.applianceFront,old.solid,old.surface]) item?.dispose();
 }
 invalidate();
}

// Only the catalog object's external dimensions are factual. Build an open,
// labeled illustration of the shell (or equipment), never call its boards real.
function createCatalogGroup(record, palette) {
 const preview = makeCatalogPreview(record);
 const root = new THREE.Group();
 root.name = `${record.name} – rekonstruált vázlat #${record.id}`;
 root.userData.scnRole = 'reference';
 root.userData.scnRecord = record;
 root.userData.scnPreviewKind = preview.kind;
 root.userData.cabinetId = record.id;
 root.userData.cabinetName = `${record.name} (SCN #${record.id})`;
 root.userData.scnApproximate = true;
 // Local origin is the source SCN placement point; all parts must inherit the
 // same Z rotation, otherwise a 180-degree cabinet drifts by its full width.
 root.position.set(...correctedPosition(record, scnCorrections[record.id]));
 root.rotation.z = record.rotationRad || 0;
 for (const part of preview.parts) {
  const partMesh = new THREE.Mesh(new THREE.BoxGeometry(1,1,1), palette[part.material]);
  partMesh.scale.set(...part.size);
  partMesh.position.set(...part.position.map((v,i) => v + part.size[i]*.5));
  partMesh.userData.scnRole = 'catalog-part';
  partMesh.userData.scnMaterialType = part.material;
  partMesh.userData.scnRecord = record;
  partMesh.userData.scnApproximate = true;
  partMesh.userData.partName = `${record.name} #${record.id} – ${part.name}`;
  root.add(partMesh);
 }
 // The outline is especially useful for catalog shapes without reconstructed parts.
 // Not raycast-selectable: all size selection comes from the original record.
 if (preview.kind === 'outline') {
  const outline = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(...record.size)),palette.edge);
  outline.position.set(...record.size.map(v => v / 2));
  outline.userData.scnOutline=true;
  root.add(outline);
 }
 return root;
}

function buildScnModel(data) {
 const root = new THREE.Group();
 root.name = 'SCN – önálló mérethelyes jelenet';
 root.userData.nativeScn=true;
 const layout = discoverScnScenes(data.entries);
 const groups = new Map();
 const meshes = new Map();
 for(const region of layout.regions) {
  const group=new THREE.Group();
  group.name=region.name + ' (SCN térbeli jelenetrész, nem szekrényazonosító)';
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
 unitBox.translate(.5,.5,.5); // [0,1]^3: rotation pivot is SCN local origin
 const cylinderX = new THREE.CylinderGeometry(.5,.5,1,12);
 cylinderX.rotateZ(Math.PI/2);
 cylinderX.translate(.5,.5,.5);
 const cylinderZ = new THREE.CylinderGeometry(.5,.5,1,12);
 cylinderZ.rotateX(Math.PI/2);
 cylinderZ.translate(.5,.5,.5);
 const rectangle2d = new THREE.PlaneGeometry(1,1);
 rectangle2d.translate(.5,.5,0);
 const circle2d = new THREE.CircleGeometry(.5,32);
 circle2d.translate(.5,.5,0);
 const palette=makeScnMaterials($('finishStyle').value);
 for(const record of data.entries) {
  const role=classifyScnRecord(record);
  if(role==='invalid') continue;
  let item;
  if (role === 'reference') {
   item = createCatalogGroup(record, palette);
  } else {
   const geometry=record.type==='cylinderX'?cylinderX:record.type==='cylinderZ'?cylinderZ:
     record.type==='plane2d'?rectangle2d:record.type==='circle2d'?circle2d:unitBox;
   const materialType=role==='panel'||role==='wall'?'board':
     role==='solid'?'solid':role==='surface'?'surface':role==='fitting'?'metal':'reference';
   item = new THREE.Mesh(geometry, materialType==='board'?palette.board:palette[materialType]);
   item.scale.set(...record.size);
   item.position.set(...correctedPosition(record, scnCorrections[record.id]));
   item.rotation.z = record.rotationRad || 0;
   item.userData.scnMaterialType=materialType;
   item.userData.partName = record.name + ` (SCN #${record.id})`;
   item.userData.scnApproximate=!['panel','wall','solid','surface'].includes(role);
  }
  item.name=`${record.name} #${record.id}`;
  item.userData.scnRole=role;
  item.userData.scnRecord=record;
  const regionId=layout.idToRegion.get(record.id) ?? 0;
  item.userData.scnRegionId=regionId;
  groups.get(regionId)?.add(item);
  meshes.set(record.id,item);
 }
 root.userData.scnState={data,layout,groups,meshes,palette};
 return root;
}
function setScnVisible({refit = true} = {}) {
 if (!model?.userData.nativeScn) return;
 let panels=0, references=0, walls=0;
 for(const group of scnRegionGroups.values()) group.visible=!hiddenObjects.has(group);
 for(const object of scnRecordMeshes.values()) {
  const role=object.userData.scnRole;
  object.visible=!hiddenObjects.has(object) && !hiddenObjects.has(object.parent);
  object.traverse(part=>{if(part!==object) part.visible=!hiddenObjects.has(part);});
  if(object.visible && (role==='panel'||role==='solid'||role==='surface')) panels++;
  if(object.visible && role==='reference') references++;
  if(object.visible && role==='wall') walls++;
 }
 if(selectedMesh) {
  let visible=true;
  for(let p=selectedMesh; p && p!==model; p=p.parent) if(!p.visible) {visible=false;break;}
  if(!visible) clearSelection();
 }
 $('visibleScnCount').textContent=`${panels} lap / szilárdtest / 2D sík · ${references} katalógusvázlat · ${walls} takarópanel · teljes rajztér`;
 showScnEnvelopeWarnings();
 boundsCache=new WeakMap();
 partSizeCache=new WeakMap();
 if(refit) fitView();
 else refitCameraToVisibleObjects();
 updateScnItemList();
 renderStructureTree();
 invalidate();
}
function refreshHiddenObjects() {
 const list=$('hiddenObjectsList');
 if(!list) return;
 list.replaceChildren();
 $('showAllObjects').disabled=hiddenObjects.size===0;
 if(!hiddenObjects.size) {
  const hint=document.createElement('p');
  hint.className='hint'; hint.textContent='Nincs elrejtett elem.';
  list.append(hint); return;
 }
 for(const object of hiddenObjects) {
  const button=document.createElement('button');
  button.className='scn-item';
  button.textContent='👁 Visszakapcsolás: '+(object.userData?.cabinetName||object.userData?.partName||object.name||'Objektum');
  button.addEventListener('click',()=>{
   hiddenObjects.delete(object); object.visible=true;
   if(model?.userData.nativeScn) setScnVisible({refit:false});
   else {refitCameraToVisibleObjects();renderStructureTree();}
   refreshHiddenObjects();
  });
  list.append(button);
 }
}
function hideSelectedObject() {
 if(!selectedMesh || !model) return;
 const details=selectionDetails();
 if(!details?.object || details.object===model) return notify('Válassz ki egy külön bútort vagy alkatrészt!');
 const object=details.object;
 hiddenObjects.add(object); object.visible=false;
 clearSelection();
 if(model.userData.nativeScn) setScnVisible({refit:false});
 else refitCameraToVisibleObjects();
 refreshHiddenObjects();
 renderStructureTree();
 notify('Elrejtve: '+(object.userData?.cabinetName||object.userData?.partName||object.name));
}
function selectedScnRecord() {
 if (!model?.userData.nativeScn || !selectedMesh) return null;
 const record = selectedMesh.userData.scnRecord;
 return record && scnRecordMeshes.has(record.id) ? record : null;
}
function refreshPositionPanel() {
 const panel = $('positionAdjustSection');
 if (!panel) return;
 const record = selectedScnRecord();
 panel.hidden = !record;
 if (!record) return;
 $('positionSource').textContent = '#' + record.id + ' ' + record.name +
   ' · eredeti SCN: X ' + record.position[0] + ', Y ' + record.position[1] +
   ', Z ' + record.position[2] + ' mm';
 const offset = normaliseAdjustment(scnCorrections[record.id]);
 for (const [id,i] of [['adjustX',0],['adjustY',1],['adjustZ',2]]) $(id).value = String(offset[i]);
 $('positionSaveStatus').textContent = positionSaveFailed ?
  'Figyelem: a pozíció mentése nem sikerült. Az aktuális megjelenítésben alkalmazva van.' :
  'Csak a Viewer elhelyezését változtatja; az eredeti SCN érintetlen.';
}
function showScnEnvelopeWarnings() {
 const list = $('scnOverlapList');
 if (!list || !scnLayout) return;
 const references = scnLayout.data.entries.filter(record => classifyScnRecord(record) === 'reference');
 const warnings = envelopeWarnings(references, scnCorrections);
 list.replaceChildren();
 if (!warnings.length) {
  list.textContent = 'Nincs kimutatott, jelentős katalógus-befoglaló átfedés. Ez nem bizonyítja, hogy minden tényleges felület különálló.';
  return;
 }
 const head = document.createElement('div');
 head.textContent = warnings.length + ' lehetséges befoglaló-átfedés az SCN jelenetben (nem igazolt fizikai ütközés):';
 list.append(head);
 for (const overlap of warnings.slice(0,12)) {
  const a = scnLayout.data.entries.find(x => x.id === overlap.a);
  const b = scnLayout.data.entries.find(x => x.id === overlap.b);
  const item = document.createElement('div');
  item.textContent = '#' + overlap.a + ' ' + (a?.name || '') + ' és #' + overlap.b + ' ' +
    (b?.name || '') + ': X ' + Math.round(overlap.overlapMm[0]) +
    ', Y ' + Math.round(overlap.overlapMm[1]) + ', Z ' + Math.round(overlap.overlapMm[2]) + ' mm';
  list.append(item);
 }
}
async function hashScn(buffer) {
 const digest = await crypto.subtle.digest('SHA-256', buffer);
 return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');
}
async function loadScnCorrections(hash) {
 try {
  const res = await fetch('/api/placement/' + hash, {cache:'no-store'});
  if(!res.ok) return {};
  const parsed = await res.json();
  if (!parsed.adjustments || typeof parsed.adjustments!=='object' || Array.isArray(parsed.adjustments)) return {};
  const safe={};
  for(const [id,value] of Object.entries(parsed.adjustments)) {
   if(!/^[0-9]{1,6}$/.test(id) || !Array.isArray(value) || value.length !== 3) continue;
   const actual = normaliseAdjustment(value);
   if(actual.some(v=>v!==0)) safe[id]=actual;
  }
  return safe;
 } catch { return {}; }
}
async function saveScnCorrections() {
 if(!scnFileHash) return;
 try {
  const res=await fetch('/api/placement/' + scnFileHash, {
   method:'POST', headers:{'Content-Type':'application/json','X-Scn-Viewer':'1'},
   body:JSON.stringify({adjustments:scnCorrections})
  });
  if(!res.ok) throw new Error('Nem sikerült menteni az igazítást.');
  positionSaveFailed=false;
 } catch(error) {
  positionSaveFailed=true;
  notify('Az igazítás megjelent, de nem sikerült helyben elmenteni.');
 }
 refreshPositionPanel();
}
function applyPositionAdjustment(offset) {
 const rec=selectedScnRecord();
 if(!rec) { notify('Válassz ki előbb egy SCN-objektumot!'); return; }
 if(!Array.isArray(offset) || offset.length!==3 || offset.some(n=>!Number.isFinite(n) || Math.abs(n)>30000)) {
  notify('Az X, Y, Z eltolás legyen ±30 000 mm közötti szám.');
  return;
 }
 const delta=normaliseAdjustment(offset);
 if(delta.every(v=>v===0)) delete scnCorrections[rec.id];
 else scnCorrections[rec.id]=delta;
 const object=scnRecordMeshes.get(rec.id);
 object.position.set(...correctedPosition(rec,delta));
 model.updateWorldMatrix(true,true);
 boundsCache=new WeakMap();
 partSizeCache=new WeakMap();
 clearMeasure();
 const current=selectedMesh;
 if(current) setSelection(current);
 modelBox=getModelBounds();
 updateGrid(); updateStats(); showScnEnvelopeWarnings();
 invalidate();
 notify('#' + rec.id + ' megjelenítési eltolás: X ' + delta[0] + ', Y ' + delta[1] + ', Z ' + delta[2] + ' mm');
 void saveScnCorrections();
}

function setTreeNodeExpanded(object, expanded) {
 const entry = treeNodeElements.get(object);
 treeExpanded.set(object, expanded);
 if (!entry || !entry.hasChildren) return;
 entry.wrapper.classList.toggle('collapsed', !expanded);
 entry.caret.textContent = expanded ? '▾' : '▸';
 entry.caret.setAttribute('aria-expanded', String(expanded));
}

// Select the *actual* clicked mesh in the tree, even in cabinet-measurement
// mode (which may show its parent group's dimensions in the inspector).
// Only this ancestor chain is opened; all unrelated groups remain collapsed.
function syncTreeSelection(target = selectedMesh, {revealParents = true} = {}) {
 const area=$('structureTree');
 if (!area) return;
 area.querySelectorAll('.tree-active').forEach(row => {
  row.classList.remove('tree-active');
  row.setAttribute('aria-selected','false');
 });
 if (!target) return;
 let object=target;
 while (object && !treeNodeElements.has(object)) object=object.parent;
 if (!object) return;
 const node=treeNodeElements.get(object);
 if(revealParents) {
  for(let ancestor=object.parent; ancestor; ancestor=ancestor.parent) {
   if(treeNodeElements.has(ancestor)) setTreeNodeExpanded(ancestor,true);
   if(ancestor===model) break;
  }
 }
 node.row.classList.add('tree-active');
 node.row.setAttribute('aria-selected','true');
 // A user click in the 3D view should also locate the matching entry.
 node.row.scrollIntoView({block:'nearest',inline:'nearest',behavior:'auto'});
}

function renderStructureTree() {
 const area=$('structureTree');
 if(!area)return;
 area.replaceChildren();
 treeNodeElements = new Map();
 if(!model){$('treeCount').textContent='';area.textContent='Nyiss meg egy 3D fájlt.';return;}
 let count=0;model.traverse(o=>{if(o.isMesh)count++;});
 $('treeCount').textContent='('+ (model.userData.nativeScn?scnRecordMeshes.size:count)+' elem)';
 function node(object,label,children=[]) {
  const wrapper=document.createElement('div');
  const hasChildren=children.length>0;
  const expanded=treeExpanded.get(object)===true;
  wrapper.className='tree-node'+(hasChildren?' collapsed':' leaf');
  if(hasChildren && expanded) wrapper.classList.remove('collapsed');
  const row=document.createElement('div');
  row.className='tree-row';
  row.setAttribute('role','treeitem');
  row.setAttribute('aria-selected','false');
  const toggle=document.createElement('button');
  toggle.className='tree-caret';
  toggle.textContent=hasChildren?(expanded?'▾':'▸'):'·';
  toggle.title='Csoport kinyitása / becsukása';
  toggle.setAttribute('aria-expanded',String(expanded));
  toggle.addEventListener('click',()=>{
   if(hasChildren) setTreeNodeExpanded(object,treeExpanded.get(object)!==true);
  });
  const checkbox=document.createElement('input');checkbox.type='checkbox';
  checkbox.checked=isVisibleInHierarchy(object);
  checkbox.setAttribute('aria-label',label+' láthatóság');
  checkbox.addEventListener('change',()=>{
   if(checkbox.checked){hiddenObjects.delete(object);object.visible=true;}
   else {hiddenObjects.add(object);object.visible=false;}
   if(model.userData.nativeScn) setScnVisible({refit:false});
   else {
    if(selectedMesh && !isVisibleInHierarchy(selectedMesh)) clearSelection();
    refitCameraToVisibleObjects();renderStructureTree();
   }
   refreshHiddenObjects();
  });
  const labelButton=document.createElement('button');
  labelButton.className='tree-name';labelButton.textContent=label;labelButton.title=label;
  labelButton.addEventListener('click',()=>{
   let mesh=object.isMesh?object:null;
   if(!mesh)object.traverse(o=>{if(!mesh&&o.isMesh)mesh=o;});
   if(!mesh)return;
   if(!isVisibleInHierarchy(object)){
    hiddenObjects.delete(object);object.visible=true;
    if(model.userData.nativeScn)setScnVisible({refit:false});
    else {refitCameraToVisibleObjects();renderStructureTree();}
    refreshHiddenObjects();
   }
   // A tree-label click ONLY selects. Expand/collapse stays exclusively
   // under the user's control via the caret button.
   setSelection(mesh,{revealInTree:false});
   syncTreeSelection(object,{revealParents:false});
   focusOnObject(object);
  });
  row.append(toggle,checkbox,labelButton);wrapper.append(row);
  treeNodeElements.set(object,{wrapper,row,caret:toggle,hasChildren});
  if(hasChildren){
   const childList=document.createElement('div');childList.className='tree-children';
   children.forEach(child=>childList.append(child));wrapper.append(childList);
  }
  return wrapper;
 }
 if(model.userData.nativeScn) {
  const branches=[];
  for(const [regionId,group] of scnRegionGroups){
   const records=[...scnRecordMeshes.values()].filter(o=>o.userData.scnRegionId===regionId);
   if(!records.length)continue;
   const items=records.map(o=>{
    const sub=o.userData.scnRole==='reference' ? o.children.filter(x=>x.isMesh).map(part=>node(part,part.userData.partName||part.name)):[];
    return node(o,(o.userData.scnRecord?.name||o.name)+' #'+o.userData.scnRecord?.id,sub);
   });
   branches.push(node(group,group.name+' ('+records.length+')',items));
  }
  area.append(node(model,'Teljes SCN jelenet',branches));
 } else {
  const walk = object => node(object,object.name || (object.isMesh?'Alkatrész':'Csoport'),
    object.children.filter(child=>child.isMesh || child.children.length).map(walk));
  area.append(node(model,'Teljes 3D modell',model.children.map(walk)));
 }
 // Preserve highlight and expansion across visibility updates and redraws.
 syncTreeSelection();
}
function updateScnItemList() {
 const list=$('scnItemList');
 list.replaceChildren();
 if(!model?.userData.nativeScn) return;
 const entries=scnLayout.data.entries.filter(record=>classifyScnRecord(record)==='reference');
 for(const record of entries) {
  const btn=document.createElement('button');btn.className='scn-item';
  const label=document.createElement('span');label.textContent='#'+record.id+' '+record.name;
  const size=document.createElement('small');size.textContent=record.size.join(' × ')+' mm';
  btn.append(label,size);
  btn.title='Katalógushivatkozás; a belső geometria lehet becsült';
  btn.addEventListener('click',()=>{
   const target=scnRecordMeshes.get(record.id);
   if(!target) return;
   if(hiddenObjects.has(target)) {
    hiddenObjects.delete(target);
    setScnVisible({refit:false});
    refreshHiddenObjects();
   }
   const selectable=target.isMesh?target:target.children.find(x=>x.isMesh);
   if(selectable) setSelection(selectable);
   focusOnObject(target);
  });
  list.append(btn);
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
 setScnVisible();
}
async function openScn(file) {
 try {
  if (file.size > 50 * 1024 * 1024) throw new Error('Legfeljebb 50 MB-os SCN nyitható meg.');
  $('fileHint').textContent = 'SCN bináris objektumadatok feldolgozása…';
  const buffer=await file.arrayBuffer();
  const decoded = decodeScn(buffer);
  scnFileHash = await hashScn(buffer);
  scnCorrections = await loadScnCorrections(scnFileHash);
  positionSaveFailed = false;
  const sceneGroup = buildScnModel(decoded);
  $('upAxis').value = 'Z';
  $('mmPerUnit').value = '1';
  mmPerUnit = 1;
  setAxis('Z');
  prepareModel(sceneGroup, file.name);
  updateScnExplorer();
  $('fileHint').textContent = `${decoded.entries.length} SCN-rekord, több önálló rajztéri elrendezés. Az összes dekódolt jelenetrész megjelenik; a kijelölt bútor vagy alkatrész külön elrejthető. A katalógusvázlatok nem gyártási alkatrészek.`;
  $('scnInfo').textContent = `${decoded.entries.length} beolvasott rekord · ${scnLayout.layout.regions.length} elkülönülő jelenetrész. A jelenetrészek térbeli csoportosítások, nem KitchenDraw bútorazonosítók. A valódi lapok SCN-méretűek; a katalógusobjektumok külméret alapján szerkesztett illusztrációk, nem valódi szabászalkatrészek.`;
  notify(`SCN megnyitva: ${decoded.entries.length} rekord · lapokra bontott nézet.`);
 } catch (error) {
  console.error(error);
  $('fileHint').textContent = 'Nem támogatott SCN változat vagy sérült fájl: ' + (error?.message || String(error));
  notify('SCN beolvasási hiba: ' + (error?.message || String(error)));
 }
}
async function openFiles(files) {
 const all = Array.from(files);
 const file = all.find(f => /\.(obj|3ds|stl|glb|gltf|scn|skp)$/i.test(f.name));
 if (!file) return notify('SCN, SKP, OBJ, 3DS, STL, GLB vagy GLTF fájlt válassz.');
 const extension = file.name.split('.').pop().toLowerCase();
 if (extension === 'scn') { await openScn(file); return; }
 try {
  let result;
  if (extension === 'skp') {
   if (file.size > 75 * 1024 * 1024) throw new Error('Az SKP legfeljebb 75 MB lehet a biztonságos helyi feldolgozáshoz.');
   $('fileHint').textContent = 'SketchUp geometria, komponensek és textúrák feldolgozása…';
   // OpenSKP returns glTF Y-up geometry in metres. Keep the original
   // component hierarchy in the generated instanced GLB.
   const converted = decodeSkpToGlb(await file.arrayBuffer());
   const gltf = await new Promise((resolve, reject) => new GLTFLoader().parse(converted.glb, '', resolve, reject));
   result = gltf.scene;
   // Every named SketchUp component/group remains a distinct selectable node.
   result.traverse(object => {
    if(object !== result && object.isGroup && object.name && object.children.length) object.userData.cabinet = true;
   });
   if (new THREE.Box3().setFromObject(result).isEmpty()) throw new Error('A beolvasott SketchUp modellben nincs megjeleníthető 3D objektum.');
   $('upAxis').value = 'Y';
   $('mmPerUnit').value = '1000'; // OpenSKP/glTF metres -> display millimetres
   mmPerUnit = 1000;
   setAxis('Y');
   prepareModel(result, file.name);
   $('manifestSection').hidden = true;
   $('fileHint').textContent = `SketchUp 3D modell · ${converted.resourceCount} egyedi geometriai erőforrás. A méretek mm-ben; a komponenselhelyezések és anyagok az SKP-ből származnak.`;
   return;
  }
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
 } catch(error) { console.error(error); const message='Nem sikerült megnyitni: ' + (error?.message || String(error)); $('fileHint').textContent=message; notify(message); }
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
    (selectedMesh.userData.scnRole === 'panel' ? 'Valódi SCN lap' : selectedMesh.userData.scnRole === 'catalog-part' ? 'Becsült vázlatelem' : 'SCN geometriai elem') : 'Alkatrész';
  return { object: selectedMesh, box: getSelectionBounds(selectedMesh), name,
    size, kind,
    notice: model.userData?.nativeScn ? (selectedMesh.userData.scnRole === 'panel' ?
     'Különálló SCN-lap (mm), az eredeti helyen és a tárolt Z-elforgatással.' :
     selectedMesh.userData.scnRole === 'catalog-part' ?
     'FIGYELEM: a kiválasztott oldal/tető/polc csupán a katalógusobjektum külső méreteiből becsült 3D vázlatelem! Nem valódi alkatrész vagy szabászméret.' :
     'Katalógus- vagy geometriai objektum: az eredeti részletek nem garantáltak.') :
     'Az alkatrész saját geometriájának méretei. Több alkatrész összevont 3D hálóját a Viewer nem tudja különválasztani.' };
 }
 const { object, inferred } = findCabinetGroup(selectedMesh);
 let box = getSelectionBounds(object);
 if(model.userData.nativeScn && object.userData?.scnRole === 'reference') {
  const rec=object.userData.scnRecord;
  // The selection outline is world-aligned; the displayed cabinet dimensions
  // below are the original LOCAL dimensions, not the expanded rotated AABB.
  const bounds = correctedBounds(rec, scnCorrections[rec.id]);
  box = new THREE.Box3(new THREE.Vector3(...bounds.min),new THREE.Vector3(...bounds.max));
 }
 if(model.userData.nativeScn && object.userData?.scnRegion) {
  box = getSelectionBounds(object); // updated geometry after manual corrections
 }
 const name = inferred ? (object.userData?.cabinetName || object.name || 'SCN objektum') : 'Teljes betöltött modell';
 const original = model.userData.nativeScn && object.userData?.scnRole === 'reference' ? object.userData.scnRecord : null;
 const displayedSize = original ? new THREE.Vector3(...original.size) : box.getSize(new THREE.Vector3());
 return { object, box, name, size: displayedSize, kind: (model.userData?.nativeScn) ? (object.userData?.scnApproximate ? 'Katalógusbútor – becsült vázlat' : object.isMesh ? 'SCN objektum' : 'Bútoregyüttes (becsült)') : 'Szekrény',
   notice: inferred
     ? (model.userData?.nativeScn ? (object.userData?.scnApproximate ? 'A külméret az SCN valódi katalógusobjektum-adatából származik; a megjelenített bútorlapok szerkezete becsült, NEM szabásjegyzék.' : 'A látható lapok térbeli csoportjának külső mérete; ez nem igazolt KitchenDraw szekrényhatár.') : 'A csoport befoglaló külmérete (X × Y × Z); az exportban szereplő elforgatás is befolyásolhatja.')
     : 'A fájl nem tartalmaz felismerhető szekrénycsoportokat: ezért a teljes modell külmérete látható, nem egy külön szekrényé.' };
}
function clearSelection() {
 selectedMesh = null;
 syncTreeSelection(null);
 refreshPositionPanel();
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
 $('hideSelected').disabled = !details || !details.object || details.object === model;
 $('selectedKind').textContent = details ? details.kind : '–';
 $('selectedNote').textContent = details ? details.notice : 'Bal kattintással válassz ki egy látható elemet.';
 const zUp = upAxis === 'Z';
 $('labelSizeY').textContent = zUp ? 'Y – mélység' : 'Z – mélység';
 $('labelSizeZ').textContent = zUp ? 'Z – magasság' : 'Y – magasság';
 for (const [id, axis] of [['sizeX','x'], ['sizeY',zUp ? 'y' : 'z'], ['sizeZ',zUp ? 'z' : 'y']]) {
  $(id).textContent = details ? `${format(details.size[axis] * mmPerUnit, 1)} mm` : '–';
 }
}
function setSelection(mesh, {revealInTree = true} = {}) {
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
 refreshPositionPanel();
 syncTreeSelection(mesh,{revealParents:revealInTree});
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
 const valid = raycaster.intersectObject(model, true).filter(h => h.object.isMesh && isVisibleInHierarchy(h.object) &&
   (!model.userData.nativeScn || h.object.userData.scnRole !== 'proxy'));
 return valid[0] || null; // nearest visible surface; never pick a panel behind the clicked cabinet
}
const cadEdgeCache = new WeakMap();
let hoveredSnap = null;
// Hard feature edges exclude triangulation diagonals.
function pickFeature(event) {
 const hit=pickHit(event);
 if (!hit?.object.geometry?.attributes.position) return null;
 const geo=hit.object.geometry;
 let edges=cadEdgeCache.get(geo);
 if (!edges) { edges=new THREE.EdgesGeometry(geo,1); cadEdgeCache.set(geo,edges); }
 const data=edges.attributes.position;
 const rect=renderer.domElement.getBoundingClientRect();
 const click=new THREE.Vector2(event.clientX-rect.left,event.clientY-rect.top);
 let corner=null,edge=null,cornerDist=8,edgeDist=7;
 const av=new THREE.Vector3(),bv=new THREE.Vector3();
 for (let i=0;i<data.count;i+=2) {
  av.fromBufferAttribute(data,i).applyMatrix4(hit.object.matrixWorld);
  bv.fromBufferAttribute(data,i+1).applyMatrix4(hit.object.matrixWorld);
  const surfaceTolerance=Math.max((geo.boundingSphere?.radius||1)*.03,hit.distance*.004);
  if (hit.point.distanceTo(closestPointOnSegment(hit.point,av,bv))>surfaceTolerance) continue;
  const va=av.clone().project(camera),vb=bv.clone().project(camera);
  if ([va.z,vb.z].some(z=>z < -1 || z > 1)) continue;
  const ap=new THREE.Vector2((va.x+1)*rect.width/2,(1-va.y)*rect.height/2);
  const bp=new THREE.Vector2((vb.x+1)*rect.width/2,(1-vb.y)*rect.height/2);
  for (const [world,screen] of [[av,ap],[bv,bp]]) {
   const d=screen.distanceTo(click);
   if (d<cornerDist) {cornerDist=d;corner={type:'corner',point:world.clone()};}
  }
  const d=closestPointOnSegment(click,ap,bp).distanceTo(click);
  if (d<edgeDist && ap.distanceTo(bp)>10) {
   edgeDist=d;edge={type:'edge',a:av.clone(),b:bv.clone()};
  }
 }
 return corner||edge;
}
// Precise 2D drafting overlay: constant-size endpoint crosses and offset
// dimension line, independent of model size, camera zoom and scene geometry.
const dimensionLayer = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
dimensionLayer.setAttribute('aria-label', 'Műszaki méretvonalak');
dimensionLayer.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;overflow:hidden;z-index:3';
viewport.appendChild(dimensionLayer);
function clearPointGraphics() {
 if (line) { scene.remove(line); line.geometry.dispose(); line.material.dispose(); line = null; }
 for (const marker of markers) { scene.remove(marker); marker.geometry.dispose(); marker.material.dispose(); }
 markers = [];
 dimensionLayer.replaceChildren();
}
function renderDimensionOverlay() {
 const rect = renderer.domElement.getBoundingClientRect();
 const width = rect.width, height = rect.height;
 dimensionLayer.setAttribute('viewBox', `0 0 ${width} ${height}`);
 dimensionLayer.replaceChildren();
 if (modelOnlyMode || !width || !height) return;
 const ns = 'http://www.w3.org/2000/svg';
 const add = (tag, attributes, label) => {
  const element = document.createElementNS(ns, tag);
  Object.entries(attributes).forEach(([key,value])=>element.setAttribute(key, String(value)));
  if (label !== undefined) element.textContent = label;
  dimensionLayer.appendChild(element);
  return element;
 };
 if (measureEnabled && hoveredSnap) {
  const proj=p=>{ const v=p.clone().project(camera); return {x:(v.x+1)*width/2,y:(1-v.y)*height/2,z:v.z}; };
  if (hoveredSnap.type==='corner') {
   const p=proj(hoveredSnap.point);
   if (p.z>=-1 && p.z<=1) add('rect',{x:p.x-4,y:p.y-4,width:8,height:8,fill:'#152832',stroke:'#45ffae','stroke-width':1.5});
  } else {
   const p=proj(hoveredSnap.a),q=proj(hoveredSnap.b);
   if ([p.z,q.z].every(z=>z>=-1&&z<=1)) {
    add('line',{x1:p.x,y1:p.y,x2:q.x,y2:q.y,stroke:'#45ffae','stroke-width':2.5});
    for (const t of [p,q]) add('rect',{x:t.x-3,y:t.y-3,width:6,height:6,fill:'#152832',stroke:'#45ffae','stroke-width':1});
   }
  }
 }
 // Persisted measurements are drawn behind the currently edited dimension.
 for (const item of savedMeasures) {
  drawDimension(add, width, height, item.points, item.mode, true);
 }
 drawDimension(add, width, height, snapPoints, $('measureMode').value, false);
}
// Project stored WORLD coordinates on every render so annotations follow 3D navigation.
function measureAxisFor(points,mode) {
 if (points.length!==2 || mode==='free') return null;
 if (mode!=='ortho') return mode;
 const [a,b]=points;
 return ['x','y','z'].sort((x,y)=>Math.abs(b[y]-a[y])-Math.abs(b[x]-a[x]))[0];
}
function distanceFor(points,mode) {
 if (points.length!==2) return 0;
 const axis=measureAxisFor(points,mode);
 return axis ? Math.abs(points[1][axis]-points[0][axis]) : points[0].distanceTo(points[1]);
}
function drawDimension(add,width,height,points,mode,saved) {
 if (points.length!==2) return;
 const projected=points.map(p=>{
  const v=p.clone().project(camera);
  return {x:(v.x+1)*width/2,y:(1-v.y)*height/2,depth:v.z};
 });
 if (projected.some(p=>p.depth < -1 || p.depth > 1)) return;
 const tone=saved?'#9ddaff':'#ffe18b';
 const secondary=saved?'#709fbf':'#8fbbc8';
 const ink=saved?'#f0faff':'#fff3bd';
 const background=saved?'#173448':'#11232f';
 const drawLine=(a,b,color=tone,weight=1.2)=>add('line',{x1:a.x,y1:a.y,x2:b.x,y2:b.y,stroke:color,'stroke-width':weight});
 for (let i=0;i<projected.length;i++) {
  const p=projected[i],c=saved?'#9ddaff':(i===0?'#66eaff':'#ffcb65');
  add('circle',{cx:p.x,cy:p.y,r:2,fill:'#10202b',stroke:c,'stroke-width':1.4});
  drawLine({x:p.x-6,y:p.y},{x:p.x-3,y:p.y},c,1);
  drawLine({x:p.x+3,y:p.y},{x:p.x+6,y:p.y},c,1);
  drawLine({x:p.x,y:p.y-6},{x:p.x,y:p.y-3},c,1);
  drawLine({x:p.x,y:p.y+3},{x:p.x,y:p.y+6},c,1);
 }
 let [a,b]=projected;
 const axis=measureAxisFor(points,mode);
 if (axis) {
  const aligned=points[0].clone();
  aligned[axis]=points[1][axis];
  const v=aligned.project(camera);
  const p={x:(v.x+1)*width/2,y:(1-v.y)*height/2,depth:v.z};
  if (p.depth>=-1 && p.depth<=1) {
   add('line',{x1:b.x,y1:b.y,x2:p.x,y2:p.y,stroke:secondary,'stroke-width':.9,'stroke-dasharray':'4 3'});
   b=p;
  }
 }
 const dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy);
 if (len<2) return;
 const nx=-dy/len,ny=dx/len;
 const offset=saved?27:30;
 const a1={x:a.x+nx*offset,y:a.y+ny*offset};
 const b1={x:b.x+nx*offset,y:b.y+ny*offset};
 drawLine({x:a.x+nx*5,y:a.y+ny*5},{x:a1.x+nx*8,y:a1.y+ny*8},secondary,.9);
 drawLine({x:b.x+nx*5,y:b.y+ny*5},{x:b1.x+nx*8,y:b1.y+ny*8},secondary,.9);
 drawLine(a1,b1,tone,1.25);
 const tx=(dx/len+nx)*4,ty=(dy/len+ny)*4;
 for (const p of [a1,b1]) drawLine({x:p.x-tx,y:p.y-ty},{x:p.x+tx,y:p.y+ty},tone,1.6);
 const value=`${format(distanceFor(points,mode)*mmPerUnit)} mm`;
 const mid={x:(a1.x+b1.x)/2,y:(a1.y+b1.y)/2};
 const labelWidth=Math.max(55,value.length*7.3+12);
 add('rect',{x:mid.x-labelWidth/2,y:mid.y-23,width:labelWidth,height:19,rx:3,fill:background,'fill-opacity':'.92'});
 add('text',{x:mid.x,y:mid.y-9,'text-anchor':'middle','font-family':'Segoe UI, Arial, sans-serif','font-size':13,'font-weight':600,fill:ink},value);
}
function refreshSavedMeasureList() {
 const list=$('savedMeasureList');
 list.replaceChildren();
 $('clearSavedMeasures').disabled=savedMeasures.length===0;
 if (!savedMeasures.length) {
  const empty=document.createElement('p');
  empty.className='hint';
  empty.textContent='Még nincs rögzített méret.';
  list.appendChild(empty);
  return;
 }
 savedMeasures.forEach((item,index)=>{
  const row=document.createElement('div');
  row.className='saved-measure-item';
  const label=document.createElement('span');
  const modeLabel={free:'Szabad',ortho:'Orto (automatikus)',x:'Orto X',y:'Orto Y',z:'Orto Z'}[item.mode]||item.mode;
  label.textContent=`${index+1}. ${format(distanceFor(item.points,item.mode)*mmPerUnit)} mm – ${modeLabel}`;
  const remove=document.createElement('button');
  remove.type='button';
  remove.className='saved-measure-delete';
  remove.textContent='✕ Törlés';
  remove.title=`${index+1}. rögzített méret eltávolítása a rajzról`;
  remove.setAttribute('aria-label',`${index+1}. rögzített méret törlése a rajzról`);
  remove.addEventListener('click',()=>{
   // Only the chosen entry is deleted; keep all other dimensions and the active measurement.
   savedMeasures.splice(index,1);
   refreshSavedMeasureList();
   invalidate();
   notify('A kiválasztott méret törölve a rajzról.');
  });
  row.append(label,remove);
  list.appendChild(row);
 });
}
function freezeCurrentMeasure() {
 if (snapPoints.length!==2) return notify('Előbb jelölj ki két pontot vagy egy élt!');
 savedMeasures.push({
  points:snapPoints.map(p=>p.clone()),
  mode:$('measureMode').value
 });
 snapPoints=[];
 hoveredSnap=null;
 refreshSavedMeasureList();
 renderMeasure();
 notify('Méret rögzítve. Folytathatod a méretezést.');
}
async function exportPngWithOverlay() {
 if (!model) return notify('Előbb nyiss meg egy modellt!');
 const btn=$('exportPng');
 btn.disabled=true;
 let svgUrl=null;
 try {
  // Render and capture in the same turn (WebGL preserveDrawingBuffer is false).
  renderer.render(scene,camera);
  const source=renderer.domElement;
  const output=document.createElement('canvas');
  output.width=source.width;
  output.height=source.height;
  const ctx=output.getContext('2d');
  if (!ctx) throw new Error('A PNG rajzvászon nem hozható létre.');
  ctx.fillStyle='#172435';
  ctx.fillRect(0,0,output.width,output.height);
  ctx.drawImage(source,0,0);
  // Do not export the green mouse-hover preview. Include all locked dimensions.
  const oldHover=hoveredSnap;
  hoveredSnap=null;
  try { renderDimensionOverlay(); }
  finally { hoveredSnap=oldHover; }
  const clone=dimensionLayer.cloneNode(true);
  const rect=source.getBoundingClientRect();
  clone.setAttribute('xmlns','http://www.w3.org/2000/svg');
  clone.setAttribute('width',String(rect.width));
  clone.setAttribute('height',String(rect.height));
  const svgText=new XMLSerializer().serializeToString(clone);
  svgUrl=URL.createObjectURL(new Blob([svgText],{type:'image/svg+xml;charset=utf-8'}));
  const overlay=new Image();
  await new Promise((resolve,reject)=>{
   overlay.onload=resolve;
   overlay.onerror=()=>reject(new Error('A méretek képe nem tölthető be.'));
   overlay.src=svgUrl;
  });
  ctx.drawImage(overlay,0,0,output.width,output.height);
  const png=await new Promise((resolve,reject)=>output.toBlob(blob=>blob?resolve(blob):reject(new Error('PNG előállítás sikertelen.')),'image/png'));
  const url=URL.createObjectURL(png);
  try {
   const link=document.createElement('a');
   const name=(originName||'JOB_Viewer').replace(/\.[^.]+$/,'').replace(/[^a-zA-Z0-9_-]/g,'_').slice(0,65);
   link.download=`${name}_meretezes.png`;
   link.href=url;
   document.body.appendChild(link);
   link.click();
   link.remove();
  } finally { setTimeout(()=>URL.revokeObjectURL(url),30000); }
  notify('PNG elkészült a rajzzal és a méretekkel.');
 } catch(error) {
  console.error('PNG export hiba:',error);
  notify('PNG mentési hiba: '+error.message);
 } finally {
  if (svgUrl) URL.revokeObjectURL(svgUrl);
  btn.disabled=false;
  invalidate();
 }
}
function measurementAxis() { return measureAxisFor(snapPoints,$('measureMode').value); }
function measuredDistance() { return distanceFor(snapPoints,$('measureMode').value); }
function renderMeasure() {
 clearPointGraphics();
 const [a, b] = snapPoints;
 $('pointA').textContent = formatPoint(a);
 $('pointB').textContent = formatPoint(b);
 $('distance').textContent = (a && b) ? `${format(measuredDistance() * mmPerUnit)} mm` : '– mm';
 for (const [id, component] of [['dx','x'], ['dy','y'], ['dz','z']]) $(''+id).textContent = a && b ? `${format(Math.abs(b[component]-a[component])*mmPerUnit)} mm` : '–';
 invalidate();
}
function clearMeasure() { snapPoints = []; hoveredSnap=null; clearPointGraphics(); renderMeasure(); }
function toggleMeasure(force) {
 measureEnabled = typeof force === 'boolean' ? force : !measureEnabled;
 $('measureToggle').classList.toggle('active', measureEnabled);
 $('measureToggle').textContent = measureEnabled ? '✓ Mérés bekapcsolva' : '📏 Mérés bekapcsolása';
 $('modeStatus').classList.toggle('active', measureEnabled);
 $('modeStatus').textContent = measureEnabled ? 'Méretezés: 2 pont' : 'Kijelölés: ' + ($('selectionType').value === 'part' ? 'alkatrész' : 'szekrény');
 renderer.domElement.style.cursor = measureEnabled ? 'crosshair' : 'pointer';
 if (!measureEnabled) hoveredSnap=null;
 invalidate();
}
renderer.domElement.addEventListener('pointermove', event => {
 if (!measureEnabled || event.buttons) return;
 hoveredSnap=pickFeature(event);
 $('snapHint').textContent=hoveredSnap ? (hoveredSnap.type==='corner' ? 'Sarokpont – kattintás: méretpont' : 'Él – kattintás: teljes élhossz') : 'Közelíts egy látható sarokponthoz vagy élhez.';
 invalidate();
});
renderer.domElement.addEventListener('pointerleave', () => { hoveredSnap=null; invalidate(); });
$('measureMode').addEventListener('change', renderMeasure);
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
 const snap=pickFeature(event);
 if (!snap) { notify('Csak valódi él vagy sarokpont választható ki. Nagyíts rá.'); return; }
 hoveredSnap=snap;
 if (snap.type==='edge') snapPoints=[snap.a.clone(),snap.b.clone()];
 else {
  if (snapPoints.length>=2) snapPoints=[];
  snapPoints.push(snap.point.clone());
 }
 renderMeasure();
 if (snapPoints.length===2) notify('Mért hossz: '+format(measuredDistance()*mmPerUnit)+' mm');
});
$('selectionType').addEventListener('change', () => { refreshSelection(); toggleMeasure(false); });
$('clearSelection').addEventListener('click', clearSelection);
$('toggleTree').addEventListener('click', ()=>$('structureSidebar').classList.toggle('mobile-hidden'));
$('expandTree').addEventListener('click', ()=>{for(const [object] of treeNodeElements) setTreeNodeExpanded(object,true);});
$('collapseTree').addEventListener('click', ()=>{for(const [object] of treeNodeElements) setTreeNodeExpanded(object,false);});
$('measureToolbar').addEventListener('click', ()=>toggleMeasure());
$('toggleSettings').addEventListener('click', ()=>{$('advancedSettings').open=!$('advancedSettings').open;});
$('showAllToolbar').addEventListener('click', ()=>{$('showAllObjects').click();});
$('hideSelected').addEventListener('click', hideSelectedObject);
$('showAllObjects').addEventListener('click', () => {
 for(const object of hiddenObjects) object.visible=true;
 hiddenObjects.clear();
 if(model?.userData.nativeScn) setScnVisible({refit:false});
 else {refitCameraToVisibleObjects();renderStructureTree();}
 refreshHiddenObjects();
});
$('applyPosition').addEventListener('click', () => applyPositionAdjustment(
  ['adjustX','adjustY','adjustZ'].map(id => $(''+id).value.trim()==='' ? NaN : Number($(id).value))
));
$('resetPosition').addEventListener('click', () => applyPositionAdjustment([0,0,0]));
$('fileInput').addEventListener('change', e => { openFiles(e.target.files); e.target.value = ''; });
$('measureToggle').addEventListener('click', () => toggleMeasure());
// Two distinct operations:
//  - "Teljes nézet" (resetView) fits the model in the regular three-column UI.
//  - "Csak modell" uses the whole screen and hides UI/overlays until Back/Escape.
// Keep the existing OrbitControls instance so the pointer gestures never reset.
function refreshModelOnlyRendering() {
 updateGrid();
 if (selectionBox) selectionBox.visible = !modelOnlyMode;
 if (line) line.visible = !modelOnlyMode;
 for (const marker of markers) marker.visible = !modelOnlyMode;
 invalidate();
}
function exitModelOnlyMode() {
 if (!modelOnlyMode) return;
 modelOnlyMode = false;
 document.body.classList.remove('model-only-mode');
 $('exitModelOnly').hidden = true;
 if (document.fullscreenElement === viewport && document.exitFullscreen) {
  void document.exitFullscreen().catch(() => {});
 }
 requestAnimationFrame(() => {
  resize();
  if (model) refitCameraToVisibleObjects();
  refreshModelOnlyRendering();
 });
}
function enterModelOnlyMode() {
 if (modelOnlyMode) return;
 if (!model) return notify('Nyiss meg egy modellt a teljes képernyős nézethez!');
 modelOnlyMode = true;
 document.body.classList.add('model-only-mode');
 $('exitModelOnly').hidden = false;
 requestAnimationFrame(() => {
  resize();
  refitCameraToVisibleObjects();
  refreshModelOnlyRendering();
 });
 // Native fullscreen also hides the Windows window decorations where supported.
 // Fixed-position CSS provides a usable in-app fullscreen fallback.
 if (viewport.requestFullscreen) void viewport.requestFullscreen().catch(() => {});
}
$('enterModelOnly').addEventListener('click', enterModelOnlyMode);
$('exitModelOnly').addEventListener('click', exitModelOnlyMode);
document.addEventListener('keydown', event => {
 if (event.key === 'Escape' && modelOnlyMode) {
  event.preventDefault();
  exitModelOnlyMode();
 }
});
document.addEventListener('fullscreenchange', () => {
 if (modelOnlyMode && document.fullscreenElement !== viewport) exitModelOnlyMode();
 else if (modelOnlyMode && document.fullscreenElement === viewport) {
  requestAnimationFrame(() => { resize(); refitCameraToVisibleObjects(); });
 }
});
$('resetView').addEventListener('click', fitView);
$('clearMeasure').addEventListener('click', clearMeasure);
$('freezeMeasure').addEventListener('click',freezeCurrentMeasure);
$('clearSavedMeasures').addEventListener('click',()=>{
 savedMeasures=[];
 refreshSavedMeasureList();
 invalidate();
});
$('exportPng').addEventListener('click',exportPngWithOverlay);
$('undoPoint').addEventListener('click', () => { snapPoints.pop(); renderMeasure(); });
$('mmPerUnit').addEventListener('input', e => {
 const n = Number(e.target.value);
 if (Number.isFinite(n) && n > 0) { mmPerUnit = n; renderMeasure(); refreshSavedMeasureList(); updateStats(); }
});
$('upAxis').addEventListener('change', e => { setAxis(e.target.value); updateGrid(); updateSelectionStats(); });
$('showGrid').addEventListener('change', updateGrid);
$('showAxes').addEventListener('change', updateGrid);
$('showEdges').addEventListener('change', e => toggleEdges(e.target.checked));
$('finishStyle').addEventListener('change', applyScnFinish);
$('copyMeasure').addEventListener('click', async () => {
 if (snapPoints.length !== 2) return notify('Előbb jelölj ki két pontot!');
 const [a,b] = snapPoints;
 const content = `JOB Viewer mérés\nA: ${formatPoint(a)}\nB: ${formatPoint(b)}\nTávolság: ${format(measuredDistance()*mmPerUnit)} mm\nΔX: ${format(Math.abs(a.x-b.x)*mmPerUnit)} mm\nΔY: ${format(Math.abs(a.y-b.y)*mmPerUnit)} mm\nΔZ: ${format(Math.abs(a.z-b.z)*mmPerUnit)} mm`;
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
  if (selectionBox) selectionBox.visible = !modelOnlyMode;
  if (line) line.visible = !modelOnlyMode;
  for (const marker of markers) marker.visible = !modelOnlyMode;
  renderer.render(scene, camera);
   renderDimensionOverlay();
 });
}
new ResizeObserver(() => { resize(); invalidate(); }).observe(viewport);
resize();
refreshSavedMeasureList();
invalidate();

