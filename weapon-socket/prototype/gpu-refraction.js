import {FramebufferTexture,DepthTexture,HalfFloatType,LinearMipmapLinearFilter} from 'three/webgpu';
import * as T from 'three/tsl';
import {gpuWorldViewDirection} from './gpu-camera-view.js';

// Each surface copies the preceding HDR/depth layer, including surfaces sharing a material.
export function attachGPURefraction(material){
  if(material.hbLayeredRefraction)return;
  const colorTexture=new FramebufferTexture();colorTexture.type=HalfFloatType;colorTexture.minFilter=LinearMipmapLinearFilter;
  const color=T.viewportMipTexture(T.screenUV,null,colorTexture),depth=T.viewportTexture(T.screenUV,null,new DepthTexture());
  const textures=new Set([color.defaultFramebuffer,depth.defaultFramebuffer]);for(const node of [color,depth]){const get=node.getTextureForReference;node.getTextureForReference=function(reference){const texture=get.call(this,reference);textures.add(texture);return texture;};}
  color.updateBeforeType=depth.updateBeforeType=T.NodeUpdateType.OBJECT;
  const original=material.setupLightingModel;
  material.setupLightingModel=function(builder){
    const model=original.call(this,builder),start=model.start,owner=this;
    model.start=function(b){const enabled=this.transmission;this.transmission=false;try{start.call(this,b);}finally{this.transmission=enabled;}if(!enabled)return;
      owner.userData.hbRefractionProbeBound=!!owner.hbProbeRefraction;
      const n=T.normalWorld,v=gpuWorldViewDirection,scale=T.vec3(T.modelWorldMatrix[0].xyz.length(),T.modelWorldMatrix[1].xyz.length(),T.modelWorldMatrix[2].xyz.length()),entry=T.cameraProjectionMatrix.mul(T.cameraViewMatrix.mul(T.vec4(T.positionWorld,1)));
      const sample=ior=>{
        const direction=v.negate().refract(n,ior.reciprocal()).normalize(),ray=direction.mul(T.thickness.mul(scale)),exit=T.cameraProjectionMatrix.mul(T.cameraViewMatrix.mul(T.vec4(T.positionWorld.add(ray),1))),uv=T.vec2(exit.x.div(exit.w).mul(.5).add(.5),exit.y.div(exit.w).mul(-.5).add(.5)),edge=uv.min(T.vec2(1).sub(uv)).x.min(uv.min(T.vec2(1).sub(uv)).y).div(.02).clamp(0,1).mul(exit.w.greaterThan(1e-6).select(1,0)),front=depth.sample(uv.clamp(0,1)).r.greaterThanEqual(entry.z.div(entry.w).sub(.0001)).select(1,0),rough=T.roughness.mul(ior.mul(2).sub(2).clamp(0,1));
        const fallback=owner.hbProbeRefraction?owner.hbProbeRefraction.refraction(direction,T.positionWorld,rough):color.sample(T.screenUV).rgb;
        const light=T.mix(fallback,color.sample(uv.clamp(0,1)).level(T.screenSize.x.log2().mul(rough)).rgb,edge.mul(front)),absorption=T.attenuationDistance.greaterThan(0).select(T.attenuationColor.max(1e-6).log().mul(ray.length()).div(T.attenuationDistance.max(1e-6)).exp(),T.vec3(1));return light.mul(absorption);
      };
      let light;if(this.dispersion){const spread=T.ior.sub(1).mul(T.dispersion.mul(.025));light=T.vec3(sample(T.ior.sub(spread).max(1)).r,sample(T.ior).g,sample(T.ior.add(spread)).b);}else light=sample(T.ior);
      const f=T.specularColor.add(T.vec3(1).sub(T.specularColor).mul(T.float(1).sub(n.dot(v).clamp(0,1)).pow(5)));
      b.context.backdrop=T.vec4(light.mul(T.diffuseColor.rgb).mul(T.vec3(1).sub(f)),1);b.context.backdropAlpha=T.transmission;
    };return model;
  };
  material.hbLayeredRefraction={color,depth};const dispose=material.dispose;material.dispose=function(){for(const texture of textures)texture.dispose();textures.clear();dispose.call(this);};
}
