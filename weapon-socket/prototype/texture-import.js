import {cookTextureMipsAsync} from './texture-mip-cook.js';
import {textureImportPolicy,textureImportColorSpace} from './texture-mip-policy.js';
import {compositeNormalSource} from './texture-composite.js';
import {loadTextureImage} from './texture-image-load.js';
import {DiskMipSource,attachDiskMipSource} from './texture-disk-mips.js';
import {prepareResidentMipView} from './texture-resident-view.js';

// Canonical cook data is top-down. Bake the image-loader flip into each owned
// upload level once so GL, WebGPU, native and packed ray data see identical UVs.
function flipRows(level){const {width,height,data}=level,stride=width*4,row=new Uint8Array(stride);for(let y=0;y<Math.floor(height/2);y++){const a=y*stride,b=(height-y-1)*stride;row.set(data.subarray(a,a+stride));data.copyWithin(a,b,b+stride);data.set(row,b);}}
function readImage(image){const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;try{const context=canvas.getContext('2d',{willReadFrequently:true});if(!context)throw Error('텍스처 원본 픽셀을 읽지 못했어요.');context.drawImage(image,0,0);return{width:image.width,height:image.height,data:context.getImageData(0,0,image.width,image.height).data};}finally{canvas.width=canvas.height=0;}}
export async function loadImportedTexture2D(THREE,asset,fileUrl,resources,{signal}={}){
 if(asset.streaming?.enabled){const disk=new DiskMipSource(asset,fileUrl),base=asset.streaming.initialMip,first=disk.levels[0],root=new THREE.DataTexture(undefined,first.width,first.height);root.mipmaps=disk.levels;root.generateMipmaps=false;root.flipY=false;root.unpackAlignment=1;root.userData.hbCookedMips=true;root.userData.hbDiskMips=true;root.userData.hbTextureImportReport={policy:textureImportPolicy(asset.import),colorSpace:textureImportColorSpace(textureImportPolicy(asset.import)),source:{width:first.width,height:first.height,bytes:first.bytes},topMip:0,dimensions:disk.levels.map(l=>[l.width,l.height]),storedBytes:disk.levels.reduce((n,l)=>n+l.bytes,0),sourcePreserved:true,authored:true,authoredSources:disk.levels.map(l=>l.path),disk:true};attachDiskMipSource(root,disk);return prepareResidentMipView(THREE,root,base,{signal});}
 const policy=textureImportPolicy(asset.import),source=compositeNormalSource(asset,resources),image=await loadTextureImage(fileUrl(asset.images[0]),signal),normal=source?(source===asset.images[0]?image:await loadTextureImage(fileUrl(source),signal)):null;let cooked;const authoredImages=[];for(const mip of asset.mips||[])authoredImages.push(await loadTextureImage(fileUrl(mip.images[0]),signal));
 for(let attempt=0;attempt<2;attempt++){try{signal?.throwIfAborted();const pixels=readImage(image);cooked=await cookTextureMipsAsync(pixels,policy,{signal,transfer:true,composite:asset.composite,normalPixels:normal===image?pixels:normal?readImage(normal):undefined,authoredLevels:authoredImages.length?authoredImages.map(readImage):undefined});break;}catch(error){if(!error.retryTextureDecode||attempt)throw error;}}
 signal?.throwIfAborted();
 if(cooked.report.authored)cooked.report.authoredSources=[asset.images[0],...asset.mips.map(m=>m.images[0])];for(const level of cooked.levels)flipRows(level);const base=cooked.levels[0],map=new THREE.DataTexture(base.data,base.width,base.height,THREE.RGBAFormat,THREE.UnsignedByteType);map.mipmaps=cooked.levels;map.generateMipmaps=false;map.flipY=false;map.unpackAlignment=1;map.userData.hbCookedMips=true;map.userData.hbTextureImportReport=cooked.report;return map;
}
