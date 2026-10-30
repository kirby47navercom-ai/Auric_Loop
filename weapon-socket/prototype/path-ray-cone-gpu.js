export const transmittedSpreadGPU=(spread,ratio,inCosine,outCosine)=>spread.mul(ratio).mul(inCosine).div(outCosine.max(.01)).min(1.57);
export const reflectedSpreadGPU=(spread,roughness)=>{const r=roughness.max(.02);return spread.add(r.mul(r).mul(.5)).min(1.57);};
export const roughDielectricGPU=(roughness,ratio)=>roughness.greaterThanEqual(.05).and(ratio.sub(1).abs().greaterThan(.0001));
export const dielectricSpreadGPU=(spread,roughness,ratio,inCosine,outCosine,reflection,roughOn)=>{
 const specular=reflection.select(spread,transmittedSpreadGPU(spread,ratio,inCosine,outCosine));
 return roughOn?roughDielectricGPU(roughness,ratio).select(reflectedSpreadGPU(spread,roughness),specular):specular;
};
