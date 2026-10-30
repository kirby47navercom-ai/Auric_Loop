import {FloatType,RGBAFormat} from 'three';
// r180 backend entry point; revalidate this adapter when changing the pinned Three version.
export function installGPURayAtlasUpload(renderer){
 if(renderer.hbRayAtlasUpload)return;
 const backend=renderer.backend,original=backend.updateTexture,uploaded=new WeakSet(),stats=renderer.hbRayAtlasUpload={fullUploads:0,partialUploads:0,writeCalls:0,queuedBytes:0};
 backend.updateTexture=function(texture,options){
  if(!texture.userData?.hbRayScene)return original.call(this,texture,options);
  const state=this.get(texture),target=state.texture,{data,width,height}=texture.image||{},stride=width*4;
  const validTarget=target?.format==='rgba32float'&&target.width===width&&target.height===height&&target.depthOrArrayLayers===1&&target.mipLevelCount===1&&(target.usage&2)!==0;
  if(!uploaded.has(target)||!validTarget||!texture.updateRanges.length){const result=original.call(this,texture,options);if(target)uploaded.add(target);stats.fullUploads++;stats.queuedBytes+=data?.byteLength||0;return result;}
  if(!texture.isDataTexture||texture.type!==FloatType||texture.format!==RGBAFormat||texture.flipY||texture.generateMipmaps||!(data instanceof Float32Array)||data.length!==stride*height)throw Error('WebGPU 광선 atlas 형식을 확인하세요.');
  const ranges=texture.updateRanges.map(r=>({...r})).sort((a,b)=>a.start-b.start),spans=[];
  for(const r of ranges){if(!Number.isSafeInteger(r.start)||!Number.isSafeInteger(r.count)||r.start<0||r.count<=0||r.start%stride||r.count%stride||r.start+r.count>data.length)throw Error('WebGPU 광선 atlas 행을 확인하세요.');const last=spans.at(-1);if(last&&r.start<=last.start+last.count)last.count=Math.max(last.count,r.start+r.count-last.start);else spans.push(r);}
  for(const r of spans)if(!data.subarray(r.start,r.start+r.count).every(Number.isFinite))throw Error('WebGPU 광선 atlas 값이 유한하지 않아요.');
  for(const r of spans){const rows=r.count/stride;this.device.queue.writeTexture({texture:target,mipLevel:0,origin:{x:0,y:r.start/stride,z:0}},data.subarray(r.start,r.start+r.count),{bytesPerRow:width*16,rowsPerImage:rows},{width,height:rows,depthOrArrayLayers:1});stats.writeCalls++;stats.queuedBytes+=r.count*4;}
  state.version=texture.version;stats.partialUploads++;
 };
}
