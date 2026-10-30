import {rayTextureSampling} from './texture-sampling-mode.js';
// Specialize actual min/mag filtering before driver compilation of nested BVH programs.
export function rayTextureVariants(source,variants){
 const a=source.indexOf('vec4 hbRayTextureLevel('),b=source.indexOf('vec4 hbRayTexture(float'),end=source.indexOf('vec4 hbRaySmooth(',b),level=source.slice(a,b),sample=source.slice(b,end);
 const block=(s,token)=>{const at=s.indexOf(token);if(at<0)throw Error('Ray texture specialization');const start=at+token.length;let depth=1,next=start;while(depth){if(s[next]==='{')depth++;if(s[next]==='}')depth--;next++;}return {at,start,end:next,body:s.slice(start,next-1)};};
 const entries=new Map(variants.map(v=>{const [kind,flags]=Array.isArray(v)?v:[v,0];return [kind+'Filter'+flags,[kind,flags]];}));
 return [...entries].map(([key,[kind,flags]])=>{
  const sampling=rayTextureSampling(kind,flags),mag=sampling.filter%2,mode=Math.floor(sampling.filter/2),min=[1,3,5].includes(mode)?1:0;
  let l=level.replaceAll('hbRayTextureLevel','hbRayTextureLevel'+key).replace(',float kind','').replace('kind>1.5&&kind<2.5?z*descriptor.w-.5:z',kind===2?'z*descriptor.w-.5':'z');const volume=block(l,'if(kind>1.5&&kind<2.5){');l=l.slice(0,volume.at)+(kind===2?volume.body:'')+l.slice(volume.end);
  if(mag===min){const nearest='if(nearest>.5)return hbRayTexel(descriptor,wrap,floor(at+vec3(.5,.5,.5)));';if(mag)l=l.slice(0,l.indexOf(nearest))+'return hbRayTexel(descriptor,wrap,floor(at+vec3(.5,.5,.5)));}\n';else l=l.replace(nearest,'');}
  let s=sample.replace('hbRayTexture(','hbRayTextureKind'+key+'(').replace(',float kind','').replaceAll('hbRayTextureLevel','hbRayTextureLevel'+key).replaceAll(',z,kind,spatial',',z,spatial');const cube=block(s,'if(kind>2.5){'),other=block(s.slice(cube.end),'else{');s=s.slice(0,cube.at)+(kind===3?cube.body:other.body)+s.slice(cube.end+other.end);
  s=s.replaceAll('kind>1.5?dx.z:0.0',kind===2?'dx.z':'0.0').replaceAll('kind>1.5?dy.z:0.0',kind===2?'dy.z':'0.0').replace('if(kind>1.5)z=clamp(coordinate.z,0.0,1.0);else if(kind>.5)z=floor(index+.5);',kind===2?'z=clamp(coordinate.z,0.0,1.0);':kind===1?'z=floor(index+.5);':'');
  if(sampling.tagged){s=s.replace(',vec3 dx,vec3 dy)',',vec3 controlX,vec3 controlY,vec3 dx,vec3 dy)');if(sampling.mode==='gradient'){const body=s.indexOf('{');s=s.slice(0,body)+s.slice(body).replace(/\bdx\b/g,'controlX').replace(/\bdy\b/g,'controlY');}}
  const rawLOD=sampling.tagged?(sampling.mode==='lod'?'(controlX.x-residentBase)':sampling.mode==='bias'?'(log2(max(.000000000001,rho))+clamp(controlX.x,-16.0,15.99))':'log2(max(1.0,rho))'):kind===3?'(index-residentBase)':'log2(max(1.0,rho))';
  const start=s.indexOf('float rho='),stop=s.indexOf('if(srgb>.5',start),spatial=mag===min?mag+'.0':'('+(sampling.tagged?rawLOD+'>0.0':kind===3?rawLOD+'>0.0':'rho>1.0')+'?'+min+'.0:'+mag+'.0)',lod=mode===0||mode===5?'0.0':'clamp('+rawLOD+',0.0,max(0.0,my.w-1.0))';
  const firstSample='hbRayTextureLevel'+key+'(pointer,first,wrap,uv,z,spatial)',samples=mode===3||mode===4?'float blend=fract(lod);vec4 result=vec4(0,0,0,0);for(int mipIndex=0;mipIndex<1+(blend>0.0?1:0);mipIndex++){vec4 sampleValue=hbRayTextureLevel'+key+'(pointer,min(first+float(mipIndex),max(0.0,my.w-1.0)),wrap,uv,z,spatial);if(mipIndex==0)result=sampleValue;else result=mix(result,sampleValue,blend);}':'vec4 result='+firstSample+';';
  s=s.slice(0,start)+'float rho=max(length(derivativeX*descriptor.yzw),length(derivativeY*descriptor.yzw)),lod='+lod+',spatial='+spatial+';uv=vec2(hbRayWrap(uv.x,wrap.x),hbRayWrap(uv.y,wrap.y));'+(mode===1||mode===2?'lod=floor(lod+.5);':'')+'float first=floor(lod);'+samples+s.slice(stop);
  return l+s;
 }).join('\n');
}

