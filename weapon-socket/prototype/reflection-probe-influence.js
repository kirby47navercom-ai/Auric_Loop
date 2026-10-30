import {probeLocalPoint,probeVolumeWeight} from './reflection-probe-volume.js';

export const probeInfluenceFields=Object.freeze(['blendPositive','blendNegative','fadePositive','fadeNegative','normalPositive','normalNegative']);
const fixed=(x,y,z,w=0)=>Object.freeze([x,y,z,w]);
const defaults=Object.freeze({blendPositive:fixed(0,0,0),blendNegative:fixed(0,0,0),fadePositive:fixed(1,1,1),fadeNegative:fixed(1,1,1),normalPositive:fixed(0,0,0),normalNegative:fixed(0,0,0)});
export function probeInfluenceSettings(p){
 const advanced=p.volumeShape!=='sphere'&&p.advancedBlend===true,normal=p.blendNormalDistance||0;
 if(!advanced&&!(normal>0))return defaults;
 const np=advanced?p.blendNormalPositive:[normal,normal,normal],nn=advanced?p.blendNormalNegative:[normal,normal,normal];
 const enabled=np.some(v=>v>0)||nn.some(v=>v>0);
 if(!advanced&&!enabled)return defaults;
 return {blendPositive:[...(advanced?p.blendPositive:[p.blendDistance,p.blendDistance,p.blendDistance]),(advanced?1:0)+(enabled?2:0)],blendNegative:[...(advanced?p.blendNegative:[p.blendDistance,p.blendDistance,p.blendDistance]),0],fadePositive:[...(advanced?p.fadePositive:[1,1,1]),0],fadeNegative:[...(advanced?p.fadeNegative:[1,1,1]),0],normalPositive:[...np,0],normalNegative:[...nn,0]};
}
const unit=v=>{const n=Math.hypot(...v);return n>0?v.map(x=>x/n):[0,0,0];},dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0),saturate=x=>Math.max(0,Math.min(1,x));
export function probeInfluenceWeight(probe,point,normal=[0,0,0],ray=[0,0,0]){
 const b=probe.localBox,p=probe.p,s=probeInfluenceSettings(p),mode=s.blendPositive[3],local=probeLocalPoint(b,point);
 let weight=probeVolumeWeight(b,point,p.blendDistance);if(mode===0)return weight;
 const negative=local.map((v,i)=>(v-b.minimum[i])*b.faceScale[i]),positive=local.map((v,i)=>(b.maximum[i]-v)*b.faceScale[i]);
 if(b.shape==='sphere'?Math.hypot(...local)>b.maximum[0]:negative.some((d,i)=>d<0||positive[i]<0))return 0;
 if(mode%2===1){
  weight=1;for(let i=0;i<3;i++)weight=Math.min(weight,s.blendPositive[i]>0?saturate(positive[i]/s.blendPositive[i]):1,s.blendNegative[i]>0?saturate(negative[i]/s.blendNegative[i]):1);
  const direction=unit(probeLocalPoint(b,ray,true).map((v,i)=>v*b.faceScale[i]));
  if(direction.some(v=>v!==0))weight*=saturate(direction.reduce((v,d,i)=>v+saturate((4*d-1)*s.fadePositive[i])+saturate((-4*d-1)*s.fadeNegative[i]),0));
 }
 if(mode>=2){
  const inner=b.shape==='sphere'?b.maximum[0]-Math.hypot(...local)>=s.normalPositive[0]:negative.every((d,i)=>d>=s.normalNegative[i]&&positive[i]>=s.normalPositive[i]);
  if(!inner){const outward=unit(point.map((v,i)=>v-probe.center[i])),n=unit(normal);if(n.some(v=>v!==0)&&outward.some(v=>v!==0))weight*=saturate((.6-dot(n,outward))/.4);}
 }
 return weight;
}

// Distances are measured to affine planes in world units. The angular face mask
// uses the local plane-normal coordinates of the sample ray, not its position.
export const probeInfluenceGLSL=`
float hbProbeInfluenceFade(vec3 local,vec3 lo,vec3 hi,vec3 scale,float blend,bool sphere,vec3 point,vec3 center,vec3 normal,vec3 ray,vec4 bp,vec4 bn,vec4 fp,vec4 fn,vec4 np,vec4 nn,vec4 x,vec4 y,vec4 z){
 float weight=sphere?hbProbeSphereFade(local,hi.x,blend):hbProbeVolumeFade(local,lo,hi,scale,blend);if(bp.w<0.5)return weight;
 vec3 negative=(local-lo)*scale,positive=(hi-local)*scale;if(sphere?length(local)>hi.x:min(min(negative.x,min(negative.y,negative.z)),min(positive.x,min(positive.y,positive.z)))<0.0)return 0.0;
 if(mod(bp.w,2.0)>0.5){
  vec3 a=positive/max(bp.xyz,vec3(1e-30)),b=negative/max(bn.xyz,vec3(1e-30));
  a=vec3(bp.x>0.0?a.x:1.0,bp.y>0.0?a.y:1.0,bp.z>0.0?a.z:1.0);b=vec3(bn.x>0.0?b.x:1.0,bn.y>0.0?b.y:1.0,bn.z>0.0?b.z:1.0);
  weight=clamp(min(min(a.x,min(a.y,a.z)),min(b.x,min(b.y,b.z))),0.0,1.0);
  vec3 d=hbProbeLocalRay(ray,x,y,z)*scale;float size=length(d);if(size>0.0){d/=size;vec3 mask=clamp((4.0*d-1.0)*fp.xyz,0.0,1.0)+clamp((-4.0*d-1.0)*fn.xyz,0.0,1.0);weight*=clamp(mask.x+mask.y+mask.z,0.0,1.0);}
 }
 if(bp.w>1.5){
  bool inner=sphere?hi.x-length(local)>=np.x:positive.x>=np.x&&positive.y>=np.y&&positive.z>=np.z&&negative.x>=nn.x&&negative.y>=nn.y&&negative.z>=nn.z;
  if(!inner){vec3 direction=point-center;float d=length(direction),n=length(normal);if(d>0.0&&n>0.0)weight*=clamp((0.6-dot(normal/n,direction/d))/0.4,0.0,1.0);}
 }
 return weight;
}
`;
