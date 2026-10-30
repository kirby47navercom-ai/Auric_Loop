import {pathSurfaceGLSL} from './path-surface-shader.js';
import {pathCausticBoundaryGLSL,pathCausticsGLSL} from './path-caustics-shader.js';
import {pathMicrofacetGLSL} from './path-microfacet-shader.js';
import {pathEnvironmentGLSL} from './path-environment-shader.js';
export function pathCameraFragment(source,pathOnly=false){
 const first=source.indexOf('vec4 hbPathPhoton('),last=source.indexOf('vec4 hbCausticLoad(',first);
 if(first<0)return source;if(last<first)throw Error('광자 생성 함수 구역을 확인하세요.');
 source=source.slice(0,first)+source.slice(last);if(pathOnly){const start=source.indexOf("vec3 hbGeometryLightingLod("),end=source.indexOf("bool hbCausticBoundary(",start);if(start>=0){if(end<start)throw Error("기하 조명 구역을 확인하세요.");const hemi=source.indexOf("vec3 hbGeometryHemisphere(",start),indirect=source.indexOf("vec3 hbGeometryIndirect(",hemi);if(hemi<start||indirect<hemi||indirect>end)throw Error("반구 표본 구역을 확인하세요.");source=source.slice(0,start)+source.slice(hemi,indirect)+source.slice(end);}}return source;
}
// The photon pass never needs the camera lighting integrator or density gather.
export function pathPhotonFragment(source){
 const lighting=source.indexOf('vec3 hbGeometryLightingLod('),geometryEnd=lighting>=0?lighting:source.indexOf('bool hbCausticBoundary('),random=source.indexOf('float hbPathRandom('),visibility=source.indexOf('vec3 hbGeometryVisibilityLod(',random),smith=source.indexOf('float hbPathSmith('),brdf=source.indexOf('vec4 hbPathBRDF(',smith);
 if(geometryEnd<0||random<geometryEnd||visibility<random||smith<visibility||brdf<smith)throw Error('광자 셰이더 구역을 확인하세요.');
 const fresnel=source.indexOf('vec3 hbPathFresnel('),frame=source.indexOf('vec3 hbPathFrame(',brdf),advanced='#ifdef HB_PATH_ADVANCED\n'+source.slice(fresnel,smith)+source.slice(brdf,frame)+pathSurfaceGLSL.slice(0,pathSurfaceGLSL.indexOf('vec4 hbPathDirection('))+'\n#endif\n#endif\n';
 // Camera projection and owner tags are unused by light-emitted photon paths.
 const attributes=source.slice(0,geometryEnd).replace(/\/\/ HB_MEGALIGHTS_BEGIN[\s\S]*?\/\/ HB_MEGALIGHTS_END\n/,'').replace(/float hbRayOwner\(float id\)\{[^}]*\}\n/,'').replace(/vec3 (?:hbWorldAt|hbProject)\([^)]*\)\{[^}]*\}\n/g,'');
 return attributes+pathCausticBoundaryGLSL+'\n'+source.slice(random,visibility)+source.slice(smith,brdf)+pathMicrofacetGLSL.split('#ifdef HB_PATH_ROUGH_DIELECTRIC')[0]+advanced+pathEnvironmentGLSL.slice(0,pathEnvironmentGLSL.indexOf('vec3 hbEnvironmentDirect('))+pathCausticsGLSL.slice(0,pathCausticsGLSL.indexOf('vec4 hbCausticLoad('))+'void main(){float index=floor(vUv.y*16.0)*128.0+floor(vUv.x*128.0);gl_FragColor=hbPathPhoton(index-floor(index/1024.0)*1024.0,floor(index/1024.0));}';
}
