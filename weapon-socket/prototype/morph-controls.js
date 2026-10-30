export function morphSnapshot(group){
  const rows=[];group?.traverse(node=>{for(const [name,index] of Object.entries(node.morphTargetDictionary||{})){const weight=node.morphTargetInfluences?.[index];if(!Number.isFinite(weight))throw Error('모프 가중치가 유한해야 해요.');rows.push({mesh:node.name,name,weight});}});return rows;
}
export function morphNames(rows,mesh=''){return [...new Set(rows.filter(r=>!mesh||r.mesh===mesh).map(r=>r.name))].sort();}
export function morphWeight(rows,name,mesh=''){
  if(typeof name!=='string'||!name||name.length>200||typeof mesh!=='string'||mesh.length>200)throw Error('모프 이름/메시 이름을 확인하세요.');
  const matches=rows.filter(r=>r.name===name&&(!mesh||r.mesh===mesh));if(matches.length!==1)throw Error(matches.length?'같은 이름의 모프가 여러 개예요. 메시 이름을 지정하세요.':'모프가 없어요: '+name);return matches[0];
}
export function setMorphWeight(group,name,value,mesh=''){
  if(!Number.isFinite(value))throw Error('모프 가중치가 유한해야 해요.');const rows=morphSnapshot(group),row=morphWeight(rows,name,mesh);group.traverse(node=>{if(node.name===row.mesh&&node.morphTargetDictionary?.[name]!==undefined)node.morphTargetInfluences[node.morphTargetDictionary[name]]=value;});row.weight=value;return rows;
}
