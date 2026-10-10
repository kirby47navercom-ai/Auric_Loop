import {icon} from './icons.js';
import {Vector3,Quaternion,Euler} from 'three';
import {sceneWorldMatrix} from './scene-runtime.js';
const copy=value=>structuredClone(value);
export const escapeText=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function sceneDescendants(objects,ids){
  const result=new Set(ids);let changed=true;
  while(changed){changed=false;for(const object of objects)if(result.has(object.parent)&&!result.has(object.id)){result.add(object.id);changed=true;}}
  return objects.filter(object=>result.has(object.id));
}
export function validParent(objects,id,parent){
  if(!parent)return true;if(!objects.some(o=>o.id===parent))return false;
  const seen=new Set([id]);for(let next=parent;next;next=objects.find(o=>o.id===next)?.parent){if(seen.has(next))return false;seen.add(next);}return true;
}
export function setObjectMatrix(object,matrix){const position=new Vector3(),rotation=new Quaternion(),scale=new Vector3();matrix.decompose(position,rotation,scale);const angles=new Euler().setFromQuaternion(rotation);object.position=position.toArray();object.rotation=[angles.x,angles.y,angles.z].map(n=>n*180/Math.PI);object.scale=scale.toArray().map(n=>Math.max(.01,Math.min(10000,n)));}
export function copySceneObjects(objects,ids){const result=copy(sceneDescendants(objects,ids)),included=new Set(result.map(o=>o.id));for(const object of result)if(object.parent&&!included.has(object.parent)){setObjectMatrix(object,sceneWorldMatrix(object,objects));delete object.parent;}return result;}
export function selectionMatrices(objects,ids){const selected=new Set(ids);return objects.filter(object=>selected.has(object.id)&&!object.locked).filter(object=>{let parent=objects.find(o=>o.id===object.parent);while(parent){if(selected.has(parent.id)&&!parent.locked)return false;parent=objects.find(o=>o.id===parent.parent);}return true;}).map(object=>({id:object.id,matrix:sceneWorldMatrix(object,objects)}));}
export function transformSceneSelection(objects,selection,delta){for(const item of selection){const object=objects.find(o=>o.id===item.id);if(!object)continue;const world=item.matrix.clone().premultiply(delta),parent=objects.find(o=>o.id===object.parent);if(parent)world.premultiply(sceneWorldMatrix(parent,objects).invert());setObjectMatrix(object,world);}}
export function pasteSceneObjects(objects,copied,{offset=[0,0,0],newId=()=>crypto.randomUUID()}={}){
  const ids=new Map(copied.map(o=>[o.id,newId()])),names=new Set(objects.map(o=>o.name));
  const remap=value=>Array.isArray(value)?value.map(remap):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([key,item])=>[key,remap(item)])):typeof value==='string'&&ids.has(value)?ids.get(value):value;
  const pasted=copied.map(original=>{const object=remap(copy(original));let name=original.name,index=1;while(names.has(name))name=original.name+' '+index++;names.add(name);object.name=name;
    if(object.parent&&!ids.has(original.parent))delete object.parent;
    if(!object.parent)object.position=object.position.map((value,i)=>value+offset[i]);
    for(const component of object.components||[])component.id=newId();return object;});
  for(const object of pasted)objects.push(object);return pasted;
}
export function removeSceneObjects(objects,ids){const removed=sceneDescendants(objects,ids),set=new Set(removed.map(o=>o.id));const kept=objects.filter(o=>!set.has(o.id));objects.splice(0);for(const object of kept)objects.push(object);return removed;}
export function sceneMatches(object,query){
  const all=[object.name,object.kind,object.group,...(object.tags||[]),...(object.components||[]).map(c=>c.type)].join(' ').toLowerCase();
  return (query.toLowerCase().match(/"[^"]+"|\S+/g)||[]).every(raw=>{const exclude=raw.startsWith('-'),token=(exclude?raw.slice(1):raw).replaceAll('"',''),[key,...parts]=token.split(':'),term=parts.join(':');let match;
    if(['type','t'].includes(key)&&term)match=object.kind.toLowerCase().includes(term);
    else if(['component','c'].includes(key)&&term)match=(object.components||[]).some(c=>c.type.toLowerCase().includes(term));
    else if(key==='tag'&&term)match=(object.tags||[]).some(tag=>tag.toLowerCase()===term);
    else match=token.startsWith('+')?all.split(/\s+/).includes(token.slice(1)):all.includes(token);return exclude?!match:match;});
}
export function sceneRows(objects,query='',collapsed=new Set()){
  const byId=new Map(objects.map(o=>[o.id,o])),children=new Map(),matches=new Set(objects.filter(o=>sceneMatches(o,query)).map(o=>o.id));
  for(const o of objects){const parent=o.parent||null;if(!children.has(parent))children.set(parent,[]);children.get(parent).push(o);}
  if(query)for(const o of objects.filter(o=>matches.has(o.id))){const seen=new Set([o.id]);for(let parent=o.parent;parent&&!seen.has(parent);parent=byId.get(parent)?.parent){seen.add(parent);matches.add(parent);}}
  const rows=[],seen=new Set(),stack=(children.get(null)||[]).map(object=>({object,depth:0})).reverse();
  while(stack.length){const {object,depth}=stack.pop();if(seen.has(object.id)||!matches.has(object.id))continue;seen.add(object.id);const nested=children.get(object.id)||[];rows.push({object,depth,children:!!nested.length});if(!collapsed.has(object.id)||query)for(let i=nested.length-1;i>=0;i--)stack.push({object:nested[i],depth:depth+1});}
  return rows;
}
export function hierarchyMarkup(objects,selected,query,collapsed,kindIcon){return sceneRows(objects,query,collapsed).map(({object:o,depth,children})=>`<div class="hierarchy-row ${selected.has(o.id)?'active':''}" data-scene-row="${escapeText(o.id)}" role="treeitem" aria-selected="${selected.has(o.id)}" ${children?`aria-expanded="${!collapsed.has(o.id)}"`:''} style="--tree-depth:${depth}"><button class="tree-fold" data-fold="${escapeText(o.id)}" aria-label="${escapeText(o.name)} 하위 오브젝트 ${collapsed.has(o.id)?'펼치기':'접기'}" ${children?'':'disabled'}>${children?icon(collapsed.has(o.id)?'chevron':'chevron-down'):''}</button><button class="tree-item ${selected.has(o.id)?'active':''}" data-select="${escapeText(o.id)}" draggable="true" aria-pressed="${selected.has(o.id)}">${icon(kindIcon(o.kind))}<span class="tree-name">${escapeText(o.name)}</span></button><button class="tree-state" data-scene-lock="${escapeText(o.id)}" aria-label="${escapeText(o.name)} 선택 ${o.locked?'허용':'잠금'}" title="선택 ${o.locked?'잠금 해제':'잠금'}">${o.locked?icon('lock'):''}</button><button class="tree-state" data-scene-visible="${escapeText(o.id)}" aria-label="${escapeText(o.name)} ${o.visible?'숨기기':'표시'}">${icon(o.visible?'eye':'eye-off')}</button></div>`).join('');}
export class NavigationHistory {
  constructor(initial,limit=100){this.items=initial===undefined?[]:[copy(initial)];this.index=this.items.length-1;this.limit=limit;}
  push(value){if(JSON.stringify(this.items[this.index])===JSON.stringify(value))return;this.items.splice(this.index+1);this.items.push(copy(value));if(this.items.length>this.limit)this.items.shift();this.index=this.items.length-1;}
  navigate(direction){const next=this.index+(direction<0?-1:1);if(next<0||next>=this.items.length)return null;this.index=next;return copy(this.items[next]);}
}
