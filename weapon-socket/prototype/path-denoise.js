import {pathPixelFootprintGLSL} from './path-pixel-footprint.js';
import {normalFootprintGLSL} from './path-normal-footprint.js';
import {transmittedSpreadGLSL,reflectedSpreadGLSL,dielectricSpreadGLSL} from './path-ray-cone.js';
import {previousMediaGLSL} from './path-previous-media.js';
import {previousGeometryGLSL} from './previous-geometry-shader.js';
import {virtualGuideGLSL} from './path-guide-affine.js';
import {curvedGuideGLSL} from './path-curved-guide.js';
import {surfaceHistoryGLSL} from './path-surface-history.js';
// Display filtering never feeds the Monte Carlo history.
// shortcut: differential footprints are local; reject grazing/TIR branch changes and cap the radius at32 pixels.
export const pathDenoiseGLSL=`
${normalFootprintGLSL}
${surfaceHistoryGLSL}
${transmittedSpreadGLSL}
${reflectedSpreadGLSL}
${dielectricSpreadGLSL}
${previousGeometryGLSL}
${previousMediaGLSL}
${curvedGuideGLSL}
${virtualGuideGLSL}
${pathPixelFootprintGLSL}
vec3 hbPathPreviousPoint(float id,vec3 p){vec3 b=hbRayBary(id,p);float at=hbPathFilter.w+id*3.0;return hbGeometryLoad(at).xyz+hbGeometryLoad(at+1.0).xyz*b.y+hbGeometryLoad(at+2.0).xyz*b.z;}
vec4 hbPathGuideTrace(vec2 uv,bool auxiliary){
vec3 nearPoint=hbWorldAt(uv,0.0),farPoint=hbWorldAt(uv,.9999),origin=hbEye.w>.5?nearPoint:hbEye.xyz,direction=normalize(farPoint-origin),cameraDirection=direction,forward=normalize(hbForward.xyz),right=normalize(hbWorldAt(uv+vec2(.01,0),0.0)-nearPoint),up=normalize(cross(right,forward));vec2 cone=hbRayCameraCone(uv);float width=cone.x,secondaryDistance=0.0,oldSecondary=0.0;vec4 priorCamera=hbPathPriorCamera();vec3 oldView=vec3(0,0,1);float oldWidth=0.0,oldSpread=0.0;vec3 oldFirst=origin,oldPoint=priorCamera.xyz;bool previousValid=priorCamera.w>.5,lensDifferentials=hbPathLens.x>0.0&&hbEye.w<.5&&hbPathFilter.y>0.0,curved=auxiliary&&hbGeometryRecords.w>.5&&(lensDifferentials||hbPathFilter.x>0.0),differentials=lensDifferentials||curved;int differentialCount=lensDifferentials?4:2;
float priorIDs[16],priorMedia[16];int priorCount=0;bool priorSeeded=false,priorDirectionValid=false;vec3 priorDirection=vec3(0,0,-1);
float differentialIDs[4];vec3 ro[4],rd[4];HBPathVirtualFrame priorFrame=hbPathVirtualIdentity(),currentFrame=hbPathVirtualIdentity(),mirrorFrame=hbPathVirtualIdentity();
ro[0]=hbEye.w>.5?hbWorldAt(uv+vec2(1.0/hbScreenSize.x,0),0.0):origin;ro[1]=hbEye.w>.5?hbWorldAt(uv+vec2(0,1.0/hbScreenSize.y),0.0):origin;rd[0]=normalize(hbWorldAt(uv+vec2(1.0/hbScreenSize.x,0),.9999)-ro[0]);rd[1]=normalize(hbWorldAt(uv+vec2(0,1.0/hbScreenSize.y),.9999)-ro[1]);vec3 focus=origin+direction*hbPathLens.y/max(.000001,dot(direction,forward));ro[2]=origin+right*hbPathLens.x;ro[3]=origin+up*hbPathLens.x;rd[2]=normalize(focus-ro[2]);rd[3]=normalize(focus-ro[3]);
float ids[16];vec4 media[16];int count;hbMediumSeed(origin,direction,false,ids,media,count);int mirrorCount=0;
for(int bounce=0;bounce<min(16,int(hbPath.y));bounce++){
if(count<0)break;vec4 hit=hbGeometryTraceCone(origin,direction,hbGeometry.y,vec2(width,cone.y));if(hit.z<.5||hit.w<.5)break;width+=cone.y*hit.x;if(bounce==1)secondaryDistance=hit.x;vec3 p=origin+direction*hit.x,normal=vec3(0,0,0),geometric=hbRayGeometric(hit.y);bool front=dot(geometric,direction)<0.0;vec3 n=front?normal:-normal;vec4 physical=hbRayField0Lod(hit.y,p,-direction,width);bool glass=false;
#ifndef HB_GUIDE_OPAQUE
glass=physical.z>.5;
#endif
bool baseMirror=physical.x>.5&&physical.y<.4,mirror=baseMirror,coatOnly=false;
#ifdef HB_PATH_ADVANCED
vec4 coat=hbRayField5Lod(hit.y,p,-direction,width);bool coatMirror=coat.x>.5&&coat.y<.05;coatOnly=!glass&&!baseMirror&&coatMirror;mirror=mirror||coatMirror;
#endif
normal=hbPathSurfaceNormal(hit.y,p,-direction,width,coatOnly);n=front?normal:-normal;
float surfaceRoughness=physical.y;
#ifdef HB_PATH_ADVANCED
if(coatOnly)surfaceRoughness=coat.y;
#endif
float oldRoughness=surfaceRoughness;
vec3 oldP=p,oldN=geometric;
#if !defined(HB_GUIDE_OPAQUE) || defined(HB_RAY_SURFACE_HISTORY_0)
vec4 oldPhysical=vec4(0,0,0,0);
#endif
if(hbPathFilter.w>0.0){float at=hbPathFilter.w+hit.y*3.0;previousValid=previousValid&&hbGeometryLoad(at).w>.5;oldP=hbPathPreviousPoint(hit.y,p);oldN=normalize(cross(hbGeometryLoad(at+1.0).xyz,hbGeometryLoad(at+2.0).xyz));}if(bounce==0)oldFirst=oldP;if(bounce==1)oldSecondary=length(oldP-oldPoint);oldView=hbEye.w>.5&&bounce==0?priorCamera.xyz:normalize(oldPoint-oldP);if(priorDirectionValid)oldView=-priorDirection;if(bounce==0&&hbEye.w>.5){vec4 oldOrigin=hbPathPriorOrthoOrigin(oldP,oldView);previousValid=previousValid&&oldOrigin.w>.5;oldPoint=oldOrigin.xyz;}if(bounce==0){vec2 oldCone=hbPathPriorCone(oldP,priorCamera);oldWidth=oldCone.x;oldSpread=oldCone.y;}oldWidth+=oldSpread*length(oldP-oldPoint);
#if !defined(HB_GUIDE_OPAQUE) || defined(HB_RAY_SURFACE_HISTORY_0)
if(curved&&previousValid&&hbPathFilter.w>0.0){oldPhysical=hbRayPreviousField0TimeLod(hit.y,oldP,oldView,oldWidth,vec2(hbForward.w,1));if(!coatOnly)oldRoughness=oldPhysical.y;}
#endif

#ifndef HB_GUIDE_OPAQUE
if(auxiliary&&curved&&previousValid&&hbPreviousGeometryAvailable()){vec4 priorHit=hbPreviousGeometryTrace(oldPoint,-oldView,hbGeometry.y);previousValid=priorHit.w>.5&&priorHit.z>.5&&priorHit.y==hit.y&&length(oldPoint-oldView*priorHit.x-oldP)<=max(hbGeometryLimits.y*4.0,length(oldP-oldPoint)*.00001);}
#endif
#if defined(HB_PATH_MEDIA) && !defined(HB_GUIDE_OPAQUE)
if(auxiliary&&curved&&glass&&previousValid&&hbPreviousGeometryAvailable()&&!priorSeeded){hbPreviousMediumSeed(oldPoint,-oldView,false,priorIDs,priorMedia,priorCount);priorSeeded=true;if(priorCount<0)previousValid=false;}
#endif
oldPoint=oldP;
if(curved){oldN=coatOnly?hbPathCommittedCoatNormal(hit.y,oldP,oldView,oldWidth):hbPathCommittedNormal(hit.y,oldP,oldView,oldWidth);if(dot(oldN,oldN)<.5)previousValid=false;}
if(curved&&previousValid&&hbPathFilter.w>0.0){
#ifdef HB_RAY_SURFACE_HISTORY_0
previousValid=hbPathSameSurface(physical,oldPhysical);
#endif
#if defined(HB_PATH_ADVANCED) && defined(HB_RAY_SURFACE_HISTORY_5)
vec4 oldCoat=hbRayPreviousField5TimeLod(hit.y,oldP,oldView,oldWidth,vec2(hbForward.w,1));if(coatOnly)oldRoughness=oldCoat.y;previousValid=previousValid&&hbPathSameLobes(coat,oldCoat);
#endif
${[1,2,4,6,7,8,9].map(field=>`#if ${field>=5?'defined(HB_PATH_ADVANCED) && ':''}defined(HB_RAY_SURFACE_HISTORY_${field})
previousValid=previousValid&&hbPathSameValue(hbRayField${field}Lod(hit.y,p,-direction,width),hbRayPreviousField${field}TimeLod(hit.y,oldP,oldView,oldWidth,vec2(hbForward.w,1)));
#endif`).join('\n')}
}vec3 dp[4];if(differentials)for(int j=0;j<differentialCount;j++){differentialIDs[j]=hit.y;if(curved){vec4 h=hbGeometryTraceCone(ro[j],rd[j],hbGeometry.y,vec2(width,cone.y));if(h.z<.5||h.w<.5||hbRayOwner(h.y)!=hbRayOwner(hit.y))return vec4(0,0,0,0);dp[j]=ro[j]+rd[j]*h.x;differentialIDs[j]=h.y;vec3 gn=hbRayGeometric(h.y);vec4 ph=hbRayField0Lod(h.y,dp[j],-rd[j],width);if((dot(gn,rd[j])<0.0)!=front||(ph.z>.5)!=glass||abs(ph.w-physical.w)>.001)return vec4(0,0,0,0);bool phBaseMirror=ph.x>.5&&ph.y<.4,phMirror=phBaseMirror,phCoatOnly=false;
#ifdef HB_PATH_ADVANCED
vec4 phCoat=hbRayField5Lod(h.y,dp[j],-rd[j],width);bool phCoatMirror=phCoat.x>.5&&phCoat.y<.05;phCoatOnly=!glass&&!phBaseMirror&&phCoatMirror;phMirror=phMirror||phCoatMirror;
#endif
if(!glass&&(phMirror!=mirror||phCoatOnly!=coatOnly))return vec4(0,0,0,0);}else{float denominator=dot(geometric,rd[j]);if(abs(denominator)<.00001)return vec4(0,0,0,0);float t=dot(geometric,p-ro[j])/denominator;if(t<0.0)return vec4(0,0,0,0);dp[j]=ro[j]+rd[j]*t;}}
if(!glass&&!mirror){if(physical.y<.1&&physical.x<=.5)return vec4(0,0,0,0);if(!auxiliary)normal=hbPathVirtualPoint(mirrorFrame,normal);float depth=bounce==0?max(.00001,hbLinearDepth(hbProject(p,hbCurrentVP).z)):-max(.00001,secondaryDistance),coc=0.0;
if(lensDifferentials){vec3 x=dp[0]-p,y=dp[1]-p;coc=min(32.0,max(length(hbPathOffset(x,y,dp[2]-p)),length(hbPathOffset(x,y,dp[3]-p))));}
if(!auxiliary)return vec4(normal,depth);
vec3 virtualPoint=hbPathVirtualPoint(priorFrame,oldP),virtualCurrent=hbPathVirtualPoint(currentFrame,p);
vec3 oldUV=hbProject(virtualPoint,hbPreviousVP);oldUV.xy+=uv-hbProject(virtualCurrent,hbCurrentVP).xy;float expected=bounce==0?max(.00001,hbLinearDepth(oldUV.z)):-max(.00001,oldSecondary);if(!previousValid||!hbInside(oldUV))oldUV.xy=vec2(-1,-1);return vec4(oldUV.xy,expected,coc);}
float eta=1.0;bool reflection=true;
#if defined(HB_PATH_NORMAL_FOOTPRINT) && HB_PATH_NORMAL_FOOTPRINT > 0
vec3 footprintView=-direction;
#endif
if(glass){float volume=hbMediumID(hit.y),incoming=count>0?media[clamp(count-1,0,15)].w:1.0,outgoing=front?physical.w:1.0;if(volume>0.0&&!front){int found=-1;for(int j=0;j<count;j++)if(ids[j]==volume)found=j;if(found<0)break;if(found!=count-1)outgoing=incoming;else if(count>1)outgoing=media[clamp(count-2,0,15)].w;}if(volume<.5){incoming=front?1.0:physical.w;outgoing=front?physical.w:1.0;}eta=incoming/max(.000001,outgoing);float inCosine=abs(dot(n,direction));vec3 next=refract(direction,n,eta);reflection=dot(next,next)<.000001;if(reflection)direction=reflect(direction,n);else{direction=normalize(next);if(volume>0.0)hbMediumChange(volume,hbMediumValueLod(hit.y,p,-direction,width),front,ids,media,count);}cone.y=hbRayDielectricSpread(cone.y,surfaceRoughness,eta,inCosine,abs(dot(n,direction)),reflection);}
else{direction=reflect(direction,n);cone.y=hbRayReflectSpread(cone.y,surfaceRoughness);}
#if defined(HB_PATH_NORMAL_FOOTPRINT) && HB_PATH_NORMAL_FOOTPRINT > 0
cone.y=min(1.57,cone.y+hbRayNormalFootprint(hit.y,p,footprintView,width,normal,eta,reflection,coatOnly,false));
#endif
if(reflection){if(mirrorCount<8){if(!auxiliary)hbPathVirtualAppend(mirrorFrame,vec3(0,0,0),n,1.0,true);mirrorCount++;}else break;}
float oldEta=eta;
if(auxiliary&&curved&&glass&&previousValid&&hbPathFilter.w>0.0){
#ifndef HB_GUIDE_OPAQUE
if(hbPreviousGeometryAvailable()){vec4 branch=hbPreviousMediumBranch(hit.y,oldView,oldN,oldPhysical,front,reflection,priorIDs,priorMedia,priorCount);if(branch.w<=0.0)previousValid=false;else{oldEta=branch.w;priorDirection=branch.xyz;priorDirectionValid=true;}}
#endif
if(previousValid)previousValid=hbPathSameRefraction(oldView,oldN,hbRayPreviousGeometric(hit.y),oldEta,front,reflection);}
#ifndef HB_GUIDE_OPAQUE
if(auxiliary&&curved&&!glass&&previousValid&&hbPreviousGeometryAvailable()){priorDirection=normalize(reflect(-oldView,oldN));priorDirectionValid=true;}
#endif
if(auxiliary&&curved&&!glass&&previousValid)oldSpread=hbRayReflectSpread(oldSpread,oldRoughness);
if(auxiliary&&curved&&glass&&previousValid){previousValid=hbRayRoughDielectric(surfaceRoughness,eta)==hbRayRoughDielectric(oldRoughness,oldEta);vec3 oldNext=priorDirectionValid?priorDirection:(reflection?reflect(-oldView,oldN):normalize(refract(-oldView,front?oldN:-oldN,oldEta)));oldSpread=hbRayDielectricSpread(oldSpread,oldRoughness,oldEta,abs(dot(oldN,oldView)),abs(dot(oldN,oldNext)),reflection);}

