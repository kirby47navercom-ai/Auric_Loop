const kinds=new Set(['sequence','multiGate','switchInt','switchString','switchName']);
const exec=(id,label)=>({id,label,type:'exec',array:false});
export const isFlowNode=node=>kinds.has(node?.key);
export const isSwitchNode=node=>['switchInt','switchString','switchName'].includes(node?.key);
export const flowOutputIds=node=>node.flowOutputs??(node.key==='sequence'?['first','second']:['out0','out1','out2']);
export const flowCaseId=id=>'case'+id.slice(3);
export function validFlowNode(node){return !!node&&(node.flowOutputs===undefined||isFlowNode(node)&&Array.isArray(node.flowOutputs)&&node.flowOutputs.length<=10000&&(isSwitchNode(node)||node.flowOutputs.length>0)&&new Set(node.flowOutputs).size===node.flowOutputs.length&&node.flowOutputs.every(id=>typeof id==='string'&&(node.key==='sequence'?/^(?:first|second|then[0-9]+)$/:/^out[0-9]+$/).test(id)&&id.length<=40))&&validSwitchCases(node)&&(node.caseSensitive===undefined||node.key==='switchString'&&typeof node.caseSensitive==='boolean')&&(node.flowHasDefault===undefined||isSwitchNode(node)&&typeof node.flowHasDefault==='boolean');}
export function dynamicFlowPins(node,direction){
 if(!isFlowNode(node)||node.flowOutputs===undefined&&node.flowHasDefault===undefined&&node.key!=='switchName')return null;
 const ids=flowOutputIds(node),switchNode=isSwitchNode(node),type=node.key==='switchInt'?'int':'string';
 if(direction==='in'){if(node.key==='sequence')return [exec('exec','실행')];if(node.key==='multiGate')return [exec('exec','Enter'),exec('reset','Reset'),{id:'loop',label:'Loop',type:'bool',array:false},{id:'random',label:'Random',type:'bool',array:false},{id:'startIndex',label:'Start index',type:'int',array:false}];return [exec('exec','Enter'),{id:'selection',label:'Selection',type,array:false},...(node.caseValues?[]:ids.map((id,i)=>({id:flowCaseId(id),label:'Case '+i,type,array:false})))];}
 return [...ids.map((id,i)=>exec(id,switchNode?String(node.caseValues?.[id]??node.inputValues?.[flowCaseId(id)]??'Case '+i):(node.key==='sequence'?'Then ':'Out ')+i)),...(switchNode?(node.flowHasDefault===false?[]:[exec('default','Default')]):node.key==='multiGate'?[{id:'index',label:'Index',type:'int',array:false}]:[])];
}
export function addFlowOutput(graph,nodeId){
 const node=graph.nodes.find(n=>n.id===nodeId);if(!isFlowNode(node))return null;const ids=[...flowOutputIds(node)];if(ids.length>=10000)throw Error('한 이벤트 실행량 10000을 넘는 출력은 추가할 수 없어요.');let index=node.key==='sequence'?2:0;while(ids.includes((node.key==='sequence'?'then':'out')+index))index++;
 const id=(node.key==='sequence'?'then':'out')+index;node.flowOutputs=[...ids,id];if(isSwitchNode(node)){node.inputValues??={};const used=new Set(ids.map(id=>node.caseValues?.[id]??node.inputValues[flowCaseId(id)]));let value=index;while(used.has(node.key==='switchInt'?value:'Case '+value))value++;if(node.caseValues)node.caseValues[id]=node.key==='switchInt'?value:'Case '+value;else node.inputValues[flowCaseId(id)]=node.key==='switchInt'?value:'Case '+value;}return id;
}
function prune(graph,nodeId,pins,root,view){graph.edges=graph.edges.filter(e=>!(e.from.node===nodeId&&pins.has(e.from.pin))&&!(e.to.node===nodeId&&pins.has(e.to.pin)));if(root?.watches)root.watches=root.watches.filter(w=>w.node!==nodeId||w.view!==view||!pins.has(w.pin));}
export function removeFlowOutput(graph,nodeId,pinId,root=graph,view='event'){
 const node=graph.nodes.find(n=>n.id===nodeId);if(!isFlowNode(node))return false;const ids=flowOutputIds(node);if(!ids.includes(pinId)||!isSwitchNode(node)&&ids.length===1)return false;node.flowOutputs=ids.filter(id=>id!==pinId);const pins=new Set([pinId]);if(isSwitchNode(node)){pins.add(flowCaseId(pinId));if(node.inputValues)delete node.inputValues[flowCaseId(pinId)];if(node.caseValues)delete node.caseValues[pinId];}prune(graph,nodeId,pins,root,view);return true;
}
export function setFlowDefault(graph,nodeId,value,root=graph,view='event'){const node=graph.nodes.find(n=>n.id===nodeId);if(!isSwitchNode(node)||typeof value!=='boolean')return false;node.flowHasDefault=value;if(!value)prune(graph,nodeId,new Set(['default']),root,view);return true;}

