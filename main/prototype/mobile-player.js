import {createPersistentQueries,persistentQueryKeys} from './runtime-storage.js';
import {NativeProtocol,nativeParticleQuery} from './native-protocol.js';
import {spawnQueryRequest} from './native-spawn.js';
import {NativePhysicsQueries} from './native-physics-query.js';
import {worldPatch,commitNativeWorld} from './native-transport.js';
import {canonicalWorld} from './native-protocol.js';
import {resolveBuildPath,kioskSettings,validKioskSettings,frameSettings,validFrameSettings} from './build-profile.js';

const safe=name=>typeof name==='string'&&name.length>0&&name.length<=2000&&!/[\\:\x00-\x1f]/.test(name)&&!name.startsWith('/')&&!name.split('/').some(s=>!s||s==='.'||s==='..');
export function mobileBackend(manifest,{read,request,rendererQuery,mobile=true,baseURL='/'}){
  if(!validKioskSettings(manifest)||!validFrameSettings(manifest))throw Error('키오스크 패키지 설정 오류');
  if(manifest.version!==1||!Array.isArray(manifest.entries)||!Array.isArray(manifest.nativeModules)||!safe(manifest.startupScene))throw Error('모바일 패키지 형식 오류');
  const session={id:manifest.id,name:manifest.name,projectFile:'game.hbpack.json',startupScene:manifest.startupScene,startupBlueprint:manifest.startupBlueprint,gameInstance:manifest.gameInstance||'',legacyStorage:false,player:true};
  const entries=new Set(manifest.entries.map(e=>e.path)),protocol=new NativeProtocol(),modules=new Map();let report=null;
  const resolve=name=>{if(!safe(name))throw Error('모바일 에셋 경로 오류');const resolved=resolveBuildPath(name,manifest.redirects);return entries.has(resolved)?resolved:null;};
  const saveKey=slot=>'hbengine.savegame.json.'+slot+'.project.'+encodeURIComponent(manifest.id),persistentQueries=createPersistentQueries({readAsset:async name=>{const resolved=resolve(name);if(!resolved)throw Error('쿠킹된 데이터 에셋이 없어요.');const data=await read('Content/'+resolved);if(data instanceof Response){if(!data.ok)throw Error('데이터 에셋 요청 실패: '+data.status);return data.json();}return JSON.parse(data);},readSave:async slot=>(await request('storageRead',{})).items[saveKey(slot)]??null,writeSave:(slot,json)=>request('storageWrite',{[saveKey(slot)]:json}),deleteSave:slot=>request('storageWrite',{[saveKey(slot)]:null})});let gameSessionId;
  for(const [index,module] of manifest.nativeModules.entries())modules.set(module.signature,{...module,index,token:module.signature,queue:Promise.resolve()});
  protocol.module=token=>modules.get(token);
  const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}});
  async function nativeCall(data){
    const module=modules.get(data.token);if(!module)throw Error('패키지에 등록되지 않은 C++ 모듈');
    const job=module.queue.then(async()=>{
      let queries;try{
        const started=performance.now(),decoded=protocol.decodeRequest(module,data.request),decodedAt=performance.now();protocol.validate(module,decoded);if(decoded.moduleFrames!==undefined)protocol.frameModules(data.token,decoded.moduleFrames);if(decoded.gameSession&&gameSessionId!==decoded.gameSession.id){gameSessionId=decoded.gameSession.id;persistentQueries.clear();}if(decoded.spawnTemplates){module.spawnContexts??=new Map();module.spawnContexts.set(decoded.spawnPrefix,decoded.spawnTemplates);if(module.spawnContexts.size>8)module.spawnContexts.delete(module.spawnContexts.keys().next().value);}else if(decoded.spawnPrefix&&module.workerSpawnPrefix!==decoded.spawnPrefix&&module.spawnContexts?.has(decoded.spawnPrefix))decoded.spawnTemplates=module.spawnContexts.get(decoded.spawnPrefix);const validatedAt=performance.now();queries=new NativePhysicsQueries(decoded.objects,{authorizeWorld:query=>spawnQueryRequest(decoded,query,module.metadata,decoded.spawnTemplates||module.spawnContexts?.get(decoded.spawnPrefix))});let queryMs=0,queryCount=0;
        const clockOnly=['frame','frames','reset'].includes(decoded.command),patch=!clockOnly&&module.metadata.workerProtocol>=2&&module.transportWorld?(decoded[canonicalWorld]?.patch&&module.transportWorld===decoded[canonicalWorld].base?decoded[canonicalWorld].patch:worldPatch(module.transportWorld,decoded.objects)):null,packet=clockOnly?{...decoded,objects:[]}:patch?{...decoded,objects:undefined,objectPatch:patch}:decoded;if(decoded.command==='reset')module.transportWorld=null;
        const rpcStarted=performance.now(),reply=await request('native',{module:module.index,request:packet},async query=>{const at=performance.now();queryCount++;try{if(['particleCount','particlePlay','particleStop','particlePause','particleEmit'].includes(query.key)){if(queryCount>128)throw Error('GPU 파티클 질의 개수 오류');return await nativeParticleQuery(query,decoded.objects.length?decoded.objects:module.transportWorld||[],rendererQuery);}return persistentQueryKeys.has(query.key)?await persistentQueries(query.key,query.args):await queries.query(query);}finally{queryMs+=performance.now()-at;}}),repliedAt=performance.now();
        if(!reply.ok)throw Error(reply.error||'모바일 C++ 실행 실패');if(decoded.spawnTemplates)module.workerSpawnPrefix=decoded.spawnPrefix;const result=protocol.validateReply(module,decoded,reply);result.transport={...result.transport,...reply.hostTiming,decodeMs:decodedAt-started,validateMs:validatedAt-decodedAt,rpcMs:repliedAt-rpcStarted,replyValidationMs:performance.now()-repliedAt,queryMs,queryCount};
        const committed=data.request.worldTransport===1?commitNativeWorld(decoded.objects,result):undefined;
        if(!clockOnly)module.transportWorld=committed||commitNativeWorld(decoded.objects,result);
        const invalidateForeign=reply=>{for(const foreign of reply.foreign||[]){const target=modules.get(foreign.token);if(target)target.transportWorld=null;invalidateForeign(foreign.result);}};invalidateForeign(result);
        if(data.request.worldTransport===1){module.requestWorld=committed;module.requestWorldId=data.request.worldId;module.requestSequence=data.request.worldSequence;result.worldSequence=data.request.worldSequence;}
        else if(data.request.command==='reset'){module.requestWorld=null;module.requestSequence=0;}if(result.nativeError){if(data.request.worldTransport===1){module.requestWorld=null;module.requestSequence=0;}module.transportWorld=null;}return result;
      }catch(error){if(data.request.worldTransport===1||data.request.command==='reset'){module.requestWorld=null;module.requestSequence=0;}module.transportWorld=null;throw error;}finally{queries?.close();}
    });module.queue=job.catch(()=>{});return job;
  }
  const backend=async function fetchMobile(input,options={}){
    const url=new URL(typeof input==='string'?input:input.url,'https://hbengine.local'),method=options.method||input.method||'GET';
    const body=()=>{const raw=options.body||'{}';if(typeof raw!=='string'||raw.length>8388608)throw Error('모바일 요청 크기 오류');return JSON.parse(raw);};
    try{
      if(url.pathname==='/api/session'&&method==='GET')return json(session);
      if(url.pathname==='/api/player'&&method==='GET')return json({name:manifest.name,...frameSettings({...manifest,mobile}),kiosk:kioskSettings(manifest),configuration:manifest.configuration,redirects:manifest.redirects,width:manifest.width,height:manifest.height,scene:manifest.startupScene,mobile});
      if(url.pathname==='/api/project'&&method==='GET')return json({entries:manifest.entries});
      if(url.pathname==='/api/file'&&method==='GET'){const resolved=resolve(url.searchParams.get('path'));if(!resolved)return json({error:'게임 파일이 없어요.'},404);return read('Content/'+resolved);}
      if(url.pathname==='/api/game-data'&&method==='POST'){const data=body();return json({value:await persistentQueries(data.key,data.args)});}
      if(url.pathname==='/api/storage'){
        if(method==='GET'){if(url.searchParams.get('project')!==manifest.id)throw Error('프로젝트 ID 오류');const saved=await request('storageRead',{});if(saved?.version!==1||!saved.items||typeof saved.items!=='object'||Array.isArray(saved.items))throw Error('게임 저장 형식 오류');const suffix='.project.'+encodeURIComponent(manifest.id);return json({version:1,items:Object.fromEntries(Object.entries(saved.items).filter(([key])=>key.endsWith(suffix)))});}
        if(method==='PUT'){const data=body(),suffix='.project.'+encodeURIComponent(manifest.id);if(data.id!==manifest.id||!data.items||Array.isArray(data.items)||typeof data.items!=='object'||Object.entries(data.items).some(([key,value])=>key.length>1000||!key.endsWith(suffix)||!key.startsWith('hbengine.savegame.')&&!key.startsWith('hbengine.storage-migrated.v1.')||value!==null&&typeof value!=='string')||JSON.stringify(data.items).length>4194304)throw Error('게임 저장 범위 오류');return json(await request('storageWrite',data.items));}
      }
      if(url.pathname==='/api/native/build'&&method==='POST'){const data=body(),module=[...modules.values()].find(m=>m.header===data.header&&m.source===data.source);if(!module)throw Error('패키지에 등록되지 않은 C++ 코드');return json({token:module.token,metadata:module.metadata,diagnostics:'모바일 사전 빌드 로드'});}
      if(url.pathname==='/api/native/call'&&method==='POST')return json(await nativeCall(body()));
      if(url.pathname==='/api/player/report'){
        if(method==='POST'){report=body();if(manifest.configuration==='development')await request('report',report);return json({ok:true});}
        if(method==='GET'&&manifest.configuration==='development')return json(report);
      }
      return json({error:'모바일 실행기에 없는 작업'},404);
    }catch(error){return json({error:error.message},400);}
  };
  backend.setRendererQuery=handler=>{if(handler!==undefined&&typeof handler!=='function')throw Error('렌더러 질의 연결 오류');rendererQuery=handler;};
  backend.fileUrl=name=>{const resolved=resolve(name);if(!resolved)throw Error('게임 파일이 없어요: '+name);return baseURL+'Content/'+resolved.split('/').map(encodeURIComponent).join('/');};
  return backend;
}

