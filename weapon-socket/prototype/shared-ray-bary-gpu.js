import {gpuFn} from './gpu-function-scope.js';
import {rayCoordinatesGPU} from './ray-coordinate-basis-gpu.js';
import * as T from 'three/tsl';

// Barycentric weights are affine invariant. Reuse the TLAS inverse directly
// instead of restoring three world-space vertices with three forward matrices.
export function sharedRayBary(raw,u){
 return gpuFn(([id,point])=>{
  const r=raw(u.geometryInfo.w.add(id.mul(5))).toVar(),result=T.vec3(0).toVar();
  const valid=r.x.greaterThanEqual(u.geometryRecords.z).and(r.x.add(2).lessThan(u.geometryRecords.y)).and(r.y.greaterThanEqual(3)).and(r.y.add(2).lessThan(u.geometryInfo.w)).and(r.x.equal(r.x.floor())).and(r.y.equal(r.y.floor()));
  T.If(valid,()=>{
   const pointer=r.x.sub(u.geometryRecords.x),a=raw(pointer).xyz.toVar(),e1=raw(pointer.add(1)).xyz.toVar(),e2=raw(pointer.add(2)).xyz.toVar(),m=[raw(r.y.sub(3)).toVar(),raw(r.y.sub(2)).toVar(),raw(r.y.sub(1)).toVar()],local=T.vec3(...m.map(row=>row.xyz.dot(point).add(row.w))),delta=local.sub(a),coordinates=rayCoordinatesGPU(e1,e2,delta).toVar(),x=coordinates.x,y=coordinates.y;
   result.assign(T.vec3(T.float(1).sub(x).sub(y),x,y));
  });return result;
 }).setLayout({name:'hbRayBary',type:'vec3',inputs:[{name:'id',type:'float'},{name:'point',type:'vec3'}]});
}
