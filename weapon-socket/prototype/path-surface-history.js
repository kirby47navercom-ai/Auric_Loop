import {previousGeometryContract} from './previous-geometry.js';
import {normalMapContract} from './normal-map.js';
import {rayNormalPoseContract} from './path-guide-frames.js';
import {rayUVFootprintContract} from './ray-uv-footprint.js';
import {previousMediumContract} from './path-previous-media.js';
import {opticalSpreadContract} from './path-ray-cone.js';
// A changed transport branch cannot reuse its old virtual-surface guide.
// Reject incompatible branches before old-path reprojection can reuse history.
export const surfaceHistoryEpsilon=.001;
export const surfaceHistoryGLSL=`
vec3 hbPathSurfaceNormal(float id,vec3 p,vec3 view,float width,bool coat){
#ifdef HB_PATH_ADVANCED
if(coat)return hbRayCoatNormalLod(id,p,view,width);
#endif
return hbRayNormalLod(id,p,view,width);}
vec3 hbPathCommittedCoatNormal(float id,vec3 p,vec3 view,float width){if(hbPathFilter.w<=0.0||hbGeometryLoad(hbPathFilter.w+id*3.0).w<.5)return vec3(0,0,0);vec3 a=hbGeometryLoad(hbPathFilter.w+id*3.0+1.0).xyz,b=hbGeometryLoad(hbPathFilter.w+id*3.0+2.0).xyz;if(!hbRayFrameValid(a,b))return vec3(0,0,0);float at=hbRayAttributes(id);if(at>0.0){float encoded=hbGeometryLoad(at+3.0).w,old=hbGeometryLoad(at+4.0).w;if(encoded== -2.0||((encoded<-.5||encoded>0.0)&&old<=0.0))return vec3(0,0,0);}return hbRayPreviousCoatNormalContextLod(id,p,view,width,vec2(hbForward.w,1));}
bool hbPathSameValue(vec4 now,vec4 old){vec4 d=abs(now-old)/max(vec4(1,1,1,1),max(abs(now),abs(old)));return d.x<=.001&&d.y<=.001&&d.z<=.001&&d.w<=.001;}
bool hbPathSameSurface(vec4 now,vec4 old){vec3 d=abs(now.xyz-old.xyz);bool glass=now.z>.5,oldGlass=old.z>.5,mirror=now.x>.5&&now.y<.4,oldMirror=old.x>.5&&old.y<.4;return now.w==old.w&&d.x<=.001&&d.y<=.001&&d.z<=.001&&glass==oldGlass&&(glass||mirror==oldMirror);}
bool hbPathSameCoat(vec4 now,vec4 old){return abs(now.x-old.x)<=.001&&abs(now.y-old.y)<=.001&&(now.x>.5&&now.y<.05)==(old.x>.5&&old.y<.05);}
bool hbPathSameLobes(vec4 now,vec4 old){return hbPathSameCoat(now,old)&&hbPathSameValue(now,old);}
bool hbPathSameRefraction(vec3 view,vec3 normal,vec3 geometric,float eta,bool front,bool reflection){bool oldFront=dot(geometric,view)>0.0;vec3 next=refract(-view,oldFront?normal:-normal,eta);return oldFront==front&&((dot(next,next)<.000001)==reflection);}
`;
export function sameHistorySurface(now,old){if(![...now,...old].every(Number.isFinite))return false;const glass=now[2]>.5,oldGlass=old[2]>.5,mirror=now[0]>.5&&now[1]<.4,oldMirror=old[0]>.5&&old[1]<.4;return now[3]===old[3]&&Math.max(...now.slice(0,3).map((v,i)=>Math.abs(v-old[i])))<=surfaceHistoryEpsilon&&glass===oldGlass&&(glass||mirror===oldMirror);}
export function sameHistoryCoat(now,old){return [now[0],now[1],old[0],old[1]].every(Number.isFinite)&&Math.max(Math.abs(now[0]-old[0]),Math.abs(now[1]-old[1]))<=surfaceHistoryEpsilon&&((now[0]>.5&&now[1]<.05)===(old[0]>.5&&old[1]<.05));}
export function sameHistoryRefraction(view,normal,geometric,eta,front,reflection){if(![...view,...normal,...geometric,eta].every(Number.isFinite)||eta<=0)return false;const oldFront=geometric.reduce((sum,v,i)=>sum+v*view[i],0)>0,n=normal.map(v=>oldFront?v:-v),incident=view.map(v=>-v),cosine=n.reduce((sum,v,i)=>sum+v*incident[i],0),k=1-eta*eta*(1-cosine*cosine),next=k<0?[0,0,0]:incident.map((v,i)=>eta*v-(eta*cosine+Math.sqrt(k))*n[i]);return oldFront===front&&(next.reduce((sum,v)=>sum+v*v,0)<.000001)===reflection;}

export function sameHistoryValue(now,old){return now.length===4&&old.length===4&&[...now,...old].every(Number.isFinite)&&now.every((v,i)=>Math.abs(v-old[i])/Math.max(1,Math.abs(v),Math.abs(old[i]))<=surfaceHistoryEpsilon);}
export function sameHistoryLobes(now,old){return sameHistoryCoat(now,old)&&sameHistoryValue(now,old);}

export const raySurfaceHistoryContract=Object.freeze({
 version:1,backends:Object.freeze(['d3d11','webgl2','webgpu']),fields:Object.freeze(['physical','color-opacity','emission-thickness','normal','attenuation','coat-anisotropy','specular','sheen','iridescence','coat-normal'].map((name,field)=>Object.freeze({field,name}))),
 inputs:Object.freeze(['committed triangle and barycentric UV','committed smooth normal/tangent basis','previous world point','previous camera/view','absolute committed material time','previous pixel cone and texture footprint']),
 api:'GLSL/HLSL hbRayPreviousField0..9TimeLod(id,point,view,width,vec2(time,1)); TSL previousRayGPU(...,{fields}).field(...)',
 decodedNormals:'base: normalTime / hbRayPreviousNormalContextLod; coat: coatNormalTime / hbRayPreviousCoatNormalContextLod; committed smooth normal and independent tangent basis; TSL callers request fields [3,9]',
 guideLobes:'opaque coat mirror uses the coat normal when the base is not a mirror; base mirror and glass retain the base normal; reject differential neighbours on a different lobe',
 previousGeometry:previousGeometryContract,
 normalDecode:normalMapContract,
 normalPose:rayNormalPoseContract,
 uvFootprint:rayUVFootprintContract,
 previousMedium:previousMediumContract,opticalSpread:opticalSpreadContract,
 selection:'version-aware live output dependency; static program bodies reused; guide evaluates only needed fields; spatially uniform constants/Time/view retain current and committed base evaluation but omit zero footprint deltas; coat-anisotropy input history compares all four channels while coat mirror classification uses xy',
 gates:'physical IOR exact; physical/coat branch boundaries plus 0.001 absolute tolerance; other surface channels 0.001 relative-to-max(1,abs(values)); previous facing/TIR branch must match',
 globalReset:Object.freeze(['CPU-only animated material','any animated transmissive material','animated opacity/visibility','animated emissive RGB','authored material/texture edits','failed/uncommitted pose or clock rewind']),
 resources:'existing packed geometry/normal/motion atlas and reserved prior-time scalar; optional old-world BVH suffix and CPU refit cache for transmissive temporal guides; no additional GPU targets, uniform fields or steady-frame readbacks',
 remaining:Object.freeze(['global changed transparent-path correspondence and curved inverse solve','rough compound-lobe and participating-medium extinction/scattering footprint transport'])
});
