import {environmentAngleGLSL} from './environment-angle.js';
export const pathEnvironmentGLSL=environmentAngleGLSL+`
vec4 hbEnvironmentLoad(float index){float count=hbPathMap.y*hbPathMap.z,total=hbPathOptions.z>.5?hbPathMap.x:count+ceil(count*.5),width=min(4096.0,total),height=ceil(total/width);return texture2D(hbPathEnvironmentScene,(vec2(index-floor(index/width)*width,floor(index/width))+.5)/vec2(width,height));}
float hbEnvironmentBase(){return hbPathOptions.z>.5?0.0:hbPathMap.x;}
vec2 hbEnvironmentUV(vec3 d){return vec2(fract(((dot(d.xz,d.xz)<1e-12?0.0:hbEnvironmentAtan2(d.z,d.x))-hbPathMap.w)*.159154943+.5),hbEnvironmentAtan2(length(d.xz),d.y)*.318309886);}
vec3 hbEnvironmentCell(vec4 meta,vec2 cell){cell.x-=floor(cell.x/meta.y)*meta.y;cell.y=clamp(cell.y,0.0,meta.z-1.0);return hbEnvironmentLoad(meta.x+cell.y*meta.y+cell.x).rgb;}
vec3 hbEnvironmentLevel(vec2 uv,float level){vec4 meta=hbEnvironmentLoad(hbPathOptions.z+level);vec2 position=uv*meta.yz-.5,cell=floor(position),f=fract(position);vec3 first=mix(hbEnvironmentCell(meta,cell),hbEnvironmentCell(meta,cell+vec2(1,0)),f.x),last=mix(hbEnvironmentCell(meta,cell+vec2(0,1)),hbEnvironmentCell(meta,cell+vec2(1,1)),f.x),result=mix(first,last,f.y);if(meta.w>.5&&uv.y*meta.z<.5)result=mix(hbEnvironmentLoad(meta.w).rgb,first,uv.y*meta.z*2.0);if(meta.w>.5&&(1.0-uv.y)*meta.z<.5)result=mix(hbEnvironmentLoad(meta.w+1.0).rgb,last,(1.0-uv.y)*meta.z*2.0);return result;}
vec4 hbEnvironmentLod(vec3 d,float spread){
#ifdef HB_RAY_NO_ENV
return vec4(hbPathEnvironment.rgb,0.0);
#else
if(hbPathMap.y<.5)return vec4(hbPathEnvironment.rgb,0.0);vec2 uv=hbEnvironmentUV(d);float id=floor(uv.y*hbPathMap.z)*hbPathMap.y+floor(uv.x*hbPathMap.y);vec4 v=hbEnvironmentLoad(hbEnvironmentBase()+min(id,hbPathMap.y*hbPathMap.z-1.0));
if(hbPathOptions.z>.5){float latitude=max(.00001,length(d.xz)/max(length(d),1e-30)),footprint=max(spread*hbPathMap.y*.159154943/latitude,spread*hbPathMap.z*.318309886),last=floor(log2(max(hbPathMap.y,hbPathMap.z))),lod=clamp(log2(max(1.0,footprint)),0.0,last),level=floor(lod);v.rgb=mix(hbEnvironmentLevel(uv,level),hbEnvironmentLevel(uv,min(last,level+1.0)),fract(lod));}return vec4(v.rgb*hbPathOptions.x,v.a);
#endif
}
vec4 hbEnvironment(vec3 d){return hbEnvironmentLod(d,0.0);}
vec4 hbEnvironmentDirection(float seed){float count=hbPathMap.y*hbPathMap.z;if(count<.5)return vec4(0,1,0,0);float choice=hbPathRandom(seed+21.0)*count,index=floor(choice);vec4 cell=hbEnvironmentLoad(hbEnvironmentBase()+count+floor(index*.5));vec2 alias=index-floor(index*.5)*2.0<.5?cell.xy:cell.zw;if(fract(choice)>=alias.x)index=alias.y;float y=floor(index/hbPathMap.y),x=index-y*hbPathMap.y,phi=((x+hbPathRandom(seed+22.0))/hbPathMap.y-.5)*6.283185307+hbPathMap.w,cosine=mix(cos(3.141592654*y/hbPathMap.z),cos(3.141592654*(y+1.0)/hbPathMap.z),hbPathRandom(seed+23.0)),sine=sqrt(max(0.0,1.0-cosine*cosine));return vec4(sine*cos(phi),cosine,sine*sin(phi),hbEnvironmentLoad(hbEnvironmentBase()+index).a);}
vec3 hbEnvironmentDirect(vec3 point,vec3 n,vec3 view,float id,float seed,float width,float spread,float ratio){
#ifdef HB_RAY_NO_ENV
return vec3(0,0,0);
#else
if(hbPathMap.y<.5||hbPathOptions.x<=0.0)return vec3(0,0,0);vec4 sampleDirection=hbEnvironmentDirection(seed);vec3 d=sampleDirection.xyz;float cosine=abs(dot(n,d)),pdf=sampleDirection.w;if(cosine<=0.0||pdf<=0.0)return vec3(0,0,0);vec4 p=hbRayField0Lod(id,point,view,width),b=hbPathBSDF(n,view,d,hbRayField1Lod(id,point,view,width).rgb,p.x,max(.02,p.y),id,point,width,ratio);float opaque=1.0-p.z*(1.0-p.x);vec3 visible=hbPathLightVisibility(point+d*hbGeometryLimits.y*2.0,d,hbGeometry.y,width);if(hbGeometryLoad(hbTransport.x+id*2.0+1.0).y<.5)visible=vec3(1,1,1);return hbEnvironmentLod(d,spread).rgb*b.rgb*visible*(cosine/pdf)*hbPathMIS(pdf,b.a);
#endif
}
`;
