import {Fn,If,vec3,float,mix,materialLightMap,materialReference} from 'three/tsl';
export function gpuProbeLightmapScale(captureIrradiance,level){
 return Fn(()=>{const result=float(1).toVar(),intensity=materialReference('lightMapIntensity','float');If(intensity.greaterThan(0).and(level.greaterThan(.1)),()=>{const weights=vec3(.2126,.7152,.0722),reference=captureIrradiance.max(0).dot(weights).max(.0001),ratio=materialLightMap.max(0).dot(weights).div(reference).min(1000);result.assign(mix(1,ratio,level.sub(.1).div(.2).clamp(0,1)));});return result;})();
}
