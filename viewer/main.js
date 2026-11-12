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
function confirmScn(message = '') {
 $('scnModal').classList.remove('hidden');
 $('bridgeProblem').textContent = message || 'A közvetlen megnyitáshoz a helyi KitchenDraw Bridge kiegészítő szükséges.';
}
let requestedJob = 0;
function setBridgeState(message, ready) {
 $('bridgeStatus').textContent = message;
 $('bridgeStatus').classList.toggle('bridge-ready', ready);
}
async function bridgeHealth() {
 try {
  if (!['127.0.0.1', 'localhost'].includes(window.location.hostname)) throw new Error('Nem a helyi Viewer fut.');
  const response = await fetch('/api/health', {cache:'no-store'});
  if (!response.ok) throw new Error('A helyi kiszolgáló nem érhető el.');
  const health = await response.json();
  if (!health.server) throw new Error('Nem a helyi SCN Viewer fut.');
  setBridgeState(health.bridge ? 'KitchenDraw Bridge: kapcsolódva' : 'KitchenDraw Bridge: nincs kapcsolódva', health.bridge);
  return health.bridge;
 } catch {
  setBridgeState('Közvetlen SCN: helyi kiszolgáló szükséges', false);
  return false;
 }
}
function showManifest(data) {
 const section = $('manifestSection');
 const list = $('manifestList');
 list.replaceChildren();
 if (!data || !Array.isArray(data.objects)) { section.hidden = true; return; }
 section.hidden = false;
 $('manifestTitle').textContent = `KitchenDraw elemek (${data.objects.length} db)`;
 for (const item of data.objects.slice(0, 100)) {
  const row = document.createElement('div'); row.className = 'manifest-item';
  const name = document.createElement('strong'); name.textContent = item.name || item.reference || `Elem #${item.id}`;
  const size = document.createElement('small');
  const vals = [item.widthMm, item.depthMm, item.heightMm];
  size.textContent = vals.every(Number.isFinite) ? vals.map(x => format(x,1)).join(' × ') + ' mm' : 'Méret nem elérhető';
  row.append(name, size); list.append(row);
 }
 if (data.objects.length > 100) {
  const extra = document.createElement('p'); extra.className = 'hint';
  extra.textContent = `További ${data.objects.length - 100} elem (a lista az első 100-at mutatja).`;
  list.append(extra);
 }
 $('manifestNote').textContent = 'A KitchenDraw által tárolt méretek. Az OBJ háromszöghálóinak csoportosításától független lista; kijelöléskor a kijelölt háló mérete jelenik meg.';
}
async function openScn(file) {
 const job = ++requestedJob;
 const ready = await bridgeHealth();
 if (!ready) { confirmScn('A KitchenDraw Bridge nem aktív. Előbb fordítsd le és regisztráld a kiegészítőt, majd indítsd el a KitchenDraw-ot. A helyi Viewer továbbra is használható OBJ fájlokkal.'); return; }
 if (file.size > 50 * 1024 * 1024) { notify('Ez az SCN meghaladja az 50 MB-os biztonsági korlátot.'); return; }
 try {
  $('filename').textContent = file.name;
  $('fileHint').textContent = 'SCN betöltése KitchenDraw segítségével…';
  setBridgeState('SCN feldolgozása…', true);
  const response = await fetch('/api/scn', { method:'POST', headers:{'Content-Type':'application/octet-stream','X-Scn-Viewer':'1'}, body:file });
  if (!response.ok) throw new Error(`Az SCN átadása sikertelen (HTTP ${response.status}).`);
  const {id} = await response.json();
  if (!/^[a-f0-9]{32}$/.test(id || '')) throw new Error('Hibás feldolgozásazonosító.');
  let state = 'pending';
  for (let attempt = 0; attempt < 180; attempt++) { // 6 minutes max; large scenes take longer
   if (requestedJob !== job) return;
   const st = await fetch(`/api/jobs/${id}`, {cache:'no-store'});
   if (!st.ok) throw new Error('Nem érhető el az SCN átalakításának állapota.');
   const result = await st.json(); state = result.state;
   if (state === 'error') throw new Error(result.message || 'A KitchenDraw nem tudta exportálni az SCN fájlt.');
   if (state === 'done') {
    const objResponse = await fetch(`/api/model/${id}`, {cache:'no-store'});
    if (!objResponse.ok) throw new Error('A 3D modell nem olvasható.');
    const obj = new OBJLoader().parse(await objResponse.text());
    if (new THREE.Box3().setFromObject(obj).isEmpty()) throw new Error('Az SCN export nem tartalmaz látható háromszöghálót.');
    if (requestedJob !== job) return;
    $('upAxis').value = 'Z';
    setAxis('Z');
    prepareModel(obj, file.name);
    try {
     const metaResponse = await fetch(`/api/manifest/${id}`, {cache:'no-store'});
     if (metaResponse.ok) showManifest(await metaResponse.json());
     else showManifest(null);
    } catch { showManifest(null); }
    $('fileHint').textContent = 'KitchenDraw SCN betöltve a helyi bővítménnyel. A pontos mm-es méréshez ellenőrizd a modell-egység arányát (OBJ alapérték: 1).';
    setBridgeState('SCN megnyitva', true);
    return;
   }
   setBridgeState(state === 'working' ? 'KitchenDraw 3D export folyamatban…' : 'SCN feldolgozásra vár…', true);
   await new Promise(resolve => setTimeout(resolve, 2000));
  }
  throw new Error('Nem érkezett válasz a KitchenDraw-tól. Ellenőrizd, hogy fut-e a program és aktív-e a kiegészítő.');
 } catch (error) {
  console.error(error);
  $('fileHint').textContent = 'SCN átalakítási hiba: ' + (error.message || String(error));
  setBridgeState('SCN átalakítás sikertelen', false);
  notify(error.message || String(error));
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
    notice: 'Az alkatrész saját geometriájának méretei. Több alkatrész összevont 3D hálóját a Viewer nem tudja különválasztani.' };
 }
 const { object, inferred } = findCabinetGroup(selectedMesh);
 const box = getSelectionBounds(object);
 const name = inferred ? (object.userData?.cabinetName || object.name || 'Szekrénycsoport') : 'Teljes betöltött modell';
 return { object, box, name, size: box.getSize(new THREE.Vector3()), kind: 'Szekrény',
   notice: inferred
     ? 'A csoport befoglaló külmérete (X × Y × Z); az exportban szereplő elforgatás is befolyásolhatja.'
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
$('bridgeHelp').addEventListener('click', () => confirmScn());
$('closeModal').addEventListener('click', () => $('scnModal').classList.add('hidden'));
$('modalOk').addEventListener('click', () => $('scnModal').classList.add('hidden'));
$('scnModal').addEventListener('click', e => { if (e.target === $('scnModal')) $('scnModal').classList.add('hidden'); });
$('sampleButton').addEventListener('click', () => {
 const sample = new THREE.Group();
 sample.name = 'Bútor bemutató';
 function panel(group, name, x, y, z, w, d, h, color) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, d, h), new THREE.MeshStandardMaterial({color, roughness:.78}));
  mesh.name = name;
  mesh.position.set(x, y, z);
  group.add(mesh);
 }
 function cupboard(name, cx, w, height, color) {
  const group = new THREE.Group();
  group.name = name;
  group.position.x = cx;
  panel(group, 'Bal oldallap', -w/2+9, 0, height/2, 18, 420, height, color);
  panel(group, 'Jobb oldallap', w/2-9, 0, height/2, 18, 420, height, color);
  panel(group, 'Fenék', 0, 0, 9, w-36, 420, 18, color);
  panel(group, 'Tető', 0, 0, height-9, w-36, 420, 18, color);
  panel(group, 'Polc', 0, 0, height/2, w-36, 405, 18, 0xc4a27a);
  sample.add(group);
 }
 cupboard('1. szekrény', -400, 600, 720, 0x86b9d0);
 cupboard('2. szekrény', 400, 800, 840, 0x9ec2a2);
 $('upAxis').value = 'Z';
 setAxis('Z');
 prepareModel(sample, 'Bemutató: 2 szekrény és külön alkatrészek');
});
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

bridgeHealth();
setInterval(bridgeHealth, 12000);
