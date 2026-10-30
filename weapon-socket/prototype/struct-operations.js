import {defaultsFor,validValue} from './pin-values.js';
import {nativeRecordDefinition,nativeRecordFields,nativeRecordTemplate,validNativeRecordValue} from './native-records.js';

const pin=(id,label,type='float',extra={})=>({id,label,type,array:false,...extra});
const definitions={
 vec2:[pin('x','X'),pin('y','Y')],
 vec3:[pin('x','X'),pin('y','Y'),pin('z','Z')],
 color:[pin('r','R'),pin('g','G'),pin('b','B'),pin('a','A')],
 transform:[pin('position','Position','vec3'),pin('rotation','Rotation','vec3'),pin('scale','Scale','vec3')],
 hit:[pin('hit','Blocking hit','bool'),pin('position','Impact point','vec3'),pin('normal','Normal','vec3'),pin('actor','Actor','object')]
};
export const structTypes={vec2:'Vector2',vec3:'Vector3',color:'Color',transform:'Transform',hit:'HitResult'};
export const fieldsFor=(type,definition,metadata)=>type==='record'?nativeRecordFields(metadata,definition):Object.hasOwn(definitions,type)?definitions[type]:[];
export const isStructNode=node=>['makeStruct','breakStruct','setMembers'].includes(node?.key);
export const structNodeType=node=>node.valueType||'transform';
export const visibleStructFields=(node,metadata)=>node.memberPins??(node.key==='setMembers'?[]:fieldsFor(structNodeType(node),nativeRecordDefinition(metadata,node),metadata).map(p=>p.id));
const indexed=type=>['vec2','vec3','color'].includes(type);
export function structFields(type,value,definition,metadata){
 value??=type==='record'&&definition?nativeRecordTemplate(definition):defaultsFor(type);
 return fieldsFor(type,definition,metadata).map((p,i)=>({...p,default:type==='record'?value[p.id]:structuredClone(indexed(type)?value[i]:value[p.id])}));
}
export function structPins(node,direction,metadata){
 if(!isStructNode(node))return null;const type=structNodeType(node),definition=nativeRecordDefinition(metadata,node),fields=structFields(type,undefined,definition,metadata),extra=type==='record'?{structName:node.structName,structInfo:definition,...definition?{default:nativeRecordTemplate(definition)}:{}}:{},value=pin('value','Struct',type,{reference:node.key==='setMembers',...extra});
 if(node.key==='makeStruct')return direction==='in'?fields:[pin('return',definition?.label||structTypes[type]||node.structName,type,extra)];
 const selected=new Set(visibleStructFields(node,metadata));
 if(node.key==='breakStruct')return direction==='in'?[value]:fields.filter(p=>selected.has(p.id));
 return direction==='in'?[pin('exec','실행','exec'),value,...fields.filter(p=>selected.has(p.id)).map(p=>({...p,id:'member_'+p.id}))]:[pin('then','다음','exec'),value];
}
export function validStructNode(n,metadata,{deferred=false}={}){
 if(!isStructNode(n))return n.memberPins===undefined;
 const fields=fieldsFor(structNodeType(n),nativeRecordDefinition(metadata,n),metadata),unresolved=structNodeType(n)==='record'&&deferred&&typeof n.structName==='string'&&/^[A-Za-z_]\w*(?:::[A-Za-z_]\w*)*$/.test(n.structName);return (fields.length>0||unresolved)&&(n.array===undefined||n.array===false)&&(n.memberPins===undefined||n.key!=='makeStruct'&&Array.isArray(n.memberPins)&&new Set(n.memberPins).size===n.memberPins.length&&n.memberPins.every(id=>fields.some(p=>p.id===id&&(n.key!=='setMembers'||!p.readOnly))||unresolved&&/^[A-Za-z_]\w{0,79}$/.test(id)));
}
export function evaluateStruct(node,args,metadata,{runtime=false}={}){
 const budget=()=>runtime?{left:2000000,maximumArray:100000}:{left:20000};
 const type=structNodeType(node),fields=fieldsFor(type,nativeRecordDefinition(metadata,node),metadata),read=(v,p,i)=>indexed(type)?v[i]:v[p.id],valid=(value)=>type==='record'?validNativeRecordValue(metadata,{type,structName:node.structName},value,budget()):validValue(type,value);
 if(node.key==='makeStruct'){
  const value=indexed(type)?fields.map(p=>structuredClone(args[p.id])):Object.fromEntries(fields.map(p=>[p.id,structuredClone(args[p.id])]));
  if(!valid(value))throw Error('구조체 필드의 자료형과 범위를 확인하세요.');return {return:value};
 }
 if(!valid(args.value))throw Error('입력 구조체의 자료형을 확인하세요.');
 if(node.key==='breakStruct')return Object.fromEntries(fields.filter(p=>visibleStructFields(node,metadata).includes(p.id)).map(p=>[p.id,structuredClone(read(args.value,p,fields.indexOf(p)))]));
 const value=structuredClone(args.value);for(const id of visibleStructFields(node,metadata)){const i=fields.findIndex(p=>p.id===id),p=fields[i],v=args['member_'+id];if(!p||p.readOnly||!(type==='record'?validNativeRecordValue(metadata,p,v,budget()):p.array?Array.isArray(v)&&v.every(item=>validValue(p.type,item)):validValue(p.type,v)))throw Error((p?.label||id)+' 필드의 자료형을 확인하세요.');Object.defineProperty(value,indexed(type)?i:id,{value:structuredClone(v),writable:true,configurable:true,enumerable:true});}if(!valid(value))throw Error('구조체 값의 범위를 확인하세요.');return {value};
}
// Hide/type edits remove only pins that cease to exist, including descendants.
export function configureStructNode(root,graph,nodeId,{type,structName,members,hideUnconnected=false}={},view='event'){
 if(root.inheritance?.inherited.nodes.includes(nodeId))throw Error('상속된 부모 노드는 부모 문서에서 편집하세요.');
 const n=graph.nodes.find(n=>n.id===nodeId);if(!isStructNode(n))throw Error('구조체 노드를 선택하세요.');
 const next=structuredClone(n);if(type!==undefined)next.valueType=type;if(structName!==undefined)next.structName=structName;if(next.valueType!=='record')delete next.structName;const sameType=structNodeType(next)===structNodeType(n)&&next.structName===n.structName;
 if(!sameType){if(next.key==='makeStruct')delete next.memberPins;else next.memberPins=next.key==='setMembers'?[]:fieldsFor(structNodeType(next),nativeRecordDefinition(root.native,next),root.native).map(p=>p.id);next.inputValues={};next.splitPins=[];}
 if(members!==undefined)next.memberPins=structuredClone(members);
 if(hideUnconnected){if(next.key!=='breakStruct')throw Error('Break 노드의 출력만 숨길 수 있어요.');next.memberPins=fieldsFor(structNodeType(next),nativeRecordDefinition(root.native,next),root.native).filter(p=>graph.edges.some(e=>e.from.node===nodeId&&(e.from.pin===p.id||e.from.pin.startsWith(p.id+'.')))).map(p=>p.id);}
 if(!validStructNode(next,root.native))throw Error('구조체 자료형과 표시할 필드를 확인하세요.');
 const retained=(direction,id)=>structPins(next,direction,root.native).some(p=>id===p.id||id.startsWith(p.id+'.'))&&(sameType||structPins(n,direction,root.native).some(p=>p.id===id&&p.type==='exec'));
 graph.edges=graph.edges.filter(e=>(e.from.node!==nodeId||retained('out',e.from.pin))&&(e.to.node!==nodeId||retained('in',e.to.pin)));
 if(next.inputValues)for(const id of Object.keys(next.inputValues))if(!retained('in',id))delete next.inputValues[id];
 next.splitPins=(next.splitPins||[]).filter(id=>{const [direction,p]=id.split(':');return retained(direction,p);});
 if(root.watches)root.watches=root.watches.filter(w=>w.node!==nodeId||w.view!==view||retained(w.direction,w.pin));
 Object.assign(n,next);return n;
}
