import {gpuFn} from './gpu-function-scope.js';import * as T from 'three/tsl';
// Reuse the committed triangle edges and UVs; no additional image or vertex history.
export function tangentGuideGPU(transport,u){const load=transport.load,ray=transport.ray;return gpuFn(([id,normal,now,prior])=>{
 const result=T.vec3(0).toVar(),attributes=ray.attributes(id).toVar(),old=u.pathFilter.w.add(id.mul(3)).toVar(),uv=load(attributes).toVar(),uv2=load(attributes.add(1)).xy.toVar(),du=uv.zw.sub(uv.xy).toVar(),dv=uv2.sub(uv.xy).toVar(),det=du.x.mul(dv.y).sub(du.y.mul(dv.x)).toVar();
 T.If(det.abs().lessThan(1e-7),()=>{result.assign(prior.mul(now.dot(normal).lessThan(0).select(-1,1)));}).Else(()=>{
  const e1=ray.record(id,1).xyz.toVar(),e2=ray.record(id,2).xyz.toVar(),a=load(old.add(1)).xyz.toVar(),b=load(old.add(2)).xyz.toVar(),t=e1.mul(dv.y).sub(e2.mul(du.y)).div(det).toVar(),bt=e2.mul(du.x).sub(e1.mul(dv.x)).div(det).toVar(),pt=a.mul(dv.y).sub(b.mul(du.y)).div(det).toVar(),pb=b.mul(du.x).sub(a.mul(dv.x)).div(det).toVar();t.subAssign(now.mul(now.dot(t)));pt.subAssign(prior.mul(prior.dot(pt)));
  T.If(t.length().greaterThan(1e-10).and(pt.length().greaterThan(1e-10)).and(a.cross(b).length().greaterThan(1e-10)),()=>{t.assign(t.normalize());pt.assign(pt.normalize());bt.assign(now.cross(t).normalize().mul(now.cross(t).dot(bt).lessThan(0).select(-1,1)));pb.assign(prior.cross(pt).normalize().mul(prior.cross(pt).dot(pb).lessThan(0).select(-1,1)));const mapped=pt.mul(normal.dot(t)).add(pb.mul(normal.dot(bt))).add(prior.mul(normal.dot(now))).toVar();T.If(mapped.length().greaterThan(1e-10),()=>{result.assign(mapped.normalize().mul(mapped.dot(a.cross(b)).lessThan(0).select(-1,1)));});});
 });return result;
}).setLayout({name:'hbPathTangentNormal',type:'vec3',inputs:[{name:'id',type:'float'},{name:'normal',type:'vec3'},{name:'now',type:'vec3'},{name:'prior',type:'vec3'}]});}
export const tangentGuideGLSL=`
vec3 hbPathTangentNormal(float id,vec3 normal,vec3 now,vec3 prior){
 float attributes=hbRayAttributes(id),old=hbPathFilter.w+id*3.0,base=hbGeometryInfo.w+id*6.0;
 vec4 uv=hbGeometryLoad(attributes);vec2 uv2=hbGeometryLoad(attributes+1.0).xy,du=uv.zw-uv.xy,dv=uv2-uv.xy;
 float determinant=du.x*dv.y-du.y*dv.x;if(abs(determinant)<1e-7)return prior*(dot(now,normal)<0.0?-1.0:1.0);
 vec3 e1=hbGeometryRecord1(id).xyz,e2=hbGeometryRecord2(id).xyz,a=hbGeometryLoad(old+1.0).xyz,b=hbGeometryLoad(old+2.0).xyz;
 vec3 t=(e1*dv.y-e2*du.y)/determinant,bt=(-e1*dv.x+e2*du.x)/determinant,pt=(a*dv.y-b*du.y)/determinant,pb=(-a*dv.x+b*du.x)/determinant;
 t-=now*dot(now,t);pt-=prior*dot(prior,pt);if(length(t)<1e-10||length(pt)<1e-10||length(cross(a,b))<1e-10)return vec3(0,0,0);
 t=normalize(t);pt=normalize(pt);bt=normalize(cross(now,t))*(dot(cross(now,t),bt)<0.0?-1.0:1.0);pb=normalize(cross(prior,pt))*(dot(cross(prior,pt),pb)<0.0?-1.0:1.0);
 vec3 mapped=pt*dot(normal,t)+pb*dot(normal,bt)+prior*dot(normal,now);if(length(mapped)<1e-10)return vec3(0,0,0);mapped=normalize(mapped);return dot(mapped,cross(a,b))<0.0?-mapped:mapped;
}
`;
