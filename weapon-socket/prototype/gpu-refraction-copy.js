// r180 submits viewport mips before its still-open frame encoder has copied the new layer.
// shortcut: private r180 pass utilities; revalidate this adapter when upgrading Three.js.
export function installGPURefractionCopy(renderer){
  const backend=renderer.backend,copy=backend.copyFramebufferToTexture;
  backend.copyFramebufferToTexture=function(texture,context,rect){
    if(!texture.isFramebufferTexture||!texture.generateMipmaps)return copy.call(this,texture,context,rect);
    const utils=this.textureUtils,generate=utils.generateMipmaps;let pending=false;
    utils.generateMipmaps=function(t){if(t===texture)pending=true;else generate.call(this,t);};
    try{copy.call(this,texture,context,rect);}finally{utils.generateMipmaps=generate;}
    if(!pending)return;const state=this.get(context);
    if(!state.currentPass)return generate.call(utils,texture);
    state.currentPass.end();const data=this.get(texture),passes=utils._getPassUtils(),cache=passes.get(data.texture);
    cache.layers??=[];const bundles=cache.layers[0]??=passes._mipmapCreateBundles(data.texture,data.textureDescriptorGPU,0);
    passes._mipmapRunBundles(state.encoder,bundles);
    state.currentPass=state.encoder.beginRenderPass(state.descriptor);state.currentSets={attributes:{},bindingGroups:[],pipeline:null,index:null};
    if(context.viewport)this.updateViewport(context);
    if(context.scissor){const {x,y,width,height}=context.scissorValue;state.currentPass.setScissorRect(x,y,width,height);}
  };
}
