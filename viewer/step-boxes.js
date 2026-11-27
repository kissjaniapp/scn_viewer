/** Recognize exact closed rectangular-prism meshes for safe CAD reconstruction.
 * A bounding box alone is NOT sufficient: holes, cutouts, bevels and curved
 * surfaces must never be silently replaced by a solid box in a STEP file.
 */
export function analyzeRectangularPrism(geometry, {maxTriangles=150000}={}) {
 const attr=geometry?.attributes?.position;
 if(!attr || attr.count<8) return null;
 const points=attr.array, stride=attr.itemSize||3, n=attr.count;
 let low=[Infinity,Infinity,Infinity],high=[-Infinity,-Infinity,-Infinity];
 for(let i=0;i<n;i++){
  const o=i*stride;
  for(let c=0;c<3;c++) {
   const v=points[o+c];
   if(!Number.isFinite(v)) return null;
   low[c]=Math.min(low[c],v);high[c]=Math.max(high[c],v);
  }
 }
 const dims=low.map((v,c)=>high[c]-v);
 if(dims.some(d=>d<1e-7))return null;
 const idx=geometry.index?.array;
 const triangles=(idx?idx.length:n)/3;
 if(!Number.isInteger(triangles) || triangles<12 || triangles>maxTriangles)return null;
 const maxDim=Math.max(...dims);
 const eps=Math.max(maxDim*1e-5,1e-6);
 const areaByFace=[0,0,0,0,0,0];
 const p=(index)=>{const o=index*stride;return [points[o],points[o+1],points[o+2]];};
 for(let i=0;i<triangles;i++){
  const a=p(idx?idx[i*3]:i*3),b=p(idx?idx[i*3+1]:i*3+1),c=p(idx?idx[i*3+2]:i*3+2);
  const ab=b.map((v,j)=>v-a[j]),ac=c.map((v,j)=>v-a[j]);
  const cross=[ab[1]*ac[2]-ab[2]*ac[1],ab[2]*ac[0]-ab[0]*ac[2],ab[0]*ac[1]-ab[1]*ac[0]];
  const area=Math.hypot(...cross)/2;
  if(area<1e-14)continue;
  let face=-1;
  for(let k=0;k<3;k++){
   if([a,b,c].every(v=>Math.abs(v[k]-low[k])<eps)){face=k*2;break;}
   if([a,b,c].every(v=>Math.abs(v[k]-high[k])<eps)){face=k*2+1;break;}
  }
  if(face===-1)return null; // cutouts/diagonals/non-planar surfaces
  areaByFace[face]+=area;
 }
 for(let k=0;k<3;k++){
  const wanted=dims[(k+1)%3]*dims[(k+2)%3];
  for(let f=0;f<2;f++) if(Math.abs(areaByFace[k*2+f]-wanted)>Math.max(wanted*0.002,eps*eps*10)) return null;
 }
 return {min:low,size:dims};
}
export function boxWorldTransform(matrixWorld,box,unit=1){
 const e=matrixWorld.elements;
 const axes=[[e[0],e[1],e[2]],[e[4],e[5],e[6]],[e[8],e[9],e[10]]];
 const norms=axes.map(a=>Math.hypot(...a));
 if(norms.some(v=>v<1e-8))return null;
 const unitAxes=axes.map((a,i)=>a.map(v=>v/norms[i]));
 const dot=(a,b)=>a.reduce((acc,v,i)=>acc+v*b[i],0);
 for(let i=0;i<3;i++)for(let j=i+1;j<3;j++)if(Math.abs(dot(unitAxes[i],unitAxes[j]))>1e-4)return null;
 const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
 if(dot(cross(unitAxes[0],unitAxes[1]),unitAxes[2])<0.9999)return null;
 const size=box.size.map((d,i)=>d*norms[i]*unit);
 const t=[e[12],e[13],e[14]];
 for(let j=0;j<3;j++) for(let i=0;i<3;i++)t[j]+=axes[i][j]*box.min[i];
 const transform=[
  unitAxes[0][0],unitAxes[1][0],unitAxes[2][0],t[0]*unit,
  unitAxes[0][1],unitAxes[1][1],unitAxes[2][1],t[1]*unit,
  unitAxes[0][2],unitAxes[1][2],unitAxes[2][2],t[2]*unit
 ];
 return {size,transform};
}
