import {rayTriangleGPU} from './ray-coordinate-basis-gpu.js';
import * as T from 'three/tsl';import {gpuFn} from './gpu-function-scope.js';

export function previousGeometryGPU(transport,u,ray){
 const {load}=transport,available=()=>u.pathFilter.w.greaterThan(0).and(load(u.pathFilter.w.add(1)).w.greaterThan(0)).and(load(u.pathFilter.w.add(2)).w.greaterThan(0));
 const trace=gpuFn(([origin,direction,distance])=>{
  const pointer=load(u.pathFilter.w.add(1)).w,count=load(u.pathFilter.w.add(2)).w,node=T.float(0).toVar(),closest=distance.toVar(),id=T.float(-1).toVar(),result=T.vec4(distance,-1,0,0).toVar();
  T.If(available(),()=>{T.Loop({start:0,end:T.int(count).min(4096),type:'int',name:'priorWalk'},()=>{
   T.If(node.greaterThanEqual(count),()=>{T.Break();});const at=pointer.add(node.mul(3)),lower=load(at),upper=load(at.add(1)),ids=load(at.add(2)),near=T.float(0).toVar(),far=closest.toVar();
   for(const axis of ['x','y','z'])T.If(direction[axis].abs().lessThan(1e-30),()=>{T.If(origin[axis].lessThan(lower[axis]).or(origin[axis].greaterThan(upper[axis])),()=>{far.assign(-1);});}).Else(()=>{const a=lower[axis].sub(origin[axis]).div(direction[axis]),b=upper[axis].sub(origin[axis]).div(direction[axis]);near.assign(T.max(near,T.min(a,b)));far.assign(T.min(far,T.max(a,b)));});
   T.If(near.greaterThan(far),()=>{node.assign(lower.w);T.Continue();});
   T.Loop({start:0,end:T.int(upper.w).min(4),type:'int',name:'priorLeaf'},({priorLeaf:j})=>{
    const candidate=ids.element(j),at=u.pathFilter.w.add(candidate.mul(3)),a=load(at).xyz,e1=load(at.add(1)).xyz,e2=load(at.add(2)).xyz,coordinates=rayTriangleGPU(e1,e2,origin.sub(a),direction).toVar();
    T.If(coordinates.z.greaterThan(0),()=>{const x=coordinates.x,y=coordinates.y,t=coordinates.z;T.If(x.greaterThanEqual(0).and(y.greaterThanEqual(0)).and(x.add(y).lessThanEqual(1)).and(t.greaterThan(u.geometryLimits.y)).and(t.lessThan(closest)),()=>{const cutoff=ray.cutoff(candidate);T.If(cutoff.lessThanEqual(0).or(ray.field(candidate,origin.add(direction.mul(t)),direction.negate(),1,T.float(0),false,T.vec2(u.forward.w,1)).w.greaterThanEqual(cutoff)),()=>{closest.assign(t);id.assign(candidate);});});});
   });node.addAssign(1);
  });result.assign(T.vec4(closest,id,id.greaterThanEqual(0).select(1,0),node.greaterThanEqual(count).select(1,0)));});return result;
 }).setLayout({name:'hbPreviousGeometryTrace',type:'vec4',inputs:[{name:'origin',type:'vec3'},{name:'direction',type:'vec3'},{name:'distance',type:'float'}]});
 return {available,trace};
}
