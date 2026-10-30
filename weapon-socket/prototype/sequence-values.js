import {validValue,defaultsFor} from './blueprint-model.js';
import {actorClassNames} from './runtime-actors.js';
import {validNativeRecordPin,mapNativeRecordObjects} from './native-records.js';
import {validNativeEnumPin} from './native-enums.js';
export const sequenceValueTypes=['bool','int','float','string','vec2','vec3','color','object','transform','hit','record'];
const safe=id=>typeof id==='string'&&id.length>0&&id.length<=100&&!['__proto__','constructor','prototype'].includes(id);
const qualified=id=>typeof id==='string'&&id.length<=1000&&id.split('::').every(part=>/^[A-Za-z_]\w{0,79}$/.test(part));
export const sequenceValueDiscrete=track=>track.array||!['float','vec2','vec3','color'].includes(track.valueType);
export function validSequenceValue(track,value){
 return ['variable','nativeProperty'].includes(track.type)&&sequenceValueTypes.includes(track.valueType)&&typeof track.array==='boolean'&&(track.valueType==='record'?qualified(track.structName):track.structName===undefined)&&(track.type==='variable'?safe(track.variable):safe(track.className)&&safe(track.property)&&/^[A-Za-z_]\w*$/.test(track.className)&&/^[A-Za-z_]\w*$/.test(track.property))&&(track.array?Array.isArray(value)&&value.length<=128&&value.every(v=>validValue(track.valueType,v)):validValue(track.valueType,value))&&JSON.stringify(value).length<=65536;
}
function descriptor(object,track,bindings){
 const matches=bindings.filter(b=>b.self===object?.id),identity=definition=>definition.type===track.valueType&&definition.structName===track.structName;
 if(track.type==='variable'){
  for(const binding of matches){const definition=binding.root.variables.find(v=>v.id===track.variable);if(definition&&identity(definition)&&(definition.container==='array')===track.array)return {object,binding,definition,value:binding.variables.has(definition.id)?binding.variables.get(definition.id):definition.value};}
 }else if(object?.nativeClass===track.className){
  for(const binding of matches){const definition=binding.root.native?.classes.find(c=>c.name===track.className)?.properties.find(p=>p.name===track.property);if(definition&&!definition.readOnly&&identity(definition)&&definition.array===track.array)return {object,binding,definition,value:Object.hasOwn(object.nativeProperties||{},track.property)?object.nativeProperties[track.property]:definition.value??(definition.array?[]:defaultsFor(definition.type))};}
 }
 throw Error('시퀀스 변수의 대상·선언·자료형이 바뀌었어요: '+(track.variable||track.property));
}
function typed(target,value){return validNativeRecordPin(target.binding.root.native,target.definition,value,{runtime:true})&&validNativeEnumPin(target.binding.root.native,target.definition,value,{runtime:true});}
export function recordableRuntimeValues(object,bindings){
 const rows=[],seen=new Set();
 for(const binding of bindings.filter(b=>b.self===object.id)){
  const append=(definition,track,value,key)=>{if(seen.has(key))return;seen.add(key);if(definition.type==='record')track.structName=definition.structName;if(!validSequenceValue(track,value)||!typed({binding,definition},value))throw Error('녹화 변수의 자료형을 확인하세요: '+definition.name);rows.push({...track,key,name:definition.name,value,discrete:sequenceValueDiscrete(track)});};
  for(const definition of binding.root.variables)append(definition,{type:'variable',variable:definition.id,valueType:definition.type,array:definition.container==='array'},binding.variables.has(definition.id)?binding.variables.get(definition.id):definition.value,'variable|'+definition.id);
  for(const definition of binding.root.native?.classes.find(c=>c.name===object.nativeClass)?.properties||[])if(!definition.readOnly)append(definition,{type:'nativeProperty',className:object.nativeClass,property:definition.name,valueType:definition.type,array:definition.array},Object.hasOwn(object.nativeProperties||{},definition.name)?object.nativeProperties[definition.name]:definition.value??(definition.array?[]:defaultsFor(definition.type)),'native|'+object.nativeClass+'.'+definition.name);
 }
 return rows;
}
export function readSequenceValue(object,track,bindings){const target=descriptor(object,track,bindings);if(!typed(target,target.value))throw Error('시퀀스 변수의 실행 자료형을 확인하세요.');return structuredClone(target.value);}
export function prepareSequenceValues(changes,bindings,vm){
 return changes.map(({object,track,value})=>{
  if(!validSequenceValue(track,value))throw Error('시퀀스 변수 키 자료형 오류');const target=descriptor(object,track,bindings);if(!typed(target,value))throw Error('시퀀스 변수의 구조체·열거형 값을 확인하세요.');
  const reference=(id,pin=target.definition)=>{if(id===null)return null;const actor=vm.object(id==='self'?object.id:id);if(!actor)return null;const actorRoot=bindings.find(binding=>binding.self===actor.id)?.root;if(pin.className&&!(actor.actorClasses||actorClassNames(actor,actorRoot)).includes(pin.className))throw Error('시퀀스 오브젝트 참조 클래스 오류');return actor.id;};
  const mapped=mapNativeRecordObjects(target.binding.root.native,{...target.definition,array:track.array},value,reference);
  return {target,track,value:structuredClone(mapped),sample:value};
 });
}
export function applySequenceValues(prepared){for(const {target,track,value}of prepared)if(track.type==='variable')target.binding.variables.set(track.variable,value);else{target.object.nativeProperties??={};Object.defineProperty(target.object.nativeProperties,track.property,{value,writable:true,configurable:true,enumerable:true});}}
