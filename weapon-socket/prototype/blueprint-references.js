import {assertBlueprintMemberAccess} from './blueprint-access.js';
import {validNativeEnumPin} from './native-enums.js';
import {basePins,fieldsFor} from './blueprint-model.js';
import {nativeRecordDefinition,validNativeRecordPin} from './native-records.js';
const copy=value=>structuredClone(value);
function childReference(parent,key,type,array=false,structName,readOnly=false){return {type,array,structName,readOnly:parent.readOnly||readOnly,get:()=>parent.get()?.[key],set:value=>{if(parent.readOnly||readOnly)throw Error('읽기 전용 구조체 필드는 수정할 수 없어요.');const root=copy(parent.get());Object.defineProperty(root,key,{value:copy(value),writable:true,configurable:true,enumerable:true});parent.set(root);}};}
// Only declared storage and reference-preserving nodes can be written through.
export async function inputReference(vm,node,pin,frame,seen=new Set()){
 const edge=frame.g.edges.find(e=>e.to.node===node.id&&e.to.pin===pin);if(!edge)return null;
 const source=frame.g.nodes.find(n=>n.id===edge.from.node),[base,...path]=edge.from.pin.split('.'),key=source?.id+':'+edge.from.pin;if(!source||seen.has(key))return null;seen=new Set([...seen,key]);let ref;
 if(source.key==='getVariable'&&base==='value'){const v=frame.g.variables.find(v=>v.id===source.variableId);if(v){assertBlueprintMemberAccess(frame.b.root,v,'variables',{callerNode:source,callerClass:frame.b.classKey,receiverClass:frame.b.classKey});ref={type:v.type,array:v.container==='array',structName:v.structName,get:()=>frame.b.variables.get(v.id),set:value=>{if(!validNativeEnumPin(frame.g.native,v,value,{runtime:true})||v.type==='record'&&!validNativeRecordPin(frame.g.native,v,value,{runtime:true}))throw Error('변수 구조체 값의 자료형을 확인하세요.');frame.b.variables.set(v.id,copy(value));}};}}
 else if(source.key==='reroute'&&base==='value'||source.key==='setMembers'&&base==='value')ref=await inputReference(vm,source,'value',frame,seen);
 else if(['functionInput','macroInput'].includes(source.key))ref=frame.referenceInputs?.get(base);
 else if(source.key==='arrayGet'&&base==='return'){
  const parent=await inputReference(vm,source,'array',frame,seen),p=basePins(source,'in',frame.g).find(p=>p.id==='index'),index=frame.arrayIndices?.has(source.id)?frame.arrayIndices.get(source.id):await vm.read(source,p,frame);
  if(parent?.array&&Number.isInteger(index)&&index>=0&&index<parent.get().length)ref=childReference(parent,index,parent.type,false,parent.structName);
 }
 if(!ref)return null;
 for(const part of path){if(ref.array)return null;const fields=fieldsFor(ref.type,nativeRecordDefinition(frame.g.native,ref),frame.g.native),i=fields.findIndex(p=>p.id===part);if(i<0)return null;const field=fields[i];ref=childReference(ref,['vec2','vec3','color'].includes(ref.type)?i:part,field.type,field.array,field.structName,field.readOnly);}
 return ref;
}
