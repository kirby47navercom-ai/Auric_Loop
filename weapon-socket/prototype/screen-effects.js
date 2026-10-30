import {meshDistanceFieldGLSL} from './mesh-distance-field-shader.js';
import {normalFootprintMode} from './path-normal-footprint.js';
import {Matrix4,Vector3} from 'three';
import {geometryGIGLSL} from './geometry-gi-shader.js';
import {hierarchyGLSL} from './hierarchical-depth.js';
import {pathDenoiseGLSL} from './path-denoise.js';
import {pathTracingGLSL} from './path-tracing-shader.js';
import {ObjectMotionHistory,objectMotionEnabled} from './object-motion.js';

export const ambientOcclusionEnabled=p=>!!(p?.aoEnabled&&(p.aoMode==='ambient'||p.aoMode==='distanceField')&&p.aoIntensity>0);
export const screenEffectsEnabled=p=>!!(p&&(p.pathTracingEnabled||ambientOcclusionEnabled(p)||p.antiAliasing==='taa'&&p.aaStrength>0||p.motionBlurEnabled&&p.motionBlurStrength>0||p.ssrEnabled&&p.ssrStrength>0||p.ssgiEnabled&&p.ssgiStrength>0||p.geometryGIEnabled&&p.geometryGIStrength>0));
export const surfaceEffectsEnabled=p=>!!(p&&(ambientOcclusionEnabled(p)||p.ssrEnabled&&p.ssrStrength>0||p.ssgiEnabled&&p.ssgiStrength>0||p.geometryGIEnabled&&p.geometryGIStrength>0));
export function packedScreenEffects(p){return {path:[p?.pathTracingEnabled?1:0,p?.pathTracingBounces??6,p?.pathTracingSamples??256,0],pathQuality:[p?.pathTracingSamplesPerFrame??1,0,0,0],pathEnvironment:[...(p?.pathTracingEnvironment?.slice(0,3)??[0,0,0]),p?.pathTracingClamp??64],pathLens:[0,p?.focusDistance??10,0,0],pathAsset:p?.pathTracingHDRI||'',pathHDRILOD:p?.pathTracingHDRILOD!==false,pathCurvedGuide:!!p?.pathTracingCurvedFilter,pathNormalMode:normalFootprintMode(p?.pathTracingNormalFootprint),pathMap:[0,0,0,(p?.pathTracingHDRIRotation??0)*Math.PI/180],pathOptions:[p?.pathTracingHDRIIntensity??1,0,0,p?.megaLightsEnabled?p.megaLightsSamples??8:0],pathDenoise:[p?.pathTracingEnabled&&p?.pathTracingDenoise?p.pathTracingDenoiseStrength:0,p?.pathTracingDenoiseSteps??3,32,.02],pathFilter:[p?.pathTracingDenoiseTemporal??0,p?.pathTracingDenoiseLens??1,0,0],pathCausticTargets:[0,0,0,0],pathCausticProgress:[p?.pathTracingCausticProgressive?(p.pathTracingCausticAlpha??2/3):1,p?.pathTracingCausticRadius??.25],pathCaustics:[p?.pathTracingCaustics?1:0,p?.pathTracingCausticSamples??16,p?.pathTracingCausticRadius??.25,p?.pathTracingCausticStrength??1],transport:[0,0,p?.coloredTransmissionShadows?1:0,p?.transmissionShadowLayers??32],ambientAO:[p?.aoRadius??1,p?.aoBias??.02,ambientOcclusionEnabled(p)?p.aoIntensity:0,0],geometry:[p?.geometryGIEnabled?p.geometryGIStrength:0,p?.pathTracingEnabled?p.pathTracingDistance:p?.geometryGIDistance??20,p?.geometryGIBounces??1,p?.geometryGISamples??4],geometryRecords:[0,0,0,0],geometryInfo:[1,1,0,0],geometryLimits:[p?.geometryGITraceSteps??256,p?.geometryGIBias??.01,0,0],hierarchy:[0,0,0,p?.screenRayHiZ?1:0],temporal:[p?.antiAliasing==='taa'?p.aaStrength:0,p?.temporalFeedback??.85,p?.historyDepthTolerance??.02,0],motion:[p?.motionBlurEnabled?p.motionBlurStrength:0,p?.motionBlurClamp??.05,p?.motionBlurSamples??8,objectMotionEnabled(p)?1:0],reflection:[p?.ssrEnabled?p.ssrStrength:0,p?.ssrMaxRoughness??.8,p?.screenRayDistance??20,p?.screenRayThickness??.2],indirect:[p?.ssgiEnabled?p.ssgiStrength:0,p?.screenRaySteps??24,p?.screenRayRefineSteps??4,p?.screenRayEdgeFade??.08]};}
const halton=(index,base)=>{let value=0,f=1;while(index>0){f/=base;value+=f*(index%base);index=Math.floor(index/base);}return value;};
// Each viewport commits camera, object and deformation histories only after a successful frame.
export class ScreenFrameState{
 constructor(){this.objects=new ObjectMotionHistory();this.jitter=[0,0];this.valid=false;this.index=0;this.previous=new Matrix4();this.projection=new Matrix4();this.position=new Vector3();this.direction=new Vector3();}
 begin(camera,p,width,height,time,scene,zeroToOne=false){
  const base=camera.projectionMatrix.clone(),position=camera.getWorldPosition(new Vector3()),direction=camera.getWorldDirection(new Vector3());
  const taa=!p?.pathTracingEnabled&&p?.antiAliasing==='taa'&&p.aaStrength>0;const pathReset=this.taa!==taa||!this.valid||this.camera!==camera||this.scene!==scene||this.width!==width||this.height!==height||this.version!==p?.historyVersion||time<this.time;
  // A raster temporal gap is not a transport change; the path key checks exact camera/scene changes.
  const filterReset=pathReset||!this.projection.equals(base)||position.distanceTo(this.position)>Math.max(1,camera.near*100)||direction.dot(this.direction)<.5;const reset=filterReset||time-this.time>.25;
  this.objects.begin(reset);if(reset)this.index=0;let jitter=[0,0];
  if(taa){this.index++;const x=(halton(this.index,2)-.5)*2/width,y=(halton(this.index,3)-.5)*2/height;jitter=[x*.5,y/(zeroToOne?-2:2)];camera.projectionMatrix.premultiply(new Matrix4().set(1,0,0,x,0,1,0,y,0,0,1,0,0,0,0,1));camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();}
  const vp=new Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);if(zeroToOne&&camera.coordinateSystem!==2001)vp.premultiply(new Matrix4().set(1,0,0,0,0,1,0,0,0,0,.5,.5,0,0,0,1));
  const packed=packedScreenEffects(p);packed.temporal[3]=reset?0:1;packed.pathFilter[2]=filterReset?0:1;
  const result={...packed,jitter:[...jitter,...(reset?jitter:this.jitter)],inverseVP:vp.clone().invert().toArray(),currentVP:vp.toArray(),previousVP:((packed.path[0]>0?filterReset:reset)?vp:this.previous).toArray(),eye:[...position.toArray(),camera.isOrthographicCamera?1:0],forward:[...direction.toArray(),0],coordinates:zeroToOne?[1,0,-2,1]:[2,-1,2,-1],size:[width,height]};
  const restore=()=>{camera.projectionMatrix.copy(base);camera.projectionMatrixInverse.copy(base).invert();};
  return {packed:result,objects:this.objects,suspend:()=>{restore();this.objects.end(false);},end:(success=true)=>{restore();this.objects.end(success);this.valid=success;this.taa=taa;this.jitter=jitter;this.previous.copy(vp);this.projection.copy(base);this.position.copy(position);this.direction.copy(direction);Object.assign(this,{camera,scene,width,height,time,version:p?.historyVersion});},reset,pathReset,filterReset};
 }
 reset(){this.valid=false;this.objects.clear();}
}

