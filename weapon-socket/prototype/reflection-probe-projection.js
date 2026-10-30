import {reflectionProbeVolume,reflectionProbeSphereVolume,probeLocalPoint,probeVolumeDirection} from './reflection-probe-volume.js';

export const probeProjectionFields=Object.freeze(['projectionMinimum','projectionMaximum','projectionX','projectionY','projectionZ']);
export const inheritedProbeProjection=Object.freeze({mode:0,volume:null});
export const infiniteProbeProjection=Object.freeze({mode:3,volume:null});
const identityRows=[[1,0,0,0],[0,1,0,0],[0,0,1,0]].map(Object.freeze);
const fixedProjection=mode=>Object.freeze({projectionMinimum:Object.freeze([-1,-1,-1,mode]),projectionMaximum:Object.freeze([1,1,1,0]),projectionX:identityRows[0],projectionY:identityRows[1],projectionZ:identityRows[2]});
const inheritedSettings=fixedProjection(0),infiniteSettings=fixedProjection(3);

export function reflectionProxyVolume(group,p){
 if(p.volumeShape==='infinite')return infiniteProbeProjection;
 const m=group.matrixWorld.elements;
 const center=[0,1,2].map(i=>m[i]*p.offset[0]+m[i+4]*p.offset[1]+m[i+8]*p.offset[2]+m[i+12]);
 const volume=p.volumeShape==='sphere'?reflectionProbeSphereVolume(center,p.volumeRadius):reflectionProbeVolume(group.matrixWorld,p.offset.map((v,i)=>v-p.size[i]*.5),p.offset.map((v,i)=>v+p.size[i]*.5));
 return volume?{mode:p.volumeShape==='sphere'?2:1,volume}:infiniteProbeProjection;
}

export function resolveProbeProjection(p,proxies){
 if(p.useInfluenceVolumeAsProxy!==false)return inheritedProbeProjection;
 const proxy=proxies.get(p.proxyVolume),entry=proxy?.find(row=>row.id===p.proxyComponent||row.name===p.proxyComponent||p.proxyComponent==='ReflectionProxyVolume');
 if(!entry)return infiniteProbeProjection;
 // Editing a shared proxy shape can temporarily leave some users incompatible.
 // Keep the scene renderable; assignment through the service still rejects it.
 if(entry.p.volumeShape!=='infinite'&&entry.p.volumeShape!==p.volumeShape)return infiniteProbeProjection;
 return entry.projection;
}

export function probeProjectionSettings(projection=inheritedProbeProjection){
 if(projection.mode===0)return inheritedSettings;if(projection.mode===3)return infiniteSettings;
 const b=projection.volume;
 return {projectionMinimum:[...(b?.minimum||[-1,-1,-1]),projection.mode],projectionMaximum:[...(b?.maximum||[1,1,1]),0],projectionX:b?.localX||identityRows[0],projectionY:b?.localY||identityRows[1],projectionZ:b?.localZ||identityRows[2]};
}

export function probeProjectionDirection(probe,point,ray){
 if(!probe.p.boxProjection)return [...ray];
 const projection=probe.projection||inheritedProbeProjection;
 if(projection.mode===0)return probeVolumeDirection(probe.localBox,point,ray,probe.center);
 if(projection.mode===3)return [...ray];
 const b=projection.volume,local=probeLocalPoint(b,point),direction=probeLocalPoint(b,ray,true),scale=Math.max(...direction.map(Math.abs));
 if(!(scale>0))return [...ray];
 const q=direction.map(v=>v/scale);let distance;
 if(projection.mode===2){
  const length=Math.hypot(...q),unit=q.map(v=>v/length),radius=b.maximum[0],scaled=local.map(v=>v/radius),dot=scaled.reduce((sum,v,i)=>sum+v*unit[i],0),c=scaled.reduce((sum,v)=>sum+v*v,0)-1,perpendicular=[scaled[1]*unit[2]-scaled[2]*unit[1],scaled[2]*unit[0]-scaled[0]*unit[2],scaled[0]*unit[1]-scaled[1]*unit[0]],discriminant=1-perpendicular.reduce((sum,v)=>sum+v*v,0);
  if(discriminant<0)return [...ray];const root=Math.sqrt(discriminant),a=dot>=0?-dot-root:-dot+root,other=a!==0?c/a:-dot,near=Math.min(a,other),far=Math.max(a,other);distance=(near>=0?near:far)*radius/length;if(distance<0)return [...ray];
 }else{
  let near=-Infinity,far=Infinity;
  for(let i=0;i<3;i++){if(q[i]===0){if(local[i]<b.minimum[i]||local[i]>b.maximum[i])return [...ray];continue;}const a=(b.minimum[i]-local[i])/q[i],z=(b.maximum[i]-local[i])/q[i];near=Math.max(near,Math.min(a,z));far=Math.min(far,Math.max(a,z));}
  if(far<Math.max(near,0))return [...ray];distance=near>=0?near:far;
 }
 const hit=point.map((v,i)=>(v-probe.center[i])+(ray[i]/scale)*distance);
 return hit.every(Number.isFinite)&&Math.hypot(...hit)>1e-10?hit:[...ray];
}

// Mode0 is handled by the caller to preserve the legacy influence projection.
export const probeProjectionGLSL=`
vec3 hbProxyDirection(vec3 point,vec3 ray,vec3 center,vec4 lo,vec4 hi,vec4 x,vec4 y,vec4 z){
 if(lo.w>2.5)return ray;vec3 local=hbProbeLocalPoint(point,x,y,z),r=hbProbeLocalRay(ray,x,y,z);float scale=max(abs(r.x),max(abs(r.y),abs(r.z)));if(!(scale>0.0))return ray;r/=scale;float distance;
 if(lo.w>1.5){float size=length(r);vec3 unit=r/size,scaled=local/hi.x;float b=dot(scaled,unit),c=dot(scaled,scaled)-1.0,discriminant=1.0-dot(cross(scaled,unit),cross(scaled,unit));if(discriminant<0.0)return ray;float root=sqrt(discriminant),a=b>=0.0?-b-root:-b+root,other=a!=0.0?c/a:-b,near=min(a,other),far=max(a,other);distance=(near>=0.0?near:far)*hi.x/size;if(distance<0.0)return ray;}
 else{if((r.x==0.0&&(local.x<lo.x||local.x>hi.x))||(r.y==0.0&&(local.y<lo.y||local.y>hi.y))||(r.z==0.0&&(local.z<lo.z||local.z>hi.z)))return ray;vec3 safe=vec3(r.x==0.0?1.0:r.x,r.y==0.0?1.0:r.y,r.z==0.0?1.0:r.z),a=(lo.xyz-local)/safe,b=(hi.xyz-local)/safe,lower=min(a,b),upper=max(a,b);float near=max(r.x==0.0?-3.402823466e38:lower.x,max(r.y==0.0?-3.402823466e38:lower.y,r.z==0.0?-3.402823466e38:lower.z)),far=min(r.x==0.0?3.402823466e38:upper.x,min(r.y==0.0?3.402823466e38:upper.y,r.z==0.0?3.402823466e38:upper.z));if(far<max(near,0.0))return ray;distance=near>=0.0?near:far;}
 vec3 hit=(point-center)+(ray/scale)*distance;return dot(hit,hit)>1e-20?hit:ray;
}
`;