const asciiFold=s=>s.replace(/[A-Z]/g,c=>c.toLowerCase());
export function switchMatch(node,args){const normalize=v=>typeof v==='string'&&(node.key==='switchName'||node.key==='switchString'&&node.caseSensitive===false)?asciiFold(v):v;const selected=normalize(args.selection);return flowOutputIds(node).find(id=>normalize(node.caseValues?.[id]??args[flowCaseId(id)])===selected);}

function validSwitchCases(node){if(node.caseValues===undefined)return true;if(!isSwitchNode(node)||!node.caseValues||typeof node.caseValues!=='object'||Array.isArray(node.caseValues))return false;const ids=flowOutputIds(node);return Object.keys(node.caseValues).length===ids.length&&ids.every(id=>Object.hasOwn(node.caseValues,id)&&(node.key==='switchInt'?Number.isInteger(node.caseValues[id])&&node.caseValues[id]>=-2147483648&&node.caseValues[id]<=2147483647:typeof node.caseValues[id]==='string'&&node.caseValues[id].length<=4096));}
export function configureSwitchNode(root,graph,nodeId,options={},view='event'){
 const n=graph.nodes.find(n=>n.id===nodeId);if(!isSwitchNode(n))throw Error('Switch 노드를 선택하세요.');if(root.inheritance?.inherited.nodes.includes(nodeId))throw Error('상속된 부모 노드는 부모 문서에서 편집하세요.');
 const next=structuredClone(n),ids=flowOutputIds(n);if(options.cases!==undefined){if(!Array.isArray(options.cases)||options.cases.length>10000)throw Error('분기 목록을 확인하세요.');next.flowOutputs=[];next.caseValues={};let index=0;for(const entry of options.cases){if(!entry||typeof entry!=='object')throw Error('분기 ID와 값을 확인하세요.');let id=entry.id;if(id===undefined){while(ids.includes('out'+index)||next.flowOutputs.includes('out'+index))index++;id='out'+index++;}if(!/^out[0-9]+$/.test(id)||id.length>40||next.flowOutputs.includes(id))throw Error('분기 ID가 잘못되었거나 중복돼요.');next.flowOutputs.push(id);next.caseValues[id]=entry.value;}if(next.inputValues)for(const id of ids)delete next.inputValues[flowCaseId(id)];}
 if(options.hasDefault!==undefined)next.flowHasDefault=options.hasDefault;if(options.caseSensitive!==undefined)next.caseSensitive=options.caseSensitive;if(!validFlowNode(next))throw Error('분기 자료형과 설정을 확인하세요.');
 const removed=new Set(ids.filter(id=>!flowOutputIds(next).includes(id)));if(next.flowHasDefault===false)removed.add('default');for(const id of ids)removed.add(flowCaseId(id));if(options.cases===undefined)for(const id of ids)removed.delete(flowCaseId(id));
 prune(graph,nodeId,removed,root,view);Object.assign(n,next);return n;
}
export function moveFlowOutput(graph,nodeId,pinId,offset){const n=graph.nodes.find(n=>n.id===nodeId);if(!isFlowNode(n)||![-1,1].includes(offset))return false;const ids=[...flowOutputIds(n)],at=ids.indexOf(pinId),to=at+offset;if(at<0||to<0||to>=ids.length)return false;[ids[at],ids[to]]=[ids[to],ids[at]];n.flowOutputs=ids;return true;}
