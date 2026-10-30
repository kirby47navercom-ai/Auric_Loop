import * as THREE from 'three';

const glHelpers=`uniform sampler2D hbLayerColor,hbLayerDepth;uniform vec2 hbLayerSize;uniform float hbLayerReady;
vec4 hbLayerSample(vec2 uv,float rough,float ior,vec3 position,vec3 ray){
 vec4 fallback=getTransmissionSample(gl_FragCoord.xy/hbLayerSize,rough,ior);
 #ifdef ENVMAP_TYPE_CUBE_UV
 vec3 direction=normalize(ray);
 HB_PROBE_REFRACTION_DIRECTION
 fallback.rgb=mix(fallback.rgb,textureCubeUV(envMap,envMapRotation*direction,rough).rgb*envMapIntensity,HB_PROBE_REFRACTION_WEIGHT);
 #endif
 vec4 entry=projectionMatrix*viewMatrix*vec4(position,1.0);vec4 exit=projectionMatrix*viewMatrix*vec4(position+ray,1.0);
 float edge=clamp(min(min(uv.x,uv.y),min(1.0-uv.x,1.0-uv.y))/.02,0.0,1.0)*step(.000001,exit.w);
 if(hbLayerReady>.5){float z=texture2D(hbLayerDepth,clamp(uv,0.0,1.0)).r;edge*=step(entry.z/entry.w*.5+.5-.0001,z);float lod=rough*clamp(ior*2.0-2.0,0.0,1.0)*log2(hbLayerSize.x);vec4 captured=textureLod(hbLayerColor,clamp(uv,0.0,1.0),lod);return mix(fallback,captured,edge);}
 return mix(fallback,getTransmissionSample(clamp(uv,0.0,1.0),rough,ior),edge);
}`;

export function patchGLRefraction(shader,uniforms,chunk){
  Object.assign(shader.uniforms,uniforms);
  const probe=shader.fragmentShader.includes('hbProbeDirection');
  const helper=glHelpers.replace('HB_PROBE_REFRACTION_DIRECTION',probe?'direction=hbProbeDirection(direction);':'').replace('HB_PROBE_REFRACTION_WEIGHT',probe?'hbProbeWeight()':'1.0');
  let source=shader.fragmentShader.includes('#include <transmission_pars_fragment>')?shader.fragmentShader.replace('#include <transmission_pars_fragment>',chunk):shader.fragmentShader;
  const marker='vec4 getIBLVolumeRefraction';
  if(!source.includes(marker))return;
  source=source.replace(marker,helper+'\n'+marker).replace('getTransmissionSample( refractionCoords, roughness, iors[ i ] )','hbLayerSample( refractionCoords, roughness, iors[ i ], position, transmissionRay )').replace('getTransmissionSample( refractionCoords, roughness, ior )','hbLayerSample( refractionCoords, roughness, ior, position, transmissionRay )');
  shader.fragmentShader=source;
}

export function hasTransmission(scene){let found=false;scene.traverseVisible(n=>{if(n.isMesh)for(const m of Array.isArray(n.material)?n.material:[n.material])if(m?.transmission>0||m?.transmissionNode)found=true;});return found;}

