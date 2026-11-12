import { decodeScn } from './scn-parser.js';
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
renderer.toneMappingExposure = 1.4;
viewport.prepend(renderer.domElement);
renderer.domElement.style.width = '100%';
renderer.domElement.style.height = '100%';
renderer.domElement.style.touchAction = 'none';
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = .12;
controls.rotateSpeed = 1.35;
controls.zoomSpeed = 1.3;
controls.panSpeed = 1.2;
controls.screenSpacePanning = true;
// Left mouse belongs to selection / point measurement, not navigation.
controls.mouseButtons = {LEFT: null, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.ROTATE};
renderer.domElement.addEventListener('contextmenu', event => event.preventDefault());
camera.position.set(1500, -2300, 1600);
camera.up.set(0, 0, 1);
controls.target.set(0, 0, 0);
controls.update();
scene.add(new THREE.HemisphereLight(0xddeeff, 0x5b7084, 2.2));
const sun = new THREE.DirectionalLight(0xffffff, 3.2);
sun.position.set(350, -450, 900);
scene.add(sun);
const fill = new THREE.DirectionalLight(0xa2cfff, 1.1);
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
 const box = new THREE.Box3().setFromObject(model);
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
 camera.up.set(...(axis === 'Z' ? [0, 0, 1] : [0, 1, 0]));
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
  iso: [1, -1.45, .95], top: [0, 0, 1], front: [0, -1, 0], right: [1, 0, 0]
 } : {
  iso: [1, .95, 1.45], top: [0, 1, 0], front: [0, 0, 1], right: [1, 0, 0]
 };
 const dir = new THREE.Vector3(...vec[type]).normalize();
 camera.position.copy(target).addScaledVector(dir, dist);
 camera.up.set(...(upAxis === 'Z' ? [0, 0, 1] : [0, 1, 0]));
 if (type === 'top') camera.up.set(...(upAxis === 'Z' ? [0, 1, 0] : [0, 0, -1]));
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
  if (!obj.isMesh || !obj.geometry?.attributes?.position) return;
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
 model = null;
 modelBox = null;
}
function prepareModel(group, name) {
 disposeModel();
 boundsCache = new WeakMap();
 partSizeCache = new WeakMap();
 meshCountCache = new WeakMap();
 model = group;
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

// Native binary KitchenDraw SCN import: no KitchenDraw, SDK or bridge.
// The currently decoded variant stores real sizes and placements in mm,
// but catalog-defined details are reconstructed as bounding solids.
function scnColor(entry) {
 if (/^CUBE$/i.test(entry.name)) return 0x78abc1;
 if (/PANEL/i.test(entry.name)) return 0xc59b70;
 if (/^CYL/i.test(entry.name)) return 0xb0c6c7;
 if (/PULT|ND_|KÉZMOSÓ|átadó/i.test(entry.name)) return 0x789bb2;
 return 0x90aaa5;
}
function isScnCabinetAnchor(entry) {
 return /PULT|ND_1300|UNOX|KÉZMOSÓ|átadó/i.test(entry.name);
}
function buildScnModel(data) {
 const group = new THREE.Group();
 group.name = 'SCN jelenet — saját bináris dekóder';
 group.userData.nativeScn = true;
 const cube = new THREE.BoxGeometry(1, 1, 1);
 const cylinderX = new THREE.CylinderGeometry(.5, .5, 1, 16);
 cylinderX.rotateZ(Math.PI / 2);
 const cylinderZ = new THREE.CylinderGeometry(.5, .5, 1, 16);
 cylinderZ.rotateX(Math.PI / 2);
 const materialCache = new Map();
 const objects = [];
 for (const record of data.entries) {
  const color = scnColor(record);
  let material = materialCache.get(color);
  if (!material) {
   material = new THREE.MeshStandardMaterial({color, roughness:.82, metalness:.02, side:THREE.DoubleSide});
   materialCache.set(color, material);
  }
  const geometry = record.type === 'cylinderX' ? cylinderX : record.type === 'cylinderZ' ? cylinderZ : cube;
  const mesh = new THREE.Mesh(geometry, material);
  mesh.scale.set(...record.size);
  mesh.position.set(...record.position.map((v, i) => v + record.size[i] / 2));
  mesh.name = `${record.name} #${record.id}`;
  mesh.userData.partName = record.name + ` [SCN #${record.id}]`;
  mesh.userData.scnRecord = record;
  mesh.userData.scnApproximate = true;
  objects.push({mesh, record});
 }
 // Associate primitives with the best fitting named furniture bounding boxes.
 // This is a spatial aid, NOT a claim that KitchenDraw's proprietary component
 // hierarchy or exact CNC panel tree has been recovered.
 const anchors = objects.filter(({record}) => isScnCabinetAnchor(record));
 const groups = anchors.map(({record}) => {
  const cabinet = new THREE.Group();
  cabinet.name = record.name + ` (SCN csoport — becslés)`;
  cabinet.userData.cabinetName = cabinet.name;
  cabinet.userData.scnApproximate = true;
  group.add(cabinet);
  return {record,cabinet};
 });
 for (const {mesh,record} of objects) {
  const ownAnchor = groups.find(g => g.record === record);
  if (ownAnchor) { ownAnchor.cabinet.add(mesh); continue; }
  if (record.name !== 'CUBE' && !/^CYL|^PLAN1$|PANEL/i.test(record.name)) {
   group.add(mesh); continue;
  }
  const center = record.position.map((x,i) => x + record.size[i]/2);
  let best = null, score = Infinity;
  for (const g of groups) {
   const p=g.record.position, d=g.record.size;
   // A surrounding furniture object must encompass the panel center with
   // a small tolerance; never attach distant elements by mere proximity.
   const delta = center.map((v,i) => Math.max(p[i]-180-v, 0, v-(p[i]+d[i]+180)));
   if (delta.some(v => v > 0)) continue;
   const dist = Math.hypot(...center.map((v,i) => (v-(p[i]+d[i]/2))/(d[i]+1)));
   if (dist<score) {score=dist; best=g;}
  }
  (best ? best.cabinet : group).add(mesh);
 }
 return group;
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
  $('fileHint').textContent = `${decoded.entries.length} valós SCN-objektum és mm-es koordinátája beolvasva. A katalógusfüggő részleteket a Viewer befoglaló testekkel helyettesíti; az ezek felületén végzett mérés közelítő.`;
  $('scnInfo').textContent = `${decoded.entries.length} elem · ${decoded.recognized} ismert rekord · ${decoded.unsupported} kihagyott sablon/nem támogatott rekord. Az objektumméretek és az elhelyezés közvetlenül az SCN-ből származnak, nem a bemutatómodellből.`;
  notify(`Valódi SCN megnyitva: ${decoded.entries.length} objektum (egyszerűsített 3D).`);
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
  showManifest(null);
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
 const named = hierarchy.find(p => p.userData?.cabinetId || p.userData?.cabinet || isCabinetName(p.name));
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
 if (mode === 'part') {
  const size = getLocalPartSize(selectedMesh);
  const name = selectedMesh.userData?.partName || selectedMesh.name || `Alkatrész ${meshNumbers.get(selectedMesh) || ''}`;
  return { object: selectedMesh, box: getSelectionBounds(selectedMesh), name,
    size, kind: 'Alkatrész',
    notice: model.userData?.nativeScn ? 'Méret közvetlenül az SCN objektumrekordjából (mm). A kirajzolt alakzat a befoglaló forma közelítése.' : 'Az alkatrész saját geometriájának méretei. Több alkatrész összevont 3D hálóját a Viewer nem tudja különválasztani.' };
 }
 const { object, inferred } = findCabinetGroup(selectedMesh);
 const box = getSelectionBounds(object);
 const name = inferred ? (object.userData?.cabinetName || object.name || 'SCN objektum') : 'Teljes betöltött modell';
 return { object, box, name, size: box.getSize(new THREE.Vector3()), kind: (model.userData?.nativeScn && object.isMesh) ? 'SCN objektum' : 'Szekrény',
   notice: inferred
     ? (model.userData?.nativeScn ? 'SCN-adatokból számolt befoglaló méret. Az eredeti gyártói 3D forma és szekrénycsoport határa nem minden esetben ismert.' : 'A csoport befoglaló külmérete (X × Y × Z); az exportban szereplő elforgatás is befolyásolhatja.')
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
 return raycaster.intersectObject(model, true).find(h => h.object.isMesh) || null;
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
controls.addEventListener('change', invalidate);
new ResizeObserver(() => { resize(); invalidate(); }).observe(viewport);
resize();
invalidate();

