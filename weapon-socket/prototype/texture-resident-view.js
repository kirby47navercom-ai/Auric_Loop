import {authoredTextureLevels} from './texture-authored-mips.js';
import {diskMipSource} from './texture-disk-mips.js';
const views=new WeakMap();
export const hasResidentMipView=map=>views.has(map);
export const residentMipBase=map=>views.get(map)?.base||0;
export const residentMipSource=map=>views.get(map)?.source||map;
// Logical levels are the decoded/import-policy result, before GPU residency.
// This helper owns no image decode, upload, bind, budget decision or timer.
export function residentSourceLevels(map){
 const source=residentMipSource(map);
 const disk=diskMipSource(source);if(disk)return disk.levels;
 if(source.userData?.hbAuthoredMips&&(source.isCubeTexture||source.isDataArrayTexture||source.isData3DTexture))return authoredTextureLevels(source);
 if(!source.userData?.hbCookedMips||!source.isDataTexture||source.isDataArrayTexture||source.isData3DTexture||source.generateMipmaps)throw Error('상주 밉 전환은 가져온 RGBA8 사용자 지정 밉이 필요해요.');
 const levels=source.mipmaps,base=source.image;if(!Array.isArray(levels)||!levels.length||!Number.isSafeInteger(base?.width)||base.width<1||!Number.isSafeInteger(base?.height)||base.height<1||levels.length>1+Math.floor(Math.log2(Math.max(base.width,base.height))))throw Error('상주 밉 체인 크기를 확인하세요.');
 let width=base.width,height=base.height;for(const[index,l]of levels.entries()){if(l.width!==width||l.height!==height||!(l.data instanceof Uint8Array||l.data instanceof Uint8ClampedArray)||!Number.isSafeInteger(width*height*4)||l.data.length!==width*height*4||index===0&&l.data!==base.data)throw Error('상주 밉의 크기와 자료가 달라요.');width=Math.max(1,Math.floor(width/2));height=Math.max(1,Math.floor(height/2));}
 return levels.map(l=>({...l,depth:1}));
}
export function residentMipInfo(map){
 const source=residentMipSource(map),levels=residentSourceLevels(source),base=residentMipBase(map),first=levels[base];
 const disk=diskMipSource(source);return {base,width:first.width,height:first.height,depth:first.depth,levels:levels.length-base,logicalWidth:levels[0].width,logicalHeight:levels[0].height,logicalDepth:levels[0].depth,logicalLevels:levels.length,residentBytes:levels.slice(base).reduce((n,l)=>n+(l.data?.byteLength||0),0),sourceMipBytes:levels.reduce((n,l)=>n+(l.data?.byteLength||0),0),...(disk?{disk:disk.state()}:{} )};
}
export function createResidentMipView(C,map,base){
 const source=residentMipSource(map),levels=residentSourceLevels(source);if(!Number.isInteger(base)||base<0||base>=levels.length)throw Error('상주 시작 밉을 확인하세요.');
 const disk=diskMipSource(source);if(disk&&levels.slice(base).some(l=>!l.data))throw Error('디스크 밉을 먼저 비동기로 읽어야 해요.');
 const cube=!!source.isCubeTexture,first=levels[base],image=cube?(base===0?source.images:source.mipmaps[base-1].images).slice():{data:first.data,width:first.width,height:first.height,...source.isData3DTexture||source.isDataArrayTexture?{depth:first.depth}:{}},mipmaps=cube?source.mipmaps.slice(base):levels.slice(base),Type=cube?C.CubeTexture:source.isData3DTexture?C.Data3DTexture:source.isDataArrayTexture?C.DataArrayTexture:C.DataTexture;
 // Texture.copy marks its Source as updated. Supply the new Source before
 // copying, so creating a candidate never changes the original Source version.
 const view=new Type();view.copy({...map,source:new C.Source(image),mipmaps});if(map.wrapR!==undefined)view.wrapR=map.wrapR;
 view.userData.hbResidentMipBase=base;views.set(view,{source,base});if(disk){const release=disk.retain(base);let disposed=false;view.addEventListener('dispose',()=>{if(disposed)return;disposed=true;release();view.image.data=null;view.mipmaps=[];});}return view;
}
export async function prepareResidentMipView(C,map,base,{signal}={}){signal?.throwIfAborted();const disk=diskMipSource(residentMipSource(map));if(!disk)return createResidentMipView(C,map,base);const release=await disk.acquire(base,signal);try{signal?.throwIfAborted();return createResidentMipView(C,map,base);}finally{release();}}
export function residentLogicalLOD(map,lod){if(!Number.isFinite(lod))throw Error('논리 밉 수준을 확인하세요.');return Math.max(0,lod-residentMipBase(map));}
export const textureResidencyContract=Object.freeze({version:1,cpp:'Materials::SetResidentMip(target,parameter,level); -1 releases manual request to TextureStreaming, or restores base0 while no pool is active',node:'materialResidentMip',source:'decoded import-policy RGBA8 2D/array/cube/volume levels, or opt-in authored2D image-per-level disk sources; project files untouched',logical:'LOD inputs use source levels; explicit LOD subtracts resident base while automatic derivatives use physical resident dimensions',views:'fresh texture/Source identity with existing source pixel buffers and sampler/UV/color flags; creating a candidate does not dispose, upload or modify the original',accounting:'RGBA8 mip payload bytes; excludes driver padding/heap overhead and other resources. D3D textureResourceBytes totals allocated explicit texture payloads; sourceMipBytes are CPU decoded data; committing a binding precedes its next GPU upload/present',restore:'base0 uses retained decoded source, or asynchronously rereads explicit disk levels; never reconstruct fine mips from a coarse view',transition:'staged view, whole selection validity/cancel, latest parameter generation and source/UV/sampler stamps; original source levels map to physical level-minus-base regions; nonresident writes preserve source and emit no GPU box',remaining:'additional disk domains/cooking, exact procedural/secondary-view demand, whole-GPU budgets/heaps, raw/HDR/compressed domains and platform cooking; automatic node-material mip pool is a separate textureResidencyPool contract'});
