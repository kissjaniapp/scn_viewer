/** Detect closed, linearly extruded polygonal parts (L-shaped or notched
 * furniture panels) from indexed or non-indexed triangle meshes.
 * Only a provably watertight prism is accepted; never replace other shapes
 * by a misleading bounding box. Supports one contour or several holes.
 */
const axes=[ [1,2,0], [0,2,1], [0,1,2] ];
const cross2=(a,b)=>a[0]*b[1]-a[1]*b[0];
const polygonArea=loop=>Math.abs(loop.reduce((sum,p,i)=>{
 const q=loop[(i+1)%loop.length];return sum+cross2(p,q);
},0))/2;
const key2=(p,eps)=>p.map(n=>Math.round(n/eps)).join(',');
const key3=(p,eps)=>p.map(n=>Math.round(n/eps)).join(',');
const area3=(a,b,c)=>Math.hypot(
 (b[1]-a[1])*(c[2]-a[2])-(b[2]-a[2])*(c[1]-a[1]),
 (b[2]-a[2])*(c[0]-a[0])-(b[0]-a[0])*(c[2]-a[2]),
 (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]))/2;

export function analyzeExtrudedPolygon(geometry,{maxTriangles=12000}={}){
 const attr=geometry?.attributes?.position;
 if(!attr||attr.count<8)return null;
 const raw=attr.array,stride=attr.itemSize||3;
 const idx=geometry.index?.array;
 const count=idx?idx.length:attr.count;
 if(count%3!==0||count<36||count/3>maxTriangles)return null;
 const p=i=>{
  const j=(idx?idx[i]:i)*stride;
  return [raw[j],raw[j+1],raw[j+2]];
 };
 const faces=[],min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
 for(let i=0;i<count;i+=3){
  const face=[p(i),p(i+1),p(i+2)];
  if(face.some(a=>a.some(x=>!Number.isFinite(x))))return null;
  for(const v of face)for(let j=0;j<3;j++){
   min[j]=Math.min(min[j],v[j]);max[j]=Math.max(max[j],v[j]);
  }
  faces.push(face);
 }
 const scale=Math.max(...max.map((n,i)=>n-min[i]));
 if(!(scale>0))return null;
 const eps=Math.max(scale*1e-6,1e-7);
 // Strict water-tightness: each quantized geometric 3D edge must be shared
 // by exactly two triangles. Duplicate/intersecting/open surfaces are rejected.
 const shared=new Map();
 for(const face of faces){
  if(area3(...face)<=eps*eps*.01)return null;
  const vs=face.map(v=>key3(v,eps));
  if(new Set(vs).size!==3)return null;
  for(let k=0;k<3;k++){
   const a=vs[k],b=vs[(k+1)%3];
   const key=a<b?a+'|'+b:b+'|'+a;
   shared.set(key,(shared.get(key)||0)+1);
  }
 }
 if([...shared.values()].some(v=>v!==2))return null;

 for(const [u,v,axis] of axes){
  const h=max[axis]-min[axis];
  if(h<eps*2)continue;
  const cap=[[],[]],side=[];
  let valid=true;
  for(const face of faces){
   if(face.every(p=>Math.abs(p[axis]-min[axis])<=eps))cap[0].push(face);
   else if(face.every(p=>Math.abs(p[axis]-max[axis])<=eps))cap[1].push(face);
   else{
    const a=face[0],b=face[1],c=face[2];
    const projectedArea=Math.abs(cross2([b[u]-a[u],b[v]-a[v]],[c[u]-a[u],c[v]-a[v]]));
    if(projectedArea>eps*eps*8){valid=false;break;}
    side.push(face);
   }
  }
  if(!valid||!side.length||!cap[0].length||!cap[1].length)continue;
  function extract(facesOnCap){
   const edges=new Map(),points=new Map();
   let triangleArea=0;
   for(const face of facesOnCap){
    const verts=face.map(q=>[q[u],q[v]]);
    triangleArea+=Math.abs(cross2([verts[1][0]-verts[0][0],verts[1][1]-verts[0][1]],
      [verts[2][0]-verts[0][0],verts[2][1]-verts[0][1]]))/2;
    const keys=verts.map(q=>key2(q,eps));
    for(let k=0;k<3;k++){
     points.set(keys[k],verts[k]);
     const a=keys[k],b=keys[(k+1)%3];
     const edge=a<b?a+'|'+b:b+'|'+a;
     edges.set(edge,{a,b,count:(edges.get(edge)?.count||0)+1});
    }
   }
   if([...edges.values()].some(e=>e.count>2))return null;
   const boundary=[...edges.entries()].filter(([,e])=>e.count===1);
   if(boundary.length<3)return null;
   const graph=new Map();
   for(const [,e] of boundary)for(const [a,b] of [[e.a,e.b],[e.b,e.a]]) {
    if(!graph.has(a))graph.set(a,[]);
    graph.get(a).push(b);
   }
   if([...graph.values()].some(x=>x.length!==2))return null;
   const remaining=new Set(graph.keys()),loops=[];
   while(remaining.size){
    const start=remaining.values().next().value;
    const loop=[],seen=new Set();
    let prev=null,curr=start;
    for(let steps=0;steps<graph.size+1;steps++){
     if(seen.has(curr)){if(curr!==start)return null;break;}
     seen.add(curr);remaining.delete(curr);
     loop.push(points.get(curr));
     const nbrs=graph.get(curr);
     const next=nbrs[0]!==prev?nbrs[0]:nbrs[1];
     prev=curr;curr=next;
     if(curr===start)break;
    }
    if(curr!==start||loop.length<3)return null;
    loops.push(loop);
   }
   if(!loops.length)return null;
   const areas=loops.map(polygonArea);
   const biggest=areas.indexOf(Math.max(...areas));
   const enclosed=areas[biggest]-areas.reduce((s,a,i)=>i===biggest?s:s+a,0);
   if(enclosed<=eps*eps || Math.abs(enclosed-triangleArea)>Math.max(enclosed*.003,eps*eps*10))return null;
   const contour=loops[biggest],holes=loops.filter((_,i)=>i!==biggest);
   // Compare both cap boundaries by undirected quantized edges.
   const keys=new Set(boundary.map(([key])=>key));
   return {contour,holes,keys};
  }
  const bottom=extract(cap[0]),top=extract(cap[1]);
  if(!bottom||!top||bottom.keys.size!==top.keys.size||
    [...bottom.keys].some(x=>!top.keys.has(x)))continue;
  const to3=p=>{
   const world=[0,0,0];world[u]=p[0];world[v]=p[1];world[axis]=min[axis];
   return world;
  };
  const extrusion=[0,0,0];extrusion[axis]=h;
  return {outline:bottom.contour.map(to3),holes:bottom.holes.map(loop=>loop.map(to3)),extrusion};
 }
 return null;
}

