/**
 * SCN object's placement transform, independent of Three.js.
 * The source XYZ coordinate is the object's LOCAL origin, not the centre of
 * its bounding cuboid.  The KitchenDraw XY orientation at +164 is radians;
 * rotate each local (x,y) around that origin, then add the source translation.
 * Never rotate a cabinet about its bounding-box centre.
 */
export function scnRotation(record) {
  const a = record?.rotationRad;
  return Number.isFinite(a) && Math.abs(a) <= 200 * Math.PI ? a : 0;
}

export function scnWorldPoint(record, localPoint) {
  const [tx, ty, tz] = record.position;
  const [x, y, z] = localPoint;
  const theta = scnRotation(record);
  const c = Math.cos(theta), s = Math.sin(theta);
  return [tx + x*c - y*s, ty + x*s + y*c, tz + z];
}

/** World-aligned bounding box, accounting for the object's Z-axis rotation. */
export function scnWorldBounds(record) {
  const [w,d,h] = record.size;
  const points = [[0,0,0],[w,0,0],[w,d,0],[0,d,0]]
    .map(point => scnWorldPoint(record, point));
  const min = [Math.min(...points.map(p=>p[0])),Math.min(...points.map(p=>p[1])),record.position[2]];
  const max = [Math.max(...points.map(p=>p[0])),Math.max(...points.map(p=>p[1])),record.position[2]+h];
  return {min,max,size:max.map((v,i)=>v-min[i])};
}

/** The original catalog XY dimensions remain local even after rotation. */
export function scnWorldCenter(record) {
  return scnWorldPoint(record, record.size.map(v=>v/2));
}
