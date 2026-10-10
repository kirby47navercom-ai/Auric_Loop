// JSON snapshots stay separate from the mutable game world. Clone only changed
// paths after a successful call; failures force the next request to send a full world.
export function worldPatch(previous,current,limit=4096){
  const operations=[],escape=value=>/[~/]/.test(value)?String(value).replace(/~/g,'~0').replace(/\//g,'~1'):String(value);
  const add=(operation,depth)=>{operations.push(operation);if(operations.length>limit||depth>64||operation.path.length>4096)throw Error('full snapshot');};
  function walk(a,b,path,depth=0){
    if(Object.is(a,b))return;
    const aa=Array.isArray(a),ba=Array.isArray(b),ao=a&&typeof a==='object',bo=b&&typeof b==='object';
    if(!ao||!bo||aa!==ba||aa&&a.length!==b.length){add({op:'replace',path,value:b},depth);return;}
    if(aa){if(a.length<=4){let changes=0,scalar=true;for(let i=0;i<a.length;i++){if(!Object.is(a[i],b[i]))changes++;if(a[i]!==null&&typeof a[i]==='object'||b[i]!==null&&typeof b[i]==='object')scalar=false;}if(!changes)return;if(scalar&&changes>1){add({op:'replace',path,value:b},depth);return;}}for(let i=0;i<a.length;i++){const value=b[i],type=typeof value;walk(a[i],value===undefined||type==='function'||type==='symbol'||type==='number'&&!Number.isFinite(value)?null:value,path+'/'+i,depth+1);}return;}
    for(const key in a)if(Object.hasOwn(a,key)&&(!Object.hasOwn(b,key)||b[key]===undefined))add({op:'remove',path:path+'/'+escape(key)},depth+1);
    for(const key in b)if(Object.hasOwn(b,key)&&b[key]!==undefined){const exists=Object.hasOwn(a,key);if(exists&&Object.is(a[key],b[key]))continue;const at=path+'/'+escape(key);if(!exists)add({op:'add',path:at,value:b[key]},depth+1);else walk(a[key],b[key],at,depth+1);}
  }
  try{walk(previous,current,'');return operations;}catch{return null;}
}
export function applyWorldPatch(previous,operations){
  if(!Array.isArray(operations)||operations.length>4096)throw Error('C++ snapshot patch limit');
  const copies=new Map(),copy=value=>{if(!value||typeof value!=='object')throw Error('C++ snapshot patch parent');if(copies.has(value))return copies.get(value);const next=Array.isArray(value)?value.slice():{...value};copies.set(value,next);copies.set(next,next);return next;};
  let result=previous;
  for(const op of operations){
    if(!op||!['add','remove','replace'].includes(op.op)||typeof op.path!=='string'||op.path.length>4096||op.op!=='remove'&&!Object.hasOwn(op,'value'))throw Error('C++ snapshot patch operation');
    if(op.path===''){if(op.op==='remove')throw Error('C++ snapshot root removal');result=op.value;continue;}
    if(!op.path.startsWith('/')||/\~(?![01])/.test(op.path))throw Error('C++ snapshot JSON Pointer');
    const parts=op.path.slice(1).split('/').map(p=>p.replace(/~1/g,'/').replace(/~0/g,'~'));if(parts.length>64)throw Error('C++ snapshot path depth');result=copy(result);let parent=result;
    for(const key of parts.slice(0,-1)){if(!Object.hasOwn(parent,key))throw Error('C++ snapshot missing parent');const child=copy(parent[key]);Object.defineProperty(parent,key,{value:child,writable:true,enumerable:true,configurable:true});parent=child;}
    const key=parts.at(-1),exists=Object.hasOwn(parent,key);
    if(Array.isArray(parent)){if(!/^(0|[1-9]\d*)$/.test(key)||Number(key)>parent.length||op.op!=='add'&&!exists)throw Error('C++ snapshot array index');const i=Number(key);if(op.op==='add')parent.splice(i,0,op.value);else if(op.op==='remove')parent.splice(i,1);else parent[i]=op.value;}
    else {if(op.op!=='add'&&!exists)throw Error('C++ snapshot missing field');if(op.op==='remove')delete parent[key];else Object.defineProperty(parent,key,{value:op.value,writable:true,enumerable:true,configurable:true});}
  }
  return result;
}
// Native values have already crossed the JSON/typed protocol boundary. Avoid
// structuredClone's message-transfer setup for these small property replies.
export function cloneNativeValue(value){
  if(Array.isArray(value))return value.map(cloneNativeValue);
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,child])=>[key,cloneNativeValue(child)]));
  return value;
}
export function commitNativeWorld(world,result){
  if(!result.worldCommitted?.length)return world;
  const ids=new Set(result.worldCommitted),states=new Map(result.objects.filter(o=>ids.has(o.id)).map(o=>[o.id,o]));
  return world.map(object=>states.has(object.id)?{...object,...cloneNativeValue(states.get(object.id))}:object);
}
// Engine-owned UI snapshots are immutable. Cache their JSON without hiding any
// UI fields from C++; ordinary mutable actor data is serialized on every call.
const immutableJSON=new WeakMap();
export function immutableNativeSnapshot(value){
  const text=JSON.stringify(value),snapshot=JSON.parse(text),freeze=value=>{if(value&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;};freeze(snapshot);immutableJSON.set(snapshot,{text,value:snapshot});return snapshot;
}
function withJSONField(object,key,value){const text=JSON.stringify({...object,[key]:undefined});return text.slice(0,-1)+(text.length>2?',':'')+JSON.stringify(key)+':'+value+'}';}
function nativeRowJSON(object){
  const debug=object.gameplayDebug,ui=debug?.ui,encoded=ui&&immutableJSON.get(ui);return encoded===undefined?JSON.stringify(object):withJSONField(object,'gameplayDebug',withJSONField(debug,'ui',encoded.text));
}
function detachedNativeRow(object,row){
  const debug=object.gameplayDebug,encoded=debug?.ui&&immutableJSON.get(debug.ui);if(!encoded)return JSON.parse(row);
  const value=JSON.parse(withJSONField(object,'gameplayDebug',withJSONField(debug,'ui','null')));value.gameplayDebug.ui=encoded.value;return value;
}
// Compiled templates without an actor cannot receive a foreign actor call.
// Keep the boundary if even an inactive actor belongs to another module.
export function canDeferNativeFrames(objects,builds){
  const tokens=new Set();for(const object of objects){if(!object.nativeClass)continue;const build=builds.get(object.blueprintAsset||object.nativeBuildAsset);if(!build)return false;tokens.add(build.token);if(tokens.size>1)return false;}return true;
}
// Timer-free module clocks have no callbacks or actor writes. Send their steps
// together instead of waiting for a separate host/UI round trip for each one.
export function canParallelNativeFrames(builds,owner,delta){
  const scale=Math.fround(owner.core.scale),step=owner.core.paused?0:Math.fround(Math.fround(delta)*scale);
  return Number.isFinite(delta)&&delta>=0&&delta<=1&&Number.isFinite(scale)&&scale>=0&&typeof owner.core.paused==='boolean'&&[...builds].every(build=>{
    const client=nativeWorldClient(build,owner);
    return build.metadata?.nativeFrameBatch===1&&client.clockBatchable&&client.pendingCalls===0&&!client.frames.length&&Number.isFinite(Math.fround(client.clockState?.time+step));
  });
}
export async function advanceNativeFrames(builds,owner,delta,invoke,isCurrent=()=>owner.active&&!owner.stopping){
  const unique=[...new Map([...builds.values()].map(build=>[build.token,build])).values()];
  const mergeClocks=unique.length>1&&unique.length<=32&&unique.every(build=>{const c=nativeWorldClient(build,owner);return build.metadata.nativeModuleFrameBatch===1&&c.clockBatchable&&c.pendingCalls===0&&c.frames.length<63;});
  const advance=async build=>{
    if(!isCurrent())return;
    const result=await invoke({command:'frame',delta,deferFrame:mergeClocks||canDeferNativeFrames(owner.objects,builds),clock:{scale:owner.core.scale,paused:owner.core.paused}},build);
    if(isCurrent())await owner.nativeTimers(result,owner.bindings.filter(binding=>owner.hooks.nativeBuild?.(binding.self)?.token===build.token));
  };
  const parallel=unique.length>1&&canParallelNativeFrames(unique,owner,delta);
  const counts=owner.nativeFrameGroups??={parallel:0,sequential:0};counts[parallel?'parallel':'sequential']++;
  if(parallel)await Promise.all(unique.map(advance));
  else for(const build of unique){if(!isCurrent())break;await advance(build);}
}
export class NativeWorldClient {
  constructor(owner){this.owner=owner;this.id=crypto.randomUUID();this.world=null;this.rows=null;this.sequence=0;this.queue=Promise.resolve();this.pendingCalls=0;this.clockRevision=0;this.frames=[];this.clockBatchable=false;this.clockState=null;this.spawnContext=null;}
  call(request,metadata,send){
    this.moduleFrameBatch=metadata?.nativeModuleFrameBatch===1;
    this.pendingCalls++;
    const job=this.queue.then(async()=>{
      const game=this.owner?.hooks?.game;if(game&&metadata?.nativeGameSession===1)request={...request,gameSession:game.snapshot()};const context=request.spawnTemplates,prefix=request.spawnPrefix,deliver=send;
      if(context&&this.spawnContext?.context===context&&this.spawnContext.prefix===prefix&&request.command!=='reset'){const {spawnTemplates,...next}=request;request=next;}
      send=async packet=>{
        const revision=this.clockRevision,preludes=[];
        if(!packet.command&&metadata.nativeModuleFrameBatch===1)for(const [token,client] of owners.get(this.owner)||[]){if(preludes.length>=32)break;if(client===this||!client.moduleFrameBatch||client.pendingCalls||!client.clockBatchable||!client.frames.length)continue;let release;const gate=new Promise(r=>release=r),steps=client.frames;client.frames=[];client.pendingCalls++;client.queue=client.queue.then(()=>gate);preludes.push({token,client,steps,release});}
        let result;try{result=await deliver(preludes.length?{...packet,moduleFrames:preludes.map(({token,steps})=>({token,steps}))}:packet);
          if(preludes.length){if(!Array.isArray(result.moduleFrames)||result.moduleFrames.length!==preludes.length)throw Error('C++ 모듈 프레임 응답 개수 오류');for(let i=0;i<preludes.length;i++){const p=preludes[i],r=result.moduleFrames[i];if(r.token!==p.token||r.result.clockBatchable!==true||r.result.timerCallbacks?.length||r.result.operations?.length||r.result.objects?.length||r.result.events?.length)throw Error('C++ 모듈 프레임 응답 경계 오류');p.client.clockState=r.result.clock;p.client.clockBatchable=true;}}
        }catch(error){for(const p of preludes){p.client.clockBatchable=false;p.client.clockState=null;}throw error;}finally{for(const p of preludes){p.client.pendingCalls--;p.release();}}

        const refresh=reply=>{for(const foreign of reply.foreign||[]){
          const receiver=owners.get(this.owner)?.get(foreign.token);
          if(receiver){receiver.clockRevision++;receiver.clockBatchable=foreign.result.clockBatchable===true&&!foreign.result.nativeError&&receiver.pendingCalls===0&&!receiver.frames.length;receiver.clockState=foreign.result.clock;}
          refresh(foreign.result);
        }};refresh(result);
        if(game&&result.gameSession?.id===game.id)game.setState(result.gameSession.state);
        if(context)this.spawnContext={context,prefix};
        // An older reply must not restore a clock proof superseded by a foreign call.
        return revision===this.clockRevision?result:{...result,clockBatchable:false};
      };
      if(metadata?.workerProtocol!==3)return send(request);
      if(request.command==='reset'){this.frames=[];this.clockBatchable=false;const result=await send(request);this.world=null;this.rows=null;this.sequence=0;this.clockBatchable=result.clockBatchable===true;this.clockState=result.clock;return result;}
      if(request.command==='initialize'){const result=await send(request);this.world=null;this.rows=null;this.sequence=0;this.clockBatchable=result.clockBatchable===true;this.clockState=result.clock;return result;}
      if(request.command==='frame'){
        if(!Number.isFinite(request.delta)||request.delta<0||request.delta>1||request.clock&&(!Number.isFinite(request.clock.scale)||request.clock.scale<0||typeof request.clock.paused!=='boolean'))return send(request);
        // With one module and no active C++ timers, only the next C++ read can
        // observe this clock. Carry each original step, preserving float rounding.
        const scale=Math.fround(request.clock?.scale),delta=request.clock?.paused?0:Math.fround(Math.fround(request.delta)*scale),time=Math.fround(this.clockState?.time+delta);
        if(request.deferFrame&&request.clock&&metadata.nativeFrameBatch===1&&this.clockBatchable&&this.frames.length<63&&Number.isFinite(time)&&Number.isFinite(scale)){this.frames.push({delta:request.delta,clock:{...request.clock}});this.clockState={time,delta,scale,paused:request.clock.paused};return {objects:[],events:[],operations:[],timerCallbacks:[],clock:this.clockState};}
        const {deferFrame,...plain}=request,frames=this.frames;this.frames=[];const result=await send({...plain,...(frames.length?{frameAdvances:frames}:{})});this.clockBatchable=result.clockBatchable===true;this.clockState=result.clock;return result;
      }
      // Native JSON serialization compares unchanged actor rows faster than walking
      // all their component/UI fields in JS. Keep only detached, immutable rows.
      const serializeStart=performance.now();let reusedRows=0;const rows=request.objects.map(object=>nativeRowJSON(object)??'null'),current=rows.map((row,i)=>{if(this.world&&row===this.rows?.[i]){reusedRows++;return this.world[i];}return detachedNativeRow(request.objects[i],row);}),serializedAt=performance.now();
      let next,packet,sequence=this.sequence+1;const patch=this.world&&worldPatch(this.world,current);
      if(patch){next=applyWorldPatch(this.world,patch);packet={...request,objects:undefined,objectPatch:patch,worldTransport:1,worldId:this.id,baseSequence:this.sequence,worldSequence:sequence};}
      if(!packet){next=current;sequence=1;packet={...request,objects:next,worldTransport:1,worldId:this.id,baseSequence:0,worldSequence:sequence};}
      const frames=this.frames;this.frames=[];if(frames.length)packet.frameAdvances=frames;
      const preparedAt=performance.now(),result=await send(packet),acknowledgeAt=performance.now();this.clockBatchable=result.clockBatchable===true&&!result.nativeError;this.clockState=result.clock;if(result.worldSequence!==sequence)throw Error('C++ snapshot acknowledgment mismatch');const committed=commitNativeWorld(next,result);this.world=result.nativeError?null:committed;this.rows=result.nativeError?null:rows.map((row,i)=>committed[i]===next[i]?row:JSON.stringify(committed[i]));this.sequence=result.nativeError?0:sequence;if(result.transport)Object.assign(result.transport,{clientSerializeMs:serializedAt-serializeStart,clientPatchMs:preparedAt-serializedAt,clientAckMs:performance.now()-acknowledgeAt,worldRows:rows.length,reusedRows});return result;
    });
    // The ordering tail must not keep the last complete response alive.
    this.queue=job.then(()=>{},()=>{this.spawnContext=null;this.world=null;this.rows=null;this.sequence=0;this.frames=[];this.clockBatchable=false;this.clockState=null;});return job.finally(()=>this.pendingCalls--);
  }
}
const owners=new WeakMap();
export function nativeWorldClient(build,owner=build){if(!owners.has(owner))owners.set(owner,new Map());const clients=owners.get(owner);if(!clients.has(build.token))clients.set(build.token,new NativeWorldClient(owner));return clients.get(build.token);}
