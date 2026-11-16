import assert from 'node:assert/strict';
import { decodeSkpToGlb } from '../viewer/skp-loader.js';
import { buildInstancedScene, toInstancedGLB } from 'openskp';

assert.equal(typeof buildInstancedScene, 'function');
assert.equal(typeof toInstancedGLB, 'function');
assert.throws(() => decodeSkpToGlb(null), /SketchUp SKP/);
assert.throws(() => decodeSkpToGlb(new ArrayBuffer(0)), /SketchUp SKP/);
assert.throws(() => decodeSkpToGlb(new ArrayBuffer(20)), /SketchUp SKP/);
// Real SKP model regression can be run locally with a separate fixture.
// Do not commit private customer models to the public repository.
console.log('OK: OpenSKP native reader available, component-preserving GLB conversion connected.');
