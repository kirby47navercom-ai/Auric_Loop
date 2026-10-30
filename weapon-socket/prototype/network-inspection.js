import {replicaSpawnCompatible} from './network-state.js';
const kinds=new Set(['replicas','remote','removals','failures']);
export function inspectNetworkWorld(world,{kind='replicas',offset=0,limit=32,query=''}={}){
 if(!kinds.has(kind)||!Number.isSafeInteger(offset)||offset<0||!Number.isSafeInteger(limit)||limit<1||limit>128||typeof query!=='string'||query.length>160)throw Error('네트워크 조회 종류·페이지·검색어를 확인하세요.');
 const source=kind==='replicas'?world.replicas:kind==='remote'?world.remote:kind==='removals'?world.removals:world.failedSpawns,items=[],needle=query.toLocaleLowerCase();let count=0;
 for(const [id,value]of source){
  const object=kind==='replicas'?value.object:null,remote=kind==='remote'||kind==='failures'?value:kind==='removals'?value.row:world.remote.get(id),spawn=remote?.spawn,root=object?.spawnRoot||spawn?.root||'',asset=object?.spawnAsset||spawn?.asset||'';
  if(needle&&![id,object?.name||'',root,asset].some(v=>v.toLocaleLowerCase().includes(needle)))continue;
  const index=count++;if(index<offset)continue;if(items.length>=limit){if(!needle)break;continue;}
  const local=world.replicas.get(id)?.object;
  items.push({id,...(object?{object:object.id,name:object.name||'',active:object.poolActive!==false,visible:object.visible!==false,hidden:!!value.hiddenState}:{}),...(root?{root,asset,local:object?.spawnLocalId||spawn?.local||'',replacementPending:world.replacements?.has(root)||false,replacing:world.replacing?.has(root)||false}:{}),owner:remote?.owner||value.component?.properties?.ownerPeer||'',registered:!!local,...(local&&remote?{localMatchesSource:replicaSpawnCompatible(local,remote)}:{}),...(kind==='removals'?{action:value.hidden?'hide':'destroy'}:{}),...(kind==='failures'?{action:'spawn-failed'}:{})});
 }
 return {kind,offset,limit,query,count:needle?count:source.size,items,readOnly:true,status:world.status,generation:world.generation,authority:world.authority,peer:world.peer,counts:{replicas:world.replicas.size,remote:world.remote.size,removals:world.removals.size,failures:world.failedSpawns.size,replacements:world.replacements?.size||0,replacing:world.replacing?.size||0}};
}
