import {gpuProbeInfluenceNodes} from './reflection-probe-influence-gpu.js';
import {probeInfluenceFields} from './reflection-probe-influence.js';
import {probeAtlasRecordTexels} from './reflection-probe-record.js';
import {Fn,If,Loop,Break,cache,vec2,vec3,int,uint,uvec4,float,floatBitsToUint,ivec2} from 'three/tsl';
import {gpuProbeVolumeNodes} from './reflection-probe-volume-gpu.js';
export function gpuProbeSpatialChoice(table,width,count,point,normal=null,ray=null){
 const load=(index,field)=>{const at=int(index).mul(probeAtlasRecordTexels).add(field);return table.load(ivec2(at.mod(width),at.div(width)));};
 const unpack=(a,b)=>int(a).add(int(b).mul(65536)),tree=(i,field)=>load(count,int(i).mul(3).add(field));
 return cache(Fn(()=>{const first=int(-1).toVar(),second=int(-1).toVar(),weights=vec2(0).toVar(),firstFlags=float(0).toVar(),at=point.toVar(),cursor=int(0).toVar(),total=count.mul(2).sub(1);
 Loop({start:int(0),end:total,type:'int',condition:'<'},()=>{If(cursor.greaterThanEqual(total),()=>{Break();});const lower=tree(cursor,0).toVar(),upper=tree(cursor,1).toVar(),meta=tree(cursor,2).toVar(),skip=unpack(lower.w,upper.w),rank=unpack(meta.z,meta.w);
 If(at.lessThan(lower.xyz).any().or(at.greaterThan(upper.xyz).any()).or(second.greaterThanEqual(0).and(rank.greaterThanEqual(second))),()=>{cursor.assign(skip);}).Else(()=>{const leaf=unpack(meta.x,meta.y);If(leaf.greaterThan(0),()=>{const index=leaf.sub(1),lo=load(index,1).toVar(),hi=load(index,2).toVar(),scale=load(index,6).toVar(),volume={minimum:lo.xyz,maximum:hi.xyz,localX:load(index,3),localY:load(index,4),localZ:load(index,5),faceScale:scale.xyz,blend:lo.w,sphere:scale.w.mod(4).greaterThan(1.5)},box=gpuProbeVolumeNodes(volume,at,vec3(0,0,1),vec3(0)),weight=normal?gpuProbeInfluenceNodes(Object.fromEntries(probeInfluenceFields.map((k,j)=>[k,load(index,14+j)])),volume,at,normal,ray,load(index,0).xyz,box.fade):box.fade;If(weight.greaterThan(0),()=>{If(first.lessThan(0).or(index.lessThan(first)),()=>{second.assign(first);weights.y.assign(weights.x);first.assign(index);weights.x.assign(weight);firstFlags.assign(scale.w);}).ElseIf(second.lessThan(0).or(index.lessThan(second)),()=>{second.assign(index);weights.y.assign(weight);});});});cursor.addAssign(1);});});
 If(firstFlags.greaterThanEqual(4),()=>weights.y.mulAssign(float(1).sub(weights.x)));return uvec4(uint(first.add(1)),uint(second.add(1)),floatBitsToUint(weights.x),floatBitsToUint(weights.y));})());
}
