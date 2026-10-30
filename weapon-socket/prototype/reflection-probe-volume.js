import {Matrix4} from 'three';
export const reflectionProbeFlags=p=>(p.boxProjection?1:0)+(p.volumeShape==='sphere'?2:0)+(p.priorityBlend?4:0);

// Three affine rows keep native/GL/TSL packing independent of matrix conventions.
// Face distances stay in world units under nonuniform scale, reflection or shear.
export function reflectionProbeVolume(matrix,minimum,maximum){
 const m=matrix.elements;if(!m.every(Number.isFinite)||m[3]!==0||m[7]!==0||m[11]!==0||m[15]!==1||minimum.length!==3||maximum.length!==3||minimum.some((v,i)=>!Number.isFinite(v)||!Number.isFinite(maximum[i])||v>=maximum[i]))throw Error('반사 프로브의 변환·영역을 확인하세요.');const determinant=matrix.determinant();if(!Number.isFinite(determinant)||determinant===0)return null;const a=new Matrix4().copy(matrix).invert().elements,rows=[0,1,2].map(i=>[a[i],a[i+4],a[i+8],a[i+12]]),scale=rows.map(r=>1/Math.hypot(...r.slice(0,3)));if([...rows.flat(),...scale,...minimum,...maximum].some(v=>!Number.isFinite(Math.fround(v)))||scale.some(v=>Math.fround(v)<=0))return null;
 const middle=minimum.map((v,i)=>(v+maximum[i])*.5),worldCenter=[0,1,2].map(i=>m[i]*middle[0]+m[i+4]*middle[1]+m[i+8]*middle[2]+m[i+12]),halfAxes=[0,1,2].map(i=>[0,1,2].map(j=>m[i*4+j]*(maximum[i]-minimum[i])*.5));return {worldCenter,halfAxes,minimum:[...minimum],maximum:[...maximum],localX:rows[0],localY:rows[1],localZ:rows[2],faceScale:[...scale,0],volume:Math.abs(determinant)*minimum.reduce((v,n,i)=>v*(maximum[i]-n),1)};
}
// Sphere radius is in world units; owner scale moves the offset, not the radius.
export function reflectionProbeSphereVolume(center,radius){
 if(center.length!==3||center.some(v=>!Number.isFinite(v))||!Number.isFinite(radius)||radius<=0)throw Error('반사 구의 중심·반경을 확인하세요.');
 const b=reflectionProbeVolume(new Matrix4().makeTranslation(...center),[-radius,-radius,-radius],[radius,radius,radius]);if(!b)return null;b.shape='sphere';b.volume=4*Math.PI/3*radius**3;return b;
}
export function probeSphereDirection(point,direction,local,ray,radius,center){
 if(Math.hypot(...local)>radius)return [...direction];const scale=Math.max(...ray.map(Math.abs));if(!(scale>0))return [...direction];
 const q=ray.map(v=>v/scale),length=Math.hypot(...q),unit=q.map(v=>v/length),scaled=local.map(v=>v/radius),b=scaled.reduce((v,n,i)=>v+n*unit[i],0),c=Math.min(0,scaled.reduce((v,n)=>v+n*n,0)-1),root=Math.sqrt(Math.max(0,b*b-c)),distance=b>0?(b+root>0?-c/(b+root):0):root-b,result=point.map((v,i)=>(v-center[i])+(direction[i]/scale)*(distance*radius/length));
 return Math.hypot(...result)>1e-10?result:[...direction];
}
export function probeLocalPoint(bounds,point,direction=false){return ['localX','localY','localZ'].map(key=>bounds[key].slice(0,3).reduce((n,v,i)=>n+v*point[i],direction?0:bounds[key][3]));}
export function probeVolumeWeight(bounds,point,blendDistance=0){const local=probeLocalPoint(bounds,point),distance=bounds.shape==='sphere'?bounds.maximum[0]-Math.hypot(...local):Math.min(...local.map((v,i)=>Math.min(v-bounds.minimum[i],bounds.maximum[i]-v)*bounds.faceScale[i]));return distance<0?0:blendDistance>0?Math.min(1,distance/blendDistance):1;}
export function probeVolumeDirection(bounds,point,direction,center){const local=probeLocalPoint(bounds,point),ray=probeLocalPoint(bounds,direction,true);if(bounds.shape==='sphere')return probeSphereDirection(point,direction,local,ray,bounds.maximum[0],center);if(local.some((v,i)=>v<bounds.minimum[i]||v>bounds.maximum[i]))return [...direction];let distance=Infinity;for(let i=0;i<3;i++)if(ray[i]!==0)distance=Math.min(distance,((ray[i]>0?bounds.maximum[i]:bounds.minimum[i])-local[i])/ray[i]);if(!Number.isFinite(distance))return [...direction];const projected=point.map((v,i)=>v+direction[i]*distance-center[i]);return Math.hypot(...projected)>1e-10?projected:[...direction];}

export const probeVolumeGLSL=`
float hbProbeSphereFade(vec3 p,float radius,float blend){float distance=radius-length(p);return distance<0.0?0.0:blend>0.0?clamp(distance/blend,0.0,1.0):1.0;}
vec3 hbProbeSphereProject(vec3 point,vec3 ray,vec3 center,vec3 p,vec3 r,float radius){
 if(length(p)>radius)return ray;float scale=max(abs(r.x),max(abs(r.y),abs(r.z)));if(!(scale>0.0))return ray;vec3 q=r/scale;float size=length(q);q/=size;vec3 scaled=p/radius;float b=dot(scaled,q),c=min(0.0,dot(scaled,scaled)-1.0),root=sqrt(max(0.0,b*b-c)),distance=b>0.0?(b+root>0.0?-c/(b+root):0.0):root-b;vec3 result=(point-center)+(ray/scale)*(distance*radius/size);return dot(result,result)>1e-20?result:ray;
}

vec3 hbProbeLocalPoint(vec3 p,vec4 x,vec4 y,vec4 z){vec4 v=vec4(p,1);return vec3(dot(x,v),dot(y,v),dot(z,v));}
vec3 hbProbeLocalRay(vec3 r,vec4 x,vec4 y,vec4 z){return vec3(dot(x.xyz,r),dot(y.xyz,r),dot(z.xyz,r));}
float hbProbeVolumeFade(vec3 p,vec3 lo,vec3 hi,vec3 faceScale,float blend){vec3 edge=min(p-lo,hi-p)*faceScale;float distance=min(edge.x,min(edge.y,edge.z));return distance<0.0?0.0:blend>0.0?clamp(distance/blend,0.0,1.0):1.0;}
float hbProbeAxisExit(float p,float r,float lo,float hi){return r==0.0?3.402823466e38:((r>0.0?hi:lo)-p)/r;}
vec3 hbProbeProject(vec3 point,vec3 ray,vec3 center,vec3 p,vec3 r,vec3 lo,vec3 hi){if(all(equal(ray,vec3(0))))return ray;if(any(lessThan(p,lo))||any(greaterThan(p,hi)))return ray;float distance=min(hbProbeAxisExit(p.x,r.x,lo.x,hi.x),min(hbProbeAxisExit(p.y,r.y,lo.y,hi.y),hbProbeAxisExit(p.z,r.z,lo.z,hi.z)));vec3 result=point+ray*distance-center;return dot(result,result)>1e-20?result:ray;}
`;
