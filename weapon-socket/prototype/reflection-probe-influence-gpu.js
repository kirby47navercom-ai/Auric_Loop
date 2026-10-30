import {Fn,If,vec3,vec4,float,cache} from 'three/tsl';

export function gpuProbeInfluenceNodes(u,volume,point,normal,ray,center,legacyFade){
 return cache(Fn(()=>{
  const result=legacyFade.toVar(),mode=u.blendPositive.w;
  If(mode.greaterThan(.5),()=>{
   const at=vec4(point,1),local=vec3(volume.localX.dot(at),volume.localY.dot(at),volume.localZ.dot(at)).toVar(),negative=local.sub(volume.minimum).mul(volume.faceScale).toVar(),positive=volume.maximum.sub(local).mul(volume.faceScale).toVar(),sphere=volume.sphere??float(0).greaterThan(.5);
   const inside=sphere.select(local.length().lessThanEqual(volume.maximum.x),negative.greaterThanEqual(0).all().and(positive.greaterThanEqual(0).all()));
   If(inside.not(),()=>{result.assign(0);}).Else(()=>{
    If(mode.mod(2).greaterThan(.5),()=>{
     const a=vec3(...['x','y','z'].map(k=>u.blendPositive[k].greaterThan(0).select(positive[k].div(u.blendPositive[k].max(1e-30)),float(1)))),b=vec3(...['x','y','z'].map(k=>u.blendNegative[k].greaterThan(0).select(negative[k].div(u.blendNegative[k].max(1e-30)),float(1))));
     result.assign(a.x.min(a.y).min(a.z).min(b.x).min(b.y).min(b.z).clamp(0,1));
     const d=vec3(volume.localX.xyz.dot(ray),volume.localY.xyz.dot(ray),volume.localZ.xyz.dot(ray)).mul(volume.faceScale).toVar(),size=d.length();
     If(size.greaterThan(0),()=>{d.divAssign(size);const mask=d.mul(4).sub(1).mul(u.fadePositive.xyz).clamp(0,1).add(d.mul(-4).sub(1).mul(u.fadeNegative.xyz).clamp(0,1));result.mulAssign(mask.x.add(mask.y).add(mask.z).clamp(0,1));});
    });
    If(mode.greaterThan(1.5),()=>{
     const inner=sphere.select(volume.maximum.x.sub(local.length()).greaterThanEqual(u.normalPositive.x),positive.greaterThanEqual(u.normalPositive.xyz).all().and(negative.greaterThanEqual(u.normalNegative.xyz).all()));
     If(inner.not(),()=>{const outward=point.sub(center).toVar(),d=outward.length(),n=normal.length();If(d.greaterThan(0).and(n.greaterThan(0)),()=>{result.mulAssign(float(.6).sub(normal.div(n).dot(outward.div(d))).div(.4).clamp(0,1));});});
    });
   });
  });
  return result;
 })());
}
