import {validValue,defaultsFor,graphContext} from './blueprint-model.js';
import {assetTitle,validAsset} from './asset-documents.js';
import {prepareActorBindings} from './play-world.js';
import {blueprintClasses,derivesFrom} from './class-types.js';
import {actorClassNames} from './runtime-actors.js';
import {componentDefinitions} from './scene-components.js';

const copy=v=>structuredClone(v);
const basicKinds={Actor:'empty',Pawn:'character',Character:'character',Cube:'cube',Sphere:'sphere',Cylinder:'cylinder',Plane:'plane'};
export const spawnTransformValid=t=>validValue('transform',t)&&t.scale.every(n=>n>=.01)&&['position','rotation','scale'].every(k=>t[k].every(n=>Math.abs(n)<=(k==='position'?1000000:10000)));
const actor=(name,kind='empty')=>({id:'root',name,kind,group:'WORLD',visible:true,position:[0,0,0],rotation:[0,0,0],scale:[1,1,1],components:[]});
export function spawnRequested(bindings){return bindings.some(b=>/\bScene\s*::\s*Spawn\s*\(/.test(b.root.native?.source||'')||JSON.stringify(b.root).match(/"key":"(?:sceneSpawn|spawn)"/));}
export async function prepareSpawnCatalog(files,hooks){
  const templates=new Map(),byName=new Map(),bindings=new Map(),inputAssets={contexts:new Map(),actions:new Map()};
  const add=(key,value)=>{if(templates.has(key))throw Error('생성 클래스 이름 중복: '+key);templates.set(key,value);};
  for(const [name,kind] of Object.entries(basicKinds))add(name,{key:name,root:'root',objects:[actor(name,kind)],pool:{enabled:false,maxInactive:0}});
  for(const file of files.filter(f=>['blueprint','prefab'].includes(f.kind))){
    const path=file.path,data=await hooks.readAsset(path);if(!validAsset(file.kind,data))throw Error('생성 에셋 검증 실패: '+path);
    let objects,root;
    if(file.kind==='blueprint'){root='root';objects=[{...actor(data.name),blueprintAsset:path}];}
    else{root=data.root;objects=copy(data.objects);}
    const loaded=await prepareActorBindings(objects,hooks),first=objects.find(o=>o.id===root);
    if(first.parent||first.parentId)throw Error('프리팹 루트에 외부 부모가 있어요: '+path);
    for(const o of objects){if(o.components?.some(c=>c.type==='SpriteRenderer'&&c.properties?.enabled!==false))o.kind='sprite';else if(o.kind==='empty'&&o.components?.some(c=>c.type==='MeshRenderer'&&c.properties?.enabled!==false))o.kind='model';}
    const poolComponent=first.components?.find(c=>c.type==='PooledActor'&&c.properties?.enabled!==false),pool={enabled:!!poolComponent,maxInactive:poolComponent?.properties?.maxInactive??128};
    const references=Object.fromEntries(loaded.bindings.map(b=>[b.self,b.root.native?.classes.find(c=>c.name===objects.find(o=>o.id===b.self)?.nativeClass)?.properties.filter(p=>p.type==='object').map(p=>p.name)||[]]));
    const componentReferences=Object.fromEntries(objects.map(o=>[o.id,Object.fromEntries((o.components||[]).map(c=>[c.id,Object.entries(componentDefinitions[c.type]?.properties||{}).filter(([,p])=>p.objectReference).map(([name])=>name)]))]));
    add(path,{key:path,root,objects:copy(objects),pool,references,componentReferences});bindings.set(path,loaded.bindings);
    for(const kind of ['contexts','actions'])for(const [key,value] of loaded.inputAssets[kind])inputAssets[kind].set(key,value);
    const names=byName.get(assetTitle(path))||[];names.push(path);byName.set(assetTitle(path),names);
  }
  for(const [name,paths] of byName)if(paths.length===1&&!templates.has(name))templates.set(name,templates.get(paths[0]));
  const nativeClasses=new Map();
  for(const build of new Set(hooks.builds.values()))for(const c of build.metadata.classes){
    if(!blueprintClasses[c.base]||!derivesFrom(c.base,'Actor'))continue;
    if(nativeClasses.has(c.name)&&nativeClasses.get(c.name).token!==build.token)throw Error('생성 C++ 클래스 이름이 여러 빌드에 있어요: '+c.name);
    nativeClasses.set(c.name,build);
    if(templates.has(c.name))throw Error('생성 클래스 이름 중복: '+c.name);
    const nativeProperties=Object.fromEntries(c.properties.map(p=>[p.name,copy(p.value??(p.array?[]:defaultsFor(p.type)))]));
    const nativeBuildAsset='@native/'+c.name;hooks.builds.set(nativeBuildAsset,build);
    const object={...actor(c.name,basicKinds[c.base]||'empty'),nativeClass:c.name,nativeBuildAsset,nativeProperties};
    object.actorClasses=actorClassNames(object,{name:c.name,settings:{parentClass:c.name},native:build.metadata});
    add(c.name,{key:c.name,root:'root',objects:[object],pool:{enabled:false,maxInactive:0}});
  }
  return {templates,bindings,inputAssets,builds:hooks.builds};
}

export function instantiateSpawn(template,transform,rootId=crypto.randomUUID(),existing){
  if(!spawnTransformValid(transform))throw Error('생성 위치·회전·크기를 확인하세요.');
  const ids=new Map(template.objects.map((o,i)=>[o.id,o.id===template.root?rootId:existing?.find(x=>x.spawnLocalId===o.id)?.id||rootId+'_'+i]));
  const remap=v=>typeof v==='string'&&ids.has(v)?ids.get(v):Array.isArray(v)?v.map(remap):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).map(([k,x])=>[k,remap(x)])):v;
  const objects=template.objects.map(source=>{const o=copy(source);o.id=ids.get(source.id);o.spawnAsset=template.key;o.spawnRoot=rootId;o.spawnLocalId=source.id;o.spawnPool=copy(template.pool);for(const field of ['parent','parentId','owner','pawn','controller'])if(ids.has(o[field]))o[field]=ids.get(o[field]);
    // Only reference-bearing state is remapped; names, tags and arbitrary strings stay authored.
    if(o.nativeProperties)for(const key of template.references?.[source.id]||[])if(Object.hasOwn(o.nativeProperties,key))o.nativeProperties[key]=remap(o.nativeProperties[key]);
    for(const c of o.components||[])for(const key of template.componentReferences?.[source.id]?.[c.id]||[])if(Object.hasOwn(c.properties,key))c.properties[key]=remap(c.properties[key]);
    o.poolActive=true;delete o.destroying;if(source.id===template.root)Object.assign(o,copy(transform));return o;});
  return {rootId,objects,ids};
}
export function spawnBindings(catalog,template,instance){return (catalog.bindings.get(template.key)||[]).map(b=>({...b,self:instance.ids.get(b.self),variableValues:Object.fromEntries(Object.entries(b.variableValues||{}).map(([id,value])=>{const d=b.root.variables.find(v=>v.id===id);const remap=v=>typeof v==='string'?instance.ids.get(v)||v:v;return [id,d?.type==='object'?Array.isArray(value)?value.map(remap):remap(value):copy(value)];}))}));}
export async function initializeSpawn(vm,bindings,services,objects,{reused=false}={}){
  const generation=vm.generation,current=()=>vm.active&&!vm.stopping&&vm.generation===generation;
  for(const b of bindings)if(current()&&vm.object(b.self)?.poolActive!==false&&vm.object(b.self))await vm.emit(b,'construction',{},graphContext(b.root,'construction'));
  for(const o of objects)if(current()&&vm.object(o.id)===o&&o.poolActive!==false)await services.startActor(o,vm);
  for(const o of objects)if(current()&&vm.object(o.id)===o&&o.poolActive!==false)await services.startSystems(vm,o.id);
  for(const b of bindings){if(!current()||!vm.object(b.self)||vm.object(b.self).poolActive===false)continue;b.spawnInitialized=true;await vm.emit(b,'beginPlay',{});if(reused&&current()&&vm.object(b.self)?.poolActive!==false&&vm.bindings.includes(b))await vm.custom(b,'OnPoolAcquire');}
}
