import {normalFootprintContract} from './path-normal-footprint.js';
import {pathPixelFootprintContract} from './path-pixel-footprint.js';
// Match the existing radiance integrator's local specular cone model.
export const transmittedSpreadGLSL='float hbRayTransmitSpread(float spread,float ratio,float inCosine,float outCosine){return min(1.57,spread*ratio*inCosine/max(.01,outCosine));}\n';
export const reflectedSpreadGLSL='float hbRayReflectSpread(float spread,float roughness){float r=max(.02,roughness);return min(1.57,spread+r*r*.5);}\n';
export const dielectricSpreadGLSL=`bool hbRayRoughDielectric(float roughness,float ratio){
#ifdef HB_PATH_ROUGH_DIELECTRIC
return roughness>=.05&&abs(ratio-1.0)>.0001;
#else
return false;
#endif
}
float hbRayDielectricSpread(float spread,float roughness,float ratio,float inCosine,float outCosine,bool reflection){
if(hbRayRoughDielectric(roughness,ratio))return hbRayReflectSpread(spread,roughness);
return reflection?spread:hbRayTransmitSpread(spread,ratio,inCosine,outCosine);
}
`;
export const opticalSpreadContract=Object.freeze({version:1,normalVariation:normalFootprintContract,pixelProjection:pathPixelFootprintContract,model:'local cone proxy aligned with radiance integrator; 0.01 specular grazing floor and 1.57 cap',inputs:'previous/current spread and selected base/coat roughness, each path IOR ratio, absolute incoming/outgoing shading-normal cosines',reflection:'non-glass base/coat proxy guide uses the selected lobe roughness and existing radiance heuristic min(1.57,spread+max(.02,roughness)^2/2); committed guide reuses its own live physical/coat evaluation',dielectric:Object.freeze({feature:'HB_PATH_ROUGH_DIELECTRIC / transport.roughOn; selected with the radiance integrator',roughThreshold:.05,iorDifferenceThreshold:.0001,rough:'when enabled, roughness >=0.05 and abs(ratio-1)>0.0001 broaden reflected or transmitted cone by roughness^2/2',specular:'otherwise reflection/TIR retain spread, transmission uses ratio*incomingCosine/outgoingCosine',history:'committed path uses its own physical roughness and replayed medium ratio; reject a change between rough and delta modes'}),selection:'proxy directions remain geometric reflect/refract; rough spread does not assert stochastic microfacet path correspondence',resources:'existing current cone and previous spread scalars; no extra ray query, image, uniform, buffer or readback',remaining:'global curved-normal/path differentials and full anisotropic/rough/participating-medium footprint transport'});
