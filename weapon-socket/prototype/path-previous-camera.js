import * as T from 'three/tsl';
import {gpuFn} from './gpu-function-scope.js';

// Reconstruct the committed camera from existing VP planes. No additional
// uniform, image history or CPU/GPU readback is needed. Projection changes reset history.
export const previousCameraGLSL=`
vec4 hbPathPriorClip(vec4 p){return hbPreviousVP*p;}
vec4 hbPathPriorOrthoOrigin(vec3 point,vec3 view){vec4 axis=hbPathPriorClip(vec4(view,0)),clip=hbPathPriorClip(vec4(point,1));if(abs(axis.z)<1e-20)return vec4(0,0,0,0);return vec4(point+view*((hbCoordinates.y*clip.w-clip.z)/axis.z),1);}
vec4 hbPathPriorCamera(){
 vec4 x=hbPathPriorClip(vec4(1,0,0,0)),y=hbPathPriorClip(vec4(0,1,0,0)),z=hbPathPriorClip(vec4(0,0,1,0)),w=hbPathPriorClip(vec4(0,0,0,1));
 vec3 a=vec3(x.x,y.x,z.x),b=vec3(x.y,y.y,z.y),c=vec3(x.w,y.w,z.w);
 if(hbEye.w>.5){vec3 direction=vec3(x.z,y.z,z.z);return length(direction)>1e-10?vec4(-normalize(direction),1):vec4(0,0,0,0);}
 float determinant=dot(a,cross(b,c));if(abs(determinant)<1e-20)return vec4(0,0,0,0);
 return vec4((-w.x*cross(b,c)-w.y*cross(c,a)-w.w*cross(a,b))/determinant,1);
}
vec2 hbPathPriorCone(vec3 point,vec4 camera){
 vec4 x=hbPathPriorClip(vec4(1,0,0,0)),y=hbPathPriorClip(vec4(0,1,0,0)),z=hbPathPriorClip(vec4(0,0,1,0));vec3 a=vec3(x.x,y.x,z.x),b=vec3(x.y,y.y,z.y),c=vec3(x.w,y.w,z.w);
 if(hbEye.w>.5){c=-camera.xyz;float det=dot(a,cross(b,c));if(abs(det)<1e-20)return vec2(0,0);return vec2(max(length(cross(b,c)*(2.0/hbScreenSize.x/det)),length(cross(c,a)*(hbCoordinates.z/hbScreenSize.y/det))),0);}
 vec4 clip=hbPathPriorClip(vec4(point,1));vec2 ndc=clip.xy/clip.w;vec3 d=normalize(point-camera.xyz),dx=normalize(cross(a-(ndc.x+2.0/hbScreenSize.x)*c,b-ndc.y*c)),dy=normalize(cross(a-ndc.x*c,b-(ndc.y+hbCoordinates.z/hbScreenSize.y)*c));dx*=dot(dx,d)<0.0?-1.0:1.0;dy*=dot(dy,d)<0.0?-1.0:1.0;return vec2(0,max(length(dx-d),length(dy-d)));
}
`;
export function previousCameraGPU(u){return gpuFn(()=>{
 const x=u.previousVP.mul(T.vec4(1,0,0,0)).toVar(),y=u.previousVP.mul(T.vec4(0,1,0,0)).toVar(),z=u.previousVP.mul(T.vec4(0,0,1,0)).toVar(),w=u.previousVP.mul(T.vec4(0,0,0,1)).toVar(),a=T.vec3(x.x,y.x,z.x).toVar(),b=T.vec3(x.y,y.y,z.y).toVar(),c=T.vec3(x.w,y.w,z.w).toVar(),result=T.vec4(0).toVar();
 T.If(u.eye.w.greaterThan(.5),()=>{const direction=T.vec3(x.z,y.z,z.z).toVar();T.If(direction.length().greaterThan(1e-10),()=>{result.assign(T.vec4(direction.normalize().negate(),1));});}).Else(()=>{const det=a.dot(b.cross(c)).toVar();T.If(det.abs().greaterThanEqual(1e-20),()=>{result.assign(T.vec4(b.cross(c).mul(w.x.negate()).sub(c.cross(a).mul(w.y)).sub(a.cross(b).mul(w.w)).div(det),1));});});return result;
 }).setLayout({name:'hbPathPriorCamera',type:'vec4',inputs:[]})();}

export function previousConeGPU(u,point,camera){return gpuFn(([point,camera])=>{
 const x=u.previousVP.mul(T.vec4(1,0,0,0)).toVar(),y=u.previousVP.mul(T.vec4(0,1,0,0)).toVar(),z=u.previousVP.mul(T.vec4(0,0,1,0)).toVar(),a=T.vec3(x.x,y.x,z.x).toVar(),b=T.vec3(x.y,y.y,z.y).toVar(),c=T.vec3(x.w,y.w,z.w).toVar(),result=T.vec2(0).toVar();
 T.If(u.eye.w.greaterThan(.5),()=>{c.assign(camera.xyz.negate());const det=a.dot(b.cross(c)).toVar();T.If(det.abs().greaterThanEqual(1e-20),()=>{result.assign(T.vec2(T.max(b.cross(c).mul(T.float(2).div(u.size.x).div(det)).length(),c.cross(a).mul(u.coordinates.z.div(u.size.y).div(det)).length()),0));});}).Else(()=>{
  const clip=u.previousVP.mul(T.vec4(point,1)).toVar(),ndc=clip.xy.div(clip.w).toVar(),d=point.sub(camera.xyz).normalize().toVar(),dx=a.sub(c.mul(ndc.x.add(T.float(2).div(u.size.x)))).cross(b.sub(c.mul(ndc.y))).normalize().toVar(),dy=a.sub(c.mul(ndc.x)).cross(b.sub(c.mul(ndc.y.add(u.coordinates.z.div(u.size.y))))).normalize().toVar();dx.mulAssign(dx.dot(d).lessThan(0).select(-1,1));dy.mulAssign(dy.dot(d).lessThan(0).select(-1,1));result.assign(T.vec2(0,T.max(dx.sub(d).length(),dy.sub(d).length())));
 });return result;
 }).setLayout({name:'hbPathPriorCone',type:'vec2',inputs:[{name:'point',type:'vec3'},{name:'camera',type:'vec4'}]})(point,camera);}

export function previousOrthoOriginGPU(u,point,view){return gpuFn(([point,view])=>{
 const axis=u.previousVP.mul(T.vec4(view,0)).toVar(),clip=u.previousVP.mul(T.vec4(point,1)).toVar(),result=T.vec4(0).toVar();T.If(axis.z.abs().greaterThanEqual(1e-20),()=>{result.assign(T.vec4(point.add(view.mul(u.coordinates.y.mul(clip.w).sub(clip.z).div(axis.z))),1));});return result;
 }).setLayout({name:'hbPathPriorOrthoOrigin',type:'vec4',inputs:[{name:'point',type:'vec3'},{name:'view',type:'vec3'}]})(point,view);}
