/**
 * KitchenDraw .SCN binary scene reader (independent, no KitchenDraw runtime).
 *
 * Verified against 64F080FA_4198_01.scn: 463 records carry explicit size,
 * position, rotation angle and 'mm' unit markers.  Each relevant object record contains:
 *  +0:  @FORMES or @DK02 catalog ID; +16: CP1250 object description
 *  +74/80/86: uint16 presence marker (=1), then uint16 X/Y/Z dimensions
 *  +106/112/118: uint16 marker (=1), then int16 X/Y/Z positions
 *  +164: float64 XY rotation in radians (around the original local origin)
 *  +256: 'mm' (unit marker)
 * The high word of each 32-bit parameter is NOT a coordinate.  In particular
 * Z uses a 0x0009 high word on the tested KitchenDraw scene.
 *
 * LIMITATION: Not a complete proprietary format decoder. Some object entries
 * reference catalog shapes that aren't embedded as polygons in the .SCN.
 * Their *stored dimensions, placements and Z-axis rotation* can be applied
 * to schematic cuboids/cylinders, but not the missing catalog meshes/textures.
 */
import { scnWorldBounds } from './scn-transform.js';

const decoder = new TextDecoder('windows-1250');
const patterns = [
  [64, 70, 79, 82, 77, 69, 83], // @FORMES
  [64, 68, 75, 48, 50], // @DK02
];
const MIN_SIZE = 300;
const FIELD_MARKERS = [74, 80, 86, 106, 112, 118];

function stringAt(bytes, start, end) {
  let stop = start;
  while (stop < end && bytes[stop] !== 0) stop++;
  return decoder.decode(bytes.subarray(start, stop)).trim();
}

export function decodeScn(buffer) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (bytes.length < MIN_SIZE) throw new Error('Az SCN fájl túl rövid vagy sérült.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const entries = [];
  let recognized = 0;
  let unsupported = 0;
  for (let i = 0; i + 275 < bytes.length; i++) {
    if (bytes[i] !== 64) continue;
    let catalog = null;
    for (const pattern of patterns) {
      if (pattern.every((v, offset) => bytes[i + offset] === v)) {
        catalog = pattern.length === 7 ? '@FORMES' : '@DK02';
        break;
      }
    }
    if (!catalog) continue;
    // These exact fixed offsets apply to the verified variant only; never
    // invent a position for unsupported serialization variants.
    if (bytes[i + 256] !== 109 || bytes[i + 257] !== 109) continue;
    recognized++;
    if (!FIELD_MARKERS.every(offset => view.getUint16(i + offset, true) === 1)) {
      unsupported++;
      continue;
    }
    const dimensions = [76, 82, 88].map(offset => view.getUint16(i + offset, true));
    const position = [108, 114, 120].map(offset => view.getInt16(i + offset, true));
    const name = stringAt(bytes, i + 16, i + 48) || `${catalog} objektum`;
    // Explicit 2D primitives have a genuine zero Z extent in this SCN variant.
    // Keep their true dimensions and draw a separate XY surface in the viewer.
    const planar = /^(?:SURF2D|CIRC322D)$/i.test(name);
    if (dimensions.some(v => v > 32000) || dimensions[0] === 0 || dimensions[1] === 0 ||
        (dimensions[2] === 0 && !planar)) {
      unsupported++;
      continue;
    }
    const rotationRad = view.getFloat64(i + 164, true);
    if (!Number.isFinite(rotationRad) || Math.abs(rotationRad) > 200 * Math.PI) {
      unsupported++;
      continue;
    }
    entries.push({
      id: entries.length + 1,
      catalog,
      name,
      size: dimensions,
      position,
      rotationRad,
      type: /^SURF2D$/i.test(name) ? 'plane2d' : /^CIRC322D$/i.test(name) ? 'circle2d' :
        /^CYL H$/i.test(name) ? 'cylinderX' : /^CYL V$/i.test(name) ? 'cylinderZ' : 'box',
      offset: i,
    });
    i += 260; // avoid matching text inside the same verified record
  }
  if (!entries.length) {
    throw new Error('Nem találtam dekódolható 3D objektumot ebben az SCN változatban. Nem jelenítek meg kitalált geometriát.');
  }
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const e of entries) {
    const bbox = scnWorldBounds(e);
    for (let a = 0; a < 3; a++) {
      min[a] = Math.min(min[a], bbox.min[a]);
      max[a] = Math.max(max[a], bbox.max[a]);
    }
  }
  return {
    entries,
    recognized,
    unsupported,
    boundsMm: {min, max, size: max.map((v, i) => v - min[i])},
    fidelity: 'bounding-geometry',
    note: 'A tárolt méretek, pozíciók és Z-elforgatások valós SCN-adatok; a 2D felületek külön síkok. A katalógusfüggő alakzatok egyszerűsített befoglaló testek.'
  };
}
