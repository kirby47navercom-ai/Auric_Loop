import {vec3,vec4,float,Fn,If,cache} from 'three/tsl';

// The ray parameter is unchanged by the affine transform. Intersect locally,
// then use that same distance on the world ray to address the captured cubemap.
export function gpuProbeVolumeNodes(u,point,ray,center){
 const p=vec4(point,1),local=vec3(u.localX.dot(p),u.localY.dot(p),u.localZ.dot(p)),direction=vec3(u.localX.xyz.dot(ray),u.localY.xyz.dot(ray),u.localZ.xyz.dot(ray)),edge=local.sub(u.minimum).min(u.maximum.sub(local)).mul(u.faceScale),distance=edge.x.min(edge.y).min(edge.z),outside=distance.lessThan(0),fade=outside.select(float(0),u.blend.greaterThan(0).select(distance.div(u.blend.greaterThan(0).select(u.blend,float(1))).clamp(0,1),float(1)));
 const exits=['x','y','z'].map(k=>{const r=direction[k],zero=r.equal(0),bound=r.greaterThan(0).select(u.maximum[k],u.minimum[k]);return zero.select(float(3.402823466e38),bound.sub(local[k]).div(zero.select(float(1),r)));}),hit=point.add(ray.mul(exits[0].min(exits[1]).min(exits[2]))).sub(center),projected=outside.select(ray,ray.x.notEqual(0).or(ray.y.notEqual(0)).or(ray.z.notEqual(0)).select(hit.dot(hit).greaterThan(1e-20).select(hit,ray),ray));const isSphere=u.sphere??float(0).greaterThan(.5),sphereDistance=u.maximum.x.sub(local.length()),shape=cache(Fn(()=>{
 const result=vec4(projected,fade).toVar();If(isSphere,()=>{
  const inside=sphereDistance.greaterThanEqual(0),sphereFade=inside.select(u.blend.greaterThan(0).select(sphereDistance.div(u.blend.greaterThan(0).select(u.blend,float(1))).clamp(0,1),float(1)),float(0));result.w.assign(sphereFade);result.xyz.assign(ray);
  const scale=direction.abs().x.max(direction.abs().y).max(direction.abs().z);If(inside.and(scale.greaterThan(0)),()=>{
   const q=direction.div(scale).toVar(),size=q.length().toVar(),unit=q.div(size),scaled=local.div(u.maximum.x).toVar(),b=scaled.dot(unit).toVar(),c=scaled.dot(scaled).sub(1).min(0).toVar(),root=b.mul(b).sub(c).max(0).sqrt().toVar(),sum=b.add(root),exit=b.greaterThan(0).select(c.negate().div(sum.greaterThan(0).select(sum,float(1))),root.sub(b)),hit=point.sub(center).add(ray.div(scale).mul(exit.mul(u.maximum.x).div(size))).toVar();If(hit.dot(hit).greaterThan(1e-20),()=>{result.xyz.assign(hit);});
  });
 });return result;
})());return {local,direction,distance:isSphere.select(sphereDistance,distance),fade:shape.w,projected:shape.xyz};
}
