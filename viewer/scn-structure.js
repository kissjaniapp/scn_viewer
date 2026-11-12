/**
 * Honest, deterministic schematic rendering for catalog objects whose actual
 * polygon meshes do not exist in the SCN. All these panels are PREVIEWS, not
 * recovered cut-list parts. Dimensions/positions come from the source record.
 */
const APPLIANCE = /(?:UNOX|SpidoCook|KÁVÉFŐZŐ|KAVEFOZO|RETRO\s*HC|HŰTŐ|HUTO|SÜTŐ|SUTO|MOSOGATÓGÉP|MOSOGATOGEP)/i;

export function catalogPreviewType(record) {
  const [w, d, h] = record.size || [];
  if (![w, d, h].every(n => Number.isFinite(n) && n > 0)) return 'none';
  if (APPLIANCE.test(record.name || '')) return 'appliance';
  if (w >= 300 && d >= 250 && h >= 350) return 'cabinet';
  return 'outline';
}

function element(name, size, position, material) {
  return {name, size, position, material, isInferred: true};
}

/** Positions relative to original catalog envelope's lower-left-front corner (mm). */
export function makeCatalogPreview(record, wallThicknessMm = 18) {
  const [w, d, h] = record.size;
  const type = catalogPreviewType(record);
  const parts = [];
  const t = Math.min(wallThicknessMm, w / 9, d / 9, h / 9);
  if (type === 'cabinet') {
    // Open at the viewer-facing (-Y) side, so shelves and partitions remain visible.
    // These are MODELLED illustrations, not assertions about original construction.
    parts.push(element('Bal oldallap (becsült)', [t,d,h], [0,0,0], 'previewBoard'));
    parts.push(element('Jobb oldallap (becsült)', [t,d,h], [w-t,0,0], 'previewBoard'));
    parts.push(element('Fenék (becsült)', [w-2*t,d,t], [t,0,0], 'previewBoard'));
    parts.push(element('Tető (becsült)', [w-2*t,d,t], [t,0,h-t], 'previewBoard'));
    parts.push(element('Hátlap (becsült)', [w-2*t,Math.min(4,t),h-2*t], [t,d-Math.min(4,t),t], 'previewBack'));
    if (h >= 1050) {
      parts.push(element('Polc (illusztráció)', [w-2*t,d-Math.min(4,t),t], [t,0,h*.49], 'previewBoard'));
    }
    if (w >= 1200) {
      // Illustrative split is used only for very wide open cabinets.
      parts.push(element('Osztó (illusztráció)', [t,d-Math.min(4,t),h-2*t], [w*.5-t*.5,0,t], 'previewBoard'));
    }
  } else if (type === 'appliance') {
    // Recognizable appliance silhouette, front face and inset display, not a cabinet.
    parts.push(element('Berendezés burkolata (becsült)', [w,d,h], [0,0,0], 'applianceBody'));
    const margin = Math.min(w*.10,h*.10,60);
    parts.push(element('Berendezés előlapja (illusztráció)', [Math.max(20,w-2*margin),Math.max(4,d*.012),Math.max(20,h-2*margin)], [margin,0,margin], 'applianceFront'));
  }
  for (const part of parts) {
    if (part.size.some(v => v <= 0)) throw new Error('Érvénytelen becsült bútorelem');
  }
  return {kind:type, envelopeMm:[w,d,h], parts};
}

/** Huge decorative panels are often room-facing screens covering the other furniture. */
export function isCoveringWall(record) {
  if (!/DECO\s*PANEL/i.test(record.name || '')) return false;
  const [x,y,z] = record.size || [];
  return Math.max(x,y) >= 3000 && z >= 1600 && Math.min(x,y) <= 50;
}
