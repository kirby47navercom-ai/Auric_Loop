import {normalFootprintMode} from './path-normal-footprint.js';
import {startGPUPathPreparation,cancelGPUPathPreparation} from './gpu-path-preparation.js';
import {rayShaderPlanForScene} from './ray-materials.js';
import {MeshBasicNodeMaterial,Color,Vector3,Vector4,BackSide,PostProcessing,LightingNode,NodeUpdateType} from 'three/webgpu';
import {uniform,positionLocal,positionWorld,cameraPosition,vec3,vec4,float,fog,rangeFogFactor,mix,pmremTexture,normalWorld,normalView,clearcoatNormalView,bentNormalView,positionViewDirection,roughness,clearcoatRoughness,cameraViewMatrix,cache} from 'three/tsl';
import {bloom} from 'three/addons/tsl/display/BloomNode.js';
import {pass} from 'three/tsl';

export {createGPUProbeEnvironment} from './gpu-probe-environment.js';
import {postProcessSettings} from './post-processing.js';
import {screenEffectsEnabled,surfaceEffectsEnabled,ambientOcclusionEnabled} from './screen-effects.js';
import {gpuScreenEffects,gpuSurfaceOutputs,installGpuSurfaceKeys} from './screen-effects-gpu.js';
import {objectMotionEnabled} from './object-motion.js';
import {gpuPostProcessing} from './gpu-post-processing.js';

export function createGPUSkyMaterial(source){
  const defaults={topColor:new Color(),horizonColor:new Color(),sunDirection:new Vector3(),sunColor:new Color(),moonDirection:new Vector3(),moonColor:new Color(),sunDiskPower:350},u={};
  for(const [key,value] of Object.entries(defaults))u[key]=uniform(source?.[key]?.value?.clone?.()??source?.[key]?.value??value);
  const d=positionLocal.normalize(),height=d.y.smoothstep(-.12,.85),disk=(direction,color)=>d.dot(direction.normalize()).max(0).pow(u.sunDiskPower).mul(color).mul(.55);
  const material=new MeshBasicNodeMaterial({side:BackSide,depthWrite:false,fog:false});material.colorNode=mix(u.horizonColor,u.topColor,height).add(disk(u.sunDirection,u.sunColor)).add(disk(u.moonDirection,u.moonColor));material.uniforms=u;
  material.clone=()=>createGPUSkyMaterial(u);return material;
}

export function applyGPUFog(scene,resolved,state){
  if(!resolved){scene.fogNode=null;return;}
  let gpu=scene.userData.hbGPUFog;
  if(!gpu){
    const u={color:uniform(new Color()),near:uniform(0),far:uniform(1),height:uniform(state.hbHeightFog.value),distances:uniform(state.hbHeightFogDistances.value),enabled:uniform(0)};
    const distance=positionWorld.sub(cameraPosition).length(),start=u.distances.x,ratio=start.div(distance.max(.00001)).clamp(0,1),startHeight=mix(cameraPosition.y,positionWorld.y,ratio),span=positionWorld.y.sub(startHeight),k=u.height.y.mul(span);
    const safeK=k.abs().lessThan(.001).select(float(1),k),integral=k.abs().lessThan(.001).select(float(1),float(1).sub(k.negate().clamp(-40,40).exp()).div(safeK));
    const density=u.height.x.mul(u.height.y.negate().mul(startHeight.sub(u.height.z)).clamp(-40,40).exp()),optical=density.mul(distance.sub(start).max(0)).mul(integral);
    const amount=distance.greaterThanEqual(u.distances.y).select(float(0),float(1).sub(optical.negate().exp()).clamp(0,u.height.w));
    const factor=u.enabled.greaterThan(.5).select(amount,rangeFogFactor(u.near,u.far));gpu={u,factor,node:fog(u.color,factor)};scene.userData.hbGPUFog=gpu;
  }
  const u=gpu.u;u.color.value.setRGB(...resolved.color.slice(0,3));u.enabled.value=resolved.legacy?0:1;u.near.value=resolved.near??0;u.far.value=resolved.far??1;scene.fogNode=gpu.node;
}