export function worldExtrudedPolygon(matrix,profile,mmPerUnit=1){
 const e=matrix?.elements;
 if(!e || e.length!==16||!Array.from(e).every(Number.isFinite)||
  Math.abs(e[3])+Math.abs(e[7])+Math.abs(e[11])+Math.abs(e[15]-1)>1e-8||
  !(mmPerUnit>0))return null;
 const place=p=>[
  (e[0]*p[0]+e[4]*p[1]+e[8]*p[2]+e[12])*mmPerUnit,
  (e[1]*p[0]+e[5]*p[1]+e[9]*p[2]+e[13])*mmPerUnit,
  (e[2]*p[0]+e[6]*p[1]+e[10]*p[2]+e[14])*mmPerUnit
 ];
 const v=profile.extrusion;
 const extrusion=[
  (e[0]*v[0]+e[4]*v[1]+e[8]*v[2])*mmPerUnit,
  (e[1]*v[0]+e[5]*v[1]+e[9]*v[2])*mmPerUnit,
  (e[2]*v[0]+e[6]*v[1]+e[10]*v[2])*mmPerUnit
 ];
 if(Math.hypot(...extrusion)<1e-7)return null;
 return {outline:profile.outline.map(place),holes:profile.holes.map(loop=>loop.map(place)),extrusion};
}
