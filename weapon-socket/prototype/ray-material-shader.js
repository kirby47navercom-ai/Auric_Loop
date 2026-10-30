import {rayStaticChannel} from './ray-channel-layout.js';
import {pruneGeneratedRayOperands} from './ray-program-operands.js';
import {checkerGLSL} from './procedural-material.js';
import {rayBarycentricOffsetGLSL} from './ray-barycentric-offset.js';
import {guardRayDifferentialLibrary} from './ray-differential-library.js';
import {rayDifferentialExpression,rayDifferentialAxis,rayDifferentialGLSL,rayDifferentialExpressions} from './ray-program-differentials.js';
import {normalMapGLSL} from './normal-map.js';
import {previousRayNormalGLSL,previousRayFieldsGLSL,previousRayCoatNormalGLSL} from './ray-previous-context.js';
import {rayGuidePreviousFields,rayPreviousProgramRequired} from './ray-surface-history-context.js';
import {rayUVFootprintGLSL} from './ray-uv-footprint.js';
import {rayOutputInstructions} from './ray-program-liveness.js';
import {rayTextureVariants} from './ray-texture-shader.js';
import {rayVaryingCoordinateInstructions,rayTextureNeedsFootprint} from './ray-mip.js';
import {rayOperations,rayProgramFieldMask} from './ray-materials.js';
// All numeric graph operations use the persisted material graph's order and casts.
export const rayOperationExpressions={constant:'value',uv:'vec4(uv,0,0)',time:'vec4((timeContext.y>.5?timeContext.x:value.x),(timeContext.y>.5?timeContext.x:value.x),(timeContext.y>.5?timeContext.x:value.x),(timeContext.y>.5?timeContext.x:value.x))',worldPosition:'vec4(point,0)',worldNormal:'vec4(normal,0)',viewDirection:'vec4(view,0)',channel:'vec4(a[int(value.x)],a[int(value.x)],a[int(value.x)],a[int(value.x)])',combine:'vec4(a.x,b.x,c.x,d.x)',texture:'hbRayTexture(value.x,a.xyz,b.x,value.y,value.z,value.w,aX.xyz,aY.xyz)',add:'a+b',subtract:'a-b',multiply:'a*b',divide:'a/mix(vec4(.000001,.000001,.000001,.000001),b,step(vec4(.000001,.000001,.000001,.000001),abs(b)))',power:'pow(max(a,vec4(0,0,0,0)),b)',min:'min(a,b)',max:'max(a,b)',step:'step(a,b)',lerp:'mix(a,b,c.x)',clamp:'clamp(a,b,c)',saturate:'clamp(a,0.0,1.0)',oneMinus:'vec4(1,1,1,1)-a',normalize:'meta.w<1.5?vec4(sign(a.x),sign(a.x),sign(a.x),sign(a.x)):a/max(length(a),.000001)',sine:'sin(a)',absolute:'abs(a)',fraction:'fract(a)',dot:'vec4(dot(a.xyz,b.xyz),dot(a.xyz,b.xyz),dot(a.xyz,b.xyz),dot(a.xyz,b.xyz))',length:'meta.w<1.5?vec4(abs(a.x),abs(a.x),abs(a.x),abs(a.x)):vec4(length(a),length(a),length(a),length(a))',normalMap:'vec4(hbDecodeNormalMap(a.xyz,b.x),0)',cosine:'cos(a)',floor:'floor(a)',ceil:'ceil(a)',squareRoot:'sqrt(max(a,vec4(0,0,0,0)))',sign:'sign(a)',exp2:'exp2(a)',log2:'log2(max(a,vec4(.000001,.000001,.000001,.000001)))',smoothstep:'hbRaySmooth(a,b,c)',distance:'vec4(length(a.xyz-b.xyz),length(a.xyz-b.xyz),length(a.xyz-b.xyz),length(a.xyz-b.xyz))',cross:'vec4(cross(a.xyz,b.xyz),0)',reflect:'vec4(reflect(a.xyz,normalize(b.xyz)),0)',fresnel:'vec4(c.x+(1.0-c.x)*pow(1.0-clamp(dot(normalize(a.xyz),normalize(b.xyz)),0.0,1.0),max(c.x,.0001)))',noise:'vec4(hbRayNoise(a.xy*b.x))',checker:'vec4('+checkerGLSL('a.xy','b.xy','hbRayMod')+')',radialGradient:'vec4(clamp(1.0-length(a.xy-b.xy)/max(c.x,.000001),0.0,1.0))',linearGradient:'vec4(clamp(dot(a.xy-vec2(.5,.5),vec2(cos(b.x),sin(b.x)))+.5,0.0,1.0))',tilingOffset:'a*b+c',panner:'a+b*c.x',rotateUV:'vec4(hbRayRotate(a.xy,b.x,c.xy),0,0)',cast:'a',eyeUV:'vec4(a.xy-b.xy/max(abs(b.z),.1)*max(c.x,0.0)*clamp(d.x,0.0,1.0),0,0)'};
const operations=rayOperationExpressions;operations.fresnel='vec4(d.x+(1.0-d.x)*pow(1.0-clamp(dot(normalize(a.xyz),normalize(b.xyz)),0.0,1.0),max(c.x,.0001)))';
for(const key of ['fresnel','noise','checker','radialGradient','linearGradient'])operations[key]=operations[key].replace(/^vec4\((.*)\)$/s,'hbRayScalar($1)');
// Alpha visibility uses width0 and level0 gradients; keep cube explicit LOD,
// but never compile unrelated fields or coordinate differential graphs.
function rayProgramGLSLPass(programs,alpha=false,previous=false){let code=alpha||previous?'':rayTextureVariants(rayMaterialGLSL,programs.flatMap(p=>p.instructions.filter(i=>i[0]===9).map(i=>[i[8],i[10]])));if(!alpha&&programs.some(p=>{const needed=rayVaryingCoordinateInstructions(p.instructions);return p.instructions.some((i,n)=>i[0]===1&&needed.has(n));}))code+=rayUVFootprintGLSL;for(const p of programs){const live=alpha?rayOutputInstructions(p.instructions):null,needed=alpha?new Set():rayVaryingCoordinateInstructions(p.instructions,live),declared=new Set(),derived=new Set(),derivativeDefinitions=new Map();const uses=op=>p.instructions.some((i,n)=>(!live||live.has(n))&&i[0]===op),varies=op=>[...needed].some(n=>p.instructions[n][0]===op);let body=(varies(1)?'vec2 uv,uvX,uvY;hbRayUVFootprint(id,point,view,width,uv,uvX,uvY);':uses(1)?'vec2 uv=hbRayUV(id,point);':'')+(uses(4)?'vec3 normal=hbRaySmoothNormal(id,point);':'');if([3,4].some(varies))body+='vec3 pointX=hbRayOffset(id,view,width,0.0),pointY=hbRayOffset(id,view,width,1.0);';if(varies(4))body+='vec3 normalX=hbRaySmoothNormalOffset(id,point,pointX)-normal,normalY=hbRaySmoothNormalOffset(id,point,pointY)-normal;';p.instructions.forEach((i,index)=>{if(live&&!live.has(index))return;const [op,dest,size]=i,channel=rayStaticChannel(i),context=i.slice(4,8).map(r=>r<0?'vec4(0,0,0,0)':'r'+r);body+='{vec4 value=hbGeometryLoad(pointer+'+(index*3+2)+'.0),meta=vec4('+i.slice(0,4).map(n=>n+'.0').join(',')+'),a='+context[0]+',b='+context[1]+',c='+context[2]+',d='+context[3]+';';if(op===8){for(let channel=i[8];channel<i[8]+i[9];channel++)body+='result['+channel+']=a['+(i[10]<2?0:channel-i[8])+']*value.z;';}else{let expression=channel===null?operations[rayOperations[op]]:'vec4(a.'+'xyzw'[channel]+')';if(op===9){if(i[10]>=64)expression=expression.replace(',aX.xyz,aY.xyz)',',c.xyz,d.xyz,aX.xyz,aY.xyz)');body+='vec4 aX='+(alpha||!derivativeDefinitions.get(i[4])||!rayTextureNeedsFootprint(i)?'vec4(0,0,0,0)':'rX'+i[4])+',aY='+(alpha||!derivativeDefinitions.get(i[4])||!rayTextureNeedsFootprint(i)?'vec4(0,0,0,0)':'rY'+i[4])+';';expression=(expression.replace('hbRayTexture(','hbRayTextureKind'+i[8]+'Filter'+i[10]+'(').replace(',value.z','')).replace('value.y',i[9]+'.0').replace('value.w',i[10]+'.0');}body+='vec4 v='+expression+';';const trim=name=>size===1?name+'=vec4('+Array(4).fill(name+'.x').join(',')+');':size===2?name+'.zw=vec2(0,0);':size===3?name+'.w=0.0;':'';body+=trim('v')+'r'+dest+'=v;';declared.add(dest);if(needed.has(index)){derived.add(dest);for(const axis of ['X','Y']){const expr=rayDifferentialAxis(channel===null?rayDifferentialExpression(rayOperations[op],expression):'vec4(aDelta.'+'xyzw'[channel]+')',axis);body+='{';for(let j=0;j<4;j++)body+='vec4 '+String.fromCharCode(97+j)+axis+'='+(!derivativeDefinitions.get(i[j+4])?'vec4(0,0,0,0)':'r'+axis+i[j+4])+';';body+='vec4 v'+axis+'='+expr+';'+trim('v'+axis)+'r'+axis+dest+'=v'+axis+';}';}}derivativeDefinitions.set(dest,needed.has(index));}body+='}';});code+='vec4 hbRayProgram'+p.key+'(float pointer,float id,vec3 point,vec3 view,vec4 result,float width,vec2 timeContext){'+[...declared].map(r=>'vec4 r'+r+'=vec4(0,0,0,0);').join('')+[...derived].flatMap(r=>['X','Y'].map(a=>'vec4 r'+a+r+'=vec4(0,0,0,0);')).join('')+pruneGeneratedRayOperands(body)+'return result;}\n';}code+='vec4 hbRayExecuteFieldTime(float field,float key,float pointer,float id,vec3 point,vec3 view,vec4 result,float width,vec2 timeContext){';for(const p of programs){const mask=rayProgramFieldMask(p),condition=mask===1023?'':'(field<-.5'+Array.from({length:10},(_,i)=>mask&(1<<i)?'||field=='+i+'.0':'').join('')+')&&';code+='if('+condition+'key=='+p.key+'.0)return hbRayProgram'+p.key+'(pointer,id,point,view,result,width,timeContext);';}code+='return result;}vec4 hbRayExecuteTime(float key,float pointer,float id,vec3 point,vec3 view,vec4 result,float width,vec2 timeContext){return hbRayExecuteFieldTime(-1.0,key,pointer,id,point,view,result,width,timeContext);}vec4 hbRayExecute(float key,float pointer,float id,vec3 point,vec3 view,vec4 result,float width){return hbRayExecuteTime(key,pointer,id,point,view,result,width,vec2(0,0));}';return alpha?code.replace(/\bhbRayProgram(?=\d)/g,'hbRayProgramAlpha').replace(/\bhbRayExecute/g,'hbRayExecuteAlpha'):code;}
export const rayNormalTimeRequired=programs=>programs.some(p=>(rayProgramFieldMask(p)&8)&&p.instructions.some(i=>i[0]===2));
export function rayProgramGLSL(programs){return rayGuidePreviousFields(programs).map(field=>'#define HB_RAY_SURFACE_HISTORY_'+field+' 1\n').join('')+(rayNormalTimeRequired(programs)?'#define HB_RAY_NORMAL_TIME 1\n':'')+'vec4 hbRayExecuteAlphaFieldTime(float field,float key,float pointer,float id,vec3 point,vec3 view,vec4 result,float width,vec2 timeContext);\n'+rayProgramGLSLPass(programs)+rayProgramGLSLPass(programs.filter(p=>rayProgramFieldMask(p)&2),true)+rayFixedFieldRuns(programs)+rayPreviousProgramsGLSL(programs);}
export function rayPreviousProgramsGLSL(programs){
 const selected=programs.filter(rayPreviousProgramRequired),all=rayProgramGLSLPass(selected,false,true),start=all.indexOf('vec4 hbRayProgram'),uv=all.includes('void hbRayUVFootprint(')?rayUVFootprintGLSL:'',normal=rayMaterialGLSL.slice(rayMaterialGLSL.indexOf('vec3 hbRayNormalContextLod('),rayMaterialGLSL.indexOf('vec3 hbRayNormalTimeLod('));
 return previousRayNormalGLSL((start<0?'':all.slice(start))+rayFixedFieldRuns(programs),normal,uv,previousRayFieldsGLSL(rayMaterialGLSL),new Set(selected.map(p=>p.key)))+previousRayCoatNormalGLSL(rayMaterialGLSL);
}
function rayFixedFieldRuns(programs){return Array.from({length:10},(_,field)=>'vec4 hbRayRunField'+field+'(float id,vec3 point,vec3 view,float material,vec4 result,float width,vec2 timeContext){vec4 program=hbGeometryLoad(material+'+(field*2+1)+'.0);if(program.y<.5)return result;'+programs.filter(p=>rayProgramFieldMask(p)&(1<<field)).map(p=>'if(program.w=='+p.key+'.0)return hbRayProgram'+p.key+'(program.x,id,point,view,result,width,timeContext);').join('')+'return result;}').join('\n');}
export const rayMaterialGLSL=`${normalMapGLSL}
${guardRayDifferentialLibrary(rayDifferentialGLSL,rayDifferentialExpressions,rayOperations)}
${rayBarycentricOffsetGLSL}
float hbRayMod(float a,float b){return a-b*floor(a/b);}
vec4 hbRayScalar(float v){return vec4(v,v,v,v);}
vec3 hbRayBary(float id,vec3 point){float at=hbGeometryInfo.w+id*6.0;vec3 origin,e1,e2;hbGeometryFrame(id,origin,e1,e2);vec3 delta=point-origin;vec2 weights=hbRayCoordinates(e1,e2,delta);return vec3(1.0-weights.x-weights.y,weights);}
float hbRayAttributes(float id){return hbTransport.y>1.5?hbGeometryLoad(hbTransport.x+id*2.0+1.0).z:0.0;}
float hbRayOwner(float id){float at=hbRayAttributes(id);if(at<=0.0)return -id-1.0;float owner=hbGeometryLoad(at+2.0).w;return owner>0.0?owner:-id-1.0;}
vec3 hbRayGeometric(float id){return normalize(hbGeometryRecord3(id).xyz);}
vec3 hbRaySmoothNormalOffset(float id,vec3 point,vec3 offset){float at=hbRayAttributes(id);vec3 normal=hbRayGeometric(id);if(at>0.0){vec3 b=hbRayBaryOffset(id,point,offset),candidate=hbGeometryLoad(at+2.0).xyz*b.x+hbGeometryLoad(at+3.0).xyz*b.y+hbGeometryLoad(at+4.0).xyz*b.z;if(dot(candidate,candidate)>.000001){candidate=normalize(candidate);normal=dot(normal,candidate)<0.0?-candidate:candidate;}}return normal;}
vec3 hbRaySmoothNormal(float id,vec3 point){return hbRaySmoothNormalOffset(id,point,vec3(0,0,0));}
vec2 hbRayUV(float id,vec3 point){float at=hbRayAttributes(id);if(at<=0.0)return vec2(0,0);vec3 b=hbRayBary(id,point);vec4 first=hbGeometryLoad(at);return first.xy*b.x+first.zw*b.y+hbGeometryLoad(at+1.0).xy*b.z;}
vec3 hbRayOffset(float id,vec3 view,float width,float axis){vec3 n=hbRayGeometric(id),t=cross(n,view);if(dot(t,t)<.000001)t=cross(n,abs(n.z)<.9?vec3(0,0,1):vec3(0,1,0));t=normalize(t);return axis<.5?t*width:cross(n,t)*(width/max(.01,abs(dot(n,view))));}
float hbRayWrap(float v,float mode){return mode<.5?clamp(v,0.0,1.0):mode<1.5?fract(v):1.0-abs(hbRayMod(v,2.0)-1.0);}
float hbRayIndex(float v,float extent,float mode){return mode<.5?clamp(v,0.0,extent-1.0):mode<1.5?hbRayMod(v,extent):min(hbRayMod(v,extent*2.0),extent*2.0-1.0-hbRayMod(v,extent*2.0));}
vec4 hbRayTexel(vec4 descriptor,vec4 wrap,vec3 coordinate){float x=hbRayIndex(coordinate.x,descriptor.y,wrap.x),y=hbRayIndex(coordinate.y,descriptor.z,wrap.y),z=clamp(coordinate.z,0.0,descriptor.w-1.0);return hbGeometryLoad(descriptor.x+x+(y+z*descriptor.z)*descriptor.y);}
vec3 hbRayCube(vec3 d){vec3 ad=abs(d);if(max(max(ad.x,ad.y),ad.z)<.000001)d=vec3(0,0,1);ad=abs(d);vec2 uv;float z;if(ad.x>=ad.y&&ad.x>=ad.z){z=d.x>0.0?0.0:1.0;uv=vec2(d.x>0.0?-d.z:d.z,-d.y)/max(ad.x,.000001);}else if(ad.y>=ad.z){z=d.y>0.0?2.0:3.0;uv=vec2(d.x,d.y>0.0?d.z:-d.z)/max(ad.y,.000001);}else{z=d.z>0.0?4.0:5.0;uv=vec2(d.z>0.0?d.x:-d.x,-d.y)/max(ad.z,.000001);}return vec3(uv*.5+.5,z);}
vec4 hbRayTextureLevel(float pointer,float level,vec4 wrap,vec2 uv,float z,float kind,float nearest){vec4 descriptor=hbGeometryLoad(pointer+4.0+level);if(hbGeometryLoad(pointer+3.0).w<.5)descriptor=hbGeometryLoad(pointer);vec3 at=vec3(uv*descriptor.yz-.5,kind>1.5&&kind<2.5?z*descriptor.w-.5:z);if(nearest>.5)return hbRayTexel(descriptor,wrap,floor(at+vec3(.5,.5,.5)));vec3 first=floor(at),weight=fract(at);vec4 lo=mix(mix(hbRayTexel(descriptor,wrap,first),hbRayTexel(descriptor,wrap,first+vec3(1,0,0)),weight.x),mix(hbRayTexel(descriptor,wrap,first+vec3(0,1,0)),hbRayTexel(descriptor,wrap,first+vec3(1,1,0)),weight.x),weight.y);if(kind>1.5&&kind<2.5){vec4 hi=mix(mix(hbRayTexel(descriptor,wrap,first+vec3(0,0,1)),hbRayTexel(descriptor,wrap,first+vec3(1,0,1)),weight.x),mix(hbRayTexel(descriptor,wrap,first+vec3(0,1,1)),hbRayTexel(descriptor,wrap,first+vec3(1,1,1)),weight.x),weight.y);return mix(lo,hi,weight.z);}return lo;}
vec4 hbRayTexture(float pointer,vec3 coordinate,float index,float srgb,float kind,float nearest,vec3 dx,vec3 dy){vec4 descriptor=hbGeometryLoad(pointer),wrap=hbGeometryLoad(pointer+1.0),mx=hbGeometryLoad(pointer+2.0),my=hbGeometryLoad(pointer+3.0);float residentBase=floor(my.w/256.0);my.w=hbRayMod(my.w,256.0);vec2 uv=coordinate.xy;float z=0.0;vec3 derivativeX=dx,derivativeY=dy;
 if(kind>2.5){vec3 c=hbRayCube(coordinate);uv=c.xy;z=c.z;derivativeX=vec3(hbRayCube(coordinate+dx).xy-uv,0);derivativeY=vec3(hbRayCube(coordinate+dy).xy-uv,0);}
 else{uv=vec2(dot(mx.xyz,vec3(uv,1)),dot(my.xyz,vec3(uv,1)));derivativeX=vec3(dot(mx.xy,dx.xy),dot(my.xy,dx.xy),kind>1.5?dx.z:0.0);derivativeY=vec3(dot(mx.xy,dy.xy),dot(my.xy,dy.xy),kind>1.5?dy.z:0.0);if(wrap.z>.5)uv.y=1.0-uv.y;if(kind>1.5)z=clamp(coordinate.z,0.0,1.0);else if(kind>.5)z=floor(index+.5);}
 float rho=max(length(derivativeX*descriptor.yzw),length(derivativeY*descriptor.yzw)),lod=clamp(log2(max(1.0,rho)),0.0,max(0.0,my.w-1.0)),spatial=nearest;if(kind>2.5){lod=clamp(index-residentBase,0.0,max(0.0,my.w-1.0));rho=index-residentBase>0.0?2.0:1.0;}if(rho>1.0)spatial=wrap.w<-.5||wrap.w==1.0||wrap.w==3.0?1.0:0.0;if(wrap.w<=0.0)lod=0.0;else if(wrap.w<2.5)lod=floor(lod+.5);uv=vec2(hbRayWrap(uv.x,wrap.x),hbRayWrap(uv.y,wrap.y));float first=floor(lod);vec4 result=hbRayTextureLevel(pointer,first,wrap,uv,z,kind,spatial);if(wrap.w>2.5&&fract(lod)>0.0)result=mix(result,hbRayTextureLevel(pointer,min(first+1.0,my.w-1.0),wrap,uv,z,kind,spatial),fract(lod));
 if(srgb>.5&&my.w<.5)result.rgb=mix(result.rgb/12.92,pow(max((result.rgb+.055)/1.055,vec3(0,0,0)),vec3(2.4,2.4,2.4)),step(vec3(.04045,.04045,.04045),result.rgb));return result;
}
vec4 hbRaySmooth(vec4 a,vec4 b,vec4 c){vec4 t=clamp((c-a)/max(b-a,vec4(.000001,.000001,.000001,.000001)),0.0,1.0);return t*t*(vec4(3,3,3,3)-2.0*t);}
float hbRayHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float hbRayNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(hbRayHash(i),hbRayHash(i+vec2(1,0)),f.x),mix(hbRayHash(i+vec2(0,1)),hbRayHash(i+vec2(1,1)),f.x),f.y);}
vec2 hbRayRotate(vec2 uv,float angle,vec2 center){vec2 p=uv-center;return vec2(p.x*cos(angle)-p.y*sin(angle),p.x*sin(angle)+p.y*cos(angle))+center;}
vec4 hbRayBound(vec4 v,float field){v=clamp(v,-65000.0,65000.0);if(field<.5)return vec4(clamp(v.xyz,0.0,1.0),clamp(v.w,1.0,2.5));if(field<1.5)return vec4(max(v.rgb,vec3(0,0,0)),clamp(v.w,0.0,1.0));if(field<2.5)return max(v,vec4(0,0,0,0));if(field>3.5)return vec4(clamp(v.rgb,0.0,1.0),max(v.w,0.0));return v;}
/*HB_RAY_PROGRAMS*/
vec4 hbRayRunTime(float id,vec3 point,vec3 view,float material,float field,vec4 result,float width,vec2 timeContext){vec4 program=hbGeometryLoad(material+field*2.0+1.0);if(program.y<.5)return result;
/*HB_RAY_PROGRAM_CALL*/
return result;}
vec4 hbRayRun(float id,vec3 point,vec3 view,float material,float field,vec4 result,float width){return hbRayRunTime(id,point,view,material,field,result,width,vec2(0,0));}
#ifdef HB_PATH_ADVANCED
vec4 hbRayField5Lod(float id,vec3 point,vec3 view,float width){float at=hbRayAttributes(id);vec4 result=vec4(0.0,0.1,0.0,0.0);if(at>0.0&&hbGeometryLoad(at+1.0).w>4.5){float material=hbGeometryLoad(at+1.0).z;result=hbGeometryLoad(material+10.0);
#if !defined(HB_RAY_CONSTANT_FIELDS) && defined(HB_RAY_FIELD_5)
result=hbRayRunField5(id,point,view,material,result,width,vec2(0,0));
#endif
}vec4 v=clamp(result,-65000.0,65000.0);return vec4(clamp(v.xyz,0.0,1.0),clamp(v.w,-6.283185307,6.283185307));}
vec4 hbRayField6Lod(float id,vec3 point,vec3 view,float width){float at=hbRayAttributes(id);vec4 result=vec4(1.0,1.0,1.0,1.0);if(at>0.0&&hbGeometryLoad(at+1.0).w>5.5){float material=hbGeometryLoad(at+1.0).z;result=hbGeometryLoad(material+12.0);
#if !defined(HB_RAY_CONSTANT_FIELDS) && defined(HB_RAY_FIELD_6)
result=hbRayRunField6(id,point,view,material,result,width,vec2(0,0));
#endif
}vec4 v=clamp(result,-65000.0,65000.0);return clamp(v,0.0,1.0);}
vec4 hbRayField7Lod(float id,vec3 point,vec3 view,float width){float at=hbRayAttributes(id);vec4 result=vec4(1.0,1.0,1.0,0.5);if(at>0.0&&hbGeometryLoad(at+1.0).w>6.5){float material=hbGeometryLoad(at+1.0).z;result=hbGeometryLoad(material+14.0);
#if !defined(HB_RAY_CONSTANT_FIELDS) && defined(HB_RAY_FIELD_7)
result=hbRayRunField7(id,point,view,material,result,width,vec2(0,0));
#endif
}vec4 v=clamp(result,-65000.0,65000.0);return vec4(clamp(v.rgb,0.0,1.0),clamp(v.w,.07,1.0));}
vec4 hbRayField8Lod(float id,vec3 point,vec3 view,float width){float at=hbRayAttributes(id);vec4 result=vec4(0.0,1.3,400.0,0.0);if(at>0.0&&hbGeometryLoad(at+1.0).w>7.5){float material=hbGeometryLoad(at+1.0).z;result=hbGeometryLoad(material+16.0);
#if !defined(HB_RAY_CONSTANT_FIELDS) && defined(HB_RAY_FIELD_8)
result=hbRayRunField8(id,point,view,material,result,width,vec2(0,0));
#endif
}vec4 v=clamp(result,-65000.0,65000.0);return vec4(clamp(v.x,0.0,1.0),clamp(v.y,1.0,3.0),clamp(v.z,0.0,2000.0),clamp(v.w,0.0,1.0));}
vec4 hbRayField9Lod(float id,vec3 point,vec3 view,float width){float at=hbRayAttributes(id);vec4 result=vec4(0.0,0.0,1.0,0.0);if(at>0.0&&hbGeometryLoad(at+1.0).w>8.5){float material=hbGeometryLoad(at+1.0).z;result=hbGeometryLoad(material+18.0);
#if !defined(HB_RAY_CONSTANT_FIELDS) && defined(HB_RAY_FIELD_9)
result=hbRayRunField9(id,point,view,material,result,width,vec2(0,0));
#endif
}vec4 v=clamp(result,-65000.0,65000.0);return v;}
#endif
vec4 hbRayField0Lod(float id,vec3 point,vec3 view,float width){float base=hbGeometryInfo.w+id*6.0,attributes=hbRayAttributes(id);vec4 result=vec4(hbGeometryRecord0(id).w,hbGeometryRecord1(id).w,hbGeometryRecord2(id).w,hbGeometryRecord3(id).w);if(attributes<=0.0)return hbRayBound(result,0.0);float material=hbGeometryLoad(attributes+1.0).z;result=hbGeometryLoad(material+0.0);
#if !defined(HB_RAY_CONSTANT_FIELDS) && defined(HB_RAY_FIELD_0)
result=hbRayRunField0(id,point,view,material,result,width,vec2(0,0));
#endif
return hbRayBound(result,0.0);}
vec4 hbRayField1Lod(float id,vec3 point,vec3 view,float width){float base=hbGeometryInfo.w+id*6.0,attributes=hbRayAttributes(id);vec4 result=hbGeometryRecord4(id);if(attributes<=0.0)return hbRayBound(result,1.0);float material=hbGeometryLoad(attributes+1.0).z;result=hbGeometryLoad(material+2.0);
#if !defined(HB_RAY_CONSTANT_FIELDS) && defined(HB_RAY_FIELD_1)
result=hbRayRunField1(id,point,view,material,result,width,vec2(0,0));
#endif
return hbRayBound(result,1.0);}
vec4 hbRayField2Lod(float id,vec3 point,vec3 view,float width){float base=hbGeometryInfo.w+id*6.0,attributes=hbRayAttributes(id);vec4 result=hbGeometryRecord5(id);if(attributes<=0.0)return hbRayBound(result,2.0);float material=hbGeometryLoad(attributes+1.0).z;result=hbGeometryLoad(material+4.0);
#if !defined(HB_RAY_CONSTANT_FIELDS) && defined(HB_RAY_FIELD_2)
result=hbRayRunField2(id,point,view,material,result,width,vec2(0,0));
#endif
return hbRayBound(result,2.0);}
vec4 hbRayField3TimeLod(float id,vec3 point,vec3 view,float width,vec2 timeContext){float base=hbGeometryInfo.w+id*6.0,attributes=hbRayAttributes(id);vec4 result=vec4(0,0,1,0);if(attributes<=0.0)return hbRayBound(result,3.0);float material=hbGeometryLoad(attributes+1.0).z;result=hbGeometryLoad(material+6.0);
#if !defined(HB_RAY_CONSTANT_FIELDS) && defined(HB_RAY_FIELD_3)
result=hbRayRunField3(id,point,view,material,result,width,timeContext);
#endif
return hbRayBound(result,3.0);}
vec4 hbRayField3Lod(float id,vec3 point,vec3 view,float width){return hbRayField3TimeLod(id,point,view,width,vec2(0,0));}
vec4 hbRayField4Lod(float id,vec3 point,vec3 view,float width){float base=hbGeometryInfo.w+id*6.0,attributes=hbRayAttributes(id);vec4 result=hbGeometryLoad(hbTransport.x+id*2.0);if(attributes<=0.0)return hbRayBound(result,4.0);float material=hbGeometryLoad(attributes+1.0).z;result=hbGeometryLoad(material+8.0);
#if !defined(HB_RAY_CONSTANT_FIELDS) && defined(HB_RAY_FIELD_4)
result=hbRayRunField4(id,point,view,material,result,width,vec2(0,0));
#endif
return hbRayBound(result,4.0);}
float hbRayCutoff(float id){float at=hbRayAttributes(id);return at>0.0?hbGeometryLoad(hbGeometryLoad(at+1.0).z+6.0).w:0.0;}
vec3 hbRayNormalContextLod(float id,vec3 point,vec3 view,float width,vec2 timeContext){vec3 n=hbRaySmoothNormal(id,point);float at=hbRayAttributes(id);if(at<=0.0||hbGeometryLoad(hbGeometryLoad(at+1.0).z+7.0).z<.5)return n;vec4 uv=hbGeometryLoad(at);vec2 uv2=hbGeometryLoad(at+1.0).xy,du=uv.zw-uv.xy,dv=uv2-uv.xy;float determinant=du.x*dv.y-du.y*dv.x;if(abs(determinant)<.0000001)return n;float base=hbGeometryInfo.w+id*6.0;vec3 origin,e1,e2;hbGeometryFrame(id,origin,e1,e2);hbRayScaleFrame(e1,e2);vec3 t=(e1*dv.y-e2*du.y)/determinant,b=(-e1*dv.x+e2*du.x)/determinant;t-=n*dot(n,t);t=hbRayUnit(t);if(dot(t,t)<.5)return n;b=normalize(cross(n,t))*(dot(cross(n,t),b)<0.0?-1.0:1.0);vec3 map=hbRayField3TimeLod(id,point,view,width,timeContext).xyz,candidate=(t*map.x+b*map.y+n*map.z),gn=hbRayGeometric(id);if(dot(candidate,candidate)<.000001)return n;candidate=normalize(candidate);return dot(candidate,gn)<0.0?-candidate:candidate;}
vec3 hbRayNormalTimeLod(float id,vec3 point,vec3 view,float width,float previousTime){return hbRayNormalContextLod(id,point,view,width,vec2(previousTime,1));}
vec3 hbRayNormalLod(float id,vec3 point,vec3 view,float width){return hbRayNormalContextLod(id,point,view,width,vec2(0,0));}
#ifdef HB_PATH_ADVANCED
vec3 hbRayCoatNormalLod(float id,vec3 point,vec3 view,float width){vec3 n=hbRaySmoothNormal(id,point);float at=hbRayAttributes(id);if(at<=0.0||hbGeometryLoad(at+1.0).w<9.5||hbGeometryLoad(hbGeometryLoad(at+1.0).z+19.0).z<.5)return n;vec4 uv=hbGeometryLoad(at);vec2 uv2=hbGeometryLoad(at+1.0).xy,du=uv.zw-uv.xy,dv=uv2-uv.xy;float determinant=du.x*dv.y-du.y*dv.x;if(abs(determinant)<.0000001)return n;float base=hbGeometryInfo.w+id*6.0;vec3 origin,e1,e2;hbGeometryFrame(id,origin,e1,e2);hbRayScaleFrame(e1,e2);vec3 t=(e1*dv.y-e2*du.y)/determinant,b=(-e1*dv.x+e2*du.x)/determinant;t-=n*dot(n,t);t=hbRayUnit(t);if(dot(t,t)<.5)return n;b=normalize(cross(n,t))*(dot(cross(n,t),b)<0.0?-1.0:1.0);vec3 map=hbRayField9Lod(id,point,view,width).xyz,candidate=(t*map.x+b*map.y+n*map.z),gn=hbRayGeometric(id);if(dot(candidate,candidate)<.000001)return n;candidate=normalize(candidate);return dot(candidate,gn)<0.0?-candidate:candidate;}
#endif
vec4 hbRayField0(float id,vec3 point,vec3 view){return hbRayField0Lod(id,point,view,0.0);}
vec4 hbRayField1(float id,vec3 point,vec3 view){float at=hbRayAttributes(id);vec4 result=hbGeometryRecord4(id);if(at>0.0){float material=hbGeometryLoad(at+1.0).z;result=hbGeometryLoad(material+2.0);
#if !defined(HB_RAY_CONSTANT_FIELDS) && defined(HB_RAY_FIELD_1)
 vec4 program=hbGeometryLoad(material+3.0);if(program.y>.5){
 result=hbRayExecuteAlphaFieldTime(1.0,program.w,program.x,id,point,view,result,0.0,vec2(0,0));
 }
#endif
 }return hbRayBound(result,1.0);}
vec4 hbRayField2(float id,vec3 point,vec3 view){return hbRayField2Lod(id,point,view,0.0);}
vec4 hbRayField3(float id,vec3 point,vec3 view){return hbRayField3Lod(id,point,view,0.0);}
vec4 hbRayField4(float id,vec3 point,vec3 view){return hbRayField4Lod(id,point,view,0.0);}
vec3 hbRayNormal(float id,vec3 point,vec3 view){return hbRayNormalLod(id,point,view,0.0);}
`;
