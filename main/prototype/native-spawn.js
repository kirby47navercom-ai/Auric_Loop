import {validValue} from './blueprint-model.js';
import {validateNativeBindings} from './native-module-query.js';
import {validComponents,componentDefinitions} from './scene-components.js';

const wireCache=new WeakMap();
export function nativeSpawnRequest(vm,build,catalog){
  const lifetime=build.metadata.nativeActorLifetime===1?{activeActors:vm.objects.filter(o=>!['widget','component'].includes(o.kind)&&!o.destroying&&o.poolActive!==false).map(o=>o.id)}:{};
  if(!catalog||build.metadata.nativeSpawn!==1)return lifetime;
  let builds=wireCache.get(catalog);if(!builds)wireCache.set(catalog,builds=new Map());
  if(!builds.has(build.token)){
    const templates={},aliases={};
    for(const [name,t] of catalog.templates){if(name!==t.key){aliases[name]=t.key;continue;}
      const owners=new Map((catalog.bindings.get(t.key)||[]).map(b=>[b.self,b]));
      const nativeBindings=t.objects.flatMap(o=>{const owner=catalog.builds?.get(o.blueprintAsset||o.nativeBuildAsset);if(!owner||!o.nativeClass)return [];const overrides=owners.get(o.id)?.root.nodes.filter(n=>n.key==='nativeEvent'&&n.nativeId.startsWith(o.nativeClass+'.')).map(n=>n.nativeId)||[];return [{id:o.id,token:owner.token,className:o.nativeClass,properties:o.nativeProperties||{},overrides}];});
      templates[name]={...t,nativeBindings,objects:t.objects.map(o=>{const owner=catalog.builds?.get(o.blueprintAsset||o.nativeBuildAsset);if(owner?.token===build.token)return o;const {nativeClass,nativeProperties,...plain}=o;return plain;})};}
    builds.set(build.token,{templates,aliases});
  }
  vm.spawnPrefix??=crypto.randomUUID();
  // One prefix per VM and native module prevents IDs from colliding across workers.
  vm.spawnModules??=new Map();if(!vm.spawnModules.has(build.token))vm.spawnModules.set(build.token,crypto.randomUUID());
  return {...lifetime,spawnPrefix:vm.spawnModules.get(build.token),spawnTemplates:builds.get(build.token)};
}
export function validateSpawnTemplates(context,metadata,resolve){
  if(!context||typeof context!=='object'||!context.templates||Array.isArray(context.templates)||!context.aliases||Array.isArray(context.aliases)||Object.keys(context.templates).length>1024||Object.keys(context.aliases).length>1024)throw Error('C++ 생성 카탈로그 형식 오류');
  for(const [key,t] of Object.entries(context.templates)){
    if(key.length>1000||!key||t?.key!==key||!Array.isArray(t.objects)||!t.objects.length||!t.objects.some(o=>o.id===t.root)||new Set(t.objects.map(o=>o.id)).size!==t.objects.length||!t.pool||typeof t.pool.enabled!=='boolean'||!Number.isInteger(t.pool.maxInactive)||t.pool.maxInactive<0||t.pool.maxInactive>1000)throw Error('C++ 생성 템플릿 형식 오류');
    for(const o of t.objects){if(!o||typeof o.id!=='string'||o.id.length>160||!validValue('transform',o)||o.components!==undefined&&!validComponents(o.components))throw Error('C++ 생성 기본값 오류');const c=metadata.classes.find(c=>c.name===o.nativeClass);if(o.nativeClass!==undefined&&!c)throw Error('C++ 생성 클래스 오류');for(const [name,value] of Object.entries(o.nativeProperties||{})){const p=c?.properties.find(p=>p.name===name);if(!p||!(p.array?Array.isArray(value)&&value.length<=100000&&value.every(v=>validValue(p.type,v)):validValue(p.type,value)))throw Error('C++ 생성 속성 오류: '+name);}}
    if(t.nativeBindings!==undefined){if(!resolve&&t.nativeBindings.length)throw Error('C++ 생성 모듈 검증기가 없어요.');validateNativeBindings({objects:t.objects,nativeBindings:t.nativeBindings},resolve);}
    for(const [id,names] of Object.entries(t.references||{})){const o=t.objects.find(o=>o.id===id),row=t.nativeBindings?.find(r=>r.id===id),c=row?resolve(row.token)?.metadata.classes.find(c=>c.name===row.className):metadata.classes.find(c=>c.name===o?.nativeClass);if(!o||!Array.isArray(names)||names.length>100||names.some(name=>!c?.properties.some(p=>p.name===name&&p.type==='object')))throw Error('C++ 생성 객체 참조 스키마 오류');}
    for(const [id,components] of Object.entries(t.componentReferences||{})){const o=t.objects.find(o=>o.id===id);if(!o||!components||Array.isArray(components)||typeof components!=='object')throw Error('C++ 생성 컴포넌트 참조 형식 오류');for(const [id,names] of Object.entries(components)){const c=o.components?.find(c=>c.id===id);if(!c||!Array.isArray(names)||names.length>100||names.some(name=>!componentDefinitions[c.type]?.properties[name]?.objectReference))throw Error('C++ 생성 컴포넌트 참조 스키마 오류');}}
  }
  for(const [name,key] of Object.entries(context.aliases))if(!name||name.length>1000||typeof key!=='string'||!Object.hasOwn(context.templates,key)||Object.hasOwn(context.templates,name))throw Error('C++ 생성 별칭 오류');
  if(JSON.stringify(context).length>2000000)throw Error('C++ 생성 카탈로그 2MB 제한 초과');return context;
}

