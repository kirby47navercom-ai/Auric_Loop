import {Source,Mesh,PlaneGeometry,NodeMaterial,Vector4,NoToneMapping,LinearSRGBColorSpace} from 'three/webgpu';
import {Fn,mrt,output,vec4,positionLocal,uniform,max} from 'three/tsl';

// Three r180 maps the entire HDR framebuffer, ignoring material.toneMapped.
// Keep attachment zero HDR (transmission copies it), and allocate a presentation
// attachment only when raw display colors and scene colors share the canvas.
// shortcut: r180 private framebuffer/output hooks; revalidate on Three upgrades.
export function installGPUDisplayColors(renderer){
  const decorated=new WeakSet(),keyed=new WeakSet(),attachments=new WeakMap();
  const stats=renderer.hbDisplayColorResources={mode:'scene',targets:0,bytes:0,multisampleBytes:0,automaticReadbacks:0};
  let active=null,background=null,depth=0;
  const presentationMRT=mrt({output,hbDisplayColor:output});presentationMRT.hbDisplayColors=true;
  const enabled=builder=>builder.renderer.getMRT()?.hbDisplayColors===true;
  const presentation=(raw,builder)=>{
    const mapping=builder.material.toneMapped===false?NoToneMapping:builder.renderer.getMRT().hbToneMapping;
    // Match the direct WebGL output before alpha blending. The HDR attachment
    // remains linear; only this disposable presentation attachment is encoded.
    if(builder.material.premultipliedAlpha){const a=raw.a;return vec4(vec4(raw.rgb.div(max(a,1e-6)),a).renderOutput(mapping,renderer.outputColorSpace).rgb.mul(a),a);}
    return raw.renderOutput(mapping,renderer.outputColorSpace);
  };
  function decorate(material){
    if(!material?.isNodeMaterial||decorated.has(material))return;
    decorated.add(material);
    const setup=material.setup,setupOutput=material.setupOutput;
    material.setup=function(builder){
      if(!enabled(builder)||this.fragmentNode!==null)return setup.call(this,builder);
      const previous=this.mrtNode,extra=mrt({hbDisplayColor:Fn((_,b)=>presentation(output,b))()});
      this.mrtNode=previous?previous.merge(extra):extra;
      try{return setup.call(this,builder);}finally{this.mrtNode=previous;}
    };
    material.setupOutput=function(builder,color){
      const result=setupOutput.call(this,builder,color);
      if(!enabled(builder)||this.fragmentNode===null)return result;
      if(result.isMRTNode)return result.merge(mrt({hbDisplayColor:presentation(result.get('output'),builder)}));
      if(result.isOutputStructNode)throw Error('Display color output requires a named output attachment.');
      return mrt({output:result,hbDisplayColor:presentation(result,builder)});
    };
  }
  const fromMaterial=renderer.library.fromMaterial;
  renderer.library.fromMaterial=function(...args){const material=fromMaterial.apply(this,args);decorate(material);return material;};
  const renderObject=renderer.renderObject;
  renderer.renderObject=function(object,scene,camera,geometry,material,...args){
    if(!keyed.has(material)){keyed.add(material);const key=material.customProgramCacheKey;material.customProgramCacheKey=function(){return key.call(this)+'|hb-display:'+this.userData.hbDisplayColorKey;};}
    material.userData.hbDisplayColorKey=this.getMRT()?.hbDisplayColors?`1:${this.getMRT().hbToneMapping}:${this.outputColorSpace}:${material.toneMapped!==false}`:'0';
    decorate(material);return renderObject.call(this,object,scene,camera,geometry,material,...args);
  };
  function release(target){
    const data=target&&attachments.get(target);if(!data)return;
    target.dispose();target.textures.splice(target.textures.indexOf(data.texture),1);target.texture.name=data.name;data.texture.dispose();attachments.delete(target);
    stats.targets=stats.bytes=stats.multisampleBytes=0;
  }
  const framebuffer=renderer._getFrameBufferTarget;
  renderer._getFrameBufferTarget=function(){
    const target=framebuffer.call(this);if(!active||!target||this.getRenderTarget()!==null)return target;
    let data=attachments.get(target);
    if(!data){target.dispose();const base=target.texture,texture=base.clone();texture.source=new Source({...base.image});texture.isRenderTargetTexture=true;texture.renderTarget=target;texture.name='hbDisplayColor';data={texture,name:base.name};base.name='output';target.textures.push(texture);attachments.set(target,data);}
    stats.targets=1;stats.bytes=target.width*target.height*8;stats.multisampleBytes=stats.bytes*(target.samples>1?target.samples:0);return target;
  };
  const renderOutput=renderer._renderOutput;
  renderer._renderOutput=function(target){
    const data=active&&attachments.get(target);if(!data)return renderOutput.call(this,target);
    const base=target.textures[0],mapping=this.toneMapping,space=this.outputColorSpace,mrtNode=this.getMRT();
    target.textures[0]=data.texture;this.toneMapping=NoToneMapping;this.outputColorSpace=LinearSRGBColorSpace;this.setMRT(null);
    try{return renderOutput.call(this,target);}finally{target.textures[0]=base;this.toneMapping=mapping;this.outputColorSpace=space;this.setMRT(mrtNode);}
  };
  // r180 clears nonzero MRT attachments to black. A single background draw
  // preserves a colored/transparent clear in both attachments, without readback.
  const updateBackground=renderer._background.update;
  renderer._background.update=function(scene,list,context){
    updateBackground.call(this,scene,list,context);
    if(!active||!renderer.getMRT()?.hbDisplayColors||!context.clearColor||scene.backgroundNode||scene.background&&!scene.background.isColor)return;
    if(!background){const color=uniform(new Vector4()),material=new NodeMaterial();material.name='HB.DisplayClear';material.vertexNode=vec4(positionLocal.xy,1,1);material.fragmentNode=color;material.depthTest=material.depthWrite=material.fog=material.lights=material.toneMapped=false;material.premultipliedAlpha=true;material.allowOverride=false;background={color,mesh:new Mesh(new PlaneGeometry(2,2),material)};}
    const c=context.clearColorValue;let r=c.r,g=c.g,b=c.b;
    if(renderer.alpha&&c.a>0){r/=c.a;g/=c.a;b/=c.a;}
    background.color.value.set(r,g,b,c.a);const mesh=background.mesh;list.unshift(mesh,mesh.geometry,mesh.material,0,0,null,null);
  };
  function counts(scene){
    if(scene.userData?.hbDisplayColorCounts)return scene.userData.hbDisplayColorCounts;
    let display=0,sceneColors=0,transparent=false;
    scene.traverseVisible(node=>{if(node.userData.spriteMask||node.userData.editorHelper||!node.material)return;for(const material of Array.isArray(node.material)?node.material:[node.material]){if(!material.visible)continue;if(material.toneMapped===false)++display;else ++sceneColors;transparent||=material.transparent;}});
    return {display,sceneColors,transparent};
  }
  for(const name of ['render','renderAsync','compileAsync']){
    const original=renderer[name];
    renderer[name]=function(scene,...args){
      // A reflection/shadow/extension pass may reenter while a canvas frame is
      // open. It owns its own target, so never export our canvas MRT into it.
      if(depth&&active&&this.getRenderTarget()&&!attachments.has(this.getRenderTarget())&&this.getMRT()===active){const previous=this.getMRT();this.setMRT(null);const restore=()=>this.setMRT(previous);try{const result=original.call(this,scene,...args);if(result?.then)return result.finally(restore);restore();return result;}catch(error){restore();throw error;}}
      if(depth||this.getRenderTarget()||this.getOutputRenderTarget()||this.getMRT())return original.call(this,scene,...args);
      if(this.toneMapping===NoToneMapping){release(this._frameBufferTarget);stats.mode='unmapped';return original.call(this,scene,...args);}
      const {display,sceneColors,transparent}=counts(scene),mapping=this.toneMapping;
      if(!display){release(this._frameBufferTarget);stats.mode='scene';return original.call(this,scene,...args);}
      const mixed=!!(sceneColors||transparent||scene.backgroundNode||scene.background?.isTexture);
      if(mixed){active=presentationMRT;active.hbToneMapping=mapping;this.setMRT(active);stats.mode='mixed';}
      else{release(this._frameBufferTarget);this.toneMapping=NoToneMapping;stats.mode='display';}
      const target=this.getRenderTarget();++depth;const restore=()=>{--depth;this.toneMapping=mapping;if(mixed){if(name==='compileAsync')this.setRenderTarget(target);this.setMRT(null);active=null;}};
      try{if(mixed&&name==='compileAsync')this.setRenderTarget(this._getFrameBufferTarget());const result=original.call(this,scene,...args);if(result?.then)return result.finally(restore);restore();return result;}catch(error){restore();throw error;}
    };
  }
  const dispose=renderer.dispose;
  renderer.dispose=function(){background?.mesh.geometry.dispose();background?.mesh.material.dispose();background=null;stats.targets=stats.bytes=stats.multisampleBytes=0;return dispose.call(this);};
}
