/**
 * Spatial scenes in KitchenDraw SCN exports.
 * Files may contain several independent copies/layouts on the same global
 * drawing plane. Do not fit the camera to all copies at once.
 *
 * Grouping is ONLY a viewing aid, not a recovered cabinet hierarchy.
 */
import { scnWorldCenter, scnWorldBounds } from './scn-transform.js';
import { classifyScnRecord } from './scn-layout.js';

export function discoverScnScenes(entries, maxDistanceMm = 2500) {
  const usable = entries.filter(e => classifyScnRecord(e) !== 'invalid');
  const centers = usable.map(scnWorldCenter);
  const parent = usable.map((_, i) => i);
  const root = i => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  };
  const distanceSq = maxDistanceMm * maxDistanceMm;
  for (let i = 0; i < usable.length; i++) {
    for (let j = 0; j < i; j++) {
      const dx = centers[i][0] - centers[j][0];
      const dy = centers[i][1] - centers[j][1];
      if (Math.abs(dx) <= maxDistanceMm && Math.abs(dy) <= maxDistanceMm &&
          dx * dx + dy * dy <= distanceSq) {
        const ri = root(i), rj = root(j);
        if (ri !== rj) parent[ri] = rj;
      }
    }
  }
  const components = new Map();
  usable.forEach((entry, i) => {
    const key = root(i);
    if (!components.has(key)) components.set(key, []);
    components.get(key).push(entry);
  });
  const regions = [...components.values()].map(members => {
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    let panelCount = 0;
    for (const record of members) {
      if (['panel', 'wall'].includes(classifyScnRecord(record))) panelCount++;
      const box = scnWorldBounds(record);
      for (let axis = 0; axis < 3; axis++) {
        min[axis] = Math.min(min[axis], box.min[axis]);
        max[axis] = Math.max(max[axis], box.max[axis]);
      }
    }
    return {min, max, panelCount, recordCount: members.length,
      panelIds: members.map(e => e.id)};
  }).sort((a, b) => b.panelCount - a.panelCount ||
      b.recordCount - a.recordCount || a.min[0] - b.min[0]);
  regions.forEach((region, i) => {
    region.id = i + 1;
    region.name = region.panelCount > 2
      ? `Jelenetrész ${i + 1}`
      : `Különálló objektum ${i + 1}`;
    region.label = `${region.name} · ${region.recordCount} rekord`;
  });
  const idToRegion = new Map();
  for (const region of regions) {
    for (const id of region.panelIds) idToRegion.set(id, region.id);
  }
  return {regions, idToRegion};
}
