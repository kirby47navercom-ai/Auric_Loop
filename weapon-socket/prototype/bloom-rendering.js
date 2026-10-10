import {Vector2,Vector4} from 'three';
import {EffectComposer} from 'three/addons/postprocessing/EffectComposer.js';
import {RenderPass} from 'three/addons/postprocessing/RenderPass.js';
import {UnrealBloomPass} from 'three/addons/postprocessing/UnrealBloomPass.js';
import {OutputPass} from 'three/addons/postprocessing/OutputPass.js';
import {enabledComponent} from './scene-components.js';

export function bloomSettings(objects){
  let selected;
  for(const object of objects){const p=enabledComponent(object,'PostProcessVolume');if(object.visible!==false&&object.poolActive!==false&&p&&(!selected||p.priority>selected.priority))selected=p;}
  return selected?.bloomEnabled&&selected.bloomStrength>0?selected:null;
}

// One lazy pipeline per actual viewport; disabled bloom owns no render targets.
export class BloomRendering{
  constructor(){this.views=new Map();this.rect=new Vector4();}
  render(renderer,scene,camera,objects){
    const p=bloomSettings(objects);let view=this.views.get(renderer);
    if(!p){if(view){this.release(view);this.views.delete(renderer);}renderer.render(scene,camera);return;}
    renderer.getViewport(this.rect);const ratio=renderer.getPixelRatio(),w=Math.max(1,Math.round(this.rect.z*ratio)),h=Math.max(1,Math.round(this.rect.w*ratio));
    if(!view){const composer=new EffectComposer(renderer),render=new RenderPass(scene,camera),bloom=new UnrealBloomPass(new Vector2(w,h),p.bloomStrength,p.bloomRadius,p.bloomThreshold),output=new OutputPass();composer.setPixelRatio(1);composer.addPass(render);composer.addPass(bloom);composer.addPass(output);view={composer,render,bloom,output,width:0,height:0,scale:0};this.views.set(renderer,view);}
    if(view.width!==w||view.height!==h){view.composer.setSize(w,h);view.width=w;view.height=h;}
    if(view.scale!==p.bloomResolutionScale||view.bloom.resolution.x!==w*p.bloomResolutionScale||view.bloom.resolution.y!==h*p.bloomResolutionScale){view.bloom.resolution.set(w*p.bloomResolutionScale,h*p.bloomResolutionScale);view.bloom.setSize(Math.max(1,Math.round(w*p.bloomResolutionScale)),Math.max(1,Math.round(h*p.bloomResolutionScale)));view.scale=p.bloomResolutionScale;}
    view.render.scene=scene;view.render.camera=camera;view.bloom.strength=p.bloomStrength;view.bloom.radius=p.bloomRadius;view.bloom.threshold=p.bloomThreshold;
    view.composer.render();
  }
  release(view){view.composer.dispose();view.render.dispose();view.bloom.dispose();view.output.dispose();}
  disposeRenderer(renderer){const view=this.views.get(renderer);if(view){this.release(view);this.views.delete(renderer);}}
  dispose(){for(const view of this.views.values())this.release(view);this.views.clear();}
}
