import {Fn,If,vec3,vec4,float,bool,cache} from 'three/tsl';

export function gpuProbeProjectionNodes(u,point,ray,center,inherited){return cache(Fn(()=>{
 const result=inherited.toVar(),mode=u.minimum.w;
 If(mode.greaterThan(.5),()=>{
  result.assign(ray);
  If(mode.lessThan(2.5),()=>{
   const at=vec4(point,1),local=vec3(u.localX.dot(at),u.localY.dot(at),u.localZ.dot(at)).toVar(),r=vec3(u.localX.xyz.dot(ray),u.localY.xyz.dot(ray),u.localZ.xyz.dot(ray)).toVar(),scale=r.abs().x.max(r.abs().y).max(r.abs().z).toVar();
   If(scale.greaterThan(0),()=>{
    r.divAssign(scale);const distance=float(0).toVar(),valid=bool(false).toVar();
    If(mode.greaterThan(1.5),()=>{
     const size=r.length().toVar(),unit=r.div(size),scaled=local.div(u.maximum.x).toVar(),b=scaled.dot(unit).toVar(),c=scaled.dot(scaled).sub(1).toVar(),perpendicular=scaled.cross(unit).toVar(),discriminant=float(1).sub(perpendicular.dot(perpendicular)).toVar();
     If(discriminant.greaterThanEqual(0),()=>{const root=discriminant.sqrt(),a=b.greaterThanEqual(0).select(b.negate().sub(root),b.negate().add(root)).toVar(),other=a.notEqual(0).select(c.div(a.notEqual(0).select(a,float(1))),b.negate()),near=a.min(other),far=a.max(other);distance.assign(near.greaterThanEqual(0).select(near,far).mul(u.maximum.x).div(size));valid.assign(distance.greaterThanEqual(0));});
    }).Else(()=>{
     const near=float(-3.402823466e38).toVar(),far=float(3.402823466e38).toVar();valid.assign(true);
     for(const k of ['x','y','z']){const outside=local[k].lessThan(u.minimum[k]).or(local[k].greaterThan(u.maximum[k]));If(r[k].equal(0),()=>{If(outside,()=>{valid.assign(false);});}).Else(()=>{const a=u.minimum[k].sub(local[k]).div(r[k]),b=u.maximum[k].sub(local[k]).div(r[k]);near.assign(near.max(a.min(b)));far.assign(far.min(a.max(b)));});}
     valid.assign(valid.and(far.greaterThanEqual(near.max(0))));distance.assign(near.greaterThanEqual(0).select(near,far));
    });
    If(valid,()=>{const hit=point.sub(center).add(ray.div(scale).mul(distance)).toVar();If(hit.dot(hit).greaterThan(1e-20),()=>{result.assign(hit);});});
   });
  });
 });return result;
})());}