const same=(a,b)=>a===b||Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&a.every((v,i)=>same(v,b[i]))||a&&b&&typeof a==='object'&&typeof b==='object'&&!Array.isArray(a)&&!Array.isArray(b)&&Object.keys(a).length===Object.keys(b).length&&Object.keys(a).every(k=>Object.hasOwn(b,k)&&same(a[k],b[k]));
export function spawnReplyObjects(request,result,metadata,context){
  const objects=new Map(request.objects.map(o=>[o.id,o]));
  for(const op of result.operations||[]){
    if(op.key==='sceneDestroy'){
      const o=objects.get(op.args?.target);if(o){const root=o.spawnRoot||o.id;for(const row of objects.values())if(row.id===root||row.spawnRoot===root)objects.set(row.id,{...row,poolActive:false});}continue;
    }
    if(op.key!=='sceneSpawn')continue;
    const a=op.args,key=context?.aliases?.[a?.blueprintOrPrefab]||a?.blueprintOrPrefab,t=context?.templates?.[key];
    if(metadata.nativeSpawn!==1||!t||!a||!validValue('transform',a.transform)||!Array.isArray(a.spawnStates)||a.spawnStates.length!==t.objects.length||typeof a.spawnId!=='string'||a.spawnId.length>160)throw Error('C++ 생성 결과 형식 오류');
    const existing=objects.get(a.spawnId);if(existing?!(t.pool.enabled&&existing.spawnAsset===key&&existing.spawnRoot===existing.id&&existing.poolActive===false):!(a.actorId?a.spawnId===a.actorId: a.spawnId.startsWith('spawn_'+request.spawnPrefix+'_')))throw Error('C++ 생성 객체 ID 오류');
    const ids=new Map(t.objects.map((o,i)=>[o.id,o.id===t.root?a.spawnId:a.spawnId+'_'+i]));
    for(const source of t.objects){const id=ids.get(source.id),state=a.spawnStates.find(o=>o?.id===id);if(!state||!validValue('transform',state)||!state.scale.every(v=>v>=.01)||!['position','rotation','scale'].every(k=>state[k].every(v=>Math.abs(v)<=(k==='position'?1000000:10000))))throw Error('C++ 생성 객체 변환 오류');
      const expected={...source,id,spawnAsset:key,spawnRoot:a.spawnId,spawnLocalId:source.id,spawnPool:t.pool,poolActive:true};delete expected.destroying;
      for(const field of ['parent','parentId','owner','pawn','controller'])if(ids.has(expected[field]))expected[field]=ids.get(expected[field]);
      expected.components=source.components&&structuredClone(source.components);for(const c of expected.components||[])for(const key of t.componentReferences?.[source.id]?.[c.id]||[])if(ids.has(c.properties[key]))c.properties[key]=ids.get(c.properties[key]);if(expected.components===undefined)delete expected.components;
      const strip=o=>Object.fromEntries(Object.entries(o).filter(([k])=>!['position','rotation','scale','nativeProperties'].includes(k)));
      if(!same(strip(state),strip(expected)))throw Error('C++ 생성 객체 템플릿 불일치');
      const c=metadata.classes.find(c=>c.name===source.nativeClass);if(state.nativeProperties!==undefined&&(!c||!state.nativeProperties||Array.isArray(state.nativeProperties)||typeof state.nativeProperties!=='object'||Object.entries(state.nativeProperties).some(([name,v])=>{const p=c.properties.find(p=>p.name===name);return !p||!(p.array?Array.isArray(v)&&v.length<=100000&&v.every(x=>validValue(p.type,x)):validValue(p.type,v));})))throw Error('C++ 생성 속성 출력 오류');
      objects.set(id,{...state});
    }
  }
  return objects;
}

// Queries may see actors created earlier in the same C++ call. Their identities
// and module ownership still come from the validated asset catalog.
export const spawnQueryCursor=Symbol('native spawn query cursor');
export function spawnNativeBindings(request,operations,context){
  const rows=new Map((request.nativeBindings||[]).map(r=>[r.id,r]));
  for(const op of operations||[]){if(op.key!=='sceneSpawn')continue;const key=context?.aliases?.[op.args?.blueprintOrPrefab]||op.args?.blueprintOrPrefab,t=context?.templates?.[key];if(!t)continue;
    const ids=new Map(t.objects.map((o,i)=>[o.id,o.id===t.root?op.args.spawnId:op.args.spawnId+'_'+i]));
    for(const row of t.nativeBindings||[]){const properties=structuredClone(row.properties),remap=v=>Array.isArray(v)?v.map(remap):ids.get(v)||v;for(const key of t.references?.[row.id]||[])if(Object.hasOwn(properties,key))properties[key]=remap(properties[key]);rows.set(ids.get(row.id),{...row,id:ids.get(row.id),properties});}
  }
  return [...rows.values()];
}
export function spawnQueryRequest(request,query,metadata,context){
  const operations=query.operations||[];
  if(!Array.isArray(operations)||operations.length>2000)throw Error('C++ 생성 질의 작업 범위 오류');
  const projected=spawnReplyObjects(request,{operations},metadata,context);
  if(!Array.isArray(query.objects)||query.objects.length!==projected.size||new Set(query.objects.map(o=>o.id)).size!==projected.size||query.objects.some(o=>!projected.has(o.id)))throw Error('C++ 생성 질의 월드 범위 오류');
  return {...request,objects:[...projected.values()],nativeBindings:spawnNativeBindings(request,operations.slice(request[spawnQueryCursor]||0),context)};
}