// Shared GLSL/HLSL ray marching and history resolve; misses retain the existing probe/environment result.
export const screenEffectsGLSL=`
vec3 hbWorldAt(vec2 uv,float depth){vec4 q=hbInverseVP*vec4(uv.x*2.0-1.0,uv.y*hbCoordinates.z+hbCoordinates.w,depth*hbCoordinates.x+hbCoordinates.y,1.0);return q.xyz/q.w;}
vec3 hbProject(vec3 p,mat4 vp){vec4 q=vp*vec4(p,1.0);vec3 ndc=q.xyz/q.w;return vec3(ndc.x*.5+.5,(ndc.y-hbCoordinates.w)/hbCoordinates.z,(ndc.z-hbCoordinates.y)/hbCoordinates.x);}
bool hbInside(vec3 p){return p.x>0.0&&p.x<1.0&&p.y>0.0&&p.y<1.0&&p.z>0.0&&p.z<1.0;}
${meshDistanceFieldGLSL}
${hierarchyGLSL}
${geometryGIGLSL}
${pathTracingGLSL}
${pathDenoiseGLSL}
vec4 hbRay(vec3 p,vec3 direction){float steps=hbIndirect.y,stepSize=hbReflection.z/steps,previousDifference=-1.0;
 for(int i=1;i<=64;i++){if(float(i)>steps)break;if(float(i+3)<=steps&&hbEmptySegment(hbProject(p+direction*(float(i-1)*stepSize),hbCurrentVP),hbProject(p+direction*(float(i+3)*stepSize),hbCurrentVP))){i+=3;previousDifference=-1.0;continue;}float distance=float(i)*stepSize;vec3 at=hbProject(p+direction*distance,hbCurrentVP);if(!hbInside(at))break;float d=texture2D(hbScreenDepth,at.xy).r;if(d>=.99999){previousDifference=-1.0;continue;}float difference=hbLinearDepth(at.z)-hbLinearDepth(d);
  if(difference>0.0){
   if(previousDifference<=0.0&&hbIndirect.z>0.0){float loDistance=distance-stepSize,hiDistance=distance;
    for(int j=0;j<min(8,int(hbIndirect.z));j++){float mid=(loDistance+hiDistance)*.5;vec3 probe=hbProject(p+direction*mid,hbCurrentVP);float sceneDepth=texture2D(hbScreenDepth,probe.xy).r;if(sceneDepth<.99999&&hbLinearDepth(probe.z)>hbLinearDepth(sceneDepth))hiDistance=mid;else loDistance=mid;}
    distance=hiDistance;at=hbProject(p+direction*distance,hbCurrentVP);d=texture2D(hbScreenDepth,at.xy).r;difference=hbLinearDepth(at.z)-hbLinearDepth(d);
   }
   if(d<.99999&&difference>0.0&&difference<hbReflection.w){vec3 n=texture2D(hbSurfaceNormal,at.xy).xyz*2.0-1.0;if(dot(n,n)<.5||dot(n,direction)<-.05){float border=min(min(at.x,1.0-at.x),min(at.y,1.0-at.y));return vec4(texture2D(hbScreenSource,at.xy).rgb,smoothstep(0.0,max(.000001,hbIndirect.w),border)*(1.0-distance/hbReflection.z));}}
  }
  previousDifference=difference;
 }return vec4(0.0,0.0,0.0,0.0);
}

#ifdef HB_PATH_ONLY
vec4 hbScreenResolve(vec2 uv){return hbPathResolve(uv);}
#else
vec4 hbScreenResolve(vec2 uv){
#ifndef HB_RAY_NO_PATH
if(hbPath.x>.5)return hbPathResolve(uv);
#endif
vec4 original=texture2D(hbScreenSource,uv);float depth=texture2D(hbScreenDepth,uv).r;vec3 c=original.rgb,p=hbWorldAt(uv,depth);vec4 nr=texture2D(hbSurfaceNormal,uv),am=texture2D(hbSurfaceAlbedo,uv);vec3 n=nr.xyz*2.0-1.0;
 if(depth<.99999&&dot(n,n)>.5){n=normalize(n);vec3 incident=hbEye.w>.5?hbForward.xyz:normalize(p-hbEye.xyz);vec3 start=p+n*min(.05,hbReflection.w*.25);
  if(hbAmbientAO.z>0.0&&hbAmbientAO.w>0.0)c-=texture2D(hbSurfaceAmbient,uv).rgb*hbDFAmbient(p,n);
  if(hbAmbientAO.z>0.0&&hbAmbientAO.w==0.0){float z=hbLinearDepth(depth),occ=0.0;float radius=max(1.0,hbAmbientAO.x*hbScreenSize.y*hbCamera.w/(hbCamera.z>.5?1.0:max(z,.01)));vec2 delta=vec2(radius,radius)/hbScreenSize;for(int i=0;i<8;i++){float a=float(i)*.785398163,other=hbLinearDepth(texture2D(hbScreenDepth,clamp(uv+vec2(cos(a),sin(a))*delta,0.0,1.0)).r),d=z-other;occ+=step(hbAmbientAO.y,d)*(1.0-smoothstep(0.0,hbAmbientAO.x*2.0,d));}c-=texture2D(hbSurfaceAmbient,uv).rgb*clamp(occ*.125*hbAmbientAO.z,0.0,1.0);}
  if(hbReflection.x>0.0&&nr.w<hbReflection.y){vec4 hit=hbRay(start,reflect(incident,n));vec3 f0=mix(vec3(.04,.04,.04),am.rgb,am.a),f=f0+(1.0-f0)*pow(1.0-max(0.0,dot(n,-incident)),5.0);float fade=1.0-smoothstep(hbReflection.y*.75,hbReflection.y,nr.w);c=mix(c,c*(1.0-f)+hit.rgb*f,hit.a*hbReflection.x*fade);}
#ifndef HB_RAY_NO_GI
  if(hbGeometry.x>0.0&&hbGeometryInfo.z>0.0)c+=hbGeometryIndirect(p,n)*am.rgb*(1.0-am.a)*hbGeometry.x*.318309886;
#endif
  if(hbIndirect.x>0.0){vec3 tangent=normalize(cross(n,abs(n.z)<.9?vec3(0.0,0.0,1.0):vec3(0.0,1.0,0.0))),bitangent=cross(n,tangent),sum=vec3(0.0,0.0,0.0);for(int i=0;i<4;i++){float a=float(i)*1.570796327+.392699;vec3 direction=normalize(n*.70710678+(tangent*cos(a)+bitangent*sin(a))*.70710678);vec4 hit=hbRay(start,direction);sum+=hit.rgb*hit.a;}c+=sum*.25*am.rgb*(1.0-am.a)*hbIndirect.x;}
 }
 vec3 previous=hbProject(p,hbPreviousVP);bool reuse=hbTemporal.w>.5;
 if(hbMotion.w>.5){vec4 objectMotion=texture2D(hbObjectMotion,uv);if(objectMotion.a>1.5&&abs(objectMotion.a-2.0-depth)<.002)previous=vec3(uv-hbJitter.xy+hbJitter.zw,depth);else if(abs(abs(objectMotion.a)-depth)<.001&&abs(objectMotion.a)>.000001){if(objectMotion.a<0.0)reuse=false;else previous=objectMotion.xyz;}}
 if(reuse&&depth<.99999&&hbInside(previous)){
  if(hbMotion.x>0.0){vec2 velocity=(uv-previous.xy-hbJitter.xy+hbJitter.zw)*hbMotion.x;float size=length(velocity);velocity*=min(1.0,hbMotion.y/max(size,.000001));vec3 sum=c;float total=1.0;for(int i=1;i<16;i++){if(float(i)>=hbMotion.z)break;vec2 at=clamp(uv+velocity*(float(i)/max(1.0,hbMotion.z-1.0)-.5),0.0,1.0);float d=texture2D(hbScreenDepth,at).r;if(abs(hbLinearDepth(d)-hbLinearDepth(depth))<max(.05,hbLinearDepth(depth)*.02)){sum+=texture2D(hbScreenSource,at).rgb;total+=1.0;}}c=sum/total;}
  if(hbTemporal.x>0.0){vec4 old=texture2D(hbScreenHistory,previous.xy);float expected=hbLinearDepth(previous.z),difference=abs(exp2(old.a)-expected);if(difference<max(.02,expected*hbTemporal.z)){vec3 lo=c,hi=c;for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){vec3 neighbor=texture2D(hbScreenSource,clamp(uv+vec2(float(x),float(y))/hbScreenSize,0.0,1.0)).rgb+c-original.rgb;lo=min(lo,neighbor);hi=max(hi,neighbor);}c=mix(c,clamp(old.rgb,lo,hi),hbTemporal.x*hbTemporal.y);}}
 }
 return vec4(max(vec3(0.0,0.0,0.0),c),log2(hbLinearDepth(depth)));
}
#endif
`;