#if defined(HB_PATH_NORMAL_FOOTPRINT) && HB_PATH_NORMAL_FOOTPRINT > 0
if(auxiliary&&curved&&previousValid)oldSpread=min(1.57,oldSpread+hbRayNormalFootprint(hit.y,oldP,oldView,oldWidth,oldN,oldEta,reflection,coatOnly,true));
#endif
if(auxiliary){hbPathVirtualAppend(priorFrame,oldP,oldN,oldEta,reflection);hbPathVirtualAppend(currentFrame,p,curved?normal:geometric,eta,reflection);}
if(differentials)for(int j=0;j<differentialCount;j++){vec3 dn=hbPathSurfaceNormal(differentialIDs[j],dp[j],-rd[j],width,coatOnly);if(!front)dn=-dn;vec3 next=reflection?reflect(rd[j],dn):refract(rd[j],dn,eta);if(dot(next,next)<.000001||(glass&&reflection&&dot(refract(rd[j],dn,eta),refract(rd[j],dn,eta))>.000001))return vec4(0,0,0,0);rd[j]=normalize(next);ro[j]=dp[j]+rd[j]*hbGeometryLimits.y*2.0;}
origin=p+direction*hbGeometryLimits.y*2.0;
}return vec4(0,0,0,0);}
vec4 hbPathGuideResolve(vec2 uv){return hbPathGuideTrace(uv,false);}
vec4 hbPathAuxResolve(vec2 uv){return hbPathGuideTrace(uv,true);}
float hbPathCoC(vec2 uv,vec4 guide){if(hbPathLens.x<=0.0||hbEye.w>.5||guide.w==0.0)return 0.0;return texture2D(hbDenoiseAux,uv).w;}
vec4 hbPathDenoiseResolve(vec2 uv){vec4 center=texture2D(hbDenoiseGuide,uv),original=texture2D(hbScreenSource,uv);if(center.w==0.0||(hbGeometryRecords.w>.5&&(hbPathLens.x>0.0||hbPathFilter.x>0.0)&&texture2D(hbDenoiseAux,uv).z==0.0)||(hbPathLens.x>0.0&&hbPathFilter.y==0.0))return original;vec3 sum=vec3(0,0,0);float total=0.0,coc=hbPathCoC(uv,center),stride=hbPathLens.x>0.0?min(hbPathOptions.w,max(1.0,coc)):hbPathOptions.w;
 for(int y=-2;y<=2;y++)for(int x=-2;x<=2;x++){vec2 at=uv+vec2(float(x),float(y))*stride/hbScreenSize;if(at.x<0.0||at.x>1.0||at.y<0.0||at.y>1.0)continue;vec4 guide=texture2D(hbDenoiseGuide,at),v=texture2D(hbScreenSource,at);if(center.w*guide.w<=0.0||(hbGeometryRecords.w>.5&&(hbPathLens.x>0.0||hbPathFilter.x>0.0)&&texture2D(hbDenoiseAux,at).z==0.0))continue;float normal=pow(max(0.0,dot(center.xyz,guide.xyz)),hbPathDenoise.z),depth=exp(-abs(abs(center.w)-abs(guide.w))/max(.00001,abs(center.w)*hbPathDenoise.w*stride)),lens=exp(-abs(coc-hbPathCoC(at,guide))/max(1.0,coc));vec3 delta=v.rgb-original.rgb;float brightness=exp(-dot(delta,delta)/max(.001,(dot(original.rgb,original.rgb)+.1)*(1.0+coc*coc*.25))),kernel=(x==0?6.0:abs(x)==1?4.0:1.0)*(y==0?6.0:abs(y)==1?4.0:1.0),weight=normal*depth*brightness*kernel*lens;sum+=v.rgb*weight;total+=weight;
 }return vec4(mix(original.rgb,sum/max(.000001,total),hbPathDenoise.x*(hbPathLens.x>0.0?hbPathFilter.y:1.0)),original.a);
}
vec4 hbPathTemporalResolve(vec2 uv){vec4 original=texture2D(hbScreenSource,uv),center=texture2D(hbDenoiseGuide,uv),motion=texture2D(hbDenoiseAux,uv),oldGuide=texture2D(hbDenoisePreviousGuide,motion.xy);if(hbPathFilter.x<=0.0||hbPathFilter.z<.5||motion.x<0.0||motion.x>1.0||motion.y<0.0||motion.y>1.0||center.w*oldGuide.w<=0.0||dot(center.xyz,oldGuide.xyz)<.95||abs(motion.z-oldGuide.w)>max(.00001,abs(motion.z)*.02)||(hbPathLens.x>0.0&&hbPathFilter.y==0.0))return original;vec3 lo=original.rgb,hi=original.rgb;
 for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){vec2 at=clamp(uv+vec2(float(x),float(y))/hbScreenSize,0.0,1.0);vec4 guide=texture2D(hbDenoiseGuide,at);if(center.w*guide.w>0.0&&dot(center.xyz,guide.xyz)>.95&&abs(center.w-guide.w)<max(.00001,abs(center.w)*.02)){vec3 v=texture2D(hbScreenSource,at).rgb;lo=min(lo,v);hi=max(hi,v);}}
 return vec4(mix(original.rgb,clamp(texture2D(hbDenoiseHistory,motion.xy).rgb,lo,hi),hbPathFilter.x),original.a);
}
`;
// Image filters consume guides only; do not compile the unused ray traversal,
// material evaluator or guide solver again for each spatial/temporal pass.
export const pathDenoiseFilterGLSL=pathDenoiseGLSL.slice(pathDenoiseGLSL.indexOf('float hbPathCoC('));
export function temporalDenoiseColor(current,previous,center,oldGuide,neighbors,feedback,valid=true){if(!valid||feedback<=0||center[3]*oldGuide[3]<=0||center.slice(0,3).reduce((s,v,i)=>s+v*oldGuide[i],0)<.95||Math.abs(center[3]-oldGuide[3])>Math.max(.00001,Math.abs(center[3])*.02))return [...current];return current.map((v,i)=>{const lo=Math.min(v,...neighbors.map(n=>n[i])),hi=Math.max(v,...neighbors.map(n=>n[i]));return v*(1-feedback)+Math.max(lo,Math.min(hi,previous[i]))*feedback;});}
export function denoiseWeight(center,guide,color,other,x,y,stride=1){if(center[3]*guide[3]<=0)return 0;const dot=(a,b)=>a.slice(0,3).reduce((s,v,i)=>s+v*b[i],0),delta=other.map((v,i)=>v-color[i]);return Math.max(0,dot(center,guide))**32*Math.exp(-Math.abs(Math.abs(center[3])-Math.abs(guide[3]))/Math.max(.00001,Math.abs(center[3])*.02*stride))*Math.exp(-dot(delta,delta)/Math.max(.001,dot(color,color)+.1))*(x===0?6:Math.abs(x)===1?4:1)*(y===0?6:Math.abs(y)===1?4:1);}
