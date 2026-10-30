import {gpuFn} from './gpu-function-scope.js';
import * as T from 'three/tsl';
export function pathMicrofacetNode(smith,fresnel){
 const frame=n=>n.cross(n.z.abs().lessThan(.9).select(T.vec3(0,0,1),T.vec3(0,1,0))).normalize();
 const visible=gpuFn(([n,view,tangent,axes,angle,radius])=>{
  const bitangent=n.cross(tangent),v=T.vec3(view.dot(tangent).mul(axes.x),view.dot(bitangent).mul(axes.y),view.dot(n).max(.000001)).normalize(),x=T.vec3(1,0,0).toVar();T.If(v.xy.dot(v.xy).greaterThan(.000001),()=>{x.assign(T.vec3(v.y.negate(),v.x,0).normalize());});
  const y=v.cross(x),a=radius.sqrt().mul(angle.cos()),blend=v.z.add(1).mul(.5),b=T.float(1).sub(blend).mul(T.float(1).sub(a.mul(a)).max(0).sqrt()).add(blend.mul(radius.sqrt()).mul(angle.sin())),h=x.mul(a).add(y.mul(b)).add(v.mul(T.float(1).sub(a.mul(a)).sub(b.mul(b)).max(0).sqrt()));
  return tangent.mul(h.x.mul(axes.x)).add(bitangent.mul(h.y.mul(axes.y))).add(n.mul(h.z.max(.000001))).normalize();
 }).setLayout({name:'hbPathVisibleNormal',type:'vec3',inputs:[{name:'n',type:'vec3'},{name:'view',type:'vec3'},{name:'tangent',type:'vec3'},{name:'axes',type:'vec2'},{name:'angle',type:'float'},{name:'radius',type:'float'}]});
 const dielectric=gpuFn(([n,view,light,rough,ratio,radianceScale])=>{
  const result=T.vec4(0).toVar(),nv=n.dot(view),nl=n.dot(light),reflection=nl.greaterThan(0),sum=reflection.select(view.add(light),view.add(light.div(ratio.max(.000001))));
  T.If(nv.greaterThan(0).and(nl.abs().greaterThan(.000001)).and(sum.dot(sum).greaterThan(.00000001)),()=>{
   const original=sum.normalize(),h=original.dot(n).lessThan(0).select(original.negate(),original),vh=view.dot(h),lh=light.dot(h);
   T.If(vh.greaterThan(0).and(reflection.select(lh.greaterThan(0),lh.lessThan(0))),()=>{
    const a2=rough.pow(4),nh=n.dot(h).max(0),den=nh.mul(nh).mul(a2.sub(1)).add(1),d=a2.div(den.mul(den).mul(Math.PI).max(.000000000001)),gv=smith(nv,a2),gl=smith(nl.abs(),a2),g=T.float(1).div(T.float(1).div(gv.max(.000001)).add(T.float(1).div(gl.max(.000001))).sub(1).max(.000001)),f=fresnel(vh,ratio),normalPDF=d.mul(gv).mul(vh).div(nv.max(.000001));
    T.If(reflection,()=>{const value=f.mul(d).mul(g).div(nv.mul(nl).mul(4).max(.000001)),pdf=f.mul(normalPDF).div(vh.mul(4).max(.000001));result.assign(T.vec4(T.vec3(value),pdf));}).Else(()=>{const jac=lh.add(vh.mul(ratio)),j2=jac.mul(jac);T.If(j2.greaterThan(.000000000001),()=>{const value=T.float(1).sub(f).mul(d).mul(g).mul(lh.mul(vh).abs()).mul(radianceScale).div(nv.mul(nl).abs().max(.000001).mul(j2)),pdf=T.float(1).sub(f).mul(normalPDF).mul(lh.abs()).div(j2);result.assign(T.vec4(T.vec3(value),pdf));});});
   });
  });return result;
 }).setLayout({name:'hbPathDielectric',type:'vec4',inputs:[{name:'n',type:'vec3'},{name:'view',type:'vec3'},{name:'light',type:'vec3'},{name:'rough',type:'float'},{name:'ratio',type:'float'},{name:'radianceScale',type:'float'}]});
 return {frame,visible,dielectric};
}
