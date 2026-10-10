export const defaultSortingLayers=[{id:'default',name:'Default'}];
export function sortingLayerControls(layers,values,attrs,{disabled=false}={}){
  const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const choices=sortingLayerChoices(layers);for(const id of values)if(!choices.some(([key])=>id===key))choices.push([id,id+' · 미등록']);
  return '<div class="component-layer-list">'+choices.map(([id,name])=>`<label><input type="checkbox" ${attrs} data-component-layer="${esc(id)}" aria-label="${esc(name)} 대상 레이어" ${values.includes(id)?'checked':''}${disabled?' disabled':''}>${esc(name)}</label>`).join('')+'</div>';
}
export const toggleSortingLayer=(values,id,checked)=>checked?[...new Set([...values,id])]:values.filter(value=>value!==id);
export function validSortingLayers(layers){return Array.isArray(layers)&&layers.length>0&&layers.length<=64&&layers.some(l=>l?.id==='default')&&new Set(layers.map(l=>l?.id)).size===layers.length&&layers.every(l=>l&&typeof l.id==='string'&&/^[\w-]{1,80}$/.test(l.id)&&typeof l.name==='string'&&l.name.trim().length>0&&l.name.length<=80&&(l.sortMode===undefined||['distance','y'].includes(l.sortMode)));}
export function sortingLayerChoices(layers,value){const result=(validSortingLayers(layers)?layers:defaultSortingLayers).map(l=>[l.id,l.name]);if(value&&!result.some(([id])=>id===value))result.push([value,value+' · 미등록']);return result;}
export function sortingLayerIndex(layers,id){const result=(layers||defaultSortingLayers).findIndex(l=>l.id===id);return result<0?Math.max(0,(layers||defaultSortingLayers).findIndex(l=>l.id==='default')):result;}
export function editSortingLayers(layers,action,index,value){
  const next=structuredClone(layers||defaultSortingLayers);
  if(action==='add')next.push({id:crypto.randomUUID(),name:'Layer '+next.length});
  else{if(!Number.isInteger(index)||!next[index])throw Error('정렬 레이어를 확인하세요.');if(action==='name')next[index].name=value;else if(action==='sortMode')next[index].sortMode=value;else if(action==='remove'){if(next[index].id==='default')throw Error('Default 레이어는 유지해야 해요.');next.splice(index,1);}else if(action==='up'||action==='down'){const to=index+(action==='up'?-1:1);if(to<0||to>=next.length)return next;[next[index],next[to]]=[next[to],next[index]];}else throw Error('정렬 레이어 명령을 확인하세요.');}
  if(!validSortingLayers(next))throw Error('정렬 레이어 이름·개수를 확인하세요.');return next;
}
