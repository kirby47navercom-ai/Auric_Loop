import {blueprintClasses} from './class-types.js';

const kindClass={character:'Character',character2d:'Character',controller:'PlayerController',gameMode:'GameMode',gameState:'GameState',playerState:'PlayerState'};
const assetClass=path=>path.split('/').at(-1).replace(/\.hbblueprint\.json$/,'');
export function actorClassNames(object,root){
  const classes=new Set(root?[root.name,object.blueprintAsset,...root.inheritance?.ancestors||[]]:[]);
  for(const path of [...classes])if(typeof path==='string'&&path.endsWith('.hbblueprint.json'))classes.add(assetClass(path));
  let type=root?.settings?.parentClass||object.nativeClass||kindClass[object.kind]||'Actor';
  const native=root?.native?.classes?.find(c=>c.name===type);if(native){classes.add(type);type=native.base;}
  for(let depth=0;type&&depth<32;depth++){classes.add(type);type=blueprintClasses[type]?.base;}
  return [...classes].filter(v=>typeof v==='string'&&v);
}
export function findRuntimeActors(objects,key,args){
  const field={sceneFindClass:'className',sceneFindTag:'tag',sceneFindId:'id'}[key];
  if(!field)return undefined;
  const value=args[field];if(typeof value!=='string'||value.length>1000||typeof args.includeInactive!=='boolean')throw Error('오브젝트 찾기 입력을 확인하세요.');
  const candidates=objects.filter(o=>!['widget','component'].includes(o.kind)&&!o.destroying&&(args.includeInactive||o.poolActive!==false));
  if(key==='sceneFindId')return {return:candidates.find(o=>o.id===value)?.id||null};
  if(!value)return {return:[]};
  return {return:candidates.filter(o=>key==='sceneFindTag'?o.tags?.includes(value):(o.actorClasses||actorClassNames(o)).includes(value)).map(o=>o.id)};
}
