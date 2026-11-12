/** Regression: SCN object local origin and rotation in the actual Three.js transforms. */
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { scnWorldBounds, scnWorldPoint } from '../viewer/scn-transform.js';
import { makeCatalogPreview } from '../viewer/scn-structure.js';

const close = (actual, expected, name) => {
  for (let i=0;i<3;i++) assert(Math.abs(actual[i] - expected[i]) < .0001,
    `${name} axis ${i}: ${actual[i]} != ${expected[i]}`);
};
const record = {name:'EK PULT SZIMPLA, normal',position:[2600,3900,0],size:[600,700,900],rotationRad:Math.PI};
const root = new THREE.Group();
root.position.set(...record.position);
root.rotation.z = record.rotationRad;
const schematic = makeCatalogPreview(record);
assert.equal(schematic.kind,'cabinet');
for(const part of schematic.parts) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshBasicMaterial());
  mesh.scale.set(...part.size);
  mesh.position.set(...part.position.map((v,i)=>v+part.size[i]/2));
  root.add(mesh);
}
root.updateWorldMatrix(true,true);
close(root.children[0].getWorldPosition(new THREE.Vector3()).toArray(),
  scnWorldPoint(record,[9,350,450]),'Left cabinet panel center');
// Envelope bounding box remains correct after all parts are rotated together.
const theoretical = scnWorldBounds(record);
const shellBox = new THREE.Box3().setFromObject(root);
close(shellBox.min.toArray(),theoretical.min,'Rotated shell min');
close(shellBox.max.toArray(),theoretical.max,'Rotated shell max');
// The independent SCN panel must rotate around local zero, not its centre.
const panel = {size:[600,18,900],position:[2600,3900,0],rotationRad:Math.PI/2};
const unit = new THREE.BoxGeometry(1,1,1);
unit.translate(.5,.5,.5);
const board=new THREE.Mesh(unit,new THREE.MeshBasicMaterial());
board.scale.set(...panel.size);
board.position.set(...panel.position);
board.rotation.z = panel.rotationRad;
const bounds = new THREE.Box3().setFromObject(board);
close(bounds.min.toArray(),scnWorldBounds(panel).min,'Rotated board min');
close(bounds.max.toArray(),scnWorldBounds(panel).max,'Rotated board max');
console.log('OK: Three.js cabinet + independent panel rotate around SCN origin, positions and dimensions match preview.');
