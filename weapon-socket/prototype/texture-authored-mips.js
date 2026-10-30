export const authoredTextureMipContract=Object.freeze({version:1,dimensions:Object.freeze(['texture2d','texturearray','volumetexture','cubemap']),descriptor:'images is level zero; optional mips:[{images:[asset paths]}] stores subsequent consecutive levels',layout:'RGBA8 top-down slice-major; floor-half width/height, array/cube layer count unchanged, cube six square faces, volume depth floor-halved; a complete chain ends at 1x1 or 1x1x1 for volumes',policy:'authored levels are never regenerated; 2D preserves explicit import color/normal/coverage/composite/top-mip policy; all levels and slices must be present and dimensionally consistent',ownership:'decoded data is owned by the texture; source images are preserved; uploads only when texture version changes',editing:'document.patch/save and normal undo; image references participate in dependency/rename/packaging',backends:Object.freeze(['WebGL2','WebGPU','DirectX11','packed-ray-mips'])});
export function validAuthoredMipDescriptors(kind,images,mips,imagePath){
 if(mips===undefined)return true;if(!Array.isArray(mips))return false;if(!mips.length)return true;
 if(!['texture2d','texturearray','volumetexture','cubemap'].includes(kind))return false;let depth=images.length;
 return mips.every(level=>{if(kind==='volumetexture')depth=Math.max(1,Math.floor(depth/2));return !!level&&typeof level==='object'&&!Array.isArray(level)&&Object.keys(level).every(k=>k==='images')&&Array.isArray(level.images)&&level.images.length===depth&&level.images.every(imagePath);});
}
export const textureDescriptorImages=data=>[...data.images,...(data.mips||[]).flatMap(l=>l.images)];
export function validateLayeredTextureMips(texture){
 const volume=!!texture.isData3DTexture,array=!!texture.isDataArrayTexture,base=texture.image,levels=texture.mipmaps;
 if(!volume&&!array||texture.generateMipmaps||!Array.isArray(levels)||!levels.length)throw Error('배열·볼륨의 사용자 지정 밉을 확인하세요.');
 let w=base.width,h=base.height,d=base.depth;
 if(![w,h,d].every(n=>Number.isSafeInteger(n)&&n>0)||levels.length>1+Math.floor(Math.log2(Math.max(w,h,volume?d:1))))throw Error('사용자 지정 밉 개수와 크기를 확인하세요.');
 for(const[index,level]of levels.entries()){
  if(level.width!==w||level.height!==h||level.depth!==d||!(level.data instanceof Uint8Array||level.data instanceof Uint8ClampedArray)||!Number.isSafeInteger(w*h*d*4)||level.data.length!==w*h*d*4||index===0&&level.data!==base.data)throw Error('사용자 지정 밉 크기·슬라이스·RGBA8 자료가 달라요.');
  w=Math.max(1,Math.floor(w/2));h=Math.max(1,Math.floor(h/2));if(volume)d=Math.max(1,Math.floor(d/2));
 }
 // Sampling an incomplete chain would silently clamp or read uninitialized mips.
 const last=levels.at(-1);if(last.width!==1||last.height!==1||volume&&last.depth!==1)throw Error('사용자 지정 밉을 마지막 1 크기까지 지정하세요.');
 return levels;
}
const cubeLevels=new WeakMap();
export function authoredTextureLevels(texture){
 if(!texture.isCubeTexture)return validateLayeredTextureMips(texture);
 const old=cubeLevels.get(texture);if(old?.version===texture.version&&old.images===texture.image&&old.mips===texture.mipmaps)return old.levels;
 if(texture.generateMipmaps||!Array.isArray(texture.image)||texture.image.length!==6||!Array.isArray(texture.mipmaps))throw Error('사용자 지정 큐브 밉을 확인하세요.');
 const levels=[];let width=texture.image[0]?.image?.width;
 if(!Number.isSafeInteger(width)||width<1||texture.mipmaps.length!==Math.floor(Math.log2(width)))throw Error('큐브 밉을 마지막 1 크기까지 지정하세요.');
 for(const row of [texture,...texture.mipmaps]){
  if(!row.isCubeTexture||row.images.length!==6)throw Error('큐브 밉의 여섯 면을 확인하세요.');
  const faces=row.images.map(face=>face?.image),slice=width*width*4;
  if(!Number.isSafeInteger(slice*6)||faces.some(face=>face?.width!==width||face.height!==width||!(face.data instanceof Uint8Array||face.data instanceof Uint8ClampedArray)||face.data.length!==slice))throw Error('큐브 밉의 정사각형 크기·RGBA8 면 자료를 확인하세요.');
  const first=faces[0].data,shared=faces.every((face,i)=>face.data.buffer===first.buffer&&face.data.byteOffset===first.byteOffset+i*slice),data=shared?new Uint8Array(first.buffer,first.byteOffset,slice*6):new Uint8Array(slice*6);
  if(!shared)for(let i=0;i<6;i++)data.set(faces[i].data,i*slice);levels.push({width,height:width,depth:6,data});width=Math.max(1,Math.floor(width/2));
 }
 cubeLevels.set(texture,{version:texture.version,images:texture.image,mips:texture.mipmaps,levels});return levels;
}
export async function loadAuthoredLayeredTexture(THREE,asset,loader,fileUrl,first){
 const volume=asset.dimension==='volumetexture',cube=asset.dimension==='cubemap',levels=[],canvas=document.createElement('canvas');let width=first.width,height=first.height,depth=asset.images.length;
 try{
  const context=canvas.getContext('2d',{willReadFrequently:true});if(!context)throw Error('사용자 지정 밉 이미지를 읽지 못했어요.');
  for(const[level,images]of [asset.images,...asset.mips.map(m=>m.images)].entries()){
   if(!Number.isSafeInteger(width*height*depth*4)||width*height*depth*4>2147483647)throw Error('사용자 지정 밉 자료 크기를 확인하세요.');
   canvas.width=width;canvas.height=height;const data=new Uint8Array(width*height*depth*4);
   for(let z=0;z<images.length;z++){const image=level===0&&z===0?first:await loader.loadAsync(fileUrl(images[z]));if(image.width!==width||image.height!==height)throw Error('사용자 지정 밉의 이미지 크기를 맞춰 주세요.');context.clearRect(0,0,width,height);context.drawImage(image,0,0);data.set(context.getImageData(0,0,width,height).data,z*width*height*4);}
   levels.push({width,height,depth,data});width=Math.max(1,Math.floor(width/2));height=Math.max(1,Math.floor(height/2));if(volume)depth=Math.max(1,Math.floor(depth/2));
  }
  const asCube=level=>new THREE.CubeTexture(Array.from({length:6},(_,i)=>new THREE.DataTexture(level.data.subarray(i*level.width*level.height*4,(i+1)*level.width*level.height*4),level.width,level.height,THREE.RGBAFormat,THREE.UnsignedByteType))),base=levels[0],map=cube?asCube(base):volume?new THREE.Data3DTexture(base.data,base.width,base.height,base.depth):new THREE.DataArrayTexture(base.data,base.width,base.height,base.depth);map.mipmaps=cube?levels.slice(1).map(asCube):levels;map.generateMipmaps=false;map.flipY=false;map.unpackAlignment=1;map.userData.hbAuthoredMips=true;
  try{authoredTextureLevels(map);}catch(error){map.dispose();throw error;}return map;
 }finally{canvas.width=canvas.height=0;}
}
