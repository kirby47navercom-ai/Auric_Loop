import {gpuLight2DUniforms} from './gpu-2d-lighting.js';
import {MeshBasicNodeMaterial,MeshStandardNodeMaterial,SpriteNodeMaterial,DataTexture,DoubleSide,Color,Vector2,Vector4,AdditiveBlending,NormalBlending,RenderTarget} from 'three/webgpu';
import {Fn,If,uniform,texture,vec3,vec4,positionLocal,normalWorld,modelViewMatrix,modelWorldMatrixInverse,cameraWorldMatrix,screenUV,diffuseColor,mix,float,materialReference,attribute,positionGeometry,uv,smoothstep} from 'three/tsl';

export function createGPUViewportMaterial(original,mode){
  const lit=mode==='lighting'||mode==='detailLighting',Type=original.isSpriteNodeMaterial?SpriteNodeMaterial:lit?MeshStandardNodeMaterial:MeshBasicNodeMaterial,m=new Type({color:mode==='unlit'?original.color||0xffffff:mode==='wireframe'?0xb7c5d5:0xbfbfbf,side:mode==='wireframe'?DoubleSide:original.side,transparent:original.transparent,opacity:original.opacity,alphaTest:original.alphaTest,depthWrite:original.depthWrite,blending:original.blending,wireframe:mode==='wireframe'});
  for(const key of ['positionNode','scaleNode','rotationNode','opacityNode','alphaTestNode','maskNode'])if(original[key])m[key]=original[key];
  if(mode==='normals'){m.colorNode=normalWorld.mul(.5).add(.5);m.toneMapped=false;}else if(mode==='unlit'){m.map=original.map||null;m.colorNode=original.colorNode;}if(mode==='detailLighting'||mode==='normals'){m.normalNode=original.normalNode;m.normalMap=original.normalMap;m.bumpMap=original.bumpMap;m.bumpScale=original.bumpScale;if(original.normalScale)m.normalScale?.copy(original.normalScale);}
  // Diagnostic materials borrow source textures/nodes; the source object remains their owner.
  m.userData.hbViewportGPU=true;return m;
}

export function gpuSpriteMask(material){
  if(material.userData.hbSpriteMask)return material.userData.hbSpriteMask;
  const fallback=new DataTexture(new Uint8Array([255,255,255,255]),1,1);fallback.needsUpdate=true;
  const map=texture(fallback,screenUV),mode=uniform(0),size=uniform(new Vector2(1,1));
  material.maskNode=mode.lessThan(.5).or(mode.lessThan(1.5).select(map.r.greaterThanEqual(.5),map.r.lessThan(.5)));
  material.userData.hbGPU=true;material.userData.hbMaskFallback=fallback;material.userData.hbSpriteMask={hbSpriteMask:map,hbSpriteMaskMode:mode,hbSpriteMaskSize:size};
  const dispose=material.dispose.bind(material);let released=false;material.dispose=()=>{if(released)return;released=true;fallback.dispose();dispose();};return material.userData.hbSpriteMask;
}

export function createGPUSpriteMaterial(map,p,normalMap,lightingTextures){
  const tint=p.color||[1,1,1,1],mode=p.blendMode||'translucent',lit=['lit','lit2d'].includes(p.shading);
  const material=new (lit?MeshStandardNodeMaterial:MeshBasicNodeMaterial)({map,color:new Color(...tint.slice(0,3)),opacity:tint[3],transparent:['translucent','additive'].includes(mode),blending:mode==='additive'?AdditiveBlending:NormalBlending,alphaTest:mode==='masked'?(p.alphaCutoff??.5):0,side:DoubleSide,depthWrite:!['translucent','additive'].includes(mode)});
  if(lit&&normalMap){material.normalMap=normalMap;const strength=p.normalStrength??1;material.normalScale.set(strength,p.normalFlipY?-strength:strength);}
  const ppu=uniform(0),flash=uniform(0),emission=uniform(p.emissiveIntensity||0);
  material.positionNode=Fn(()=>{const local=positionLocal.toVar(),view=modelViewMatrix.mul(vec4(local,1)).toVar();If(ppu.greaterThan(0),()=>{const snapped=vec4(view.xy.mul(ppu).add(.5).floor().div(ppu),view.zw);local.assign(modelWorldMatrixInverse.mul(cameraWorldMatrix).mul(snapped).xyz);});return local;})();
  const output=material.setupOutput.bind(material);material.setupOutput=(builder,value)=>output(builder,vec4(mix(value.rgb.add(diffuseColor.rgb.mul(emission)),vec3(1),flash.clamp(0,1)),value.a));
  material.userData.hbGPU=true;material.userData.hbSpriteEffectsOwner=material.uuid;material.userData.hbSpriteEffects={hbPixelPPU:ppu,hbSpriteFlash:flash,hbSpriteEmission:emission};
  if(p.shading==='lit2d')gpuLight2DUniforms(material,lightingTextures);
  if(['inside','outside'].includes(p.maskInteraction))gpuSpriteMask(material);
  material.clone=()=>{const clone=createGPUSpriteMaterial(material.map,p,material.normalMap,lightingTextures);clone.hbLight2DMaskTexture=material.hbLight2DMaskTexture;return clone;};return material;
}

export function createGPUMaskMaterial(map,alphaCutoff){
  const material=new MeshBasicNodeMaterial({map,color:'#ffffff',alphaTest:alphaCutoff,side:DoubleSide,depthTest:false,depthWrite:false,toneMapped:false});
  // The shared mask includes alpha equal to the cutoff; NodeMaterial's stock test uses <=.
  material.colorNode=vec3(1);material.alphaTestNode=float(-1);material.maskNode=(map?materialReference('map','texture').a:float(1)).greaterThanEqual(materialReference('alphaTest','float'));return material;
}

export const gpuMaskTarget=(w,h,options)=>new RenderTarget(w,h,options);

export function createGPUProjectileMaterial(style){
  const fallback=new DataTexture(new Uint8Array([255,255,255,255]),1,1);fallback.needsUpdate=true;const map=texture(fallback),u={uvRect:uniform(new Vector4(0,0,1,1)),shape:uniform(new Vector2(1,1)),hasMap:uniform(false,'bool'),tint:uniform(new Vector4(...style.color)),size:uniform(style.size),planeXZ:uniform(style.plane==='XZ','bool')};let source=null;u.map={get value(){return source;},set value(value){source=value;map.value=value||fallback;}};
  const offset=positionGeometry.xy.mul(u.shape).mul(u.size),sample=u.hasMap.select(map.uv(u.uvRect.xy.add(uv().mul(u.uvRect.zw))),vec4(1,1,1,float(1).sub(smoothstep(.42,.5,uv().sub(.5).length())))),material=new MeshBasicNodeMaterial({transparent:true,depthWrite:false,side:DoubleSide,alphaTest:.001});material.positionNode=attribute('shotPosition','vec3').add(u.planeXZ.select(vec3(offset.x,0,offset.y),vec3(offset,0)));material.colorNode=u.tint.rgb.mul(sample.rgb);material.opacityNode=u.tint.a.mul(sample.a);material.uniforms=u;material.userData.hbGPU=true;const dispose=material.dispose.bind(material);let released=false;material.dispose=()=>{if(released)return;released=true;fallback.dispose();dispose();};return material;
}
