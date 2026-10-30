const installed=new WeakSet();

// r180's fallback readback binds READ_FRAMEBUFFER outside its state cache,
// then deletes that FBO without restoring it or freeing the pixel-pack buffer.
export function installGPUFallbackReadback(renderer){
 const backend=renderer.backend;if(!backend?.isWebGLBackend||installed.has(backend))return;installed.add(backend);
 backend.copyTextureToBuffer=async function(texture,x,y,width,height,faceIndex=0){
  if(![x,y,width,height,faceIndex].every(Number.isSafeInteger)||x<0||y<0||width<1||height<1||faceIndex<0||faceIndex>5)throw Error('GPU readback region is invalid.');
  const {gl,state,textureUtils,utils}=this,{textureGPU,glFormat,glType}=this.get(texture),Type=textureUtils._getTypedArrayType(glType),byteLength=width*height*textureUtils._getBytesPerTexel(glType,glFormat),framebuffer=gl.createFramebuffer(),buffer=gl.createBuffer();
  if(!framebuffer||!buffer){if(framebuffer)gl.deleteFramebuffer(framebuffer);if(buffer)gl.deleteBuffer(buffer);throw Error('GPU readback temporary allocation failed.');}
  const previousRead=gl.getParameter(gl.READ_FRAMEBUFFER_BINDING),previousPack=gl.getParameter(gl.PIXEL_PACK_BUFFER_BINDING),packNames=[gl.PACK_ALIGNMENT,gl.PACK_ROW_LENGTH,gl.PACK_SKIP_ROWS,gl.PACK_SKIP_PIXELS],packValues=packNames.map(name=>gl.getParameter(name));
  try{
   try{
    state.bindFramebuffer(gl.READ_FRAMEBUFFER,framebuffer);
    gl.framebufferTexture2D(gl.READ_FRAMEBUFFER,gl.COLOR_ATTACHMENT0,texture.isCubeTexture?gl.TEXTURE_CUBE_MAP_POSITIVE_X+faceIndex:gl.TEXTURE_2D,textureGPU,0);
    if(gl.checkFramebufferStatus(gl.READ_FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw Error('GPU readback framebuffer is incomplete.');
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER,buffer);gl.bufferData(gl.PIXEL_PACK_BUFFER,byteLength,gl.STREAM_READ);for(let i=0;i<packNames.length;i++)gl.pixelStorei(packNames[i],i===0?1:0);gl.readPixels(x,y,width,height,glFormat,glType,0);
   }finally{
    for(let i=0;i<packNames.length;i++)gl.pixelStorei(packNames[i],packValues[i]);gl.bindBuffer(gl.PIXEL_PACK_BUFFER,previousPack);state.bindFramebuffer(gl.READ_FRAMEBUFFER,previousRead);gl.deleteFramebuffer(framebuffer);
   }
   // Restore bindings before awaiting the fence; another frame may render
   // while this explicit readback is pending.
   await utils._clientWaitAsync();
   const result=new Type(byteLength/Type.BYTES_PER_ELEMENT),pack=gl.getParameter(gl.PIXEL_PACK_BUFFER_BINDING);
   try{gl.bindBuffer(gl.PIXEL_PACK_BUFFER,buffer);gl.getBufferSubData(gl.PIXEL_PACK_BUFFER,0,result);}finally{gl.bindBuffer(gl.PIXEL_PACK_BUFFER,pack);}
   return result;
  }finally{gl.deleteBuffer(buffer);}
 };
}
