import {FloatType,RGBAFormat} from 'three';

// Three r180 backend adapter. Only owned, single-level RGBA32F probe tables.
export function installProbeTableUpload(renderer){
 const backend=renderer.backend;if(!backend||renderer.hbProbeTableUpload)return;
 const original=backend.updateTexture,uploaded=new WeakSet();renderer.hbProbeTableUpload=true;
 backend.updateTexture=function(texture,options){
  const stats=texture.userData?.hbProbeTableUpload;if(!stats)return original.call(this,texture,options);
  const {data,width,height}=texture.image||{},stride=width*4,state=this.get(texture),gl=this.gl,target=this.isWebGPUBackend?state.texture:state.textureGPU;
  if(!texture.isDataTexture||texture.type!==FloatType||texture.format!==RGBAFormat||texture.flipY||texture.generateMipmaps||!(data instanceof Float32Array)||data.length!==stride*height)throw Error('반사 후보 테이블 형식을 확인하세요.');
  const compatible=this.isWebGPUBackend?target?.format==='rgba32float'&&target.width===width&&target.height===height&&target.mipLevelCount===1&&(target.usage&2)!==0:this.isWebGLBackend&&state.glTextureType===gl.TEXTURE_2D&&state.glFormat===gl.RGBA&&state.glType===gl.FLOAT&&state.glInternalFormat===gl.RGBA32F;
  if(!target||!uploaded.has(target)||!compatible||texture.userData.hbProbeTableFull||!texture.updateRanges.length){
   const names=gl?[gl.UNPACK_ROW_LENGTH,gl.UNPACK_SKIP_PIXELS,gl.UNPACK_SKIP_ROWS]:[],values=names.map(n=>gl.getParameter(n));for(const n of names)gl.pixelStorei(n,0);let result;
   try{result=original.call(this,texture,options);}finally{names.forEach((n,i)=>gl.pixelStorei(n,values[i]));}
   if(target)uploaded.add(target);texture.clearUpdateRanges();texture.userData.hbProbeTableFull=false;stats.fullUploads++;stats.queuedBytes+=data.byteLength;return result;
  }
  const spans=[];for(const r of texture.updateRanges.map(r=>({...r})).sort((a,b)=>a.start-b.start)){
   if(!Number.isSafeInteger(r.start)||!Number.isSafeInteger(r.count)||r.start<0||r.count<=0||r.start%stride||r.count%stride||r.start+r.count>data.length)throw Error('반사 후보 테이블 행을 확인하세요.');
   const last=spans.at(-1);if(last&&r.start<=last.start+last.count)last.count=Math.max(last.count,r.start+r.count-last.start);else spans.push(r);
  }
  for(const r of spans)if(!data.subarray(r.start,r.start+r.count).every(Number.isFinite))throw Error('반사 후보 자료가 유한하지 않아요.');
  let restore;
  if(gl){this.state.bindTexture(state.glTextureType,target);this.textureUtils.setTextureParameters(state.glTextureType,texture);const names=[gl.UNPACK_ROW_LENGTH,gl.UNPACK_SKIP_PIXELS,gl.UNPACK_SKIP_ROWS],values=names.map(n=>gl.getParameter(n));for(const n of names)gl.pixelStorei(n,0);restore=()=>names.forEach((n,i)=>gl.pixelStorei(n,values[i]));}
  try{for(const r of spans){const rows=r.count/stride,source=data.subarray(r.start,r.start+r.count);
   if(gl)gl.texSubImage2D(state.glTextureType,0,0,r.start/stride,width,rows,state.glFormat,state.glType,source);
   else this.device.queue.writeTexture({texture:target,mipLevel:0,origin:{x:0,y:r.start/stride,z:0}},source,{bytesPerRow:width*16,rowsPerImage:rows},{width,height:rows,depthOrArrayLayers:1});
   stats.writeCalls++;stats.queuedBytes+=r.count*4;
  }}finally{restore?.();}
  texture.clearUpdateRanges();texture.userData.hbProbeTableFull=false;stats.partialUploads++;state.version=texture.version;
 };
}

function uploadWebGLProbeRows(renderer,texture,rows,full,stats){
 const gl=renderer.getContext(),data=texture.image.data,width=texture.image.width,stride=width*4,known=renderer.hbProbeTableGLTextures??=new WeakSet(),target=renderer.properties.get(texture).__webglTexture;
 const names=[gl.UNPACK_ROW_LENGTH,gl.UNPACK_SKIP_PIXELS,gl.UNPACK_SKIP_ROWS,gl.UNPACK_FLIP_Y_WEBGL],values=names.map(n=>gl.getParameter(n));for(const n of names)gl.pixelStorei(n,0);
 try{
  if(full||!target||!known.has(target)){texture.clearUpdateRanges();texture.needsUpdate=true;renderer.initTexture(texture);const current=renderer.properties.get(texture).__webglTexture;if(current)known.add(current);stats.fullUploads++;stats.queuedBytes+=data.byteLength;return;}
  renderer.state.bindTexture(gl.TEXTURE_2D,target);
  for(const row of rows){gl.texSubImage2D(gl.TEXTURE_2D,0,0,row,width,1,gl.RGBA,gl.FLOAT,data.subarray(row*stride,(row+1)*stride));stats.writeCalls++;stats.queuedBytes+=stride*4;}
  stats.partialUploads++;
 }finally{names.forEach((n,i)=>gl.pixelStorei(n,values[i]));}
}

export function queueProbeTableUpload(renderer,texture,rows,full){
 if(!texture.userData.hbProbeTableUpload)texture.userData.hbProbeTableUpload={fullUploads:0,partialUploads:0,writeCalls:0,queuedBytes:0};
 if(!renderer.backend){uploadWebGLProbeRows(renderer,texture,rows,full,texture.userData.hbProbeTableUpload);return;}
 installProbeTableUpload(renderer);
 if(full){texture.clearUpdateRanges();texture.userData.hbProbeTableFull=true;}
 else if(!texture.userData.hbProbeTableFull){const stride=texture.image.width*4;for(const row of rows)texture.addUpdateRange(row*stride,stride);}
 texture.needsUpdate=true;
}
