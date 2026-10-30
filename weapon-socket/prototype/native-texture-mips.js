import {authoredTextureLevels,validateLayeredTextureMips} from './texture-authored-mips.js';
// Explicit upload levels exclude level zero. Packing never mutates the caller.
export function textureUploadBytes(data,height,stride,flipY){
 if(!ArrayBuffer.isView(data)||!Number.isSafeInteger(height)||height<1||!Number.isSafeInteger(stride)||stride<1||!data.byteLength||data.byteLength%(height*stride))throw Error('텍스처 업로드 행을 확인하세요.');
 const bytes=new Uint8Array(data.buffer,data.byteOffset,data.byteLength);if(!flipY)return bytes;
 const copy=bytes.slice(),row=new Uint8Array(stride);for(let layer=0;layer<bytes.length/(height*stride);layer++)for(let y=0;y<Math.floor(height/2);y++){const a=(layer*height+y)*stride,b=(layer*height+height-y-1)*stride;row.set(copy.subarray(a,a+stride));copy.copyWithin(a,b,b+stride);copy.set(row,b);}return copy;
}
export function packedTextureMips(texture,width,height,encode){
 if(texture.isCubeTexture&&texture.userData?.hbAuthoredMips)return authoredTextureLevels(texture).slice(1).map(level=>({width:level.width,height:level.height,layers:6,rgbaBase64:encode(textureUploadBytes(level.data,level.height,level.width*4,texture.flipY))}));
 const levels=texture.mipmaps;if(!levels?.length)return undefined;
 if(texture.isDataArrayTexture||texture.isData3DTexture)return validateLayeredTextureMips(texture).slice(1).map(level=>({width:level.width,height:level.height,layers:level.depth,rgbaBase64:encode(textureUploadBytes(level.data,level.height,level.width*4,texture.flipY))}));
 if(!texture.isDataTexture||texture.isDataArrayTexture||texture.isData3DTexture||texture.generateMipmaps||!(texture.image.data instanceof Uint8Array||texture.image.data instanceof Uint8ClampedArray))throw Error('명시적 밉은 자동 생성 없는 RGBA8 2D 자료만 지원해요.');
 if(levels.length>1+Math.floor(Math.log2(Math.max(width,height))))throw Error('텍스처 밉 개수를 확인하세요.');
 const result=[];let w=width,h=height;for(const [index,level]of levels.entries()){
  if(level.width!==w||level.height!==h||!(level.data instanceof Uint8Array||level.data instanceof Uint8ClampedArray)||level.data.length!==w*h*4)throw Error('텍스처 밉 크기와 자료를 확인하세요.');
  if(index===0){if(level.data!==texture.image.data)throw Error('첫 밉과 기본 텍스처 자료가 달라요.');}else result.push({width:w,height:h,rgbaBase64:encode(textureUploadBytes(level.data,h,w*4,texture.flipY))});
  w=Math.max(1,Math.floor(w/2));h=Math.max(1,Math.floor(h/2));
 }return result;
}
