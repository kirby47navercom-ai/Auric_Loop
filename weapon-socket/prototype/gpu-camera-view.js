import * as T from 'three/tsl';
import {cameraViewContract} from './camera-view-contract.js';
import {attachGPUIridescence} from './gpu-iridescence.js';
import {installGPUFallbackReadback} from './gpu-fallback-readback.js';

const decorated=new WeakSet(),installed=new WeakSet();
export const gpuViewDirection=T.cameraProjectionMatrix.element(3).w.equal(1).select(T.vec3(0,0,1),T.positionViewDirection);
export const gpuWorldViewDirection=gpuViewDirection.transformDirection(T.cameraViewMatrix);

export function attachGPUCameraView(material){
 if(!material?.isNodeMaterial||decorated.has(material)||!material.isMeshStandardNodeMaterial)return material;
 decorated.add(material);const variants=material.setupVariants;
 material.setupVariants=function(builder){
  // The VarNode belongs to this shader builder. Do not alter the shared TSL
  // accessor or cache a camera-specific choice on the material.
  builder.stack.assign(T.positionViewDirection,gpuViewDirection);
  return variants.call(this,builder);
 };
 if(material.isMeshPhysicalNodeMaterial){const setup=material.setupLightingModel;material.setupLightingModel=function(builder){
  const model=setup.call(this,builder);
  if(model.transmission&&!this.hbLayeredRefraction){
   let corrected=null;
   const prepare=b=>{
    const backdrop=b.context.backdrop;if(backdrop===corrected)return;let call=backdrop;
    for(let depth=0;call?.isVarNode&&depth<4;depth++)call=call.node;
    // shortcut: r180's owned, not-yet-built volume call has view at slot1.
    // Keep the original texture owner and all other volume/dispersion inputs.
    if(!call?.isShaderCallNodeInternal||!Array.isArray(call.rawInputs)||call.rawInputs.length!==15)throw Error('GPU volume view adapter requires review for this Three version.');
    call.rawInputs=call.rawInputs.slice();call.rawInputs[1]=gpuWorldViewDirection;call.needsUpdate=true;corrected=backdrop;
   };
   for(const key of ['direct','directRectArea','indirect']){const consume=model[key];model[key]=function(...args){prepare(key==='indirect'?args[0]:args[1]);return consume.apply(this,args);};}
  }
  return model;
 };}
 material.needsUpdate=true;return material;
}
export function installGPUCameraView(renderer){
 if(installed.has(renderer))return;installed.add(renderer);
 installGPUFallbackReadback(renderer);
 const from=renderer.library.fromMaterial;
 renderer.library.fromMaterial=function(...args){return attachGPUIridescence(attachGPUCameraView(from.apply(this,args)));};
 renderer.hbCameraView=cameraViewContract;
}
