import {Color,Matrix4,Vector4,WebGLRenderTarget,HalfFloatType,ShaderMaterial} from 'three';

export class ObjectMotionPass{
 constructor(){
  this.target=new WebGLRenderTarget(1,1,{type:HalfFloatType,depthBuffer:true});
  const uniforms={hbPreviousBones:{value:null},hbPreviousInstances:{value:null},hbPreviousWeights:{value:[]},hbPreviousBase:{value:1},hbBindCorrection:{value:[0,0,0]},hbPreviousMVP:{value:new Matrix4()},hbFlag:{value:0},hbIgnore:{value:0},hbJitter:{value:new Vector4()},hbMap:{value:null},hbHasMap:{value:0},hbAlpha:{value:1},hbCutoff:{value:0}};
  this.material=new ShaderMaterial({uniforms,depthTest:true,depthWrite:true,toneMapped:false,vertexShader:`#include <common>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
uniform sampler2D hbPreviousBones,hbPreviousInstances;uniform vec3 hbBindCorrection;
#ifdef USE_MORPHTARGETS
uniform float hbPreviousWeights[MORPHTARGETS_COUNT],hbPreviousBase;
#endif
mat4 hbHistoryMatrix(sampler2D source,int index){return mat4(texelFetch(source,ivec2(0,index),0),texelFetch(source,ivec2(1,index),0),texelFetch(source,ivec2(2,index),0),texelFetch(source,ivec2(3,index),0));}
uniform float hbFlag;uniform mat4 hbPreviousMVP;varying vec4 hbPreviousClip,hbCurrentClip;varying vec2 hbUv;void main(){hbUv=uv;vec3 transformed=position;
#include <morphinstance_vertex>
#include <morphtarget_vertex>
#include <skinbase_vertex>
#include <skinning_vertex>
vec3 previousPosition=position;if(abs(hbFlag)>.5&&hbFlag<1.5){
#ifdef USE_MORPHTARGETS
previousPosition*=hbPreviousBase;for(int t=0;t<MORPHTARGETS_COUNT;t++)previousPosition+=getMorph(gl_VertexID,t,0).xyz*hbPreviousWeights[t];
#endif
#ifdef USE_SKINNING
mat4 previousSkin=hbHistoryMatrix(hbPreviousBones,int(skinIndex.x))*skinWeight.x+hbHistoryMatrix(hbPreviousBones,int(skinIndex.y))*skinWeight.y+hbHistoryMatrix(hbPreviousBones,int(skinIndex.z))*skinWeight.z+hbHistoryMatrix(hbPreviousBones,int(skinIndex.w))*skinWeight.w;
previousPosition=(previousSkin*vec4(previousPosition,1.0)).xyz+hbBindCorrection*(1.0-dot(skinWeight,vec4(1)));
#endif
#ifdef USE_INSTANCING
previousPosition=(hbHistoryMatrix(hbPreviousInstances,gl_InstanceID)*vec4(previousPosition,1.0)).xyz;
#endif
}else{previousPosition=transformed;
#ifdef USE_INSTANCING
previousPosition=(instanceMatrix*vec4(previousPosition,1.0)).xyz;
#endif
}hbPreviousClip=hbPreviousMVP*vec4(previousPosition,1.0);
#include <project_vertex>
hbCurrentClip=gl_Position;}`,fragmentShader:'uniform float hbFlag,hbIgnore,hbHasMap,hbAlpha,hbCutoff;uniform vec4 hbJitter;uniform sampler2D hbMap;varying vec4 hbPreviousClip,hbCurrentClip;varying vec2 hbUv;void main(){if(hbIgnore>.5)discard;float a=hbAlpha;if(hbHasMap>.5)a*=texture2D(hbMap,hbUv).a;if(a<hbCutoff)discard;vec3 now=hbCurrentClip.xyz/hbCurrentClip.w*.5+.5,old=hbPreviousClip.xyz/max(.000001,hbPreviousClip.w)*.5+.5;if(hbFlag>1.5)old=vec3(now.xy-hbJitter.xy+hbJitter.zw,now.z);gl_FragColor=vec4(old,hbFlag>1.5?2.0+now.z:sign(hbFlag)*max(.000001,now.z));}'});
 }
 render(renderer,scene,camera,frame){
  const u=this.material.uniforms,previousVP=new Matrix4().fromArray(frame.packed.previousVP);u.hbJitter.value.fromArray(frame.packed.jitter);
  this.material.onBeforeRender=(r,s,c,g,object,group)=>{const source=Array.isArray(object.material)?object.material[group?.materialIndex||0]:object.material,value=frame.objects.get(object);const textures=frame.objects.textures(value);u.hbPreviousBones.value=textures?.bones||null;u.hbPreviousInstances.value=textures?.instances||null;u.hbPreviousWeights.value=value.pose?.weights||[];u.hbPreviousBase.value=object.geometry.morphTargetsRelative?1:1-(value.pose?.weights||[]).reduce((a,b)=>a+b,0);u.hbBindCorrection.value=value.pose?.bindTranslation||[0,0,0];u.hbFlag.value=value.flag;u.hbIgnore.value=!source||source.transparent||!object.isMesh||object.userData.sprite||object.userData.draw2d||source.isShaderMaterial?1:0;u.hbPreviousMVP.value.multiplyMatrices(previousVP,value.world);u.hbMap.value=source?.map||null;u.hbHasMap.value=source?.map?1:0;u.hbAlpha.value=source?.opacity??1;u.hbCutoff.value=source?.alphaTest??0;this.material.side=source?.side??0;this.material.uniformsNeedUpdate=true;};
  const target=renderer.getRenderTarget(),override=scene.overrideMaterial,background=scene.background,alpha=renderer.getClearAlpha(),color=renderer.getClearColor(new Color()),autoClear=renderer.autoClear;
  try{scene.overrideMaterial=this.material;scene.background=null;renderer.autoClear=true;renderer.setClearColor(0,0);renderer.setRenderTarget(this.target);renderer.render(scene,camera);}finally{scene.overrideMaterial=override;scene.background=background;renderer.autoClear=autoClear;renderer.setClearColor(color,alpha);renderer.setRenderTarget(target);this.material.onBeforeRender=()=>{};}
 }
 setSize(w,h){this.target.setSize(w,h);}
 dispose(){this.target.dispose();this.material.dispose();}
}
