import {pathMediaGLSL} from './path-media-shader.js';

export const previousMediumContract=Object.freeze({version:1,selection:'lazy first transmissive boundary; committed old-world BVH and absolute previous material time; disabled for thin-only/opaque media',state:'per auxiliary ray: at most 16 stable volume IDs and 16 scalar IORs; independent of the current RGB extinction stack',boundaries:'seed from previous ray origin; latest entered IOR wins; buried non-LIFO exits preserve the top IOR; successful transmission alone mutates the stack',path:'independent previous IOR ratio and Snell/reflection direction; next old-world hit must reach the mapped old point with the same triangle; facing/TIR mismatch, unknown exit, overflow or incomplete seed rejects history',resources:'existing motion/BVH atlas and local shader state; no new targets, buffers, uniforms or automatic readbacks',remaining:'global changed-path correspondence, rough compound lobes and participating-medium extinction/scattering footprint replay'});

// Reuse the boundary/stack algorithm, but evaluate the committed IOR and geometry.
// Guide replay carries IOR only; extinction/scattering transport remains separate.
let source=pathMediaGLSL.slice(pathMediaGLSL.indexOf('#ifdef HB_PATH_MEDIA'));
source=source.replaceAll('hbMedium','hbPreviousMedium').replaceAll('hbGeometryTrace(','hbPreviousGeometryTrace(').replaceAll('hbRayGeometric(','hbRayPreviousGeometric(');
const first=source.indexOf('vec4 hbPreviousMediumValueLod('),last=source.indexOf('vec4 hbPreviousMediumValue(',first);
if(first<0||last<first)throw Error('이전 매질 생성 계약을 확인하세요.');
source=source.slice(0,first)+'float hbPreviousMediumValueLod(float id,vec3 p,vec3 view,float width){return hbRayPreviousField0TimeLod(id,p,view,width,vec2(hbForward.w,1)).w;}\n'+source.slice(last);
source=source.replace(/vec4 (hbPreviousMediumValue(?:Lod)?)/g,'float $1').replaceAll('out vec4 media[16]','out float media[16]').replaceAll('vec4 value,bool front','float value,bool front').replaceAll('vec4(0,0,0,1)','1.0');
export const previousMediaGLSL='#ifndef HB_GUIDE_OPAQUE\n'+source+`
vec4 hbPreviousMediumBranch(float id,vec3 view,vec3 normal,vec4 physical,bool front,bool reflection,inout float ids[16],inout float media[16],inout int count){
 if(count<0)return vec4(0,0,0,0);bool oldFront=dot(hbRayPreviousGeometric(id),view)>0.0;if(oldFront!=front||physical.z<=.5)return vec4(0,0,0,0);
 float volume=hbPreviousMediumID(id),incoming=count>0?media[clamp(count-1,0,15)]:1.0,outgoing=oldFront?physical.w:1.0;
 if(volume>0.0&&!oldFront){int found=-1;for(int oldExit=0;oldExit<count;oldExit++)if(ids[oldExit]==volume)found=oldExit;if(found<0)return vec4(0,0,0,0);if(found!=count-1)outgoing=incoming;else if(count>1)outgoing=media[clamp(count-2,0,15)];}
 if(volume<.5){incoming=oldFront?1.0:physical.w;outgoing=oldFront?physical.w:1.0;}
 float eta=incoming/max(.000001,outgoing);vec3 facing=oldFront?normal:-normal,next=refract(-view,facing,eta);bool oldReflection=dot(next,next)<.000001;if(oldReflection!=reflection)return vec4(0,0,0,0);
 if(oldReflection)next=reflect(-view,facing);else{next=normalize(next);if(volume>0.0)hbPreviousMediumChange(volume,physical.w,oldFront,ids,media,count);}if(count<0)return vec4(0,0,0,0);return vec4(normalize(next),eta);
}
`+'\n#endif\n';
