// Light paths are evaluated on the GPU; finite-radius density estimation is intentionally biased.
export const pathCausticBoundaryGLSL=`bool hbCausticBoundary(vec4 p){return (p.y<.05&&(p.z>.5||p.x>.5))||p.z*(1.0-p.x)>.99999||p.x>.99999;}`;
export const pathCausticsGLSL=`
vec4 hbPathPhoton(float index,float field){
#ifdef HB_PATH_NO_CAUSTICS
return vec4(0,0,0,0);
#else
float triangles=(hbGeometryLimits.z-hbGeometryInfo.w)/6.0,sources=hbGeometryLimits.w+hbPathQuality.z+(hbPathMap.y>.5&&hbPathOptions.x>0.0?1.0:0.0);float targets=hbPathCausticTargets.z>.5?hbPathCausticTargets.y:triangles;if(sources<.5||targets<.5)return vec4(0,0,0,0);
 float randomBase=index*113.71+hbPath.w*131.17+731.0,choice=min(targets-1.0,floor(hbPathRandom(randomBase+31.0)*targets)),target=hbPathCausticTargets.z>.5?hbGeometryLoad(hbPathCausticTargets.x+floor(choice/4.0))[int(choice-floor(choice/4.0)*4.0)]:choice;if(target<0.0||target>=triangles||target!=floor(target))return vec4(0,0,0,0);float at=hbGeometryInfo.w+target*6.0,r=sqrt(hbPathRandom(randomBase+32.0)),v=hbPathRandom(randomBase+33.0);vec3 e1=hbGeometryVertexLoad(at+1.0).xyz,e2=hbGeometryVertexLoad(at+2.0).xyz,aim=hbGeometryVertexLoad(at).xyz+e1*r*(1.0-v)+e2*r*v;vec4 targetPhysical=hbRayField0Lod(target,aim,hbRayGeometric(target),0.0);if(!hbCausticBoundary(targetPhysical))return vec4(0,0,0,0);
 float light=floor(hbPathRandom(randomBase+34.0)*sources);vec3 direction=vec3(0,0,-1),origin=vec3(0,0,0),flux=vec3(0,0,0);float area=length(cross(e1,e2))*.5;
 #ifdef HB_RAY_NO_ANALYTIC_LIGHTS
 if(false){}
 #else
 if(light<hbGeometryLimits.w){float base=hbGeometryLimits.z+light*4.0;vec4 p=hbGeometryLoad(base),d=hbGeometryLoad(base+1.0),c=hbGeometryLoad(base+2.0),cone=hbGeometryLoad(base+3.0);direction=p.w<.5?-normalize(d.xyz):normalize(aim-p.xyz);origin=p.w<.5?aim-direction*hbGeometry.y:p.xyz;flux=c.rgb*c.w;float distance=length(aim-origin);if(p.w>.5){flux/=max(pow(distance,cone.z),.01);if(d.w>0.0)flux*=pow(clamp(1.0-pow(distance/d.w,4.0),0.0,1.0),2.0);if(p.w>1.5)flux*=smoothstep(cone.x,max(cone.x+.00001,cone.y),dot(direction,normalize(d.xyz)));}}
#endif
#ifndef HB_RAY_NO_EMITTERS
 else if(light<hbGeometryLimits.w+hbPathQuality.z){float emitter=hbGeometryLoad(hbPathQuality.y+light-hbGeometryLimits.w).x,base=hbGeometryInfo.w+emitter*6.0,r=sqrt(hbPathRandom(randomBase+41.0)),v=hbPathRandom(randomBase+42.0);vec3 a=hbGeometryVertexLoad(base+1.0).xyz,b=hbGeometryVertexLoad(base+2.0).xyz,p=hbGeometryVertexLoad(base).xyz+a*r*(1.0-v)+b*r*v;float distance=length(aim-p);if(distance<=hbGeometryLimits.y*4.0)return vec4(0,0,0,0);direction=(aim-p)/distance;vec4 color=hbRayField1Lod(emitter,p,direction,0.0);if(color.w<hbRayCutoff(emitter))return vec4(0,0,0,0);flux=hbRayField2Lod(emitter,p,direction,0.0).rgb*color.w*(length(cross(a,b))*.5*abs(dot(hbRayGeometric(emitter),direction))/(distance*distance));origin=p+direction*hbGeometryLimits.y*2.0;}
#endif
 else{vec4 d=hbEnvironmentDirection(randomBase+43.0);if(d.w<=0.0)return vec4(0,0,0,0);direction=-d.xyz;origin=aim-direction*hbGeometry.y;flux=hbEnvironment(d.xyz).rgb/d.w;}
 flux*=area*abs(dot(hbRayGeometric(target),direction))*targets*sources;float ids[16];vec4 media[16];int count;hbMediumSeed(origin,direction,false,ids,media,count);bool scattered=false;
 for(int bounce=0;bounce<min(16,int(hbPath.y));bounce++){if(count<0)break;vec4 hit=hbGeometryTrace(origin,direction,hbGeometry.y+hbGeometryLimits.y*4.0);if(hit.z<.5||hit.w<.5||(bounce==0&&hit.y!=target))break;if(count>0)flux*=exp(-media[clamp(count-1,0,15)].rgb*hit.x);vec3 p=origin+direction*hit.x,n=hbRayNormalLod(hit.y,p,-direction,0.0);bool front=dot(hbRayGeometric(hit.y),direction)<0.0;if(!front)n=-n;vec4 physical=hbRayField0Lod(hit.y,p,-direction,0.0),color=hbRayField1Lod(hit.y,p,-direction,0.0);
  if(!hbCausticBoundary(physical)){if(scattered)return field<.5?vec4(p,hit.y+1.0):vec4(flux,front?1.0:-1.0);break;}
  if(physical.z>.5){float volume=hbMediumID(hit.y),incoming=count>0?media[clamp(count-1,0,15)].w:1.0,outgoing=front?physical.w:1.0;if(volume>0.0&&!front){int found=-1;for(int j=0;j<count;j++)if(ids[j]==volume)found=j;if(found<0)break;if(found!=count-1)outgoing=incoming;else if(count>1)outgoing=media[clamp(count-2,0,15)].w;}if(volume<.5){incoming=front?1.0:physical.w;outgoing=front?physical.w:1.0;}float ratio=incoming/max(.000001,outgoing);vec3 view=-direction,h=n;bool rough=physical.y>=.05&&abs(ratio-1.0)>.0001;
#ifdef HB_PATH_ROUGH_DIELECTRIC
if(rough)h=hbPathVisibleNormal(n,view,hbPathFrame(n),vec2(physical.y*physical.y,physical.y*physical.y),hbPathRandom(randomBase+36.0+float(bounce)*7.13)*6.283185307,hbPathRandom(randomBase+37.0+float(bounce)*7.13));
#endif
vec3 next=refract(direction,h,ratio);bool reflected=dot(next,next)<.000001||hbPathRandom(randomBase+35.0+float(bounce)*7.13)<hbDielectricFresnel(max(0.0,dot(h,view)),ratio);next=reflected?reflect(direction,h):normalize(next);if((dot(n,next)>0.0)!=reflected)break;flux*=physical.z*(1.0-physical.x);
#ifdef HB_PATH_ROUGH_DIELECTRIC
if(rough){float nv=dot(n,view),nl=abs(dot(n,next));if(nv<=0.0||nl<=.000001)break;float a2=pow(physical.y,4.0),gv=hbPathSmith(nv,a2),gl=hbPathSmith(nl,a2);flux*=gl/max(.000001,gv+gl-gv*gl);}
#endif
direction=normalize(next);if(!reflected){if(volume>0.0)hbMediumChange(volume,hbMediumValueLod(hit.y,p,-direction,0.0),front,ids,media,count);else flux*=hbPathAbsorption(hit.y,p,direction,0.0);}}
  else{vec3 view=-direction,h=n;if(physical.y>=.05)h=hbPathVisibleNormal(n,view,hbPathFrame(n),vec2(physical.y*physical.y,physical.y*physical.y),hbPathRandom(randomBase+36.0+float(bounce)*7.13)*6.283185307,hbPathRandom(randomBase+37.0+float(bounce)*7.13));vec3 beforeMetal=flux,f0=mix(vec3(.04,.04,.04),color.rgb,physical.x);flux*=f0+(vec3(1,1,1)-f0)*pow(1.0-max(0.0,dot(h,view)),5.0);direction=reflect(direction,h);if(dot(n,direction)<=0.0)break;if(physical.y>=.05){
#ifdef HB_PATH_ADVANCED
float nv=dot(n,view),nl=dot(n,direction),nh=max(0.0,dot(n,h)),a2=pow(physical.y,4.0),den=nh*nh*(a2-1.0)+1.0,d=a2/max(.000000000001,3.141592654*den*den),pdf=d*hbPathSmith(nv,a2)/(4.0*max(.000001,nv));vec4 value=hbPathSurfaceBRDF(n,view,direction,color.rgb,physical.x,physical.y,hit.y,p,0.0);if(pdf<=.000000001)break;flux=beforeMetal*value.rgb*(nl/pdf);
#else
flux*=hbPathSmith(dot(n,direction),pow(physical.y,4.0));
#endif
}}if(dot(n,direction)*dot(hbRayGeometric(hit.y),direction)*(front?1.0:-1.0)<=0.0)break;scattered=true;origin=p+direction*hbGeometryLimits.y*2.0;
 }
return vec4(0,0,0,0);
#endif
}
vec4 hbCausticLoad(float index){
#ifdef HB_WEBGL_RAY_DATA
return texelFetch(hbPathPhotonScene,ivec2(index-floor(index/128.0)*128.0,floor(index/128.0)),0);
#else
return hbPathPhotonScene.SampleLevel(linearClamp,(vec2(index-floor(index/128.0)*128.0,floor(index/128.0))+.5)/vec2(128,16),0);
#endif
}
vec3 hbPathCaustic(vec3 point,vec3 normal,float receiver,float seed,float width){
#ifdef HB_PATH_NO_CAUSTICS
return vec3(0,0,0);
#else
vec3 sum=vec3(0,0,0);if(hbPathCaustics.x<.5||hbPathCaustics.w<=0.0)return sum;vec4 physical=hbRayField0Lod(receiver,point,normal,width);if(physical.x>.5||physical.z>.5)return sum;float radius=hbPathCaustics.z;
for(int sampleIndex=0;sampleIndex<min(64,int(hbPathCaustics.y));sampleIndex++){float index=floor(hbPathRandom(seed+float(sampleIndex)*113.71+81.0)*1024.0);vec4 position=hbCausticLoad(index),flux=hbCausticLoad(index+1024.0);if(position.w<=0.0)continue;vec3 delta=position.xyz-point,n=hbRayGeometric(position.w-1.0)*flux.w;float d=dot(delta,delta);if(d<radius*radius&&abs(dot(delta,normal))<radius*.05&&dot(n,normal)>.95)sum+=flux.rgb*(2.0*(1.0-d/(radius*radius))/(3.141592654*radius*radius));}
return sum*(hbPathCaustics.w/max(1.0,hbPathCaustics.y))*hbRayField1Lod(receiver,point,normal,width).rgb*((1.0-physical.x)*(1.0-physical.z)/3.141592654);
#endif
}
`;
