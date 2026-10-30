import {glRayAtlasInfo} from './gl-ray-atlas.js';
import {rayMipCacheInfo} from './ray-mip-cache.js';
import {gpuFrameTimingInfo} from './gpu-frame-timing.js';
import {gpuPathPreparationInfo} from './gpu-path-preparation.js';
import {sharedRayInfo} from './shared-ray-geometry.js';
import * as THREE from 'three';
import {installGPURefractionCopy} from './gpu-refraction-copy.js';

export async function createGameRenderer(canvas,backend='webgl2',onError){
  if(backend==='d3d11'){const renderer=await(await import('./native-scene-renderer.js')).createNativeSceneRenderer(canvas,onError);renderer.setPixelRatio(1);return renderer;}
  if(!['webgl2','webgpu'].includes(backend))throw Error('실행 렌더러 설정 오류');
  const renderer=backend==='webgpu'?await(await import('./gpu-particles.js')).createGPURenderer(canvas):new THREE.WebGLRenderer({canvas,antialias:false,powerPreference:"high-performance"});
  renderer.hbBackend=backend;renderer.hbOnError=onError;renderer.setPixelRatio(1);renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.toneMapping=THREE.ACESFilmicToneMapping;
  // The game/editor owns its frame loop; Three's separate RAF must not erase
  // counters between a completed frame and the profiler reading them.
  renderer.info.autoReset=false;
  if(backend==='webgpu')installGPURefractionCopy(renderer);
  if(backend==='webgl2'){const opaque=(a,b)=>a.groupOrder-b.groupOrder||a.renderOrder-b.renderOrder||(a.material.transmission>0&&b.material.transmission>0?b.z-a.z:a.material.id-b.material.id||a.z-b.z)||a.id-b.id;renderer.setOpaqueSort(opaque);}
  return renderer;
}
export function checkGPUScene(renderer,data){
  if(renderer.hbBackend!=='webgpu')return;
  if(data.runtime?.renderBackend&&data.runtime.renderBackend!=='webgpu')throw Error('장면 이동에서는 실행 렌더러를 바꿀 수 없어요.');
}
export function finishGameRendererFrame(renderer){renderer.hbFrameInfo={render:{...renderer.info.render},compute:{...renderer.info.compute}};}
export function gameRendererCompilationInfo(renderer){
 if(!renderer)return null;
 const native=renderer.hbBackend==='d3d11'?renderer.hbDiagnostics():null;
 const nativeTime=Number.isFinite(native?.gpuTimeMs)&&native.gpuTimeMs>=0?native.gpuTimeMs:null;
 const gpuTiming=native?{api:'D3D11',supported:nativeTime!==null?true:null,enabled:null,status:nativeTime!==null?'ready':'unavailable',lastMs:nativeTime,completedSequence:native.gpuTimingFrame??null,scope:'existing native asynchronous GPU frame query; native collection policy'}:gpuFrameTimingInfo(renderer);
 return {backend:renderer.hbBackend,distanceFields:renderer.hbDistanceFields?.state()||renderer.hbDistanceFieldState||null,textureStreaming:renderer.hbTextureStreaming?.({limit:1})||null,gpuTiming,pipelinePreparation:native?.pipelinePreparation??gpuPathPreparationInfo(renderer.hbPathPreparation),shaderCompilation:native?.shaderCompilation||null,shaderDiskCache:native?.shaderDiskCache||null};
}
export function gameRendererInfo(renderer){
  if(renderer.hbBackend==='d3d11')return {...renderer.hbDiagnostics(),distanceFields:renderer.hbDistanceFields?.state()||renderer.hbDistanceFieldState||null,textureStreaming:renderer.hbTextureStreaming?.({limit:1})||null,rayMipCache:rayMipCacheInfo()};
  const completed=renderer.hbFrameInfo,info={...(completed?.render||renderer.info.render)};
  if(renderer.hbBackend==='webgpu'){const device=renderer.backend.device;info.calls=renderer.info.render.calls;return {distanceFields:renderer.hbDistanceFields?.state()||renderer.hbDistanceFieldState||null,textureStreaming:renderer.hbTextureStreaming?.({limit:1})||null,rayMipCache:rayMipCacheInfo(),backend:'WebGPU',cameraView:renderer.hbCameraView||null,pipelinePreparation:gpuPathPreparationInfo(renderer.hbPathPreparation),rayGeometry:sharedRayInfo(renderer.hbGeometryWorld?.packed),rayAtlasUpload:{...renderer.hbRayAtlasUpload},displayColors:{...renderer.hbDisplayColorResources},probes:renderer.hbProbeResources,framebufferTextures:renderer.hbFramebufferTextures?.size||0,adapter:device.adapterInfo,vendor:device.adapterInfo?.vendor,renderer:device.adapterInfo?.architecture,errors:[...renderer.hbGPUErrors],info,compute:{...renderer.info.compute,frameCalls:completed?.compute.frameCalls??renderer.info.compute.frameCalls},particleResources:{...renderer.hbParticleResources},memory:{...renderer.info.memory}};}
  const gl=renderer.getContext();return {distanceFields:renderer.hbDistanceFields?.state()||renderer.hbDistanceFieldState||null,textureStreaming:renderer.hbTextureStreaming?.({limit:1})||null,rayMipCache:rayMipCacheInfo(),backend:'WebGL2',rayAtlasRecovery:glRayAtlasInfo(renderer),pipelinePreparation:gpuPathPreparationInfo(renderer.hbPathPreparation),rayGeometry:sharedRayInfo(renderer.hbGeometryWorld?.packed),refraction:renderer.hbRefractionResources,probes:renderer.hbProbeResources,programs:renderer.info.programs.map(p=>({runnable:p.diagnostics?.runnable!==false})),vendor:gl.getParameter(gl.VENDOR),renderer:gl.getParameter(gl.RENDERER),info,memory:{...renderer.info.memory}};
}
