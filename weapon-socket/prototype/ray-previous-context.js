import {rayBarycentricOffsetGLSL} from './ray-barycentric-offset.js';
// Preserve early rejection and the original ordered weighted sum. Fixed
// components avoid ANGLE's emulated dynamic vec3 index in this small loop.
const previousWeightedNormalsGLSL=['x','y','z'].map((axis,index)=>`{vec3 now=hbGeometryLoad(at+2.0+${index}.0).xyz,local=x*now.x+y*now.y+z*now.z,prior=a*local.x+b*local.y+c*local.z;if(dot(prior,prior)<1e-12)return vec3(0,0,0);normal+=normalize(prior)*weights.${axis};}`).join('');
// Previous evaluation reads the committed geometry. UV interpolation must use
// that geometry too: moving only the worldPosition input changes texture LOD.
export const previousRayGeometryGLSL=`
void hbRayPreviousFrame(float id,out vec3 origin,out vec3 e1,out vec3 e2){float at=hbPathFilter.w+id*3.0;origin=hbGeometryLoad(at).xyz;e1=hbGeometryLoad(at+1.0).xyz;e2=hbGeometryLoad(at+2.0).xyz;}
vec3 hbRayPreviousGeometric(float id){vec3 a,b,c;hbRayPreviousFrame(id,a,b,c);return hbRayFrameNormal(b,c);}
${rayBarycentricOffsetGLSL.replaceAll('hbRayBaryOffset','hbRayPreviousBaryOffset').replaceAll('hbGeometryFrame','hbRayPreviousFrame')}
vec3 hbRayPreviousBary(float id,vec3 point){vec3 origin,e1,e2;hbRayPreviousFrame(id,origin,e1,e2);vec3 delta=point-origin;vec2 weights=hbRayCoordinates(e1,e2,delta);return vec3(1.0-weights.x-weights.y,weights);}
vec2 hbRayPreviousUV(float id,vec3 point){float at=hbRayAttributes(id);if(at<=0.0)return vec2(0,0);vec3 b=hbRayPreviousBary(id,point);vec4 first=hbGeometryLoad(at);return first.xy*b.x+first.zw*b.y+hbGeometryLoad(at+1.0).xy*b.z;}
float hbRayPreviousFramePointer(float encoded){return encoded<-3.5?-encoded:encoded== -3.0?-1.0:encoded;}
vec3 hbRayPreviousSmoothNormalOffset(float id,vec3 point,vec3 offset){
 float at=hbRayAttributes(id);vec3 face=hbRayPreviousGeometric(id);if(at<=0.0)return face;float current=hbRayPreviousFramePointer(hbGeometryLoad(at+3.0).w),old=hbGeometryLoad(at+4.0).w;if(current== -2.0||old<=0.0)return vec3(0,0,0);
 vec3 weights=hbRayPreviousBaryOffset(id,point,offset),normal;
 if(current<-.5)normal=hbGeometryLoad(old).xyz*weights.x+hbGeometryLoad(old+1.0).xyz*weights.y+hbGeometryLoad(old+2.0).xyz*weights.z;
 else if(current>0.0){vec3 x=hbGeometryLoad(current).xyz,y=hbGeometryLoad(current+1.0).xyz,z=hbGeometryLoad(current+2.0).xyz,a=hbGeometryLoad(old).xyz,b=hbGeometryLoad(old+1.0).xyz,c=hbGeometryLoad(old+2.0).xyz;if(abs(dot(x,cross(y,z))*dot(a,cross(b,c)))<1e-20)return vec3(0,0,0);normal=vec3(0,0,0);${previousWeightedNormalsGLSL}}
 else return face;
 if(dot(normal,normal)<1e-12)return face;normal=normalize(normal);return dot(normal,face)<0.0?-normal:normal;
}
vec3 hbRayPreviousSmoothNormal(float id,vec3 point){return hbRayPreviousSmoothNormalOffset(id,point,vec3(0,0,0));}
vec3 hbRayPreviousOffset(float id,vec3 view,float width,float axis){vec3 n=hbRayPreviousGeometric(id),t=cross(n,view);if(dot(t,t)<.000001)t=cross(n,abs(n.z)<.9?vec3(0,0,1):vec3(0,1,0));t=normalize(t);return axis<.5?t*width:cross(n,t)*(width/max(.01,abs(dot(n,view))));}
`;

