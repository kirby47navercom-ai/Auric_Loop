import {rayFrameNormalGPU,rayCoordinatesGPU} from './ray-coordinate-basis-gpu.js';
import {rayBarycentricOffsetNode} from './ray-barycentric-offset.js';
import * as T from 'three/tsl';
import {gpuFn} from './gpu-function-scope.js';
import {rayMaterialNode} from './ray-material-gpu.js';

// Share the IR/compiler/samplers, replacing only committed geometry inputs.
export function previousRayGPU(transport,u,{reuseTextures=true,fields=[3]}={}){
 const {load,ray}=transport,record=(id,slot)=>{
  const at=u.pathFilter.w.add(id.mul(3));
  if(slot<3)return T.vec4(load(at.add(slot)).xyz,0);
  if(slot===3)return T.vec4(rayFrameNormalGPU(load(at.add(1)).xyz,load(at.add(2)).xyz),0);
  return ray.record(id,slot);
 };
 const geometric=id=>record(id,3).xyz;
 const bary=gpuFn(([id,point])=>{const origin=record(id,0).xyz,e1=record(id,1).xyz,e2=record(id,2).xyz,delta=point.sub(origin),coordinates=rayCoordinatesGPU(e1,e2,delta).toVar();return T.vec3(T.float(1).sub(coordinates.x).sub(coordinates.y),coordinates);}).setLayout({name:'hbPreviousBary',type:'vec3',inputs:[{name:'id',type:'float'},{name:'point',type:'vec3'}]});
 const smoothOffset=gpuFn(([id,point,offset])=>{
  const face=geometric(id).toVar(),result=face.toVar(),at=ray.attributes(id).toVar();
  T.If(at.greaterThan(0),()=>{
   const encoded=load(at.add(3)).w.toVar(),current=encoded.lessThan(-3.5).select(encoded.negate(),encoded.equal(-3).select(-1,encoded)).toVar(),old=load(at.add(4)).w.toVar(),weights=rayBarycentricOffsetNode(T,record,id,point,offset).toVar(),normal=T.vec3(0).toVar(),valid=T.bool(true).toVar();
   T.If(current.equal(-2).or(old.lessThanEqual(0)),()=>{result.assign(T.vec3(0));}).Else(()=>{
    T.If(current.lessThan(-.5),()=>{normal.assign(load(old).xyz.mul(weights.x).add(load(old.add(1)).xyz.mul(weights.y)).add(load(old.add(2)).xyz.mul(weights.z)));}).ElseIf(current.greaterThan(0),()=>{
     const x=load(current).xyz.toVar(),y=load(current.add(1)).xyz.toVar(),z=load(current.add(2)).xyz.toVar(),a=load(old).xyz.toVar(),b=load(old.add(1)).xyz.toVar(),c=load(old.add(2)).xyz.toVar();
     T.If(x.dot(y.cross(z)).mul(a.dot(b.cross(c))).abs().greaterThanEqual(1e-20),()=>{T.Loop({start:0,end:3,type:'int',name:'priorVertex'},({priorVertex})=>{const now=load(at.add(2).add(T.float(priorVertex))).xyz.toVar(),local=x.mul(now.x).add(y.mul(now.y)).add(z.mul(now.z)).toVar(),v=a.mul(local.x).add(b.mul(local.y)).add(c.mul(local.z)).toVar();T.If(v.dot(v).greaterThanEqual(1e-12),()=>{normal.addAssign(v.normalize().mul(weights.element(priorVertex)));}).Else(()=>{valid.assign(false);});});}).Else(()=>{valid.assign(false);});
    });
    T.If(valid.not(),()=>{result.assign(T.vec3(0));}).ElseIf(normal.dot(normal).greaterThanEqual(1e-12),()=>{normal.assign(normal.normalize());result.assign(normal.dot(face).lessThan(0).select(normal.negate(),normal));});
   });
  });return result;
 }).setLayout({name:'hbPreviousSmoothNormalOffset',type:'vec3',inputs:[{name:'id',type:'float'},{name:'point',type:'vec3'},{name:'offset',type:'vec3'}]});
 const smooth=(id,point)=>smoothOffset(id,point,T.vec3(0));
 // Flags belong to material defaults; do not reconstruct current vertices for an old normal.
 const baseField=(id,context,field)=>field===0?T.vec4(ray.record(id,0).w,ray.record(id,1).w,ray.record(id,2).w,ray.record(id,3).w):ray.record(id,field===1?4:5);
 const previous=rayMaterialNode(load,u,ray.programs,fields,load,baseField,ray.normalEnabled!==false,ray.coatNormalEnabled!==false,record,bary,smooth,reuseTextures?ray.textureLibrary:null,smoothOffset);
 return {...previous,record:(id,slot)=>slot<4?T.vec4(record(id,slot).xyz,ray.record(id,slot).w):record(id,slot)};
}