// Cutout visibility keeps level0 detail and a small BVH candidate shader.
export const rayTextureAlphaGLSL=`vec4 hbRayTextureAlpha(float pointer,vec3 coordinate,float index,float srgb,float kind,float nearest){vec4 descriptor=hbGeometryLoad(pointer),wrap=hbGeometryLoad(pointer+1.0),mx=hbGeometryLoad(pointer+2.0),my=hbGeometryLoad(pointer+3.0);nearest=hbRayMod(nearest,2.0);vec2 uv=coordinate.xy;float z=0.0;
 if(kind>2.5){vec3 d=coordinate,ad=abs(d);float axis=max(max(ad.x,ad.y),ad.z);if(axis<.000001)d=vec3(0,0,1);ad=abs(d);if(ad.x>=ad.y&&ad.x>=ad.z){z=d.x>0.0?0.0:1.0;uv=vec2(d.x>0.0?-d.z:d.z,-d.y)/max(ad.x,.000001);}else if(ad.y>=ad.z){z=d.y>0.0?2.0:3.0;uv=vec2(d.x,d.y>0.0?d.z:-d.z)/max(ad.y,.000001);}else{z=d.z>0.0?4.0:5.0;uv=vec2(d.z>0.0?d.x:-d.x,-d.y)/max(ad.z,.000001);}uv=uv*.5+.5;}
 else{uv=vec2(dot(mx.xyz,vec3(uv,1)),dot(my.xyz,vec3(uv,1)));if(wrap.z>.5)uv.y=1.0-uv.y;if(kind>1.5)z=clamp(coordinate.z,0.0,1.0)*descriptor.w-.5;else if(kind>.5)z=floor(index+.5);}
 uv=vec2(hbRayWrap(uv.x,wrap.x),hbRayWrap(uv.y,wrap.y));vec3 at=vec3(uv*descriptor.yz-.5,z);vec4 result;
 if(nearest>.5)result=hbRayTexel(descriptor,wrap,floor(at+vec3(.5,.5,.5)));else{vec3 first=floor(at),weight=fract(at);vec4 lo=mix(mix(hbRayTexel(descriptor,wrap,first),hbRayTexel(descriptor,wrap,first+vec3(1,0,0)),weight.x),mix(hbRayTexel(descriptor,wrap,first+vec3(0,1,0)),hbRayTexel(descriptor,wrap,first+vec3(1,1,0)),weight.x),weight.y);if(kind>1.5&&kind<2.5){vec4 hi=mix(mix(hbRayTexel(descriptor,wrap,first+vec3(0,0,1)),hbRayTexel(descriptor,wrap,first+vec3(1,0,1)),weight.x),mix(hbRayTexel(descriptor,wrap,first+vec3(0,1,1)),hbRayTexel(descriptor,wrap,first+vec3(1,1,1)),weight.x),weight.y);result=mix(lo,hi,weight.z);}else result=lo;}
 if(srgb>.5&&my.w<.5)result.rgb=mix(result.rgb/12.92,pow(max((result.rgb+.055)/1.055,vec3(0,0,0)),vec3(2.4,2.4,2.4)),step(vec3(.04045,.04045,.04045),result.rgb));return result;
}
`;
