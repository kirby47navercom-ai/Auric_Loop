const sampleKeys=new Set(['texture','sampleArray','sampleVolume','sampleCube']);
export const volumeMipContract=Object.freeze({formats:Object.freeze(['rgba8unorm','rgba8unorm-srgb']),trigger:'owned volume upload only',filter:'compute area weights in3D, including odd dimensions; linear sRGB averaging',levels:'max(width,height,depth)',temporary:'one smaller mip chain, destroyed after submission',diagnostics:'gpuVolumeMipState(renderer); on demand, no GPU readback',idle:'no regeneration'});
export const textureSamplingContract=Object.freeze({version:1,volumeMips:volumeMipContract,modes:Object.freeze(['auto','lod','bias','gradient']),defaults:Object.freeze({texture:'auto',sampleArray:'auto',sampleVolume:'auto',sampleCube:'lod'}),inactiveInputs:'retained in JSON and Undo; ignored by compilation',gradients:'coordinate deltas; vec2 for 2D/array, vec3 for volume/cube; no array layer derivative',rayEncoding:Object.freeze({legacy:'0..11 unchanged',tagged:'64..111; mode*12 + sampler filter',reserved:'12..63 rejected'}),biasRange:Object.freeze([-16,15.99]),rayBias:'bias added before clamping raw cone LOD; zero footprint remains level0',history:'controls are ordinary graph inputs in current and committed previous material programs'});
export const textureSamplingNode=node=>sampleKeys.has(node.key);
export const materialMipMode=node=>node.mipMode??(node.key==='sampleCube'?'lod':'auto');
export const validMaterialMipMode=node=>node.mipMode===undefined||textureSamplingNode(node)&&textureSamplingContract.modes.includes(node.mipMode);
const controls=new Set(['lod','bias','gradientX','gradientY']);
export function textureSamplingPins(key,inputs){
 if(!sampleKeys.has(key))return inputs;const type=['sampleVolume','sampleCube'].includes(key)?'vec3':'vec2',size=Number(type.slice(3)),pin=(id,label,type,value)=>({id,label,type,value});
 return [...inputs,...(inputs.some(p=>p.id==='lod')?[]:[pin('lod','LOD','float',0)]),pin('bias','Mip Bias · 밉 바이어스','float',0),pin('gradientX','DDX',type,Array(size).fill(0)),pin('gradientY','DDY',type,Array(size).fill(0))];
}
export function activeTextureSamplingInputs(node,inputs){if(!textureSamplingNode(node))return inputs;const mode=materialMipMode(node);return inputs.filter(p=>!controls.has(p.id)||p.id===mode||mode==='gradient'&&p.id.startsWith('gradient'));}
export function textureSamplingGLSL(node,type,uniform,args,residentBase=null){
 const mode=materialMipMode(node),coordinate=type==='texturecube'?args.direction:type==='texturearray'?'vec3('+args.uv+',floor('+args.index+'+0.5))':args.uv;
 if(mode==='lod')return 'textureLod('+uniform+','+coordinate+',max(0.0,'+(residentBase?'('+args.lod+')-('+residentBase+')':args.lod)+'))';
 if(mode==='gradient')return 'textureGrad('+uniform+','+coordinate+','+args.gradientX+','+args.gradientY+')';
 const fn=type==='texture2d'?'texture2D':'texture';return fn+'('+uniform+','+coordinate+(mode==='bias'?',clamp('+args.bias+',-16.0,15.99)':'')+')';
}
export const validRayTextureFlags=flags=>Number.isInteger(flags)&&(flags>=0&&flags<=11||flags>=64&&flags<=111);
export function rayTextureSampling(kind,flags){if(!validRayTextureFlags(flags))throw Error('광선 텍스처 밉 모드를 확인하세요.');return flags<12?{mode:kind===3?'lod':'auto',filter:flags,tagged:false}:{mode:textureSamplingContract.modes[Math.floor((flags-64)/12)],filter:(flags-64)%12,tagged:true};}
export function rayTextureSamplingFlags(node,filter){const mode=materialMipMode(node);return mode==='auto'&&node.key!=='sampleCube'||mode==='lod'&&node.key==='sampleCube'?filter:64+textureSamplingContract.modes.indexOf(mode)*12+filter;}
export const rayTextureVariantIndex=(kind,flags)=>kind*60+(flags<12?flags:flags-64+12);
export const rayTextureVariantFlags=index=>index%60<12?index%60:index%60-12+64;
