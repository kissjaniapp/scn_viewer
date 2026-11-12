/**
 * Conservative interpretation of independently decoded SCN dimensions.
 * A catalog reference is not panel geometry: do not render its enclosing box
 * as though it were a solid cabinet. All grouping is spatial and approximate.
 */
import { isCoveringWall } from './scn-structure.js';
import { scnWorldBounds, scnWorldCenter } from './scn-transform.js';

export function classifyScnRecord(record) {
  const name = String(record.name || '').normalize('NFC');
  const dimensions = record.size || [];
  if (!Array.isArray(dimensions) || dimensions.length !== 3 || dimensions.some(n => !Number.isFinite(n) || n <= 0)) return 'invalid';
  if (/DECO\s*PANEL/i.test(name)) return isCoveringWall(record) ? 'wall' : 'panel';
  if (/^CYL\s+[HV]$/i.test(name) || /^PLAN1$/i.test(name)) return 'fitting';
  if (/^CUBE$/i.test(name)) {
    const ordered = [...dimensions].sort((a,b) => a-b);
    // Thin CUBE records may themselves be structural plates: retain them.
    if (ordered[0] <= 60 && ordered[1] >= 125 && ordered[2] >= 200) return 'panel';
    if (ordered[2] < 350 || ordered[1] < 125) return 'fitting';
    return 'proxy';
  }
  // Named appliances and catalog assemblies are reference envelopes, not
  // evidence of an actual solid rectangular body.
  return 'reference';
}

function boxGap2D(a, b) {
  const ab = scnWorldBounds(a), bb = scnWorldBounds(b);
  let total = 0;
  for (let axis=0; axis<2; axis++) {
    const gap = Math.max(0, ab.min[axis] - bb.max[axis], bb.min[axis] - ab.max[axis]);
    total += gap*gap;
  }
  return Math.sqrt(total);
}
function distanceToRegion(record, region) {
  const p = scnWorldCenter(record);
  const gapX = Math.max(0, region.min[0]-p[0], p[0]-region.max[0]);
  const gapY = Math.max(0, region.min[1]-p[1], p[1]-region.max[1]);
  return Math.hypot(gapX,gapY);
}

/**
 * Groups panels by XY adjacency. These are *areas of structure* rather than
 * claimed KitchenDraw cabinet IDs. The viewer labels the uncertainty.
 */
export function discoverScnRegions(entries, maxGapMm = 1400) {
  const panels = entries.filter(e => classifyScnRecord(e) === 'panel');
  const parents = panels.map((_,i) => i);
  function root(i) { return parents[i] === i ? i : (parents[i] = root(parents[i])); }
  function join(i,j) { const a=root(i), b=root(j); if(a !== b) parents[b]=a; }
  for(let i=0;i<panels.length;i++) {
    for(let j=0;j<i;j++) if(boxGap2D(panels[i],panels[j]) <= maxGapMm) join(i,j);
  }
  const components = new Map();
  panels.forEach((entry,i) => {
    const key=root(i);
    if(!components.has(key)) components.set(key, []);
    components.get(key).push(entry);
  });
  const regions = [...components.values()].map(members=>{
    const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
    for(const record of members) {
      const box = scnWorldBounds(record);
      for(let i=0;i<3;i++) {
        min[i]=Math.min(min[i],box.min[i]);
        max[i]=Math.max(max[i],box.max[i]);
      }
    }
    return {min,max,panelCount:members.length,panelIds:members.map(x=>x.id)};
  }).sort((a,b)=>b.panelCount-a.panelCount || a.min[0]-b.min[0]);
  regions.forEach((region,i) => {
    region.id = i+1;
    region.name = region.panelCount < 3 ? `Különálló lap ${i+1}` : `Bútoregyüttes ${i+1}`;
    region.label = `${region.name} · ${region.panelCount} lap`;
  });
  const idToRegion = new Map();
  for(const region of regions) for(const id of region.panelIds) idToRegion.set(id,region.id);
  // Assign preview/hardware entries only when close enough to a structure area.
  // Keep remote catalog objects accessible in the "all areas" view.
  for (const entry of entries) {
    if (idToRegion.has(entry.id)) continue;
    let nearest=null, smallest=Infinity;
    for (const region of regions) {
      const d=distanceToRegion(entry,region);
      if (d<smallest) {smallest=d;nearest=region;}
    }
    idToRegion.set(entry.id,smallest <= 2800 ? nearest?.id ?? null : null);
  }
  return {regions, idToRegion};
}
