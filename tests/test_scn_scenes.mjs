import assert from 'node:assert/strict';
import { discoverScnScenes } from '../viewer/scn-scenes.js';

const box = (id, x, y, name='VÍZSZ. DECO PANEL') =>
  ({id, name, size:[600,400,18], position:[x,y,0], rotationRad:0});
const entries = [
  box(1, 0, 0), box(2, 700, 0), box(3, 1400, 0),
  box(4, 10000, 2000), box(5, 10700, 2000), box(6, 11400, 2000),
  box(7, 22000, 18000),
];
const result=discoverScnScenes(entries);
assert.equal(result.regions.length, 3);
assert.deepEqual(result.regions.map(x=>x.recordCount),[3,3,1]);
assert.equal(result.idToRegion.get(1),result.idToRegion.get(3));
assert.notEqual(result.idToRegion.get(1),result.idToRegion.get(4));
assert.notEqual(result.idToRegion.get(4),result.idToRegion.get(7));
assert.equal(new Set([...result.idToRegion.keys()]).size,entries.length);
assert.deepEqual(result.regions[0].max, [2000,400,18]);
// Changing source order must not change each spatial component's membership.
const reordered=discoverScnScenes([...entries].reverse());
const memberships = layout => entries.map(e =>
  entries.filter(other=>layout.idToRegion.get(other.id)===layout.idToRegion.get(e.id))
    .map(other=>other.id).sort((a,b)=>a-b));
assert.deepEqual(memberships(result),memberships(reordered));
console.log('OK: spatial SCN scene grouping, separate layouts, no coordinate mutation');
