import {validInputSnapshot} from './runtime-input.js';
import {validValue} from './blueprint-model.js';
import {nativeTargetPin} from './native-model.js';

export function nativeBindings(objects,builds,bindings,request,metadata){
  if(request?.command&&request.command!=='initialize'||metadata?.nativeModuleQueries!==1)return undefined;
  const current=builds.get((()=>{const o=objects.find(o=>o.id===request.self);return o?.blueprintAsset||o?.nativeBuildAsset;})())?.token;
  const native=objects.filter(o=>!['widget','component'].includes(o.kind)&&o.nativeClass&&builds.has(o.blueprintAsset||o.nativeBuildAsset)),foreign=native.some(o=>builds.get(o.blueprintAsset||o.nativeBuildAsset).token!==current),owners=new Map(bindings.map(b=>[b.self,b]));
  return native.flatMap(o=>{const token=builds.get(o.blueprintAsset||o.nativeBuildAsset).token,overrides=owners.get(o.id)?.root.nodes.filter(n=>n.key==='nativeEvent'&&n.nativeId.startsWith(o.nativeClass+'.')).map(n=>n.nativeId)||[];return foreign||overrides.length?[{id:o.id,token,className:o.nativeClass,...(token!==current?{properties:o.nativeProperties||{}}:{}),overrides}]:[];});
}
export function validateNativeBindings(request,resolve){
  const rows=request.nativeBindings;if(rows===undefined)return;
  if(!Array.isArray(rows)||new Set(rows.map(r=>r?.id)).size!==rows.length)throw Error('C++ 모듈 바인딩 범위 오류');
  for(const row of rows){const module=resolve(row?.token),c=module?.metadata.classes.find(c=>c.name===row.className),state=request.objects.find(o=>o.id===row.id),properties=row.properties??(state?.nativeClass===row.className?state.nativeProperties:undefined);if(!c||!state||!properties||typeof properties!=='object'||Array.isArray(properties)||Object.keys(row).some(k=>!['id','token','className','properties','overrides'].includes(k)))throw Error('C++ 모듈 바인딩 오류');
    for(const [name,value] of Object.entries(properties)){const p=c.properties.find(p=>p.name===name);if(!p||!(p.array?Array.isArray(value)&&value.length<=100000&&value.every(v=>validValue(p.type,v)):validValue(p.type,value)))throw Error('C++ 모듈 속성 오류: '+name);}
    if(!Array.isArray(row.overrides)||row.overrides.length>500||row.overrides.some(id=>!c.functions.some(f=>f.event!=='none'&&row.className+'.'+f.name===id)))throw Error('C++ 모듈 이벤트 오류');
  }
}
export function nativeModuleWorld(objects,rows,token){
  return objects.map(o=>{const {nativeClass,nativeProperties,...base}=o,row=rows?.find(r=>r.id===o.id&&r.token===token);return row?{...base,nativeClass:row.className,nativeProperties:row.properties??(nativeClass===row.className?nativeProperties:{})}:base;});
}
export function nativeModuleRequest(request,query,resolve){
  if(query.input!==undefined&&!validInputSnapshot(query.input))throw Error('C++ 모듈 입력 상태 오류');
  const args=query.args,row=request.nativeBindings?.find(r=>r.id===args?.target),module=row&&resolve(row.token),c=module?.metadata.classes.find(c=>c.name===row.className);
  if(!c||!['getFloat','setFloat','call'].includes(args.operation)||typeof args.member!=='string'||!args.member||args.member.length>80)throw Error('C++ 모듈 대상 또는 작업 오류');
  const p=c.properties.find(p=>p.name===args.member),f=c.functions.find(f=>f.name===args.member),call={nativeId:row.className+'.'+args.member,self:row.id,scope:query.scope||'',overrides:row.overrides};
  if(args.operation==='call'){if(!f||!args.arguments||typeof args.arguments!=='object'||Array.isArray(args.arguments))throw Error('C++ 모듈 함수 오류');call.key='nativeCall';call.args={...args.arguments,...(!f.static?{[nativeTargetPin(f)]:row.id}:{})};}
  else{if(!p||p.array||!['float','int'].includes(p.type)||args.operation==='setFloat'&&p.readOnly)throw Error('C++ 모듈 숫자 속성 오류');call.key=args.operation==='getFloat'?'nativeGet':'nativeSet';call.args={target:row.id,...(call.key==='nativeSet'?{value:args.value}:{})};}
  const rows=request.nativeBindings.map(r=>{const state=query.objects.find(o=>o.id===r.id);return state?.nativeClass===r.className?{...r,properties:state.nativeProperties||r.properties}:r;});
  return {token:row.token,call,request:{...call,...(request.gameSession?{gameSession:{...request.gameSession,state:query.gameState??request.gameSession.state}}:{}),input:query.input??request.input,scopes:request.scopes,clock:query.clock,nativeBindings:rows,objects:nativeModuleWorld(query.objects,rows,row.token)}};
}
// Foreign calls have already passed their owning module's typed protocol check.
// Merge their effects at the caller's real execution boundary, retaining ownership.
export function mergeNativeReply(result,self){
  const objects=[],events=[],operations=[],spawned=new Map();
  const walk=(reply,owner)=>{
    const foreign=[...reply.foreign||[]].sort((a,b)=>(a.operationIndex??0)-(b.operationIndex??0));let next=0;
    for(let i=0;i<=(reply.operations?.length||0);i++){
      while(next<foreign.length&&(foreign[next].operationIndex??0)===i){const receipt=foreign[next++];walk(receipt.result,receipt.call.self);}
      const operation=reply.operations?.[i];if(!operation)continue;const op={...operation,self:operation.self||owner};
      if(op.key==='sceneSpawn'){op.args=structuredClone(op.args);for(const state of op.args.spawnStates||[])spawned.set(state.id,state);}
      if(op.key==='sceneDestroy'){const state=spawned.get(op.args.target),root=state?.spawnRoot||op.args.target;for(const [id,state] of spawned)if(id===root||state.spawnRoot===root)spawned.delete(id);}
      operations.push(op);
    }
    for(const state of reply.objects||[]){const created=spawned.get(state.id);if(created)Object.assign(created,structuredClone(state));}
    objects.push(...reply.objects||[]);events.push(...reply.events||[]);
  };walk(result,self);return {...result,objects,events,operations};
}
