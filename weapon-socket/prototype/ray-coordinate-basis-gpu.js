import * as T from 'three/tsl';
import {gpuFn} from './gpu-function-scope.js';
export const rayUnitGPU=gpuFn(([v])=>{const a=v.abs(),scale=T.max(T.max(a.x,a.y),a.z),result=T.vec3(0).toVar();T.If(scale.greaterThan(0),()=>result.assign(v.div(scale).normalize()));return result;}).setLayout({name:'hbRayUnit',type:'vec3',inputs:[{name:'v',type:'vec3'}]});
export const rayFrameNormalGPU=gpuFn(([a,b])=>rayUnitGPU(rayUnitGPU(a).cross(rayUnitGPU(b)))).setLayout({name:'hbRayFrameNormal',type:'vec3',inputs:[{name:'a',type:'vec3'},{name:'b',type:'vec3'}]});
export const rayFrameValidGPU=gpuFn(([a,b])=>{const n=rayUnitGPU(a).cross(rayUnitGPU(b)).toVar();return n.dot(n).greaterThan(1e-24);}).setLayout({name:'hbRayFrameValid',type:'bool',inputs:[{name:'a',type:'vec3'},{name:'b',type:'vec3'}]});
export const rayDualCoordinatesGPU=gpuFn(([e1,e2,delta])=>{
 const s1=e1.abs().toVar(),s2=e2.abs().toVar(),u=T.max(T.max(s1.x,s1.y),s1.z).toVar(),v=T.max(T.max(s2.x,s2.y),s2.z).toVar(),result=T.vec2(0).toVar();
 T.If(u.greaterThan(0).and(v.greaterThan(0)),()=>{const x=e1.div(u).toVar(),y=e2.div(v).toVar(),n=x.cross(y).toVar(),det=n.dot(n).toVar();T.If(det.greaterThan(1e-30),()=>{result.assign(T.vec2(delta.div(u).dot(y.cross(n)),delta.div(v).dot(n.cross(x))).div(det));});});return result;
}).setLayout({name:'hbRayDualCoordinates',type:'vec2',inputs:[{name:'e1',type:'vec3'},{name:'e2',type:'vec3'},{name:'delta',type:'vec3'}]});
export const rayCoordinatesGPU=gpuFn(([e1,e2,delta])=>{
 const a=e1.dot(e1).toVar(),b=e1.dot(e2).toVar(),c=e2.dot(e2).toVar(),den=a.mul(c).sub(b.mul(b)).toVar(),result=T.vec2(0).toVar();
 T.If(den.greaterThan(1e-18).and(den.greaterThan(a.mul(c).mul(1e-5))),()=>{
  const d=delta.dot(e1),e=delta.dot(e2);result.assign(T.vec2(c.mul(d).sub(b.mul(e)),a.mul(e).sub(b.mul(d))).div(den));
 }).Else(()=>{
  result.assign(rayDualCoordinatesGPU(e1,e2,delta));
 });return result;
}).setLayout({name:'hbRayCoordinates',type:'vec2',inputs:[{name:'e1',type:'vec3'},{name:'e2',type:'vec3'},{name:'delta',type:'vec3'}]});
export const rayTriangleGPU=gpuFn(([e1,e2,delta,direction])=>{
 const result=T.vec3(-1).toVar(),p=direction.cross(e2),det=e1.dot(p);
 T.If(det.abs().greaterThan(1e-7),()=>{const q=delta.cross(e1);result.assign(T.vec3(delta.dot(p),direction.dot(q),e2.dot(q)).div(det));}).Else(()=>{
  const normal=rayFrameNormalGPU(e1,e2),facing=normal.dot(rayUnitGPU(direction));
  T.If(normal.dot(normal).greaterThan(.5).and(facing.abs().greaterThan(1e-7)),()=>{const distance=delta.dot(normal).negate().div(direction.dot(normal)),weights=rayCoordinatesGPU(e1,e2,delta).add(rayCoordinatesGPU(e1,e2,direction.mul(distance)));result.assign(T.vec3(weights,distance));});
 });return result;
}).setLayout({name:'hbRayTriangleCoordinates',type:'vec3',inputs:[{name:'e1',type:'vec3'},{name:'e2',type:'vec3'},{name:'delta',type:'vec3'},{name:'direction',type:'vec3'}]});
export const rayBoxIntervalGPU=gpuFn(([origin,direction,lower,upper,distance])=>{
 const near=T.float(0).toVar(),far=distance.toVar();
 for(const axis of ['x','y','z'])T.If(direction[axis].abs().lessThan(1e-30),()=>{T.If(origin[axis].lessThan(lower[axis]).or(origin[axis].greaterThan(upper[axis])),()=>{far.assign(-1);});}).Else(()=>{const a=lower[axis].sub(origin[axis]).div(direction[axis]),b=upper[axis].sub(origin[axis]).div(direction[axis]);near.assign(T.max(near,T.min(a,b)));far.assign(T.min(far,T.max(a,b)));});
 return T.vec2(near,far);
}).setLayout({name:'hbRayBoxInterval',type:'vec2',inputs:[{name:'origin',type:'vec3'},{name:'direction',type:'vec3'},{name:'lower',type:'vec3'},{name:'upper',type:'vec3'},{name:'distance',type:'float'}]});
