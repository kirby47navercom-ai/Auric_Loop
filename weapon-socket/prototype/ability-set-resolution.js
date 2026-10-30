import {abilitySetPath,validAbilityAsset} from './ability-assets.js';
import {attributeCalculationOrder,resolveAttributeCurves} from './ability-calculations.js';

// A shared ancestor is applied once. Parent, included sets in order, then local
// rows define precedence without reapplying an ancestor through a diamond.
async function walkSets(roots,read,retain){
 const state=new Map(),sources=new Map(),order=[];let calculated=false;
 for(const asset of roots){if(!abilitySetPath(asset))throw Error('능력 세트 경로를 확인하세요.');if(state.get(asset)==='done')continue;const stack=[{asset,entered:false,index:0}];
  while(stack.length){const frame=stack.at(-1);
   if(!frame.entered){const data=structuredClone(await read(frame.asset));if(!validAbilityAsset('abilityset',data))throw Error('능력 세트 검증 실패: '+frame.asset);if(data.attributes.some(a=>a.calculation))calculated=true;if(retain)sources.set(frame.asset,data);state.set(frame.asset,'visiting');frame.children=[data.parent,...data.includes||[]].filter(Boolean);frame.entered=true;}
   if(frame.index<frame.children.length){const child=frame.children[frame.index++];if(state.get(child)==='visiting')throw Object.assign(Error('능력 세트 순환: '+[...stack.slice(-8).map(f=>f.asset),child].join(' → ')),{code:'ABILITY_SET_CYCLE'});if(state.get(child)!=='done')stack.push({asset:child,entered:false,index:0});}
   else{state.set(frame.asset,'done');order.push(frame.asset);stack.pop();}
  }
 }return{sources,order,calculated};
}
export async function validateAbilitySetGraph(assets,read){const cache=new Map(),cached=path=>{if(!cache.has(path))cache.set(path,Promise.resolve().then(()=>read(path)));return cache.get(path);};const result=await walkSets(assets,cached,false);if(result.calculated)for(const asset of assets)await resolveAbilitySet(asset,cached);return{sets:result.order.length};}
export async function abilitySetSourceOrder(assets,read){return(await walkSets(assets,read,false)).order;}
export async function resolveAbilitySet(asset,read){
 const {sources,order}=await walkSets([asset],read,true);
 const attributes=new Map(),abilities=new Set(),tags=new Set(),attributeSources=new Map(),abilitySources=new Map(),tagSources=new Map();
 for(const path of order){const data=sources.get(path);for(const row of data.attributes){attributes.set(row.name,{name:row.name,base:row.base,min:row.min,max:row.max,...(row.calculation?{calculation:structuredClone(row.calculation)}:{})});attributeSources.set(row.name,path);}for(const ability of data.abilities){abilities.add(ability);if(!abilitySources.has(ability))abilitySources.set(ability,path);}for(const tag of data.grantedTags){tags.add(tag);if(!tagSources.has(tag))tagSources.set(tag,path);}}
 const rows=[...attributes.values()],attributeOrder=attributeCalculationOrder(rows),curves=await resolveAttributeCurves(rows,read);
 return{attributeOrder,curves,root:asset,data:{version:1,name:sources.get(asset).name,attributes:rows,abilities:[...abilities],grantedTags:[...tags]},provenance:{attributes:Object.fromEntries(attributeSources),abilities:Object.fromEntries(abilitySources),tags:Object.fromEntries(tagSources)},sources:order.map(path=>({path,name:sources.get(path).name}))};
}

export function abilitySetPage(result,{section='summary',offset=0,limit=64}={}){
 if(!['summary','attributes','abilities','tags','sources'].includes(section)||!Number.isInteger(offset)||offset<0||!Number.isInteger(limit)||limit<1||limit>256)throw Error('능력 세트 조회 구역·페이지를 확인하세요.');
 const {data,provenance}=result,counts={attributes:data.attributes.length,abilities:data.abilities.length,tags:data.grantedTags.length,sources:result.sources.length},base={path:result.root,name:data.name,section,counts};if(section==='summary')return base;
 const source=section==='attributes'?data.attributes:section==='abilities'?data.abilities:section==='tags'?data.grantedTags:result.sources,items=source.slice(offset,offset+limit).map(row=>section==='attributes'?{...structuredClone(row),source:provenance.attributes[row.name]}:section==='abilities'?{asset:row,source:provenance.abilities[row]}:section==='tags'?{tag:row,source:provenance.tags[row]}:{...row});return{...base,total:source.length,offset,items,nextOffset:offset+limit<source.length?offset+limit:null};
}

function freeze(value){const pending=[value];while(pending.length){const at=pending.pop();if(!at||typeof at!=='object'||Object.isFrozen(at))continue;for(const key of Object.keys(at))pending.push(at[key]);Object.freeze(at);}return value;}

// Immutable templates are shared by owners. Budgets evict cache entries, never
// restrict the number of authored sets or attributes in a composed graph.
export class AbilitySetLibrary{
 constructor(read,{maxEntries=64,maxBytes=32*1024*1024}={}){if(![maxEntries,maxBytes].every(v=>Number.isSafeInteger(v)&&v>=0))throw Error('능력 세트 캐시 예산을 확인하세요.');this.read=read;this.maxEntries=maxEntries;this.maxBytes=maxBytes;this.entries=new Map();this.bytes=0;this.resolutions=0;}
 remove(key){const entry=this.entries.get(key);if(entry){this.bytes-=entry.bytes;this.entries.delete(key);}}
 load(asset,read=this.read){let entry=this.entries.get(asset);if(entry){this.entries.delete(asset);this.entries.set(asset,entry);return entry.promise;}entry={bytes:0,done:false};this.entries.set(asset,entry);this.resolutions++;entry.promise=resolveAbilitySet(asset,read).then(result=>{const value=freeze(result);if(this.entries.get(asset)===entry){entry.done=true;entry.bytes=JSON.stringify(value).length*2;this.bytes+=entry.bytes;while(this.entries.size>this.maxEntries||this.bytes>this.maxBytes)this.remove(this.entries.keys().next().value);}return value;}).catch(error=>{if(this.entries.get(asset)===entry)this.remove(asset);throw error;});while(this.entries.size>this.maxEntries)this.remove(this.entries.keys().next().value);return entry.promise;}
 clear(){this.entries.clear();this.bytes=0;}
 inspect(){return{entries:this.entries.size,bytes:this.bytes,pending:[...this.entries.values()].filter(e=>!e.done).length,resolutions:this.resolutions};}
}
