import * as THREE from 'three';
import {sortingLayerIndex,defaultSortingLayers} from './sorting-layers.js';
import {TwoDLighting} from './two-d-lighting.js';

const position=new THREE.Vector3(),cameraPosition=new THREE.Vector3(),direction=new THREE.Vector3();
const visible=node=>{for(let p=node;p;p=p.parent)if(!p.visible)return false;return true;};
const nearestGroup=node=>{for(let p=node;p;p=p.parent)if(p.userData.sortingGroup)return p;return null;};
const compare=(a,b)=>a.layer-b.layer||a.order-b.order||a.depth-b.depth||(a.id<b.id?-1:a.id>b.id?1:0);
export function spriteEffectsUniforms(material){
  if(material.userData.hbSpriteEffectsOwner===material.uuid)return material.userData.hbSpriteEffects;
  const uniforms={hbPixelPPU:{value:0},hbSpriteFlash:{value:0},hbSpriteEmission:{value:0}},compile=material.onBeforeCompile,key=material.customProgramCacheKey.bind(material)();
  material.onBeforeCompile=(shader,renderer)=>{compile.call(material,shader,renderer);Object.assign(shader.uniforms,uniforms);shader.vertexShader='uniform float hbPixelPPU;\n'+shader.vertexShader;shader.vertexShader=shader.vertexShader.replace('#include <project_vertex>','#include <project_vertex>\nif(hbPixelPPU>0.0){mvPosition.xy=floor(mvPosition.xy*hbPixelPPU+0.5)/hbPixelPPU;gl_Position=projectionMatrix*mvPosition;}');shader.fragmentShader='uniform float hbSpriteFlash;\nuniform float hbSpriteEmission;\n'+shader.fragmentShader;shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>','outgoingLight+=diffuseColor.rgb*hbSpriteEmission;\noutgoingLight=mix(outgoingLight,vec3(1.0),clamp(hbSpriteFlash,0.0,1.0));\n#include <opaque_fragment>');};
  material.customProgramCacheKey=()=>key+'|hb-pixel-flash-emission-v2';material.userData.hbSpriteEffectsOwner=material.uuid;material.userData.hbSpriteEffects=uniforms;material.needsUpdate=true;return uniforms;
}
export function createSpriteMaskMaterial(map,alphaCutoff,renderer){
  if(renderer?.hbMaskMaterial)return renderer.hbMaskMaterial(map,alphaCutoff);
  const material=new THREE.MeshBasicMaterial({color:0xffffff,map,alphaTest:alphaCutoff,side:THREE.DoubleSide,depthTest:false,depthWrite:false,toneMapped:false});
  material.onBeforeCompile=shader=>shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',THREE.ShaderChunk.map_fragment.replace('diffuseColor *= sampledDiffuseColor;','diffuseColor.a *= sampledDiffuseColor.a;'));
  material.customProgramCacheKey=()=> 'hb-sprite-alpha-mask-v1';return material;
}
export function spriteMaskUniforms(material){
  if(material.userData.hbSpriteMask)return material.userData.hbSpriteMask;
  const uniforms={hbSpriteMask:{value:null},hbSpriteMaskSize:{value:new THREE.Vector2(1,1)},hbSpriteMaskMode:{value:0}};
  const compile=material.onBeforeCompile,key=material.customProgramCacheKey.bind(material);
  material.onBeforeCompile=(shader,renderer)=>{compile.call(material,shader,renderer);Object.assign(shader.uniforms,uniforms);shader.fragmentShader='uniform sampler2D hbSpriteMask; uniform vec2 hbSpriteMaskSize; uniform float hbSpriteMaskMode;\n'+shader.fragmentShader;shader.fragmentShader=shader.fragmentShader.replace('#include <clipping_planes_fragment>','#include <clipping_planes_fragment>\nif(hbSpriteMaskMode>0.5){float hbMask=texture2D(hbSpriteMask,gl_FragCoord.xy/hbSpriteMaskSize).r;if((hbSpriteMaskMode<1.5&&hbMask<0.5)||(hbSpriteMaskMode>1.5&&hbMask>=0.5))discard;}');};
  const cacheKey=key();material.customProgramCacheKey=()=>cacheKey+'|hb-sprite-mask-v1';material.needsUpdate=true;material.userData.hbSpriteMask=uniforms;return uniforms;
}

// Mask textures are allocated only for an actually used combination of masks.
// They are shared by sprites with the same scope/range and released when unused.
export class TwoDRendering{
  constructor(){this.targets=new Map();this.maskScene=new THREE.Scene();this.size=new THREE.Vector2();this.clear=new THREE.Color();this.lighting=new TwoDLighting();}
  prepare(renderer,scene,camera,groups,layers,{lights=true}={}){
    layers??=defaultSortingLayers;
    if(!groups.some(g=>g.userData.sortingGroup||g.userData.maskMesh||g.userData.spriteMesh||g.userData.tilemapResources||g.children.some(n=>n.userData.draw2d))){this.dispose();return {renderers:0,maskPasses:0,maskTargets:0};}
    scene.updateMatrixWorld();camera.updateWorldMatrix(true,false);camera.getWorldPosition(cameraPosition);camera.getWorldDirection(direction);
    const roots=[],scopes=new Map(),entries=[],masks=[];
    const depth=(node,mode)=>{if(mode==='y'&&node.userData.sortPoint)position.fromArray(node.userData.sortPoint).applyMatrix4(node.matrixWorld);else position.setFromMatrixPosition(node.matrixWorld);return mode==='y'?-position.y:camera.isOrthographicCamera?-position.sub(cameraPosition).dot(direction):-position.distanceToSquared(cameraPosition);};
    const item=(node,p,id)=>({node,layer:sortingLayerIndex(layers,p.sortingLayer),order:p.sortingOrder||0,depth:depth(node,p.sortMode||layers?.find(l=>l.id===p.sortingLayer)?.sortMode),id});
    for(const group of groups){if(group.userData.disposed)continue;const p=group.userData.sortingGroup;if(p)scopes.set(group,{...item(group,p,group.userData.objectId||group.uuid),children:[]});}
    for(const [group,scope] of scopes){const parent=group.userData.sortingGroup.sortAtRoot?null:nearestGroup(group.parent);(scopes.get(parent)?.children||roots).push(scope);}
    for(const group of groups){if(group.userData.disposed)continue;
      const mask=group.userData.maskMesh;if(mask&&visible(group)){mask.updateWorldMatrix(true,false);masks.push({group,mesh:mask,scope:nearestGroup(group),properties:mask.userData.maskProperties});}
      const owned=[group];while(owned.length){const node=owned.pop();if(node.userData.objectId!==group.userData.objectId)continue;owned.push(...node.children);if(node.userData.spriteMask||node.userData.editorHelper)continue;
        const volume=node.userData.light2dVolume===true,p=group.userData.light2d;if(volume){const layer=layers.filter(l=>p.targetSortingLayers.includes(l.id)).at(-1);node.visible=!!layer&&lights&&p.enabled!==false&&p.volumeIntensity>0;Object.assign(node.userData.draw2d,{sortingLayer:layer?.id||'default',sortingOrder:2097153+(p.lightOrder||0)});}
        const scope=volume?null:nearestGroup(node);if(!node.userData.draw2d&&!(scope&&(node.isMesh||node.isPoints)))continue;
        const entry=item(node,node.userData.draw2d||{},(group.userData.objectId||group.uuid)+':'+(node.userData.draw2dId||node.uuid));entry.scope=scope;entry.properties=node.userData.draw2d||{};entries.push(entry);if(node.userData.particleRenderer&&!camera.isOrthographicCamera&&!scope&&entry.layer===sortingLayerIndex(layers,'default')&&entry.order===0&&(!entry.properties.maskInteraction||entry.properties.maskInteraction==='none'))node.renderOrder=0;else (scopes.get(scope)?.children||roots).push(entry);
      }
    }
    let order=0;const assign=list=>{list.sort(compare);for(const entry of list)if(entry.children)assign(entry.children);else entry.node.renderOrder=++order;};assign(roots);
    const lighting=this.lighting.prepare(renderer,lights?groups:[],entries,layers);renderer.getDrawingBufferSize(this.size);const used=new Set(),buckets=new Map();
    for(const entry of entries){const mode=entry.properties.maskInteraction;if(mode!=='inside'&&mode!=='outside'){for(const material of Array.isArray(entry.node.material)?entry.node.material:[entry.node.material])if(material.userData.hbSpriteMask){material.userData.hbSpriteMask.hbSpriteMaskMode.value=0;material.userData.hbSpriteMask.hbSpriteMask.value=material.userData.hbMaskFallback||null;}continue;}
      const selected=visible(entry.node)?masks.filter(mask=>{if(mask.scope!==entry.scope)return false;const p=mask.properties;if(!p.customRange)return true;const low=sortingLayerIndex(layers,p.backSortingLayer),high=sortingLayerIndex(layers,p.frontSortingLayer);return (entry.layer>low||entry.layer===low&&entry.order>=p.backSortingOrder)&&(entry.layer<high||entry.layer===high&&entry.order<=p.frontSortingOrder);}):[];
      const key=selected.map(mask=>mask.mesh.uuid).sort().join(',');let bucket=buckets.get(key);if(!bucket)buckets.set(key,bucket={selected,entries:[]});bucket.entries.push(entry);
    }
    if(!buckets.size){this.disposeMasks();return {renderers:entries.length,maskPasses:0,maskTargets:0,...lighting};}
    const originalTarget=renderer.getRenderTarget(),autoClear=renderer.autoClear,clearAlpha=renderer.getClearAlpha(),scissorTest=renderer.getScissorTest(),viewport=renderer.getViewport(new THREE.Vector4()),scissor=renderer.getScissor(new THREE.Vector4()),xrEnabled=renderer.xr.enabled;renderer.getClearColor(this.clear);
    try{
      renderer.xr.enabled=false;renderer.autoClear=true;renderer.setScissorTest(false);renderer.setClearColor(0,0);
      for(const [key,bucket] of buckets){
        if(!bucket.selected.length){if(!this.emptyMask){this.emptyMask=new THREE.DataTexture(new Uint8Array(4),1,1,THREE.RGBAFormat);this.emptyMask.needsUpdate=true;}for(const entry of bucket.entries)for(const material of Array.isArray(entry.node.material)?entry.node.material:[entry.node.material]){const uniforms=spriteMaskUniforms(material);uniforms.hbSpriteMask.value=this.emptyMask;uniforms.hbSpriteMaskSize.value.copy(this.size);uniforms.hbSpriteMaskMode.value=entry.properties.maskInteraction==='inside'?1:2;}continue;}
        used.add(key);let target=this.targets.get(key);if(!target){target=renderer.hbMaskTarget?renderer.hbMaskTarget(this.size.x,this.size.y,{depthBuffer:false,stencilBuffer:false,minFilter:THREE.NearestFilter,magFilter:THREE.NearestFilter}):new THREE.WebGLRenderTarget(this.size.x,this.size.y,{depthBuffer:false,stencilBuffer:false,minFilter:THREE.NearestFilter,magFilter:THREE.NearestFilter});this.targets.set(key,target);}else if(target.width!==this.size.x||target.height!==this.size.y)target.setSize(this.size.x,this.size.y);
        this.maskScene.clear();for(const mask of bucket.selected){const source=mask.mesh,material=source.userData.maskMaterial;material.map=source.material.map;material.alphaTest=mask.properties.alphaCutoff;const proxy=source.userData.maskProxy??=new THREE.Mesh(source.geometry,material);proxy.matrixAutoUpdate=false;proxy.matrix.copy(source.matrixWorld);this.maskScene.add(proxy);}
        const rect=camera.userData.pixelViewport,ratio=renderer.getPixelRatio();target.viewport.set(...(rect?[rect.x*ratio,rect.y*ratio,rect.width*ratio,rect.height*ratio]:[0,0,this.size.x,this.size.y]));renderer.setRenderTarget(target);renderer.render(this.maskScene,camera);
        for(const entry of bucket.entries)for(const material of Array.isArray(entry.node.material)?entry.node.material:[entry.node.material]){const uniforms=spriteMaskUniforms(material);uniforms.hbSpriteMask.value=target.texture;uniforms.hbSpriteMaskSize.value.copy(this.size);uniforms.hbSpriteMaskMode.value=entry.properties.maskInteraction==='inside'?1:2;}
      }
    }finally{this.maskScene.clear();renderer.setRenderTarget(originalTarget);renderer.setViewport(viewport);renderer.setScissor(scissor);renderer.setScissorTest(scissorTest);renderer.setClearColor(this.clear,clearAlpha);renderer.autoClear=autoClear;renderer.xr.enabled=xrEnabled;}
    for(const [key,target] of this.targets)if(!used.has(key)){target.dispose();this.targets.delete(key);}
    return {renderers:entries.length,maskPasses:used.size,maskTargets:this.targets.size,...lighting};
  }
  disposeMasks(){for(const target of this.targets.values())target.dispose();this.targets.clear();this.emptyMask?.dispose();this.emptyMask=null;this.maskScene.clear();}
  dispose(){this.disposeMasks();this.lighting.dispose();}
}