export function platformBridge(send,{nativeJSON=false}={}){
  const pending=new Map();let sequence=0,active=true;
  const arm=(id,item)=>{item.started=performance.now();item.timer=setTimeout(()=>{if(!active||pending.get(id)!==item)return;pending.delete(id);item.reject(Error('모바일 호스트 응답 시간 초과'));},item.remaining);};
  const setActive=value=>{if(active===value)return;active=value;const now=performance.now();for(const [id,item] of pending)if(active)arm(id,item);else{clearTimeout(item.timer);item.remaining=Math.max(0,item.remaining-(now-item.started));}};
  const request=(operation,data,query)=>new Promise((resolve,reject)=>{
    const id=String(++sequence),item={resolve,reject,query,remaining:15000,nativeJSON:nativeJSON&&operation==='native'};pending.set(id,item);if(active)arm(id,item);try{const reply=send({id,operation,data:item.nativeJSON?{module:data.module,requestJSON:JSON.stringify(data.request)}:data});if(reply?.then)Promise.resolve(reply).then(data=>receive({id,data}),error=>receive({id,error:error?.message||String(error)}));}catch(error){clearTimeout(item.timer);pending.delete(id);reject(error);}
  });
  const query=async(id,value)=>{try{const item=pending.get(id);if(!item?.query)throw Error('C++ 질의 작업이 없어요.');return {ok:true,value:await item.query(value)};}catch(error){return {ok:false,error:error.message};}};
  const receive=async packet=>{
    const item=pending.get(packet.id);if(!item)return;
    if(packet.query){send({operation:'queryReply',id:packet.queryId,data:await query(packet.id,packet.query)});return;}
    clearTimeout(item.timer);pending.delete(packet.id);packet.error?item.reject(Error(packet.error)):item.resolve(packet.data);
  };
  return {request,receive,query,setActive};
}

