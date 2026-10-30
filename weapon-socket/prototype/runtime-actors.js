import {blueprintClasses} from './class-types.js';

const kindClass={character:'Character',character2d:'Character2D',sprite:'SpriteActor',controller:'PlayerController',gameMode:'GameMode',gameState:'GameState',playerState:'PlayerState'};
const assetClass=path=>path.split('/').at(-1).replace(/\.hbblueprint\.json$/,'');
const findable=(o,inactive)=>o&&!['widget','component'].includes(o.kind)&&!o.destroying&&(inactive||o.poolActive!==false);
const stringField=(o,key)=>typeof o?.[key]==='string'?o[key]:'';
const instanceEncoder=new TextEncoder();
function instanceFamily(objects,id,inactive){const object=objects.find(o=>o.id===id);if(!findable(object,inactive))return null;const spawned=!!stringField(object,'spawnRoot'),root=stringField(object,spawned?'spawnRoot':'prefabRoot');if(!root||root!==id&&!objects.some(o=>o.id===root&&findable(o,inactive)))return null;return{object,root,rootField:spawned?'spawnRoot':'prefabRoot',localField:spawned?'spawnLocalId':'prefabLocalId'};}
export function actorClassNames(object,root){
  const classes=new Set(root?[root.name,object.blueprintAsset,...root.inheritance?.ancestors||[]]:[]);
  for(const path of [...classes])if(typeof path==='string'&&path.endsWith('.hbblueprint.json'))classes.add(assetClass(path));
  let type=root?.settings?.parentClass||object.nativeClass||(object.components?.some(c=>c.type==='TopDownMovement2D')?'TopDownCharacter2D':object.components?.some(c=>c.type==='CharacterMovement2D')?'Character2D':kindClass[object.kind])||'Actor';
  const native=root?.native?.classes?.find(c=>c.name===type);if(native){classes.add(type);type=native.base;}
  for(let depth=0;type&&depth<32;depth++){classes.add(type);type=blueprintClasses[type]?.base;}
  return [...classes].filter(v=>typeof v==='string'&&v);
}
export function findRuntimeActors(objects,key,args){
  if(['sceneInstanceActor','sceneInstanceActors','sceneInstanceLocalId'].includes(key)){
    if(args.instance!==null&&typeof args.instance!=='string'||key!=='sceneInstanceLocalId'&&typeof args.includeInactive!=='boolean'||key==='sceneInstanceActor'&&(typeof args.localId!=='string'||instanceEncoder.encode(args.localId).length>1000))throw Error('인스턴스 액터 찾기 입력을 확인하세요.');
    const inactive=key==='sceneInstanceLocalId'||args.includeInactive,family=instanceFamily(objects,args.instance,inactive);if(key==='sceneInstanceLocalId')return{return:family?stringField(family.object,family.localField):''};
    if(!family)return{return:key==='sceneInstanceActors'?[]:null};const belongs=o=>findable(o,inactive)&&stringField(o,family.rootField)===family.root;
    if(key==='sceneInstanceActor')return{return:objects.find(o=>belongs(o)&&stringField(o,family.localField)===args.localId)?.id||null};const ids=[];for(const object of objects)if(belongs(object))ids.push(object.id);return{return:ids};
  }
  const field={sceneFindClass:'className',sceneFindTag:'tag',sceneFindId:'id'}[key];
  if(!field)return undefined;
  const value=args[field];if(typeof value!=='string'||value.length>1000||typeof args.includeInactive!=='boolean')throw Error('오브젝트 찾기 입력을 확인하세요.');
  const candidates=objects.filter(o=>!['widget','component'].includes(o.kind)&&!o.destroying&&(args.includeInactive||o.poolActive!==false));
  if(key==='sceneFindId')return {return:candidates.find(o=>o.id===value)?.id||null};
  if(!value)return {return:[]};
  return {return:candidates.filter(o=>key==='sceneFindTag'?o.tags?.includes(value):(o.actorClasses||actorClassNames(o)).includes(value)).map(o=>o.id)};
}
