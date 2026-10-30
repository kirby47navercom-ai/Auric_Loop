import {nativeModuleKey} from './native-entry.js';
import {refreshPrefabWorld,remapPrefabInstanceReferences} from './prefab-instances.js';
import {readNativeHeader,canonicalNativeText} from './native-model.js';
import {applyTravelSpawn,parseGameJson,validGameJson} from './runtime-game.js';
import {defaultRuntimeSettings,validScene} from './model.js';
import {assetTitle,loadSceneBindings,validAsset} from './asset-documents.js';
import {prepareGameplay} from './scene-runtime.js';
import {blueprintInstanceDefaults,installBlueprintInstances} from './blueprint-overrides.js';
import {actorClassNames} from './runtime-actors.js';
import {spawnRequested,prepareSpawnCatalog} from './runtime-spawn.js';

export async function prepareActorBindings(objects,{readAsset,readText,buildNative,builds=new Map(),nativeBuilds=new Map(),loaded}){
  loaded??=await loadSceneBindings(objects,readAsset,readText);installBlueprintInstances(objects,loaded.bindings.filter(b=>!b.retained));
  for(const {root,self,path} of loaded.bindings){
    if(root.native?.classes?.length){const header=canonicalNativeText(await readText(root.native.headerPath||'Source/DoorController.h')),source=canonicalNativeText(await readText(root.native.sourcePath||'Source/DoorController.cpp'));Object.assign(root.native,await readNativeHeader(header,{sourcePath:root.native.headerPath||'Source/DoorController.h',readText}),{header,source});}
    const object=objects.find(item=>item.id===self),className=root.settings?.parentClass||'Actor',definition=root.native?.classes.find(item=>item.name===className);
    if(definition){object.nativeClass=className;object.nativeProperties=blueprintInstanceDefaults(root,object).nativeProperties;}else delete object.nativeClass;
    if(root.native?.classes?.length&&!builds.has(path)){const header=await readText(root.native.headerPath||'Source/DoorController.h'),source=await readText(root.native.sourcePath||'Source/DoorController.cpp');const compiledHeader=canonicalNativeText(header),compiledSource=canonicalNativeText(source);const entry={headerPath:root.native.headerPath||'Source/DoorController.h',sourcePath:root.native.sourcePath||'Source/DoorController.cpp'},signature=nativeModuleKey(compiledHeader,compiledSource,entry);if(!nativeBuilds.has(signature))nativeBuilds.set(signature,{...await buildNative(compiledHeader,compiledSource,entry),header:compiledHeader,source:compiledSource});builds.set(path,nativeBuilds.get(signature));}
  }
  for(const object of objects)object.actorClasses=actorClassNames(object,loaded.bindings.find(b=>b.self===object.id)?.root);
  return {...loaded,objects,builds};
}

