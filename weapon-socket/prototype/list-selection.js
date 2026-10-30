// Keys are stable tree IDs or the flat source indices, never recycled DOM rows.
export class ListSelection {
 constructor(mode='single'){this.keys=new Set();this.anchor=null;this.configure(mode);}
 configure(mode){if(!['none','single','multiple'].includes(mode))throw Error('목록 선택 방식을 확인하세요.');if(this.mode!==mode){this.mode=mode;if(mode==='none')this.keys.clear();else if(mode==='single'&&this.keys.size>1)this.keys=new Set([this.keys.values().next().value]);}}
 choose(rows,index,{shiftKey=false,ctrlKey=false,metaKey=false,focusOnly=false}={}){
  const row=rows[index];if(!row||this.mode==='none')return;
  if(focusOnly&&this.mode==='multiple')return;
  const additive=ctrlKey||metaKey;
  if(this.mode==='multiple'&&shiftKey){const start=rows.findIndex(r=>r.key===this.anchor);if(!additive)this.keys.clear();for(let i=Math.min(start<0?index:start,index);i<=Math.max(start<0?index:start,index);i++)this.keys.add(rows[i].key);}
  else{if(this.mode==='single'||!additive)this.keys.clear();if(this.mode==='multiple'&&additive&&this.keys.has(row.key))this.keys.delete(row.key);else this.keys.add(row.key);this.anchor=row.key;}
 }
 set(rows,indices){this.keys.clear();if(this.mode==='none')return;for(const index of indices){if(rows[index])this.keys.add(rows[index].key);if(this.mode==='single'&&this.keys.size)break;}this.anchor=this.keys.values().next().value??null;}
 indices(rows){const out=[];for(let i=0;i<rows.length;i++)if(this.keys.has(rows[i].key))out.push(i);return out;}
}

// Destination is a boundary in the original array. The returned map preserves
// selection and focus even when duplicate primitive values are moved together.
export function reorderListItems(items,indices,destination){
 if(!Array.isArray(items)||!Number.isInteger(destination)||destination<0||destination>items.length||!Array.isArray(indices)||indices.some(i=>!Number.isInteger(i)||i<0||i>=items.length))throw Error('목록 이동 위치를 확인하세요.');
 const chosen=new Set(indices),moving=[],rest=[];for(let i=0;i<items.length;i++)(chosen.has(i)?moving:rest).push(i);
 const at=destination-moving.filter(i=>i<destination).length,order=[...rest.slice(0,at),...moving,...rest.slice(at)];
 const positions=new Map(order.map((old,index)=>[old,index]));return{items:order.map(i=>items[i]),indices:moving.map(i=>positions.get(i)),positions,changed:order.some((old,i)=>old!==i)};
}

export function listSelectionEvent(node){
 if(!['ListView','TreeView'].includes(node.type))return {};
 const indices=node.properties.selectedIndices||'[]',ids=node.properties.selectedItemIds||'[]',from=node.reorderFrom||'[]',selectionTruncated=[indices,ids,from].some(text=>text.length>10000);
 return{selectedIndices:selectionTruncated?'[]':indices,selectedItemIds:selectionTruncated?'[]':ids,selectedCount:Math.max(JSON.parse(indices).length,JSON.parse(ids).length),selectionTruncated,listChange:node.listChange||'selection',reorderFrom:selectionTruncated?'[]':from,reorderTo:node.reorderTo??-1,listPeer:typeof node.listPeer==='string'?node.listPeer.slice(0,160):'',reorderParent:typeof node.reorderParent==='string'?node.reorderParent.slice(0,160):''};
}