export async function connectAndroidChannel(bridge,host){
  const nonce=host.crypto.randomUUID();let result;
  const receive=event=>{
    if(result||event.data!==nonce||event.origin!==''&&event.origin!==host.location.origin||event.source!==null&&event.source!==host||event.ports?.length!==1)return;
    const port=event.ports[0];port.onmessage=event=>{try{bridge.receive(JSON.parse(event.data)).catch(error=>console.warn('모바일 채널 응답:',error.message));}catch(error){console.warn('모바일 채널 형식:',error.message);}};port.start();result={port,info:{origin:event.origin,sourceIsWindow:event.source===host,sourceNull:event.source===null}};
  };
  host.addEventListener('message',receive);
  try{await bridge.request('channel',{nonce});if(!result)throw Error('모바일 메시지 포트가 없어요.');return result;}catch(error){result?.port.close();throw error;}finally{host.removeEventListener('message',receive);}
}

export async function startMobilePlayer(){
  const original=window.fetch.bind(window),manifest=await (await original('/game.hbpack.json')).json();
  let messagePort;
  const send=packet=>{const value=JSON.stringify(packet);if(messagePort)messagePort.postMessage(value);else if(window.HBMobile)window.HBMobile.postMessage(value);else return window.webkit.messageHandlers.hbmobile.postMessage(value).then(reply=>typeof reply==='string'?JSON.parse(reply):reply);};
  // Both hosts validate the envelope while passing the C++ packet as JSON text.
  // iOS resolves WebKit promises directly; Android keeps its message port.
  const bridge=platformBridge(send,{nativeJSON:true});window.hbMobileReply=bridge.receive;window.hbMobileQuery=bridge.query;window.hbMobileHostLifecycle=bridge.setActive;
  if(window.HBMobile){const connected=await connectAndroidChannel(bridge,window);messagePort=connected.port;if(manifest.configuration==='development')window.hbMobileChannel=connected.info;}
  const backend=mobileBackend(manifest,{read:name=>original('/'+name),request:bridge.request});
  window.hbMobileFileUrl=backend.fileUrl;window.hbMobileSetRendererQuery=backend.setRendererQuery;
  window.hbMobileTarget=manifest.target;
  window.fetch=(input,options)=>{const url=new URL(typeof input==='string'?input:input.url,location.href);return url.origin===location.origin&&url.pathname.startsWith('/api/')?backend(input,options):original(input,options);};
  // Preserve the existing Player close/save path on both mobile hosts.
  window.chrome={webview:{postMessage:value=>{if(value==='hbengine.close')bridge.request('close',{}).catch(()=>{});}}};
  await import('./player.js');
}
