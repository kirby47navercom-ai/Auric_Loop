import {authoredTextureLevels,validateLayeredTextureMips} from './texture-authored-mips.js';
import {textureUploadBytes} from './native-texture-mips.js';
import {textureUploadRegions} from './texture-region-updates.js';
import {initGLTextureRegions} from './gpu-texture-regions-gl.js';
const installed=new WeakSet(),glUploads=new WeakMap(),glMaps=new WeakMap();
const ownedLevels=map=>map.userData?.hbAuthoredMips?authoredTextureLevels(map):map.mipmaps.map(l=>({...l,depth:1}));
// Three uploads only level zero for DataArrayTexture/Data3DTexture. Keep the
// correction at texture creation/update, never in the draw or steady-frame path.
export function prepareGPUAuthoredMips(renderer,texture){
 if(!texture.userData.hbAuthoredMips&&!texture.userData.hbCookedMips)return texture;const levels=ownedLevels(texture);
 const backend=renderer?.backend;
 if(backend?.isWebGPUBackend&&!installed.has(backend)){
  installed.add(backend);const create=backend.createTexture,update=backend.updateTexture;
  backend.createTexture=function(map,options){return create.call(this,map,map.userData?.hbAuthoredMips||map.userData?.hbCookedMips?{...options,levels:ownedLevels(map).length}:options);};
  backend.updateTexture=function(map,options){
   if(!map.userData?.hbAuthoredMips&&!map.userData?.hbCookedMips)return update.call(this,map,options);
   const levels=ownedLevels(map),resource=this.get(map);if(!resource.textureDescriptorGPU)return update.call(this,map,options);
   const patches=textureUploadRegions(map,resource.version);if(patches)for(const p of patches)this.device.queue.writeTexture({texture:resource.texture,mipLevel:p.level,origin:{x:p.x,y:p.y,z:p.z}},p.data,{bytesPerRow:p.width*4,rowsPerImage:p.height},{width:p.width,height:p.height,depthOrArrayLayers:p.depth});
   else for(const[level,mip]of levels.entries())this.device.queue.writeTexture({texture:resource.texture,mipLevel:level},textureUploadBytes(mip.data,mip.height,mip.width*4,map.flipY),{bytesPerRow:mip.width*4,rowsPerImage:mip.height},{width:mip.width,height:mip.height,depthOrArrayLayers:mip.depth});resource.version=map.version;
  };
 }else if(renderer?.isWebGLRenderer&&texture.userData.hbAuthoredMips&&!texture.isCubeTexture){
  let maps=glMaps.get(renderer);if(!maps){maps=new WeakSet();glMaps.set(renderer,maps);}
  if(!maps.has(texture)){maps.add(texture);const updated=texture.onUpdate;texture.onUpdate=function(...args){updated?.apply(this,args);uploadGL(renderer,this);};}
 }
 if(renderer?.isWebGLRenderer){
  if(initGLTextureRegions(renderer,texture))return texture;
  if(texture.isCubeTexture){
   // Pinned Three uploads cube.mipmaps[j] at j+1, while its allocator counts
   // only that array. Correct this one synchronous owned allocation, then
   // restore the context method; no auto-generation or steady-frame wrapper.
   const gl=renderer.getContext(),storage=gl.texStorage2D,width=levels[0].width;
   gl.texStorage2D=function(target,count,format,w,h,...rest){return storage.call(this,target,target===gl.TEXTURE_CUBE_MAP&&w===width&&h===width?levels.length:count,format,w,h,...rest);};
   try{renderer.initTexture(texture);}finally{gl.texStorage2D=storage;}
  }else renderer.initTexture(texture);
 }
 return texture;
}
function uploadGL(renderer,map){
 let versions=glUploads.get(renderer);if(!versions){versions=new WeakMap();glUploads.set(renderer,versions);}const resource=renderer.properties.get(map).__webglTexture;if(!resource)return;const previousUpload=versions.get(map);if(previousUpload?.version===map.version&&previousUpload.resource===resource)return;const levels=validateLayeredTextureMips(map),gl=renderer.getContext(),target=map.isData3DTexture?gl.TEXTURE_3D:gl.TEXTURE_2D_ARRAY,binding=map.isData3DTexture?gl.TEXTURE_BINDING_3D:gl.TEXTURE_BINDING_2D_ARRAY,previous=gl.getParameter(binding),alignment=gl.getParameter(gl.UNPACK_ALIGNMENT),flip=gl.getParameter(gl.UNPACK_FLIP_Y_WEBGL);
 try{gl.bindTexture(target,resource);gl.pixelStorei(gl.UNPACK_ALIGNMENT,1);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);for(let level=1;level<levels.length;level++){const mip=levels[level];gl.texSubImage3D(target,level,0,0,0,mip.width,mip.height,mip.depth,gl.RGBA,gl.UNSIGNED_BYTE,textureUploadBytes(mip.data,mip.height,mip.width*4,map.flipY));}versions.set(map,{version:map.version,resource});}
 finally{gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,flip);gl.pixelStorei(gl.UNPACK_ALIGNMENT,alignment);gl.bindTexture(target,previous);}
}
