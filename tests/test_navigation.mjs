import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {scnWorldBounds,scnWorldPoint} from '../viewer/scn-transform.js';
const js=readFileSync(new URL('../viewer/main.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../viewer/index.html',import.meta.url),'utf8');
assert(js.indexOf('camera.up.set(0, 0, 1)') < js.indexOf('new OrbitControls(camera, renderer.domElement)'), 'Z-up MUST be set before constructing OrbitControls');
assert(js.includes('function rebuildControls()') && js.includes('controls.dispose()'), 'Controls must be reconstructed on axis changes');
for(const value of ['controls.rotateSpeed = .65','MIDDLE: THREE.MOUSE.PAN','RIGHT: THREE.MOUSE.ROTATE','LEFT: null','controls.minPolarAngle','controls.maxPolarAngle']) assert(js.includes(value),value);
for(const id of ['scnArea','scnExplorer','showCatalogShapes','showFittings','finishStyle','scnItemList','showWalls']) assert(html.includes(`id="${id}"`),id);
assert(js.includes("role==='panel'"), 'Independent panel geometry is required');
console.log('OK: stable CAD orbit, separate panel drawing, area selector and finishes');

// Regression: source SCN rotation is applied to the original placement pivot
// and shared by all reconstructed cabinet parts (never rotated about centres).
const record={position:[2600,3900,0],size:[600,700,900],rotationRad:Math.PI};
const leftPanelLocal=[9,350,450];
assert.deepEqual(scnWorldPoint(record,leftPanelLocal).map(Math.round),[2591,3550,450]);
assert.deepEqual(scnWorldBounds(record).size.map(Math.round),[600,700,900]);
assert(js.includes('root.rotation.z = record.rotationRad || 0'), 'Catalog children must inherit rotation');
assert(js.includes('partMesh.position.set(...part.position.map((v,i) => v + part.size[i]*.5))'), 'Catalog panels must stay in local coordinate space');
assert(js.includes('unitBox.translate(.5,.5,.5)'), 'Source anchor is local corner, not box centre');
assert(js.includes('item.rotation.z = record.rotationRad || 0'), 'Independent panels also rotate around SCN anchor');
