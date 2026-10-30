import {previousCameraGLSL} from './path-previous-camera.js';
import {tangentGuideGLSL} from './path-tangent-guide.js';
export const curvedGuideGLSL=tangentGuideGLSL+previousCameraGLSL+`
vec3 hbPathCommittedNormal(float id,vec3 point,vec3 view,float width){if(hbPathFilter.w<=0.0||hbGeometryLoad(hbPathFilter.w+id*3.0).w<.5)return vec3(0,0,0);vec3 oldFace=hbGeometryLoad(hbPathFilter.w+id*3.0+1.0).xyz,oldEdge=hbGeometryLoad(hbPathFilter.w+id*3.0+2.0).xyz;if(!hbRayFrameValid(oldFace,oldEdge))return vec3(0,0,0);float at=hbRayAttributes(id);if(at>0.0){float encoded=hbGeometryLoad(at+3.0).w,old=hbGeometryLoad(at+4.0).w;if(encoded== -2.0||((encoded<-.5||encoded>0.0)&&old<=0.0))return vec3(0,0,0);}return hbRayPreviousNormalContextLod(id,point,view,width,vec2(hbForward.w,1));}

vec3 hbPathPreviousNormal(float id,vec3 point,vec3 normal,vec3 view,float width){if(hbPathFilter.w<=0.0)return normal;float at=hbPathFilter.w+id*3.0;vec3 b=hbRayBary(id,point),oldPoint=hbGeometryLoad(at).xyz+hbGeometryLoad(at+1.0).xyz*b.y+hbGeometryLoad(at+2.0).xyz*b.z;return hbPathCommittedNormal(id,oldPoint,view,width);}
`;
export function previousGuideNormal(normal,current,previous){
 const sub=(a,b)=>a.map((v,i)=>v-b[i]),dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],unit=a=>{const length=Math.hypot(...a);return length>1e-10?a.map(v=>v/length):null;};
 const e1=sub(current[1],current[0]),e2=sub(current[2],current[0]),a=sub(previous[1],previous[0]),b=sub(previous[2],previous[0]),n=unit(cross(e1,e2)),oldN=unit(cross(a,b));if(!n||!oldN)return null;const area=Math.hypot(...cross(a,b)),x=cross(b,oldN),y=cross(oldN,a);return unit(x.map((v,i)=>v*dot(normal,e1)/area+y[i]*dot(normal,e2)/area+oldN[i]*dot(normal,n)));
}
