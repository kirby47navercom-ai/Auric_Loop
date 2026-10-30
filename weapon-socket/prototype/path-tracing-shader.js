import {pathCausticsGLSL,pathCausticBoundaryGLSL} from './path-caustics-shader.js';
import {normalFootprintGLSL} from './path-normal-footprint.js';
import {pathMicrofacetGLSL} from './path-microfacet-shader.js';
import {pathSurfaceGLSL} from './path-surface-shader.js';
import {pathMediaGLSL} from './path-media-shader.js';
import {pathEnvironmentGLSL} from './path-environment-shader.js';
// shortcut: thin boundaries retain legacy tint; add two-interface thin sheets when physical sheet transport is required.
export const pathCameraConeGLSL=`vec2 hbRayCameraCone(vec2 at){vec3 near=hbWorldAt(at,0.0),far=hbWorldAt(at,.9999),nx=hbWorldAt(at+vec2(1.0/hbScreenSize.x,0),0.0),ny=hbWorldAt(at+vec2(0,1.0/hbScreenSize.y),0.0);if(hbEye.w>.5)return vec2(max(length(nx-near),length(ny-near)),0);vec3 d=normalize(far-hbEye.xyz),dx=normalize(hbWorldAt(at+vec2(1.0/hbScreenSize.x,0),.9999)-hbEye.xyz),dy=normalize(hbWorldAt(at+vec2(0,1.0/hbScreenSize.y),.9999)-hbEye.xyz);return vec2(0,max(length(dx-d),length(dy-d)));}`;
export const pathTracingGLSL=`
${pathCausticBoundaryGLSL}
${normalFootprintGLSL}
float hbPathRandom(float seed){return fract(sin(seed*12.9898+78.233)*43758.5453);}
${pathMediaGLSL}
vec3 hbPathAbsorption(float triangle,vec3 point,vec3 direction,float width){float base=hbTransport.x+triangle*2.0,at=hbGeometryInfo.w+triangle*6.0;vec4 absorption=hbRayField4Lod(triangle,point,-direction,width);float thickness=hbRayField2Lod(triangle,point,-direction,width).w,cosine=max(.05,abs(dot(hbGeometryVertexLoad(at+3.0).xyz,direction)));return absorption.w>0.0?pow(max(absorption.rgb,vec3(.000001,.000001,.000001)),vec3(1,1,1)*(thickness/(absorption.w*cosine))):vec3(1,1,1);}
vec3 hbPathTransmissionFilter(float triangle,vec3 point,vec3 direction,float width){float at=hbGeometryInfo.w+triangle*6.0;vec4 color=hbRayField1Lod(triangle,point,-direction,width),physical=hbRayField0Lod(triangle,point,-direction,width);float metal=physical.x,transmission=physical.z*(1.0-metal);return transmission>0.0?hbPathAbsorption(triangle,point,direction,width)*transmission:(1.0-color.w)*mix(vec3(1,1,1),clamp(color.rgb,0.0,1.0),color.w);}
vec3 hbGeometryVisibilityLod(vec3 origin,vec3 direction,float distance,float width){vec3 result=vec3(1,1,1);float left=distance;float ids[16];vec4 media[16];int count;hbMediumSeed(origin,direction,true,ids,media,count);if(count<0)return vec3(0,0,0);
 for(int layer=0;layer<min(64,int(hbTransport.w));layer++){vec4 hit=hbGeometryTraceCone(origin,direction,left,vec2(width,0));if(hit.w<.5)return vec3(0,0,0);if(count>0)result*=exp(-media[clamp(count-1,0,15)].rgb*(hit.z>.5?hit.x:left));if(hit.z<.5)return result;if(hbTransport.y<.5)return vec3(0,0,0);float base=hbTransport.x+hit.y*2.0;bool castsShadow=hbGeometryLoad(base+1.0).x>.5;if(castsShadow){if(hbTransport.z<.5)return vec3(0,0,0);float volume=hbMediumID(hit.y);vec3 point=origin+direction*hit.x;if(volume>0.0){vec4 p=hbRayField0Lod(hit.y,point,-direction,width);result*=p.z*(1.0-p.x);hbMediumChange(volume,hbMediumValueLod(hit.y,point,-direction,width),dot(hbRayGeometric(hit.y),direction)<0.0,ids,media,count);if(count<0)return vec3(0,0,0);}else result*=hbPathTransmissionFilter(hit.y,point,direction,width);if(max(max(result.x,result.y),result.z)<.00001)return vec3(0,0,0);}float advance=hit.x+hbGeometryLimits.y*2.0;origin+=direction*advance;left-=advance;if(left<=0.0)return result;
 }return vec3(0,0,0);
}
// The photon estimate owns light -> smooth specular -> diffuse paths when enabled.
vec3 hbPathLightVisibility(vec3 origin,vec3 direction,float distance,float width){vec3 visible=hbGeometryVisibilityLod(origin,direction,distance,width);
#ifndef HB_PATH_NO_CAUSTICS
if(hbPathCaustics.x>.5&&hbPathCaustics.w>0.0){vec4 hit=hbGeometryTrace(origin,direction,distance);if(hit.z>.5&&hbGeometryLoad(hbTransport.x+hit.y*2.0+1.0).x>.5){vec4 p=hbRayField0Lod(hit.y,origin+direction*hit.x,-direction,width);if(hbCausticBoundary(p)&&p.z>.5)visible=vec3(0,0,0);}}
#endif
return visible;}
vec3 hbGeometryVisibility(vec3 origin,vec3 direction,float distance){return hbGeometryVisibilityLod(origin,direction,distance,0.0);}
vec3 hbPathFresnel(vec3 f0,float cosine){return f0+(vec3(1,1,1)-f0)*pow(clamp(1.0-cosine,0.0,1.0),5.0);}
float hbPathSmith(float cosine,float a2){return 2.0*cosine/max(.000001,cosine+sqrt(a2+(1.0-a2)*cosine*cosine));}
vec4 hbPathBRDF(vec3 n,vec3 view,vec3 light,vec3 albedo,float metal,float roughness){float nl=max(0.0,dot(n,light)),nv=max(.000001,dot(n,view));vec3 halfVector=normalize(view+light);float nh=max(0.0,dot(n,halfVector)),vh=max(.000001,dot(view,halfVector)),alpha=roughness*roughness,a2=alpha*alpha,den=nh*nh*(a2-1.0)+1.0,d=a2/max(.000000000001,3.141592654*den*den),probability=.25+.5*metal;vec3 f=hbPathFresnel(mix(vec3(.04,.04,.04),albedo,metal),vh),value=albedo*(1.0-metal)*(vec3(1,1,1)-f)*.318309886+f*(d*hbPathSmith(nl,a2)*hbPathSmith(nv,a2)/max(.000001,4.0*nl*nv));return vec4(value,nl*.318309886*(1.0-probability)+probability*d*hbPathSmith(nv,a2)/(4.0*nv));}
${pathMicrofacetGLSL}
${pathSurfaceGLSL}
vec4 hbPathBSDF(vec3 n,vec3 view,vec3 light,vec3 albedo,float metal,float rough,float id,vec3 point,float width,float ratio){vec3 geometric=hbRayGeometric(id);if(dot(n,view)<=0.0||((dot(geometric,view)*dot(geometric,light)>0.0)!=(dot(n,light)>0.0)))return vec4(0,0,0,0);float transmission=hbRayField0Lod(id,point,view,width).z*(1.0-metal);vec4 value=vec4(0,0,0,0);if(dot(n,light)>0.0)value=hbPathSurfaceBRDF(n,view,light,albedo,metal,rough,id,point,width)*(1.0-transmission);
#ifdef HB_PATH_ROUGH_DIELECTRIC
if(transmission>0.0&&rough>=.05&&abs(ratio-1.0)>.0001)value+=hbPathDielectric(n,view,light,rough,ratio,hbMediumID(id)>0.0?ratio*ratio:1.0)*transmission;
#endif
return value;}

vec3 hbPathDirect(vec3 point,vec3 n,vec3 view,float triangle,float width,float ratio,float seed){
#ifdef HB_RAY_NO_ANALYTIC_LIGHTS
 return vec3(0,0,0);
#else
float at=hbGeometryInfo.w+triangle*6.0;vec3 albedo=hbRayField1Lod(triangle,point,view,width).rgb;vec4 physical=hbRayField0Lod(triangle,point,view,width);float metal=physical.x,roughness=max(.02,physical.y),transmission=physical.z*(1.0-metal);vec3 result=vec3(0,0,0);
 for(int light=0;light<int(hbLightBudget());light++){vec2 choice=hbSelectLight(float(light),seed);float base=hbGeometryLimits.z+choice.x*4.0;vec4 p=hbGeometryLoad(base),d=hbGeometryLoad(base+1.0),c=hbGeometryLoad(base+2.0),cone=hbGeometryLoad(base+3.0);vec3 delta=p.xyz-point;float distance=length(delta),attenuation=1.0;vec3 direction=p.w<.5?normalize(d.xyz):delta/max(distance,.000001);if(p.w>.5){attenuation=1.0/max(pow(distance,cone.z),.01);if(d.w>0.0)attenuation*=pow(clamp(1.0-pow(distance/d.w,4.0),0.0,1.0),2.0);if(p.w>1.5)attenuation*=smoothstep(cone.x,max(cone.x+.00001,cone.y),dot(-direction,normalize(d.xyz)));}float cosine=abs(dot(n,direction));if(cosine>0.0&&attenuation>0.0){vec3 visibility=hbGeometryVisibilityLod(point+direction*hbGeometryLimits.y*2.0,direction,p.w<.5?hbGeometry.y:max(0.0,distance-hbGeometryLimits.y*2.0),width);if(cone.w<.5||hbGeometryLoad(hbTransport.x+triangle*2.0+1.0).y<.5)visibility=vec3(1,1,1);
#ifndef HB_PATH_NO_CAUSTICS
else if(hbPathCaustics.x>.5&&hbPathCaustics.w>0.0){vec4 blocker=hbGeometryTrace(point+direction*hbGeometryLimits.y*2.0,direction,p.w<.5?hbGeometry.y:max(0.0,distance-hbGeometryLimits.y*2.0));if(blocker.z>.5&&hbGeometryLoad(hbTransport.x+blocker.y*2.0+1.0).x>.5){vec4 surface=hbRayField0Lod(blocker.y,point+direction*(blocker.x+hbGeometryLimits.y*2.0),-direction,width);if(hbCausticBoundary(surface)&&surface.z>.5)visibility=vec3(0,0,0);}}
#endif
result+=hbPathBSDF(n,view,direction,albedo,metal,roughness,triangle,point,width,ratio).rgb*c.rgb*c.w*(cosine*attenuation*choice.y)*visibility;}
 }return result;

#endif
}

float hbPathEmissionPDF(float triangle,vec3 from,vec3 point,vec3 direction,float width){
#ifdef HB_RAY_NO_EMITTERS
return 0.0;
#else
float at=hbGeometryInfo.w+triangle*6.0;vec3 emission=hbRayField2Lod(triangle,point,-direction,width).rgb;if(hbPathQuality.z<.5||max(max(emission.x,emission.y),emission.z)<=0.0)return 0.0;float area=length(cross(hbGeometryVertexLoad(at+1.0).xyz,hbGeometryVertexLoad(at+2.0).xyz))*.5,cosine=abs(dot(hbGeometryVertexLoad(at+3.0).xyz,-direction));vec3 delta=point-from;return dot(delta,delta)/max(.000000000001,area*cosine*hbPathQuality.z);
#endif
}
float hbPathMIS(float first,float second){float a=first*first,b=second*second;return a/max(.000000000000000001,a+b);}
vec3 hbPathEmissiveDirect(vec3 point,vec3 n,vec3 view,float triangle,float seed,float width,float ratio){
#ifdef HB_RAY_NO_EMITTERS
return vec3(0,0,0);
#else
if(hbPathQuality.z<.5)return vec3(0,0,0);float emitter=hbGeometryLoad(hbPathQuality.y+floor(hbPathRandom(seed+12.0)*hbPathQuality.z)).x,base=hbGeometryInfo.w+emitter*6.0;vec3 a=hbGeometryVertexLoad(base).xyz,e1=hbGeometryVertexLoad(base+1.0).xyz,e2=hbGeometryVertexLoad(base+2.0).xyz;float u=sqrt(hbPathRandom(seed+13.0)),v=hbPathRandom(seed+14.0);vec3 lightPoint=a+e1*(u*(1.0-v))+e2*(u*v),delta=lightPoint-point;float distance=length(delta);vec3 direction=delta/max(distance,.000001);float cosine=abs(dot(n,direction)),lightCosine=abs(dot(hbGeometryLoad(base+3.0).xyz,-direction));if(cosine<=0.0||lightCosine<=.000001||distance<=hbGeometryLimits.y*4.0)return vec3(0,0,0);vec4 physical=hbRayField0Lod(triangle,point,view,width),lightColor=hbRayField1Lod(emitter,lightPoint,-direction,width);float metal=physical.x,transmission=physical.z*(1.0-metal),pdf=hbPathEmissionPDF(emitter,point,lightPoint,direction,width);if(lightColor.w<hbRayCutoff(emitter))return vec3(0,0,0);vec4 brdf=hbPathBSDF(n,view,direction,hbRayField1Lod(triangle,point,view,width).rgb,metal,max(.02,physical.y),triangle,point,width,ratio);vec3 visible=hbPathLightVisibility(point+direction*hbGeometryLimits.y*2.0,direction,distance-hbGeometryLimits.y*4.0,width);if(hbGeometryLoad(hbTransport.x+triangle*2.0+1.0).y<.5)visible=vec3(1,1,1);return brdf.rgb*(cosine/max(.000000000001,pdf))*hbRayField2Lod(emitter,lightPoint,-direction,width).rgb*lightColor.w*visible*hbPathMIS(pdf,brdf.a);
#endif
}
${pathEnvironmentGLSL}
${pathCausticsGLSL}
vec3 hbPathSample(vec3 origin,vec3 direction,float seed,vec2 initialCone){float width=initialCone.x,spread=initialCone.y;vec3 radiance=vec3(0,0,0),throughput=vec3(1,1,1),previousPoint=origin;float previousPDF=0.0,etaSurvival=1.0;bool deltaBounce=true,diffuseSeen=false,causticChain=false;float ids[16];vec4 media[16];int count;hbMediumSeed(origin,direction,false,ids,media,count);if(count<0)return vec3(0,0,0);
 for(int bounce=0;bounce<min(16,int(hbPath.y));bounce++){vec4 hit=hbGeometryTraceCone(origin,direction,hbGeometry.y,vec2(width,spread));if(hit.w<.5)break;if(count>0)throughput*=exp(-media[clamp(count-1,0,15)].rgb*(hit.z>.5?hit.x:hbGeometry.y));if(hit.z<.5){vec4 e=hbEnvironmentLod(direction,spread);radiance+=throughput*e.rgb*(causticChain&&hbPathCaustics.x>.5&&hbPathCaustics.w>0.0?0.0:1.0)*(deltaBounce?1.0:hbPathMIS(previousPDF,e.a));break;}width+=spread*hit.x;float at=hbGeometryInfo.w+hit.y*6.0;vec3 point=origin+direction*hit.x,normal=hbRayNormalLod(hit.y,point,-direction,width);bool front=dot(hbRayGeometric(hit.y),direction)<0.0;vec3 n=front?normal:-normal;vec4 color=hbRayField1Lod(hit.y,point,-direction,width),physical=hbRayField0Lod(hit.y,point,-direction,width);float metal=physical.x,roughness=max(.02,physical.y),transmission=physical.z*(1.0-metal),ior=physical.w;
#ifdef HB_PATH_NO_TRANSMISSION
transmission=0.0;
#endif
float randomBase=seed+float(bounce)*23.17;
  if(hbPathRandom(randomBase+1.0)>color.w){origin=point+direction*hbGeometryLimits.y*2.0;continue;}
  float volume=hbMediumID(hit.y),incoming=count>0?media[clamp(count-1,0,15)].w:1.0,outgoing=front?ior:1.0;if(volume>0.0&&!front){int found=-1;for(int j=0;j<count;j++)if(ids[j]==volume)found=j;if(found<0)break;outgoing=found==count-1?(count>1?media[clamp(count-2,0,15)].w:1.0):incoming;}if(volume<.5){incoming=front?1.0:ior;outgoing=front?ior:1.0;}float ratio=incoming/max(.000001,outgoing);float emissionWeight=causticChain&&hbPathCaustics.x>.5&&hbPathCaustics.w>0.0?0.0:deltaBounce?1.0:hbPathMIS(previousPDF,hbPathEmissionPDF(hit.y,previousPoint,point,direction,width));float photonWeight=1.0;
#ifndef HB_PATH_NO_CAUSTICS
photonWeight=hbCausticBoundary(physical)&&(diffuseSeen||causticChain)&&hbPathCaustics.x>.5&&hbPathCaustics.w>0.0?0.0:1.0;
#endif
radiance+=throughput*(hbRayField2Lod(hit.y,point,-direction,width).rgb*emissionWeight+hbPathDirect(point,n,-direction,hit.y,width,ratio,randomBase)+hbPathEmissiveDirect(point,n,-direction,hit.y,randomBase,width,ratio)+hbEnvironmentDirect(point,n,-direction,hit.y,randomBase,width,spread,ratio)+hbPathCaustic(point,n,hit.y,randomBase,width))*photonWeight;previousPoint=point;if(hbCausticBoundary(physical)){if(diffuseSeen)causticChain=true;}else{diffuseSeen=metal<=.5&&transmission<=.5;causticChain=false;}
  float choose=hbPathRandom(randomBase+2.0),u=hbPathRandom(randomBase+3.0),angle=hbPathRandom(randomBase+4.0)*6.283185307;
#if defined(HB_PATH_NORMAL_FOOTPRINT) && HB_PATH_NORMAL_FOOTPRINT > 0
vec3 footprintView=-direction;bool footprintActive=false,footprintCoat=false;
#endif
  if(choose<transmission){
#if defined(HB_PATH_NORMAL_FOOTPRINT) && HB_PATH_NORMAL_FOOTPRINT > 0
footprintActive=true;
#endif
#ifdef HB_PATH_ROUGH_DIELECTRIC
if(roughness>=.05&&abs(ratio-1.0)>.0001){vec3 view=-direction,h=hbPathVisibleNormal(n,view,hbPathFrame(n),vec2(roughness*roughness,roughness*roughness),angle,hbPathRandom(randomBase+5.0));float f=hbDielectricFresnel(max(0.0,dot(view,h)),ratio);vec3 refracted=refract(direction,h,ratio),outgoingDirection=u<f||dot(refracted,refracted)<.000001?reflect(direction,h):normalize(refracted);bool transmitted=!(u<f||dot(refracted,refracted)<.000001);if(transmitted?dot(n,outgoingDirection)>=0.0:dot(n,outgoingDirection)<=0.0)break;vec4 value=hbPathBSDF(n,view,outgoingDirection,color.rgb,metal,roughness,hit.y,point,width,ratio);float cosine=abs(dot(n,outgoingDirection));if(value.a<=.000000001||dot(hbRayGeometric(hit.y),outgoingDirection)*(front?1.0:-1.0)*(transmitted?-1.0:1.0)<=0.0)break;throughput*=value.rgb*(cosine/value.a);previousPDF=value.a;deltaBounce=false;direction=normalize(outgoingDirection);spread=min(1.57,spread+roughness*roughness*.5);if(transmitted){if(volume>0.0){hbMediumChange(volume,hbMediumValueLod(hit.y,point,-direction,width),front,ids,media,count);if(count<0)break;etaSurvival/=ratio*ratio;}else throughput*=hbPathAbsorption(hit.y,point,direction,width);}}
else
#endif
{deltaBounce=true;float f0=pow((incoming-outgoing)/(incoming+outgoing),2.0),f=volume>0.0?hbDielectricFresnel(max(0.0,dot(n,-direction)),ratio):f0+(1.0 - f0)*pow(1.0-max(0.0,dot(n,-direction)),5.0);vec3 refracted=refract(direction,n,ratio);if(u<f||dot(refracted,refracted)<.000001)direction=reflect(direction,n);else{float inCosine=abs(dot(n,direction));direction=normalize(refracted);spread=min(1.57,spread*ratio*inCosine/max(.01,abs(dot(n,direction))));if(volume>0.0){hbMediumChange(volume,hbMediumValueLod(hit.y,point,-direction,width),front,ids,media,count);if(count<0)break;throughput*=ratio*ratio;etaSurvival/=ratio*ratio;}else throughput*=hbPathAbsorption(hit.y,point,direction,width);} }}

  else{deltaBounce=false;
#ifdef HB_PATH_ADVANCED
vec4 lobe=hbPathDirection(hit.y,point,n,direction,metal,roughness,u,angle,hbPathRandom(randomBase+5.0),hbPathRandom(randomBase+6.0),width);vec3 outgoing=lobe.xyz;if(lobe.w<0.0)spread=max(spread,.5);else spread=min(1.57,spread+lobe.w);
#if defined(HB_PATH_NORMAL_FOOTPRINT) && HB_PATH_NORMAL_FOOTPRINT > 0
footprintActive=lobe.w>=0.0;float footprintAt=hbRayAttributes(hit.y);if(footprintActive&&footprintAt>0.0&&hbGeometryLoad(footprintAt+1.0).w>9.5)footprintCoat=u<.25*hbRayField5Lod(hit.y,point,footprintView,width).x;
#endif
#else
vec3 outgoing;if(u<.25+.5*metal){float radius=hbPathRandom(randomBase+5.0),alpha=roughness*roughness;vec3 halfVector=hbPathVisibleNormal(n,-direction,hbPathFrame(n),vec2(alpha,alpha),angle,radius);outgoing=reflect(direction,halfVector);spread=min(1.57,spread+roughness*roughness*.5);
#if defined(HB_PATH_NORMAL_FOOTPRINT) && HB_PATH_NORMAL_FOOTPRINT > 0
footprintActive=true;
#endif
}else{outgoing=hbGeometryHemisphere(n,angle,hbPathRandom(randomBase+6.0));spread=max(spread,.5);}
#endif
float cosine=dot(n,outgoing);if(cosine<=0.0)break;if(dot(hbRayGeometric(hit.y),outgoing)*(front?1.0:-1.0)<=0.0)break;vec4 brdf=hbPathBSDF(n,-direction,outgoing,color.rgb,metal,roughness,hit.y,point,width,ratio);previousPDF=brdf.a;throughput*=brdf.rgb*(cosine/max(.000001,brdf.a));direction=normalize(outgoing);}
#if defined(HB_PATH_NORMAL_FOOTPRINT) && HB_PATH_NORMAL_FOOTPRINT > 0
if(footprintActive){vec3 center=normal;
#ifdef HB_PATH_ADVANCED
if(footprintCoat)center=hbRayCoatNormalLod(hit.y,point,footprintView,width);
#endif
spread=min(1.57,spread+hbRayNormalFootprint(hit.y,point,footprintView,width,center,ratio,choose>=transmission||dot(n,direction)>=0.0,footprintCoat,false));}
#endif
  origin=point+direction*hbGeometryLimits.y*2.0;if(bounce>=2){float survival=clamp(max(max(throughput.x,throughput.y),throughput.z)*etaSurvival,.05,.95);if(hbPathRandom(randomBase+7.0)>survival)break;throughput/=survival;}
 }return clamp(radiance,vec3(0,0,0),vec3(hbPathEnvironment.w,hbPathEnvironment.w,hbPathEnvironment.w));
}
${pathCameraConeGLSL}
vec4 hbPathResolve(vec2 uv){vec4 old=texture2D(hbScreenHistory,uv);float count=hbPath.w;if(count>=hbPath.z)return old;float number=min(hbPathQuality.x,hbPath.z-count);vec3 sum=vec3(0,0,0);
 for(int sampleIndex=0;sampleIndex<min(4,int(number));sampleIndex++){float seed=dot(floor(uv*hbScreenSize),vec2(17.719,113.13))+(count+float(sampleIndex))*131.17;vec2 at=uv+(vec2(hbPathRandom(seed),hbPathRandom(seed+9.0))-.5)/hbScreenSize;vec3 nearPoint=hbWorldAt(at,0.0),farPoint=hbWorldAt(at,.9999),origin=hbEye.w>.5?nearPoint:hbEye.xyz,direction=normalize(farPoint-origin);
  if(hbPathLens.x>0.0&&hbEye.w<.5){vec3 forward=normalize(hbForward.xyz),right=normalize(hbWorldAt(at+vec2(.01,0),0.0)-nearPoint),up=normalize(cross(right,forward));float radius=sqrt(hbPathRandom(seed+10.0))*hbPathLens.x,angle=hbPathRandom(seed+11.0)*6.283185307;vec3 focal=origin+direction*(hbPathLens.y/max(.000001,dot(direction,forward)));origin+=(right*cos(angle)+up*sin(angle))*radius;direction=normalize(focal-origin);}
  sum+=hbPathSample(origin,direction,seed,hbRayCameraCone(at));
 }return vec4((sum+(count>0.0?old.rgb*count:vec3(0,0,0)))/(count+number),count+number);
}
`;
