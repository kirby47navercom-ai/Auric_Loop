import {mobileBackend} from './mobile-player.js';

export async function loadWebResources(pack,read,base,host=globalThis){
  const assets=new Map(),urls=new Map();if(!pack)return {assets,urls};
  if(pack.path!=='game.resources.bin'||!Number.isSafeInteger(pack.bytes)||pack.bytes<0||!Array.isArray(pack.files))throw Error('웹 리소스 묶음 형식 오류');
  const response=await read(pack.path);if(!response.ok)throw Error('웹 리소스 묶음을 열 수 없어요.');const bytes=await response.arrayBuffer();
  if(bytes.byteLength!==pack.bytes)throw Error('웹 리소스 묶음 크기 오류');let end=0;
  for(const file of pack.files){
    if(typeof file.path!=='string'||!file.path.startsWith('Content/')||/[\\:\x00-\x1f]/.test(file.path)||file.path.split('/').some(p=>!p||p==='.'||p==='..')||assets.has(file.path)||!Number.isSafeInteger(file.offset)||file.offset!==end||!Number.isSafeInteger(file.bytes)||file.bytes<0||file.offset+file.bytes>bytes.byteLength||!['image/png','image/jpeg','image/webp','image/gif','image/svg+xml','application/json'].includes(file.type))throw Error('웹 리소스 항목 범위 오류');
    assets.set(file.path,null);end+=file.bytes;
  }
  if(end!==bytes.byteLength)throw Error('웹 리소스 묶음 범위 오류');
  for(const file of pack.files){const blob=new Blob([new Uint8Array(bytes,file.offset,file.bytes)],{type:file.type});assets.set(file.path,blob);urls.set(new URL(file.path.split('/').map(encodeURIComponent).join('/'),base).href,host.URL.createObjectURL(blob));}
  host.addEventListener?.('pagehide',event=>{if(event.persisted)return;for(const url of urls.values())host.URL.revokeObjectURL(url);assets.clear();urls.clear();});return {assets,urls};
}

// One Wasm instance contains every AOT module; Asyncify cannot reenter it.
export function webNative(wasm){
  let queue=Promise.resolve();
  return (module,packet,query)=>{
    const job=queue.then(async()=>{
      wasm.hbQuery=async value=>{try{return {ok:true,value:await query(value)};}catch(error){return {ok:false,error:error.message};}};
      try{return JSON.parse(await wasm.ccall('HB_invoke','string',['number','string'],[module,JSON.stringify(packet)],{async:true}));}
      finally{wasm.hbQuery=undefined;}
    });
    queue=job.catch(()=>{});return job;
  };
}

export function webStorage(storage,key){
  const read=()=>{const text=storage.getItem(key),value=text?JSON.parse(text):{version:1,items:{}};if(value?.version!==1||!value.items||Array.isArray(value.items)||typeof value.items!=='object'||Object.values(value.items).some(v=>typeof v!=='string'))throw Error('웹 저장 데이터 형식 오류');return value;};
  return async(operation,items)=>{
    const value=read();if(operation==='storageRead')return value;
    for(const [key,item] of Object.entries(items)){if(item===null)delete value.items[key];else value.items[key]=item;}
    storage.setItem(key,JSON.stringify(value));return value;
  };
}

export async function startWebPlayer(host=window){
  const base=new URL('../',import.meta.url),original=host.fetch.bind(host);let resources={assets:new Map(),urls:new Map()};
  const read=name=>resources.assets.has(name)?Promise.resolve(new Response(resources.assets.get(name))):original(new URL(name.split('/').map(encodeURIComponent).join('/'),base));
  const response=await read('game.hbpack.json');if(!response.ok)throw Error('웹 게임 패키지를 열 수 없어요.');const manifest=await response.json();
  const stored=webStorage(host.localStorage,'hbengine.web.'+base.pathname+'.'+manifest.id);let native;
  resources=await loadWebResources(manifest.webResources,read,base,host);
  if(manifest.nativeModules.length){
    const {default:create}=await import(new URL('Binaries/game.mjs',base));
    const wasm=await read('Binaries/game.wasm');if(!wasm.ok)throw Error('C++ WebAssembly를 열 수 없어요.');
    native=webNative(await create({wasmBinary:await wasm.arrayBuffer()}));
  }
  const request=(operation,data,query)=>operation==='native'?native(data.module,data.request,query):operation==='report'?Promise.resolve({ok:true}):stored(operation,data);
  const mobile=host.matchMedia('(pointer: coarse)').matches;
  const runtimeManifest=mobile?{...manifest,targetFrameRate:Math.min(60,manifest.targetFrameRate),framePacing:'display'}:manifest;
  const backend=mobileBackend(runtimeManifest,{read,request,mobile,baseURL:base.href});
  host.hbMobileFileUrl=name=>{const url=backend.fileUrl(name);return resources.urls.get(url)||url;};host.hbMobileSetRendererQuery=backend.setRendererQuery;
  host.fetch=(input,options)=>{const url=new URL(typeof input==='string'?input:input.url,host.location.href);return url.origin===host.location.origin&&url.pathname.startsWith('/api/')?backend(input,options):original(input,options);};
  await import('./player.js');
}
