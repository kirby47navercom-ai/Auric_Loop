import {gpuFn} from './gpu-function-scope.js';
import * as T from 'three/tsl';
export function sharedRayLoad(scene,u,sharedMode=false){
 const raw=gpuFn(([index])=>T.textureLoad(scene,T.ivec2(index.mod(u.geometryInfo.x),index.div(u.geometryInfo.x).floor())).setUpdateMatrix(false)).setLayout({name:'hbSceneRawLoad',type:'vec4',inputs:[{name:'index',type:'float'}]});
 if(!sharedMode)return {raw,load:raw,vertex:raw,baseField:null};
 const baseFieldNode=gpuFn(([id,field])=>{const value=T.vec4(0).toVar();{const at=u.geometryInfo.w.add(id.mul(5)),a=raw(at),b=raw(at.add(1)),c=raw(at.add(2)),d=raw(at.add(3));value.assign(field.lessThan(.5).select(T.vec4(a.z,a.w,b.w,c.w),field.lessThan(1.5).select(T.vec4(c.xyz,d.w),T.vec4(d.xyz,raw(at.add(4)).x))));}return value;}).setLayout({name:'hbSceneBaseField',type:'vec4',inputs:[{name:'id',type:'float'},{name:'field',type:'float'}]});
 const baseField=(id,field)=>baseFieldNode(id,field);
 const vertex=gpuFn(([index])=>{const count=u.geometryRecords.x,start=u.geometryInfo.w,result=T.vec4(0).toVar();{const id=index.sub(start).div(6).floor(),slot=index.sub(start).sub(id.mul(6)),at=start.add(id.mul(5)),r=raw(at);
  T.If(slot.lessThan(3),()=>{const valid=r.x.greaterThanEqual(u.geometryRecords.z).and(r.x.add(2).lessThan(u.geometryRecords.y)).and(r.y.greaterThanEqual(0)).and(r.y.add(2).lessThan(start)).and(r.x.equal(r.x.floor())).and(r.y.equal(r.y.floor()));T.If(valid,()=>{const v=raw(r.x.add(slot).sub(count)).xyz,x=raw(r.y),y=raw(r.y.add(1)),z=raw(r.y.add(2)),translate=slot.lessThan(.5);result.assign(T.vec4(x.xyz.dot(v).add(translate.select(x.w,0)),y.xyz.dot(v).add(translate.select(y.w,0)),z.xyz.dot(v).add(translate.select(z.w,0)),translate.select(r.z,slot.lessThan(1.5).select(r.w,raw(at.add(1)).w))));});}).Else(()=>{result.assign(slot.lessThan(3.5).select(T.vec4(raw(at.add(1)).xyz,raw(at.add(2)).w),slot.lessThan(4.5).select(T.vec4(raw(at.add(2)).xyz,raw(at.add(3)).w),T.vec4(raw(at.add(3)).xyz,raw(at.add(4)).x))));});
 }return result;}).setLayout({name:'hbSceneVertexLoad',type:'vec4',inputs:[{name:'index',type:'float'}]});// Prefix reads use raw; all remaining logical scalar/attribute reads are suffix.
 const load=gpuFn(([index])=>raw(index.sub(u.geometryRecords.x))).setLayout({name:'hbSceneLoad',type:'vec4',inputs:[{name:'index',type:'float'}]});return {load,vertex,raw,baseField};
}