// Render the scene once per HB frame, including manual captures; Three's RAF is independent.
// Reuse Three's pass/bloom owners; disabled effects allocate no frame targets.
export class GPUBloomRendering{
  constructor(){this.views=new Map();}
  render(renderer,scene,camera,objects){
    const p=postProcessSettings(objects,camera.getWorldPosition(new Vector3()),scene.userData.hbPostWorld);scene.userData.hbBeforeLighting?.(p);let view=this.views.get(renderer);const bloomOn=!!(p?.bloomEnabled&&p.bloomStrength>0),chromatic=!!p?.chromaticAberrationEnabled,depthOn=!!(p?.dofEnabled||p?.aoEnabled),exposureOn=!!p?.autoExposureEnabled,aa=p?.antiAliasing==='fxaa',screenOn=screenEffectsEnabled(p),surfaceOn=surfaceEffectsEnabled(p),motionOn=objectMotionEnabled(p),ambientOn=ambientOcclusionEnabled(p),rayPlan=p?.pathTracingEnabled||p?.geometryGIEnabled?rayShaderPlanForScene(scene):{operations:[],registers:1,fields:[]},operations=rayPlan.operations,key=[!!renderer.hbGeometryWorld?.packed?.geometryRecords?.[0],bloomOn,chromatic,depthOn,exposureOn,aa,screenOn,surfaceOn,motionOn,ambientOn,!!p?.pathTracingEnabled,p?.pathTracingEnabled&&p?.pathTracingDenoise&&p.pathTracingDenoiseStrength>0?p.pathTracingDenoiseSteps:0,!!p?.megaLightsEnabled,JSON.stringify(rayPlan.features),rayPlan.transmission,rayPlan.normalMapped,rayPlan.coatMapped,rayPlan.medium,rayPlan.advanced,rayPlan.roughDielectric,rayPlan.hierarchy,rayPlan.emitters,normalFootprintMode(p?.pathTracingNormalFootprint),!!p?.pathTracingCurvedFilter,(p?.pathTracingDenoiseTemporal??0)>0,!!(p?.pathTracingDOF&&camera.userData.cameraProperties?.physicalLens),!!p?.pathTracingCaustics&&(p.pathTracingCausticStrength??1)>0,operations.join(','),rayPlan.fields.join(','),JSON.stringify(rayPlan.programs)].join(':');
    let retained=null;if(view&&view.key!==key){if(p?.pathTracingEnabled&&view.pathEnabled&&view.screen)retained=view.screen.detachPathHistory();this.release(view);this.views.delete(renderer);view=null;}
    if(!p){renderer.hbDistanceFieldState=null;renderer.hbPathPreparation=null;if(view){this.release(view);this.views.delete(renderer);}renderer.render(scene,camera);return;}
    if(surfaceOn||motionOn)installGpuSurfaceKeys(scene,renderer);
    if(!view){
     try{
      const scenePass=pass(scene,camera,{samples:renderer.samples,type:renderer.getColorBufferType()});scenePass.updateBeforeType=NodeUpdateType.NONE;const raw=scenePass.getTextureNode('output'),screen=screenOn?gpuScreenEffects(raw,scenePass.getTextureNode('depth'),surfaceOn?scenePass.getTextureNode('hbSurfaceNormal'):null,surfaceOn?scenePass.getTextureNode('hbSurfaceAlbedo'):null,renderer,motionOn?scenePass.getTextureNode('hbObjectMotion'):null,ambientOn?scenePass.getTextureNode('hbSurfaceAmbient'):null,rayPlan.programs||[],!!p?.pathTracingEnabled,rayPlan.fields,p?.pathTracingEnabled&&p?.pathTracingDenoise&&p.pathTracingDenoiseStrength>0?p.pathTracingDenoiseSteps:0,rayPlan.medium,rayPlan.advanced,rayPlan.roughDielectric,!!p?.pathTracingCaustics&&(p.pathTracingCausticStrength??1)>0,rayPlan.hierarchy,rayPlan.emitters,(p?.pathTracingDenoiseTemporal??0)>0,!!(p?.pathTracingDOF&&camera.userData.cameraProperties?.physicalLens),retained,!!p?.pathTracingCurvedFilter,!!renderer.hbGeometryWorld?.packed?.geometryRecords?.[0],!!rayPlan.normalMapped,!!rayPlan.coatMapped,!!rayPlan.transmission,{...rayPlan.features,megaLights:!!p?.megaLightsEnabled,normalFootprint:normalFootprintMode(p?.pathTracingNormalFootprint)}):null,color=screen?screen.node:raw,effect=bloomOn?bloom(color,p.bloomStrength,p.bloomRadius,p.bloomThreshold):null,post=new PostProcessing(renderer),grading=gpuPostProcessing(effect?color.add(effect):color,chromatic,{depth:depthOn?scenePass.getTextureNode('depth'):null,exposure:exposureOn,meterSource:raw,aa,renderer});post.outputColorTransform=false;post.outputNode=grading.node;
      if(surfaceOn||motionOn)scenePass.setMRT(gpuSurfaceOutputs(surfaceOn,motionOn?screen.motionNode:null,ambientOn));view={scenePass,effect,post,grading,screen,key,pathEnabled:!!p?.pathTracingEnabled,scale:p.bloomResolutionScale};const setSize=effect?.setSize.bind(effect);
      // r180 has no bloom resolutionScale; clamp the smallest of its five mip levels to one texel.
      if(effect)effect.setSize=(w,h)=>setSize(Math.max(32,w*view.scale),Math.max(32,h*view.scale));this.views.set(renderer,view);if(view.screen&&(p.pathTracingEnabled||p.geometryGIEnabled)){const expected=!!renderer.hbGeometryWorld?.packed?.geometryRecords?.[0],actual=view.screen.prepack(p,camera,scene);if(actual!==expected)return this.render(renderer,scene,camera,objects);}if(p.pathTracingEnabled&&view.screen)view.preparation=startGPUPathPreparation(renderer,post,screen);
     }catch(error){if(retained){retained.geometry?.dispose();retained.history.dispose();retained.state.reset();retained.pathState.reset();}throw error;}
    }
    renderer.hbPathPreparation=view.preparation||null;if(view.preparation?.error)throw view.preparation.error;if(view.preparation?.pending){renderer.render(scene,camera);return;}
    view.scale=p.bloomResolutionScale;view.scenePass.scene=scene;view.scenePass.camera=camera;if(view.effect){view.effect.strength.value=p.bloomStrength;view.effect.radius.value=p.bloomRadius;view.effect.threshold.value=p.bloomThreshold;}view.grading.update(p,scene.userData.hbMaterialTime||0,camera,scene);view.screen?.prepare(p,scene.userData.hbMaterialTime||0,camera,scene);try{const target=renderer.getRenderTarget(),mrt=renderer.getMRT();try{view.scenePass.updateBefore({renderer});}finally{renderer.setRenderTarget(target);renderer.setMRT(mrt);}view.screen?.buildHierarchy();view.screen?.renderPasses(renderer);view.post.render();view.grading.after(renderer);view.screen?.after();}catch(error){view.screen?.failed();throw error;}
  }
  release(view){cancelGPUPathPreparation(view.preparation);view.screen?.dispose();view.grading.dispose();view.post.dispose();view.scenePass.dispose();view.effect?.dispose();
    // r180 BloomNode.dispose owns targets only; release its blur/filter material owners too.
    for(const m of [...(view.effect?._separableBlurMaterials||[]),view.effect?._compositeMaterial,view.effect?._highPassFilterMaterial])m?.dispose();
  }
  disposeRenderer(renderer){renderer.hbPathPreparation=null;const view=this.views.get(renderer);if(view){this.release(view);this.views.delete(renderer);}}
  dispose(){for(const view of this.views.values())this.release(view);this.views.clear();}
}
