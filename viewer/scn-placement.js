/**
 * Display-only adjustments for imprecise catalog silhouettes.
 * Never mutate original SCN coordinates, dimensions or the imported SCN file.
 */
import { scnWorldBounds } from './scn-transform.js';

export const MAX_ADJUSTMENT_MM = 30000;

export function normaliseAdjustment(value) {
  if (!Array.isArray(value) || value.length !== 3) return [0, 0, 0];
  const numbers = value.map(Number);
  if (numbers.some(v => !Number.isFinite(v) || Math.abs(v) > MAX_ADJUSTMENT_MM)) return [0, 0, 0];
  return numbers;
}

export function correctedPosition(record, adjustment = [0, 0, 0]) {
  const delta = normaliseAdjustment(adjustment);
  return record.position.map((value, axis) => value + delta[axis]);
}

export function correctedBounds(record, adjustment = [0, 0, 0]) {
  const delta = normaliseAdjustment(adjustment);
  const source = scnWorldBounds(record);
  return {
    min: source.min.map((v, axis) => v + delta[axis]),
    max: source.max.map((v, axis) => v + delta[axis]),
    size: source.size.slice(),
  };
}

/**
 * AABB overlap for catalogue envelopes only. This is a warning, NOT proof that
 * the actual furniture meshes intersect, especially for rotated catalog items.
 */
export function envelopeWarnings(records, corrections = {}) {
  const boxItems = records.map(record => ({
    record,
    bbox: correctedBounds(record, corrections[record.id]),
  }));
  const warnings = [];
  for (let i = 0; i < boxItems.length; i++) {
    const a = boxItems[i];
    for (let j = i + 1; j < boxItems.length; j++) {
      const b = boxItems[j];
      const overlap = [0, 1, 2].map(axis =>
        Math.max(0, Math.min(a.bbox.max[axis], b.bbox.max[axis]) - Math.max(a.bbox.min[axis], b.bbox.min[axis]))
      );
      // Filter millimetre-scale edge joins and depth-zero touch points.
      if (overlap.some(v => v <= 10)) continue;
      const shared = overlap[0] * overlap[1] * overlap[2];
      const smallest = Math.min(
        a.record.size[0] * a.record.size[1] * a.record.size[2],
        b.record.size[0] * b.record.size[1] * b.record.size[2]
      );
      if (shared < smallest * .01) continue;
      warnings.push({ a: a.record.id, b: b.record.id, overlapMm: overlap,
        smallerVolumeRatio: shared / smallest });
    }
  }
  return warnings;
}