// A single HDR/depth snapshot is refreshed before each sorted surface; no CPU pixel readback.
export class RefractionRendering{
  constructor(){this.views=new Map();}
  prepare(renderer,scene){
    if(renderer.hbBackend!=='webgl2')return;
    if(!hasTransmission(scene)){this.disposeRenderer(renderer);return;}
    let view=this.views.get(renderer);if(!view){view={meshes:new Map(),materials:new Map(),color:null,depth:null,copies:0,uniforms:{hbLayerColor:{value:null},hbLayerDepth:{value:null},hbLayerSize:{value:new THREE.Vector2(1,1)},hbLayerReady:{value:0}}};this.views.set(renderer,view);}
    const meshes=new Set(),materials=new Set();
    scene.traverseVisible(mesh=>{
      if(!mesh.isMesh||mesh.userData.draw2d||mesh.userData.editorHelper)return;
      for(const material of Array.isArray(mesh.material)?mesh.material:[mesh.material]){
        if(!material?.isMeshPhysicalMaterial||material.transmission<=0)continue;materials.add(material);meshes.add(mesh);
        const old=view.materials.get(material);
        if(old&&material.onBeforeCompile===old.hook)continue;
        const compile=material.onBeforeCompile,key=material.customProgramCacheKey,cacheKey=key.call(material);
        const hook=(shader,r)=>{compile.call(material,shader,r);patchGLRefraction(shader,view.uniforms,THREE.ShaderChunk.transmission_pars_fragment);};
        material.onBeforeCompile=hook;material.customProgramCacheKey=()=>cacheKey+'|hb-depth-layer-refraction';material.needsUpdate=true;view.materials.set(material,{compile,key,hook});
      }
      if(meshes.has(mesh)&&!view.meshes.has(mesh)){
        const before=mesh.onBeforeRender,hook=(r,s,c,g,m,p)=>{before.call(mesh,r,s,c,g,m,p);const target=r.getRenderTarget();if(m.transmission>0&&target?.texture?.userData.hbRefractionScene)this.capture(r,target,view);else view.uniforms.hbLayerReady.value=0;};
        mesh.onBeforeRender=hook;view.meshes.set(mesh,{before,hook});
      }
    });
    for(const [mesh,s]of view.meshes)if(!meshes.has(mesh)){if(mesh.onBeforeRender===s.hook)mesh.onBeforeRender=s.before;view.meshes.delete(mesh);}
    for(const [m,s]of view.materials)if(!materials.has(m)){this.restore(m,s);view.materials.delete(m);}
    renderer.hbRefractionResources={copies:view.copies,layers:view.materials.size,textureBytes:view.color?Math.ceil(view.color.image.width*view.color.image.height*(8*4/3+8)):0};
  }
  capture(renderer,target,view){
    const w=target.width,h=target.height;if(!view.color||view.color.image.width!==w||view.color.image.height!==h){view.color?.dispose();view.depth?.dispose();view.color=new THREE.FramebufferTexture(w,h);view.color.type=THREE.HalfFloatType;view.color.minFilter=THREE.LinearMipmapLinearFilter;view.color.generateMipmaps=true;view.depth=new THREE.WebGLRenderTarget(w,h,{depthTexture:new THREE.DepthTexture(w,h,THREE.FloatType)});const activeFace=renderer.getActiveCubeFace(),level=renderer.getActiveMipmapLevel();renderer.setRenderTarget(view.depth);renderer.setRenderTarget(target,activeFace,level);}
    renderer.copyFramebufferToTexture(view.color);renderer.copyTextureToTexture(target.depthTexture,view.depth.depthTexture);renderer.setRenderTarget(target);
    view.uniforms.hbLayerColor.value=view.color;view.uniforms.hbLayerDepth.value=view.depth.depthTexture;view.uniforms.hbLayerSize.value.set(w,h);view.uniforms.hbLayerReady.value=1;++view.copies;
    renderer.hbRefractionResources={copies:view.copies,layers:view.materials.size,textureBytes:Math.ceil(w*h*(8*4/3+8))};
  }
  restore(material,state){if(material.onBeforeCompile===state.hook){material.onBeforeCompile=state.compile;material.customProgramCacheKey=state.key;material.needsUpdate=true;}}
  disposeRenderer(renderer){const view=this.views.get(renderer);if(!view)return;for(const [m,s]of view.materials)this.restore(m,s);for(const [mesh,s]of view.meshes)if(mesh.onBeforeRender===s.hook)mesh.onBeforeRender=s.before;view.color?.dispose();view.depth?.dispose();this.views.delete(renderer);renderer.hbRefractionResources={copies:0,layers:0,textureBytes:0};}
  dispose(){for(const renderer of this.views.keys())this.disposeRenderer(renderer);}
}
