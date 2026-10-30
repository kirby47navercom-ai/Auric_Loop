import {cookTextureMips,textureImportPolicy,validateTextureMipPixels,validateAuthoredTextureMipPixels} from './texture-mip-policy.js';
import {validateTextureComposite} from './texture-composite.js';
// One lazy worker drains the queue and terminates when idle. Loader-owned
// decoded buffers may transfer; ordinary callers keep their input ownership.
let worker=null,ready=false,active=null,nextID=1,idle=null,unavailable=false,workerStarts=0,cancelled=0;const queue=[];
function stop(){worker?.terminate();worker=null;ready=false;if(idle!==null)clearTimeout(idle);idle=null;}
const readable=job=>job.pixels.data.byteLength&&(!job.normalPixels||job.normalPixels.data.byteLength)&&(job.authoredLevels?.every(l=>l.data.byteLength)??true);
function failedTransfer(job){active=null;job.reject(Object.assign(Error('텍스처 밉 작업의 원본을 다시 읽어야 해요.'),{retryTextureDecode:true}));drain();}
async function local(job){job.local=true;try{await new Promise(resolve=>setTimeout(resolve,0));job.signal?.throwIfAborted();const result=cookTextureMips(job.pixels,job.policy,job);job.signal?.throwIfAborted();result.report.worker=false;job.resolve(result);}catch(error){job.reject(error);}finally{if(active===job)active=null;drain();}}
function drain(){
 if(active)return;if(!queue.length){if(worker)idle=setTimeout(stop,1000);return;}if(idle!==null)clearTimeout(idle);idle=null;const job=active=queue.shift();
 if(unavailable||typeof Worker==='undefined'||Math.max(job.pixels.width*job.pixels.height,(job.normalPixels?.width||0)*(job.normalPixels?.height||0))<=65536){local(job);return;}
 try{
  if(!worker){const created=worker=new Worker(new URL('./texture-mip-worker.js',import.meta.url),{type:'module'});workerStarts++;created.onmessage=({data})=>{if(worker!==created)return;if(data.ready){ready=true;send();return;}const job=active;if(!job||data.id!==job.id)return;active=null;if(data.error)job.reject(Error(data.error));else{data.result.report.worker=true;job.resolve(data.result);}drain();};created.onerror=()=>{if(worker!==created)return;const pending=active;stop();unavailable=true;if(pending){if(readable(pending))local(pending);else failedTransfer(pending);}else drain();};}
  if(ready)send();
 }catch(error){stop();unavailable=true;if(readable(job))local(job);else failedTransfer(job);}
}
function send(){const job=active;if(!job)return;try{const buffers=job.transfer?[...new Set([job.pixels.data.buffer,...(job.normalPixels?[job.normalPixels.data.buffer]:[]),...(job.authoredLevels||[]).map(l=>l.data.buffer)])]:[];worker.postMessage({id:job.id,pixels:job.pixels,policy:job.policy,composite:job.composite,normalPixels:job.normalPixels,authoredLevels:job.authoredLevels},buffers);}catch(error){stop();unavailable=true;if(readable(job))local(job);else failedTransfer(job);}}
export function cookTextureMipsAsync(pixels,value={},options={}){return new Promise((resolve,reject)=>{
 const signal=options.signal;signal?.throwIfAborted();validateTextureMipPixels(pixels);const policy=textureImportPolicy(value),composite=validateTextureComposite(options.composite,policy),normalPixels=composite.normalTexture?validateTextureMipPixels(options.normalPixels):undefined,authoredLevels=options.authoredLevels===undefined?undefined:validateAuthoredTextureMipPixels(pixels,options.authoredLevels);let settled=false;
 const finish=(fn,result)=>{if(settled)return;settled=true;signal?.removeEventListener('abort',abort);fn(result);},job={id:nextID++,pixels,policy,composite,normalPixels,authoredLevels,signal,transfer:options.transfer===true,resolve:result=>finish(resolve,result),reject:error=>finish(reject,error)},abort=()=>{
  if(settled)return;cancelled++;job.reject(signal.reason||new DOMException('Texture mip cook cancelled','AbortError'));const at=queue.indexOf(job);if(at>=0)queue.splice(at,1);else if(active===job&&!job.local){stop();active=null;}drain();
 };
 signal?.addEventListener('abort',abort,{once:true});queue.push(job);drain();
 });}
export const textureMipCookState=()=>Object.freeze({workers:worker?1:0,ready,busy:!!active,queued:queue.length,workerStarts,cancelled,fallback:unavailable||typeof Worker==='undefined'});
