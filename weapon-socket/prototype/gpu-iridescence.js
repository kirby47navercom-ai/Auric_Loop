import * as T from 'three/tsl';

// Thin-film interference follows Three.js (MIT). Explicit XYZ->RGB dot rows
// avoid the different row/column conventions of TSL mat3 and GLSL mat3.
const sensitivity=(distance,shift)=>{
 const phase=distance.mul(2*Math.PI*1e-9).toVar(),variance=T.vec3(4.3278e9,9.3046e9,6.6121e9),xyz=T.vec3(5.4856e-13,4.4201e-13,5.2481e-13).mul(variance.mul(2*Math.PI).sqrt()).mul(T.vec3(1.681e6,1.7953e6,2.2084e6).mul(phase).add(shift).cos()).mul(phase.pow2().negate().mul(variance).exp());
 const extra=T.float(9.747e-14*Math.sqrt(2*Math.PI*4.5282e9)).mul(phase.mul(2.2399e6).add(shift.x).cos()).mul(phase.pow2().mul(-4.5282e9).exp()),value=T.vec3(xyz.x.add(extra),xyz.y,xyz.z).div(1.0685e-7).toVar();
 return T.vec3(value.dot(T.vec3(3.2404542,-1.5371385,-.4985314)),value.dot(T.vec3(-.969266,1.8760108,.041556)),value.dot(T.vec3(.0556434,-.2040259,1.0572252)));
};
const schlick=(f0,cosine)=>{const f=cosine.mul(-5.55473).sub(6.98316).mul(cosine).exp2();return f0.mul(f.oneMinus()).add(f);};
export const gpuThinFilmReflectance=T.Fn(({outsideIOR,filmIOR,cosine,thickness,f0})=>{
 const eta=T.mix(outsideIOR,filmIOR,T.smoothstep(0,.03,thickness)).toVar(),cos2Squared=T.float(1).sub(outsideIOR.div(eta).pow2().mul(cosine.pow2().oneMinus())).toVar();
 T.If(cos2Squared.lessThan(0),()=>{return T.vec3(1);});
 const cos2=cos2Squared.sqrt(),r0=eta.sub(outsideIOR).div(eta.add(outsideIOR)).pow2(),r12=schlick(r0,cosine).toVar(),transmission=r12.oneMinus().toVar(),phase12=eta.lessThan(outsideIOR).select(Math.PI,0),baseRoot=f0.clamp(0,.9999).sqrt(),baseIOR=T.vec3(1).add(baseRoot).div(T.vec3(1).sub(baseRoot)).toVar(),r1=baseIOR.sub(eta).div(baseIOR.add(eta)).pow2(),r23=schlick(r1,cos2).toVar();
 const phase=T.vec3(T.float(Math.PI).sub(phase12)).add(T.vec3(baseIOR.x.lessThan(eta).select(Math.PI,0),baseIOR.y.lessThan(eta).select(Math.PI,0),baseIOR.z.lessThan(eta).select(Math.PI,0))).toVar(),distance=eta.mul(thickness).mul(cos2).mul(2).toVar(),product=r12.mul(r23).clamp(1e-5,.9999).toVar(),root=product.sqrt(),reflections=transmission.pow2().mul(r23).div(T.vec3(1).sub(product)).toVar(),result=T.vec3(r12).add(reflections).toVar(),amplitude=reflections.sub(transmission).toVar();
 for(let order=1;order<=2;order++){amplitude.mulAssign(root);result.addAssign(amplitude.mul(sensitivity(distance.mul(order),phase.mul(order))).mul(2));}
 return result.max(0);
}).setLayout({name:'hbThinFilmReflectance',type:'vec3',inputs:[{name:'outsideIOR',type:'float'},{name:'filmIOR',type:'float'},{name:'cosine',type:'float'},{name:'thickness',type:'float'},{name:'f0',type:'vec3'}]});

const decorated=new WeakSet();
export function attachGPUIridescence(material){
 if(!material?.isMeshPhysicalNodeMaterial||decorated.has(material))return material;
 decorated.add(material);const setup=material.setupLightingModel;
 material.setupLightingModel=function(builder){
  const model=setup.call(this,builder);
  if(model.iridescence){
   builder.stack.assign(T.iridescence,T.iridescenceThickness.equal(0).select(0,T.iridescence.clamp(0,1)));
   let owned=null;
   const prepare=()=>{
    if(model.iridescenceFresnel===owned)return;
    const cosine=T.normalView.dot(T.positionViewDirection).clamp(),x=cosine.oneMinus().clamp(0,1),x5=x.pow(5).clamp(0,.9999);
    model.iridescenceFresnel=owned=gpuThinFilmReflectance({outsideIOR:T.float(1),filmIOR:T.iridescenceIOR,cosine,thickness:T.iridescenceThickness,f0:T.specularColor});
    model.iridescenceF0=owned.sub(T.vec3(x5)).div(x5.oneMinus());
   };
   // start() invokes the light consumers before returning. Prepare at the
   // first consumer, after its fields are initialized and before they are used.
   for(const key of ['direct','directRectArea','indirect']){const consume=model[key];model[key]=function(...args){prepare();return consume.apply(this,args);};}
   model.computeMultiscattering=function(single,multiple,f90){
   prepare();
   const fab=T.DFGApprox({roughness:T.roughness,dotNV:T.normalView.dot(T.positionViewDirection).clamp()}),fr=T.mix(T.specularColor,this.iridescenceFresnel,T.iridescence),energy=fab.x.add(fab.y),missing=energy.oneMinus(),first=fr.mul(fab.x).add(f90.mul(fab.y));
   // The GL caller passes film Fresnel (despite naming the parameter F0).
   // Use that same input and film-adjusted average for both scattering terms.
   const average=fr.add(fr.oneMinus().mul(.047619)),repeat=first.mul(average).div(missing.mul(average).oneMinus());
   single.addAssign(first);multiple.addAssign(repeat.mul(missing));
   };
  }
  return model;
 };
 material.needsUpdate=true;return material;
}
