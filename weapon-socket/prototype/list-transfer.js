import {listLayout} from './list-layout.js';
// Only authored JSON nodes on the edited ancestor paths are copied. A branch
// moves once even when both its parent and descendants are selected.
function treeIndex(items){const layout=listLayout(items,{tree:true}),rows=new Map();function visit(values,parent=''){values.forEach((item,index)=>{rows.set(item.id,{item,parent,index});visit(item.children||[],item.id);});}visit(items);return {rows,keys:layout.keys};}
function roots(index,ids){if(!Array.isArray(ids)||!ids.length||ids.some(id=>!index.rows.has(id)))throw Error('이동할 트리 항목을 확인하세요.');const chosen=new Set(ids),result=[];for(const [id,row]of index.rows){if(!chosen.has(id))continue;let parent=row.parent,covered=false;while(parent){if(chosen.has(parent)){covered=true;break;}parent=index.rows.get(parent).parent;}if(!covered)result.push(id);}return result;}
function remove(items,chosen){let changed=false;const out=[];for(const item of items){if(chosen.has(item.id)){changed=true;continue;}const children=item.children?remove(item.children,chosen):null;if(children&&children!==item.children){changed=true;out.push({...item,children});}else out.push(item);}return changed?out:items;}
function insert(items,parent,index,moving){if(!parent)return [...items.slice(0,index),...moving,...items.slice(index)];let changed=false;const out=items.map(item=>{if(item.id===parent){changed=true;const children=item.children||[];return {...item,children:[...children.slice(0,index),...moving,...children.slice(index)]};}if(!item.children)return item;const children=insert(item.children,parent,index,moving);if(children===item.children)return item;changed=true;return {...item,children};});return changed?out:items;}
function destination(index,parent,at){if(typeof parent!=='string'||parent&&!index.rows.has(parent))throw Error('트리 부모를 확인하세요.');const siblings=parent?index.rows.get(parent).item.children||[]:[...index.rows.values()].filter(r=>!r.parent).map(r=>r.item);if(!Number.isInteger(at)||at<0||at>siblings.length)throw Error('트리 삽입 위치를 확인하세요.');return siblings;}
function topologySame(a,b){return a.rows.size===b.rows.size&&[...a.rows].every(([id,row])=>{const next=b.rows.get(id);return next?.parent===row.parent&&next.index===row.index;});}
export function reparentTreeItems(items,ids,parent='',at=0){
 const before=treeIndex(items),movingIds=roots(before,ids);destination(before,parent,at);const chosen=new Set(movingIds);let ancestor=parent;while(ancestor){if(chosen.has(ancestor))throw Error('트리 항목을 자신의 하위에 넣을 수 없어요.');ancestor=before.rows.get(ancestor).parent;}
 const moving=movingIds.map(id=>before.rows.get(id).item),adjusted=at-movingIds.filter(id=>{const row=before.rows.get(id);return row.parent===parent&&row.index<at;}).length,next=insert(remove(items,chosen),parent,adjusted,moving),after=treeIndex(next),changed=!topologySame(before,after);
 return {items:changed?next:items,keys:movingIds,from:movingIds.map(id=>({id,parent:before.rows.get(id).parent,index:before.rows.get(id).index})),parent,destination:adjusted,changed};
}
export function transferTreeItems(source,ids,target,parent='',at=0){
 if(source===target){const result=reparentTreeItems(source,ids,parent,at);return {...result,sourceItems:result.items,targetItems:result.items};}const before=treeIndex(source),to=treeIndex(target),movingIds=roots(before,ids);destination(to,parent,at);const chosen=new Set(movingIds),moving=movingIds.map(id=>before.rows.get(id).item),branch=treeIndex(moving);for(const id of branch.keys)if(to.keys.has(id))throw Error('대상 트리에 같은 ID가 있어요: '+id);
 const sourceItems=remove(source,chosen),targetItems=insert(target,parent,at,moving);treeIndex(targetItems);return {sourceItems,targetItems,keys:movingIds,parent,destination:at,from:movingIds.map(id=>({id,parent:before.rows.get(id).parent,index:before.rows.get(id).index})),changed:true};
}
export function transferListItems(source,indices,target,destination){
 if(!Array.isArray(source)||!Array.isArray(target)||source===target||!Array.isArray(indices)||!indices.length||indices.some(i=>!Number.isInteger(i)||i<0||i>=source.length)||!Number.isInteger(destination)||destination<0||destination>target.length)throw Error('목록 자료와 이동 위치를 확인하세요.');
 const chosen=new Set(indices),from=[...chosen].sort((a,b)=>a-b);if(target.length+from.length>100000)throw Error('대상 목록의 항목 예산을 넘었어요.');const moving=from.map(i=>source[i]),sourceItems=source.filter((_,i)=>!chosen.has(i)),targetItems=[...target.slice(0,destination),...moving,...target.slice(destination)],positions=new Map();let at=0;source.forEach((_,i)=>{if(!chosen.has(i))positions.set(i,at++);});return {sourceItems,targetItems,indices:from.map((_,i)=>destination+i),positions,from,destination,changed:true};
}
export function treeMoveDestination(items,ids,direction){
 const index=treeIndex(items),keys=roots(index,ids),first=index.rows.get(keys[0]),last=index.rows.get(keys.at(-1));if(keys.some(id=>index.rows.get(id).parent!==first.parent))return null;const parent=first.parent,siblings=parent?index.rows.get(parent).item.children:items;
 if(direction==='ArrowLeft'){if(!parent)return null;const p=index.rows.get(parent);return {keys,parent:p.parent,destination:p.index+1};}
 if(direction==='ArrowRight'){if(first.index===0)return null;const previous=siblings[first.index-1];return {keys,parent:previous.id,destination:previous.children?.length||0};}
 if(direction==='ArrowUp')return first.index?{keys,parent,destination:first.index-1}:null;
 if(direction==='ArrowDown')return last.index<siblings.length-1?{keys,parent,destination:last.index+2}:null;return null;
}
