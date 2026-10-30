import {pathMediaGLSL} from './path-media-shader.js';
import {pathCameraConeGLSL} from './path-tracing-shader.js';
// Guide/filter passes need ray attributes, but never execute the lighting integrator.
export function pathGuideFragment(source){
 const first=source.indexOf('float hbPathRandom('),last=source.indexOf('vec4 hbPathResolve(',first),open=source.indexOf('{',last);if(first<0||last<0||open<0)throw Error('경로 셰이더 구역을 확인하세요.');
 let depth=1,end=open+1;for(;end<source.length&&depth;end++){if(source[end]==='{')depth++;else if(source[end]==='}')depth--;}
 if(depth)throw Error('경로 셰이더 함수가 닫히지 않았어요.');
 const stubs='vec3 hbGeometryVisibilityLod(vec3 p,vec3 d,float distance,float width){return vec3(1,1,1);}\nvec3 hbGeometryVisibility(vec3 p,vec3 d,float distance){return vec3(1,1,1);}\nvec4 hbPathResolve(vec2 uv){return texture2D(hbScreenSource,uv);}\n';
 return source.slice(0,first)+stubs+pathMediaGLSL+pathCameraConeGLSL+'\n'+source.slice(end);
}
