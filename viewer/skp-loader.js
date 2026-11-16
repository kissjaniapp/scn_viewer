/**
 * SketchUp .SKP reader for the offline SCN Viewer.
 *
 * OpenSKP reads the actual SketchUp component definitions, faces, materials and
 * instance transforms; no catalog-box approximation is involved here.
 * The instanced GLB keeps components as separate scene nodes for selection.
 *
 * OpenSKP is MIT-licensed: https://github.com/iamahsanmehmood/openskp
 */
import { buildInstancedScene, toInstancedGLB } from 'openskp';

export function decodeSkpToGlb(buffer) {
  if (!(buffer instanceof ArrayBuffer) || buffer.byteLength < 64) {
    throw new Error('A SketchUp SKP fájl üres, túl rövid vagy sérült.');
  }
  const scene = buildInstancedScene(buffer);
  if (!scene?.meshResources?.length) {
    throw new Error('Az SKP beolvasható, de nem tartalmaz megjeleníthető 3D felületet.');
  }
  const data = toInstancedGLB(scene, { textures: true });
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  if (bytes.byteLength < 20) {
    throw new Error('Nem sikerült előállítani az SKP 3D geometriáját.');
  }
  return {
    glb: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    resourceCount: scene.meshResources.length,
  };
}
