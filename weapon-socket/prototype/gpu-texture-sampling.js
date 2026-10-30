import {vec3} from 'three/tsl';
// Confine the pinned Three WGSL array/gradient compatibility fixes to authored
// material samples; do not patch global builders or dependency files.
export function prepareGPUTextureSampling(node,type){
 // Authored cube directions match GLSL/D3D/rays; environment lighting rotation
 // belongs to environment samples, not a material's explicit cube input.
 if(type==='texturecube')node.setupUV=(_builder,uv)=>vec3(uv.x.negate(),uv.yz);
 const original=node.generateSnippet;node.generateSnippet=function(builder,property,uv,level,bias,depth,compare,grad,offset){
  if(!builder.renderer.backend.isWebGPUBackend)return original.call(this,builder,property,uv,level,bias,depth,compare,grad,offset);
  if(grad&&(type==='texturecube'||type==='texture3d'))grad=builder.getNodeProperties(this).gradNode.map(value=>value.build(builder,'vec3'));
  if(type==='texturearray'&&(level!==null||bias!==null||grad!==null)&&!builder.isUnfilterable(this.value)){
   if(depth===null)throw Error('배열 텍스처 레이어를 확인하세요.');const operation=level!==null?'textureSampleLevel':bias!==null?'textureSampleBias':'textureSampleGrad',values=level!==null?[level]:bias!==null?[bias]:grad;
   return operation+'('+[property,property+'_sampler',uv,depth,...values,...offset===null?[]:[offset]].join(',')+')';
  }
  return original.call(this,builder,property,uv,level,bias,depth,compare,grad,offset);
 };return node;
}
