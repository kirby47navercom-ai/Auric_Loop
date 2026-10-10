import {MeshBasicNodeMaterial,Color,Vector3,BackSide,PostProcessing} from 'three/webgpu';
import {uniform,positionLocal,positionWorld,cameraPosition,vec4,float,fog,rangeFogFactor,mix} from 'three/tsl';
import {bloom} from 'three/addons/tsl/display/BloomNode.js';
import {pass} from 'three/tsl';
import {bloomSettings} from './bloom-rendering.js';

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
    gpu={u,node:fog(u.color,u.enabled.greaterThan(.5).select(amount,rangeFogFactor(u.near,u.far)))};scene.userData.hbGPUFog=gpu;
  }
  const u=gpu.u;u.color.value.setRGB(...resolved.color.slice(0,3));u.enabled.value=resolved.legacy?0:1;u.near.value=resolved.near??0;u.far.value=resolved.far??1;scene.fogNode=gpu.node;
}

// Reuse Three's pass/bloom owners; disabled effects allocate no frame targets.
export class GPUBloomRendering{
  constructor(){this.views=new Map();}
  render(renderer,scene,camera,objects){
    const p=bloomSettings(objects);let view=this.views.get(renderer);
    if(!p){if(view){this.release(view);this.views.delete(renderer);}renderer.render(scene,camera);return;}
    if(!view){
      const scenePass=pass(scene,camera),color=scenePass.getTextureNode('output'),effect=bloom(color,p.bloomStrength,p.bloomRadius,p.bloomThreshold),post=new PostProcessing(renderer);post.outputNode=color.add(effect);
      view={scenePass,effect,post,scale:p.bloomResolutionScale};const setSize=effect.setSize.bind(effect);
      // r180 has no bloom resolutionScale; clamp the smallest of its five mip levels to one texel.
      effect.setSize=(w,h)=>setSize(Math.max(32,w*view.scale),Math.max(32,h*view.scale));this.views.set(renderer,view);
    }
    view.scale=p.bloomResolutionScale;view.scenePass.scene=scene;view.scenePass.camera=camera;view.effect.strength.value=p.bloomStrength;view.effect.radius.value=p.bloomRadius;view.effect.threshold.value=p.bloomThreshold;view.post.render();
  }
  release(view){view.post.dispose();view.scenePass.dispose();view.effect.dispose();
    // r180 BloomNode.dispose owns targets only; release its blur/filter material owners too.
    for(const m of [...view.effect._separableBlurMaterials,view.effect._compositeMaterial,view.effect._highPassFilterMaterial])m?.dispose();
  }
  disposeRenderer(renderer){const view=this.views.get(renderer);if(view){this.release(view);this.views.delete(renderer);}}
  dispose(){for(const view of this.views.values())this.release(view);this.views.clear();}
}