// Editor Play and the scenario runner prepare exactly the same game objects.
export async function preparePlayWorld(objects,settings,{readAsset,readText,buildNative,listAssets,game,gameInstance='',travelArguments={}}){
  await refreshPrefabWorld(objects,readAsset,{validate:d=>validAsset('prefab',d)});settings={...defaultRuntimeSettings,...settings};const reads=new Map(),read=path=>{if(!reads.has(path))reads.set(path,Promise.resolve().then(()=>readAsset(path)));return reads.get(path);};const config=settings.gameConfig?await read(settings.gameConfig):null;
  if(config&&!validAsset('gameconfig',config))throw Error('게임 설정 에셋 검증 실패');
  const gameRows=game?await game.attach(objects,gameInstance||config?.gameInstance||game.path||'',read,readText):[];if(game)game.setArguments(travelArguments);const initial=await loadSceneBindings(objects,read,readText);installBlueprintInstances(objects,initial.bindings.filter(b=>b.self!==game?.instance?.id||!game.initialized));const gameplay=await prepareGameplay(objects,{gameConfig:{...settings,...config,dimension:settings.dimension},readAsset:read}),loaded=await loadSceneBindings(objects,read,readText),builds=new Map(),nativeBuilds=game?.nativeBuilds||new Map();
  for(const binding of [...gameplay.bindings,...gameRows]){const existing=loaded.bindings.find(item=>item.self===binding.self);if(existing)Object.assign(existing,binding);else loaded.bindings.push(binding);}
  installBlueprintInstances(objects,loaded.bindings.filter(b=>!b.retained));
  applyTravelSpawn(objects,gameplay.gameplay,travelArguments);
  await prepareActorBindings(objects,{readAsset:read,readText,buildNative,builds,nativeBuilds,loaded});
  for(const object of objects){object.actorClasses=actorClassNames(object,loaded.bindings.find(b=>b.self===object.id)?.root);const pool=object.components?.find(c=>c.type==='PooledActor'&&c.properties?.enabled!==false);if(pool){object.poolActive=pool.properties?.initiallyActive===true;object.poolVisible=object.visible;object.poolCollision=object.collisionEnabled!==false;if(!object.poolActive){object.visible=false;object.collisionEnabled=false;object.velocity=[0,0,0];object.angularVelocity=[0,0,0];}}}
  remapPrefabInstanceReferences(objects,loaded.bindings);
  const spawnCatalog=spawnRequested(loaded.bindings,objects)?await prepareSpawnCatalog(listAssets?await listAssets():[],{readAsset:read,readText,buildNative,builds,nativeBuilds}):null;
  const result={...loaded,objects,builds,spawnCatalog,gameplay:gameplay.gameplay,physicsOptions:gameplay.physicsOptions};
  result.reapplyNativeBuild=(previous,next)=>{for(const [key,build] of builds)if(build.token===previous.token)builds.set(key,next);for(const [signature,build] of nativeBuilds)if(build.token===previous.token)nativeBuilds.delete(signature);nativeBuilds.set(JSON.stringify([canonicalNativeText(next.header),canonicalNativeText(next.source)]),next);};
  result.prepareLevel=async rows=>{await refreshPrefabWorld(rows,read,{validate:d=>validAsset('prefab',d)});const level=await prepareActorBindings(rows,{readAsset:read,readText,buildNative,builds,nativeBuilds});remapPrefabInstanceReferences(rows,level.bindings);if(spawnRequested(level.bindings,rows)&&!result.spawnCatalog)result.spawnCatalog=await prepareSpawnCatalog(listAssets?await listAssets():[],{readAsset:read,readText,buildNative,builds,nativeBuilds});return {...level,spawnCatalog:result.spawnCatalog};};return result;
}

export async function requestSceneTravel(vm,name,{readAsset,asset,arguments:args={}}){
  if(!vm.active||vm.stopping)throw Error('활성 게임 월드에서만 장면을 열 수 있어요.');
  if(typeof name!=='string'||!name.trim()||name.length>1000)throw Error('장면 경로를 확인하세요.');
  if(vm.sceneRequest)throw Error('이미 장면 전환이 요청됐어요.');
  const generation=vm.generation,path=await asset(name,'scene');if(!path)throw Error('장면 에셋이 없어요: '+name);
  const data=await readAsset(path);if(!validScene(data))throw Error('장면 에셋 검증 실패: '+path);
  if(!vm.active||vm.stopping||vm.generation!==generation)throw Error('장면을 읽는 동안 실행이 종료됐어요.');
  if(vm.sceneRequest)throw Error('이미 장면 전환이 요청됐어요.');
  const argumentsValue=typeof args==='string'?parseGameJson(args):structuredClone(args);if(!validGameJson(argumentsValue))throw Error('장면 인자 JSON 범위를 확인하세요.');if(argumentsValue.spawn&&!data.objects.some(o=>o.kind==='playerStart'&&(o.name===argumentsValue.spawn||o.id===argumentsValue.spawn||o.tags?.includes(argumentsValue.spawn))))throw Error('도착 PlayerStart가 없어요: '+argumentsValue.spawn);vm.sceneRequest={path,data:structuredClone(data),arguments:argumentsValue};return {};
}

export function resolvePlayAsset(files,name,kind){
  const exact=files.find(file=>file.kind===kind&&file.path===name);if(exact)return exact.path;
  const matches=files.filter(file=>file.kind===kind&&(file.name===name||assetTitle(file.path)===name));
  if(matches.length>1)throw Error('같은 이름의 에셋이 여러 개예요. 전체 경로를 사용하세요: '+name);
  return matches[0]?.path;
}
