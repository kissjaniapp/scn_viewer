import assert from 'node:assert/strict';
import { decodeSkpToGlb } from '../viewer/skp-loader.js';
import { buildInstancedScene, toInstancedGLB, create } from 'openskp';

assert.equal(typeof buildInstancedScene, 'function');
assert.equal(typeof toInstancedGLB, 'function');
assert.throws(() => decodeSkpToGlb(null), /SketchUp SKP/);
assert.throws(() => decodeSkpToGlb(new ArrayBuffer(0)), /SketchUp SKP/);
assert.throws(() => decodeSkpToGlb(new ArrayBuffer(20)), /SketchUp SKP/);
// Create a real SKP in-memory (including a placed component), convert it,
// and check the GLB header. This exercises the entire binary file pipeline.
const builder = create();
const cabinet = builder.addComponentDefinition('Test cabinet', definition => {
  definition.addFace([[0, 0, 0], [40, 0, 0], [40, 20, 0], [0, 20, 0]]);
});
builder.addInstance(cabinet, {translation: [10, 25, 0]});
const generated = builder.toBytes();
const source = generated.buffer.slice(generated.byteOffset, generated.byteOffset + generated.byteLength);
const result = decodeSkpToGlb(source);
assert(result.resourceCount >= 1, 'Expected component mesh resource');
assert(new DataView(result.glb).getUint32(0, true) === 0x46546c67, 'Expected glTF binary magic');
assert(result.glb.byteLength > 20);

console.log('OK: OpenSKP native reader available, component-preserving GLB conversion connected.');
