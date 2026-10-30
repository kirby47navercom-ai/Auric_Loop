// Derived ownership stays on the resolved inheritance view, never in authored
// children. A binding supplies its asset path (or source-root identity in memory).
export const blueprintClassKey=(root,fallback=root)=>root.inheritance?.path||fallback;
export const blueprintAccess=(member,kind='functions')=>kind==='variables'?(member?.private?'private':'public'):(member?.access??'public');
export function blueprintMemberOwner(root,member,kind='functions',fallback=root){
  const origins=root.inheritance?.memberOrigins?.[kind];if(origins&&Object.hasOwn(origins,member?.id))return origins[member.id];
  if(kind!=='variables')for(const node of member?.graph?.nodes||[]){const origin=root.inheritance?.nodeOrigins?.[node.id];if(origin)return origin.path;}
  return root.inheritance?.inherited?.[kind]?.includes(member?.id)?root.inheritance.ancestors[0]:blueprintClassKey(root,fallback);
}
export function blueprintMemberVisible(root,member,kind='functions',options={}){
  if(!member)return false;const access=blueprintAccess(member,kind);if(access==='public')return true;if(!['protected','private'].includes(access))return false;
  const callerRoot=options.callerRoot||root,callerClass=blueprintClassKey(callerRoot,options.callerClass??callerRoot),caller=callerRoot.inheritance?.nodeOrigins?.[options.callerNode?.id]?.path||callerClass,owner=blueprintMemberOwner(root,member,kind,options.receiverClass??root);
  if(caller===owner)return true;if(access==='private')return false;
  const lineage=[callerClass,...(callerRoot.inheritance?.ancestors||[])],at=lineage.indexOf(caller);return at>=0&&lineage.slice(at+1).includes(owner);
}
export function assertBlueprintMemberAccess(root,member,kind='functions',options={}){
  if(!blueprintMemberVisible(root,member,kind,options))throw Error('블루프린트 '+blueprintAccess(member,kind)+' 접근 불가: '+(member?.name||member?.id||'정의 없음'));
}
export function blueprintOverrideAllowed(root,definition){return !!definition&&!definition.parentImplementation&&blueprintAccess(definition)!=='private'&&!!root.inheritance?.inherited?.functions?.includes(definition.id);}
export function blueprintOverrideAccessLocked(root,definition){return !!definition&&!definition.parentImplementation&&!root.inheritance?.inherited?.functions?.includes(definition.id)&&blueprintMemberOwner(root,definition)!==blueprintClassKey(root);}
export function blueprintAccessProblem(root,contexts){
  for(const graph of contexts)for(const node of Array.isArray(graph.nodes)?graph.nodes:[]){
    if(!node)continue;
    const kind=node.key==='callMacro'?'macros':['getVariable','setVariable'].includes(node.key)?'variables':'functions';
    if(!['callFunction','callMacro','callParent','getVariable','setVariable'].includes(node.key)||node.key==='callParent'&&!node.parentDefinitionId)continue;
    const id=kind==='variables'?node.variableId:node.parentDefinitionId||node.definitionId,member=root[kind]?.find(d=>d.id===id);
    if(member&&!blueprintMemberVisible(root,member,kind,{callerNode:node}))return '블루프린트 '+blueprintAccess(member,kind)+' 접근 불가: '+member.name+' ('+node.id+')';
  }return null;
}
const portSignature=ports=>JSON.stringify(ports.filter(p=>p.type!=='exec').map(p=>[p.id,p.type,!!p.array,p.structName||'',p.enumName||'']));
export function assertBlueprintInterfaceImplementation(symbol,definition){
  if(blueprintAccess(definition)!=='public')throw Error('인터페이스 구현은 Public 함수여야 해요: '+symbol.name);
  if(portSignature(symbol.inputs)!==portSignature(definition.inputs)||portSignature(symbol.outputs)!==portSignature(definition.outputs))throw Error('인터페이스 구현 시그니처 불일치: '+symbol.name);
}