export function installSurfaceOutputs(scene,ambient=false){scene.traverse(object=>{for(const material of Array.isArray(object.material)?object.material:[object.material]){if(!material)continue;if(material.userData.hbAmbientOutput!==ambient){material.userData.hbAmbientOutput=ambient;material.needsUpdate=true;}if(material.userData.hbSurfaceOutputs)continue;material.userData.hbSurfaceOutputs=true;const compile=material.onBeforeCompile,key=material.customProgramCacheKey();material.onBeforeCompile=(shader,renderer)=>{compile.call(material,shader,renderer);shader.fragmentShader=(material.userData.hbAmbientOutput?'layout(location=3) out vec4 hbSurfaceAmbientOutput;':'')+'layout(location=1) out vec4 hbSurfaceNormalOutput;layout(location=2) out vec4 hbSurfaceAlbedoOutput;\n'+shader.fragmentShader;const lit=(material.isMeshStandardMaterial||material.isMeshPhysicalMaterial)&&!material.transparent;shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>','#include <opaque_fragment>\n'+(lit?'hbSurfaceNormalOutput=vec4(inverseTransformDirection(normal,viewMatrix)*.5+.5,roughnessFactor);hbSurfaceAlbedoOutput=vec4(diffuseColor.rgb,metalnessFactor);':'hbSurfaceNormalOutput=vec4(.5,.5,.5,1.0);hbSurfaceAlbedoOutput=vec4(0.0);'));if(material.userData.hbAmbientOutput){shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>','#include <opaque_fragment>\nhbSurfaceAmbientOutput='+ (lit?'vec4(reflectedLight.indirectDiffuse+reflectedLight.indirectSpecular,1.0);\n#ifdef USE_SHEEN\nhbSurfaceAmbientOutput.rgb=hbSurfaceAmbientOutput.rgb*sheenEnergyComp+sheenSpecularIndirect;\n#endif\n#ifdef USE_CLEARCOAT\nhbSurfaceAmbientOutput.rgb=hbSurfaceAmbientOutput.rgb*(1.0-material.clearcoat*Fcc)+clearcoatSpecularIndirect*material.clearcoat;\n#endif':'vec4(0.0);'));if(lit&&material.fog!==false){shader.fragmentShader=shader.fragmentShader.replace('#include <fog_fragment>','#include <fog_fragment>\n#ifdef USE_FOG\nhbSurfaceAmbientOutput.rgb*=1.0-fogFactor;\n#endif').replace('gl_FragColor.rgb=mix(gl_FragColor.rgb,fogColor,hbFog);','gl_FragColor.rgb=mix(gl_FragColor.rgb,fogColor,hbFog); hbSurfaceAmbientOutput.rgb*=1.0-hbFog;').replace('gl_FragColor.rgb=mix(gl_FragColor.rgb,fogColor,fogFactor);','gl_FragColor.rgb=mix(gl_FragColor.rgb,fogColor,fogFactor); hbSurfaceAmbientOutput.rgb*=1.0-fogFactor;');}}};material.customProgramCacheKey=()=>key+':hb-screen-surface-v2:'+material.userData.hbAmbientOutput;material.needsUpdate=true;}});}
