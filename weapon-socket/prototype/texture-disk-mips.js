import {textureImportPolicy} from './texture-mip-policy.js';
import {loadTextureImage,textureImagePixels} from './texture-image-load.js';

const sources=new WeakMap();
export const diskMipSource=texture=>sources.get(texture);
export const attachDiskMipSource=(texture,source)=>sources.set(texture,source);
export function diskMipEligible(asset){const p=textureImportPolicy(asset.import);return asset.dimension==='texture2d'&&p.mipmaps&&!p.topMip&&!p.maxSize&&!p.preserveCoverage&&!p.flipGreen&&!p.normalizeNormals&&!asset.composite?.normalTexture;}
export function validDiskMipSettings(asset){
 const s=asset?.streaming;if(s===undefined)return true;
 if(!s||typeof s!=='object'||Array.isArray(s)||Object.keys(s).some(k=>!['enabled','width','height','initialMip'].includes(k))||typeof s.enabled!=='boolean')return false;
 if(!s.enabled)return true;
 const n=Math.floor(Math.log2(Math.max(s.width,s.height)));
 return diskMipEligible(asset)&&[s.width,s.height].every(v=>Number.isSafeInteger(v)&&v>0&&v<=16384)&&Number.isInteger(s.initialMip)&&s.initialMip>=0&&s.initialMip<=n&&asset.mips?.length===n;
}
const abortError=()=>new DOMException('Disk mip request cancelled','AbortError');
function wait(promise,signal){
 if(!signal)return promise;signal.throwIfAborted();return new Promise((resolve,reject)=>{const abort=()=>reject(signal.reason||abortError());signal.addEventListener('abort',abort,{once:true});promise.then(resolve,reject).finally(()=>signal.removeEventListener('abort',abort));});
}
// An asset's explicit image-per-level chain is immutable. Only the mip tail
// held by active/candidate views remains decoded. No disk cache/sidecar copy.
export class DiskMipSource{
 constructor(asset,fileUrl){
  if(!validDiskMipSettings(asset)||!asset.streaming?.enabled)throw Error('디스크 밉 설정과 전체 사용자 지정 밉을 확인하세요.');
  let width=asset.streaming.width,height=asset.streaming.height;
  this.levels=[asset.images,...asset.mips.map(m=>m.images)].map(([path])=>{const row={path,width,height,depth:1,bytes:width*height*4};width=Math.max(1,width>>1);height=Math.max(1,height>>1);return row;});
  this.fileUrl=fileUrl;this.refs=this.levels.map(()=>0);this.jobs=this.levels.map(()=>null);this.reads=0;this.cancelled=0;
 }
 reserve(base){
  if(!Number.isInteger(base)||base<0||base>=this.levels.length)throw Error('디스크 시작 밉을 확인하세요.');
  for(let i=base;i<this.refs.length;i++)this.refs[i]++;let released=false;
  return()=>{if(released)return;released=true;for(let i=base;i<this.refs.length;i++)if(!--this.refs[i]){this.jobs[i]?.controller.abort();delete this.levels[i].data;}};
 }
 retain(base){if(this.levels.slice(base).some(l=>!l.data))throw Error('디스크 밉을 먼저 비동기로 읽어야 해요.');return this.reserve(base);}
 async acquire(base,signal){
  signal?.throwIfAborted();const release=this.reserve(base);
  try{for(let i=this.levels.length-1;i>=base;i--){signal?.throwIfAborted();await wait(this.read(i),signal);}signal?.throwIfAborted();return release;}catch(error){release();throw error;}
 }
 read(index){
  const row=this.levels[index];if(row.data)return Promise.resolve();let job=this.jobs[index];if(job&&!job.controller.signal.aborted)return job.promise;
  job={controller:new AbortController()};this.jobs[index]=job;this.reads++;
  job.promise=Promise.resolve().then(async()=>{const image=await loadTextureImage(this.fileUrl(row.path),job.controller.signal);if(image.width!==row.width||image.height!==row.height)throw Error('디스크 밉 이미지의 크기가 설정과 달라요.');const pixels=textureImagePixels(image,true);job.controller.signal.throwIfAborted();if(this.jobs[index]!==job)throw abortError();row.data=pixels.data;}).catch(error=>{if(job.controller.signal.aborted)this.cancelled++;throw error;}).finally(()=>{if(this.jobs[index]===job)this.jobs[index]=null;if(!this.refs[index])delete row.data;});
  return job.promise;
 }
 state(){return {decodedBytes:this.levels.reduce((n,l)=>n+(l.data?.byteLength||0),0),logicalBytes:this.levels.reduce((n,l)=>n+l.bytes,0),loadedLevels:this.levels.filter(l=>l.data).length,pendingReads:this.jobs.filter(Boolean).length,reads:this.reads,cancelledReads:this.cancelled,cache:'active and candidate views only; unused decoded levels released immediately; no persistent disk copy'};}
}
export const textureDiskMipContract=Object.freeze({version:1,asset:'texture2d.streaming {enabled,width,height,initialMip}; complete explicit image-per-level mips required',policy:'RGBA8 authored chain without coverage/composite/green/normal processing or top-mip filtering; existing import path otherwise unchanged',loading:'smallest tail first, demand-driven fine levels; per-level shared cancellable image reads; selected mip dimensions verified before publishing',ownership:'active and staged views pin decoded tails; unused levels and requests released immediately; immutable authored files, no generated sidecars',runtime:'same Materials::SetResidentMip/Blueprint node and optional TextureStreaming pool; logical LOD/history retained; without pool initialMip remains until explicit request',limits:'2D explicit images only; no raw/HDR/compressed or array/cube/volume disk mode, runtime region edits on disk sources, whole GPU/CPU heap guarantee, source-file snapshot across external edits or automatic authored-mip generation'});