export function previousRayNames(source,programKeys=null){return source.replace(/\bhbRay(UVFootprint|UV|SmoothNormal(?:Offset)?|Geometric|Bary(?:Offset)?|Offset|(?:Coat)?NormalContextLod|Field[0-9]TimeLod|RunField[0-9]|Program\d+|Execute\w*)\b/g,(original,name)=>programKeys&&name.startsWith('Program')&&!programKeys.has(Number(name.slice(7)))?original:'hbRayPrevious'+name).replace(/\bhbGeometryFrame\b/g,'hbRayPreviousFrame');}

// Keep each field's existing defaults, gates and bounds; replace only the
// geometry/time context. The guide selects live fields; opaque visibility/emission keep global reset guards.
export function previousRayFieldsGLSL(materialSource,fields=[0,1,2,4,5,6,7,8,9]){
 if(!Array.isArray(fields)||new Set(fields).size!==fields.length||fields.some(f=>!Number.isInteger(f)||f<0||f>9||f===3))throw Error('이전 표면 필드를 확인하세요.');
 return fields.map(field=>{
  const name='hbRayField'+field+'Lod',start=materialSource.indexOf('vec4 '+name+'('),open=materialSource.indexOf('{',start);if(start<0||open<0)throw Error('이전 표면 함수가 없어요.');
  let depth=1,end=open+1;for(;end<materialSource.length&&depth;end++){if(materialSource[end]==='{')depth++;else if(materialSource[end]==='}')depth--;}
  if(depth)throw Error('이전 표면 함수 구역을 확인하세요.');
  const source=materialSource.slice(start,end);if(!source.includes('float width){')||!source.includes('width,vec2(0,0)'))throw Error('이전 표면 시간 문맥을 확인하세요.');
  return previousRayNames(source.replace(name+'(',name.replace('Lod','TimeLod')+'(').replace('float width){','float width,vec2 timeContext){').replaceAll('width,vec2(0,0)','width,timeContext'));
 }).join('\n');
}

// Keep the existing public program ABI, field masks and persisted graph keys.
export function previousRayNormalGLSL(programSource,normalSource,uvSource='',surfaceSource='',programKeys=null){
 return previousRayGeometryGLSL+previousRayNames(uvSource)+previousRayNames(programSource,programKeys)+`
vec4 hbRayPreviousField3TimeLod(float id,vec3 point,vec3 view,float width,vec2 timeContext){float at=hbRayAttributes(id);if(at<=0.0)return vec4(0,0,1,0);float material=hbGeometryLoad(at+1.0).z;return hbRayBound(hbRayPreviousRunField3(id,point,view,material,hbGeometryLoad(material+6.0),width,timeContext),3.0);}
`+surfaceSource+'\n'+previousRayNames(normalSource);
}

// Clearcoat has its own tangent normal and uses the same committed frame inputs.
export function previousRayCoatNormalGLSL(materialSource){
 const name='hbRayCoatNormalLod',start=materialSource.indexOf('vec3 '+name+'('),open=materialSource.indexOf('{',start);if(start<0||open<0)throw Error('이전 코팅 노멀 함수를 확인하세요.');
 let depth=1,end=open+1;for(;end<materialSource.length&&depth;end++){if(materialSource[end]==='{')depth++;else if(materialSource[end]==='}')depth--;}
 if(depth)throw Error('이전 코팅 노멀 구역을 확인하세요.');
 return previousRayNames(materialSource.slice(start,end).replace(name+'(','hbRayCoatNormalContextLod(').replace('float width){','float width,vec2 timeContext){').replace('hbRayField9Lod(id,point,view,width)','hbRayField9TimeLod(id,point,view,width,timeContext)'));
}
