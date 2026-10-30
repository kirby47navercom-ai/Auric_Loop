import {nativeTypeSnapshot,indexedNativeStruct,nativeSnapshotDefinition} from './native-type-index.js';
import {validValue,defaultsFor} from './pin-values.js';
import {nativeEnumDefinition,validNativeEnumValue,validNativeEnumPin} from './native-enums.js';
const identifier=value=>typeof value==='string'&&/^[A-Za-z_]\w{0,79}$/.test(value);
const qualified=value=>typeof value==='string'&&value.length<=1000&&value.split('::').every(identifier);
const templates=new WeakMap();
const referencePlans=new WeakMap();
const fieldPlans=new WeakMap();
export const resetNativeRecordTemplate=definition=>{templates.delete(definition);referencePlans.delete(definition);fieldPlans.delete(definition);};
export function nativeRecordTemplate(definition){
 if(!definition)throw Error('구조체 선언이 없어요.');let value=templates.get(definition);if(value)return value;
 value=Object.fromEntries(definition.fields.map(field=>[field.name,structuredClone(field.value)]));
 const pending=[value];while(pending.length){const object=pending.pop();Object.freeze(object);for(const value of Object.values(object))if(value&&typeof value==='object')pending.push(value);}
 templates.set(definition,value);return value;
}
export function validNativeRecordDefinitions(metadata){
 const definitions=metadata?.structs;if(definitions===undefined)return true;
 if(!Array.isArray(definitions)||definitions.length>512||new Set(definitions.map(value=>value?.name)).size!==definitions.length)return false;
 if(!definitions.every(definition=>definition&&qualified(definition.name)&&typeof definition.sourcePath==='string'&&definition.sourcePath.length<=2000&&typeof definition.label==='string'&&typeof definition.tooltip==='string'&&typeof definition.blueprintType==='boolean'&&Array.isArray(definition.fields)&&definition.fields.length>0&&definition.fields.length<=128&&new Set(definition.fields.map(field=>field?.name)).size===definition.fields.length&&definition.fields.every(field=>field&&identifier(field.name)&&typeof field.label==='string'&&typeof field.tooltip==='string'&&typeof field.readOnly==='boolean'&&typeof field.array==='boolean'&&validNativeRecordPin(metadata,field,field.value,{identityOnly:true}))))return false;
 const metadataBudget={left:200000,bytes:8388608};for(const definition of definitions){const budget={left:20000,bytes:2097152};for(const field of definition.fields)if(!validNativeRecordValue(metadata,field,field.value,budget)||!validNativeRecordValue(metadata,field,field.value,metadataBudget))return false;}
 const complete=new Set(),visit=(definition,stack=[])=>{if(stack.length>=16||stack.includes(definition.name))return false;if(complete.has(definition.name))return true;for(const field of definition.fields)if(field.type==='record'){const child=nativeRecordDefinition(metadata,field);if(!child||!visit(child,[...stack,definition.name]))return false;}complete.add(definition.name);return true;};
 return definitions.every(definition=>visit(definition));
}
export function validNativeRecordPin(metadata,pin,value,{deferred=false,identityOnly=false,runtime=false}={}){
 if(pin.container==='array')pin={...pin,array:true};
 if(pin.enumName&&pin.type!=='int')return false;
 if(pin.maskEnumName){const mask=nativeEnumDefinition(metadata,{enumName:pin.maskEnumName});if(pin.enumName||!validNativeEnumPin(metadata,pin,value,{deferred,runtime})||(!mask&&!deferred))return false;}
 const budget=runtime?{left:2000000,maximumArray:100000}:{left:20000};
 if(deferred&&pin.enumName&&!nativeEnumDefinition(metadata,pin)){if(pin.structName!==undefined||!validNativeEnumPin(metadata,pin,value,{deferred,runtime}))return false;const wire={...pin};delete wire.enumName;delete wire.enumSource;return validNativeRecordValue(metadata,wire,value,budget);}
 if(pin.type!=='record')return pin.structName===undefined&&(identityOnly||validNativeRecordValue(metadata,pin,value,budget));
 if(!qualified(pin.structName))return false;
 if(!nativeRecordDefinition(metadata,pin))return deferred;
 return identityOnly||validNativeRecordValue(metadata,pin,value,budget);
}
export function nativeRecordFields(metadata,definition){
 if(!definition)return [];
 const shared=Object.isFrozen(metadata)&&Object.isFrozen(definition);
 const cached=nativeSnapshotDefinition(metadata,definition)&&fieldPlans.get(definition)?.get(metadata);if(cached)return cached;
 const defaults=nativeRecordTemplate(definition),fields=definition.fields.map(field=>{let pin={...field,id:field.name,default:defaults[field.name]};if(pin.enumName)pin={...pin,enumInfo:nativeEnumDefinition(metadata,pin)};if(pin.maskEnumName)pin={...pin,maskInfo:nativeEnumDefinition(metadata,{enumName:pin.maskEnumName})};return annotateNativeRecordPin(metadata,pin);});
 if(shared){fields.forEach(Object.freeze);Object.freeze(fields);if(nativeSnapshotDefinition(metadata,definition)){let contexts=fieldPlans.get(definition);if(!contexts){contexts=new WeakMap();fieldPlans.set(definition,contexts);}contexts.set(metadata,fields);}}
 return fields;
}
export function nativeRecordDefinition(metadata,pin){
 if(nativeTypeSnapshot(metadata))return indexedNativeStruct(metadata,pin?.structName);let found=null;
 for(const value of metadata?.structs||[])if(value.name===pin?.structName){if(found)return null;found=value;}
 return found;
}
// A value record has no dynamic object identity. Actor fields retain their own
// existing ID/reference contract, rather than turning the record into an actor.
export function validNativeRecordValue(metadata,pin,value,budget={left:20000},depth=0){
 if(--budget.left<0||depth>16)return false;
 if(typeof value==='string'&&budget.bytes!==undefined){budget.bytes-=value.length*2;if(budget.bytes<0)return false;}
 if(pin.array){if(!Array.isArray(value)||value.length>(budget.maximumArray??128))return false;for(let index=0;index<value.length;index++)if(!Object.hasOwn(value,index)||!validNativeRecordValue(metadata,{...pin,array:false},value[index],budget,depth+1))return false;return true;}
 if(pin.enumName)return validNativeEnumValue(nativeEnumDefinition(metadata,pin),value);
 if(pin.type!=='record')return validValue(pin.type,value);
 const definition=nativeRecordDefinition(metadata,pin);
 if(!definition||!value||typeof value!=='object'||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value))||Object.keys(value).length!==definition.fields.length)return false;
 return definition.fields.every(field=>Object.hasOwn(value,field.name)&&validNativeRecordValue(metadata,field,value[field.name],budget,depth+1));
}
export function nativeRecordDefault(metadata,pin,stack=[]){
 if(pin.array)return [];
 if(pin.value!==undefined)return structuredClone(pin.value);
 if(pin.type!=='record')return pin.type==='hit'?{hit:false,position:[0,0,0],normal:[0,0,0],actor:null}:structuredClone(defaultsFor(pin.type));
 const definition=nativeRecordDefinition(metadata,pin);
 if(!definition||stack.includes(definition.name)||stack.length>=16)throw Error('구조체 값의 순환·중첩 또는 선언을 확인하세요.');
 return definition.fields.every(field=>field.value!==undefined)?structuredClone(nativeRecordTemplate(definition)):Object.fromEntries(definition.fields.map(field=>[field.name,nativeRecordDefault(metadata,field,[...stack,definition.name])]));
}
export function annotateNativeRecordPin(metadata,pin){
 if(pin.type!=='record')return pin;
 const definition=nativeRecordDefinition(metadata,pin);if(pin.structInfo===definition&&(pin.array||pin.default!==undefined))return pin;return {...pin,structInfo:definition,...!pin.array&&pin.default===undefined&&definition?{default:nativeRecordTemplate(definition)}:{}};
}
function referenceFields(metadata,definition,stack=[]){
 if(!definition||stack.includes(definition.name)||stack.length>=16)throw Error('구조체 참조 선언의 순환·깊이를 확인하세요.');
 const shared=nativeSnapshotDefinition(metadata,definition);let fields=shared&&referencePlans.get(definition)?.get(metadata);if(fields)return fields;
 fields=definition.fields.filter(field=>['object','hit'].includes(field.type)||field.type==='record'&&referenceFields(metadata,nativeRecordDefinition(metadata,field),[...stack,definition.name]).length>0);if(shared){let contexts=referencePlans.get(definition);if(!contexts){contexts=new WeakMap();referencePlans.set(definition,contexts);}contexts.set(metadata,fields);}return fields;
}
export function mapNativeRecordObjects(metadata,pin,value,visit,budget={left:2000000},depth=0){
 if(--budget.left<0||depth>16)throw Error('구조체 참조 값의 크기를 확인하세요.');
 if(pin.type==='record'&&!referenceFields(metadata,nativeRecordDefinition(metadata,pin)).length)return value;
 if(pin.array||pin.container==='array'){let output=value;for(let i=0;i<value.length;i++){const next=mapNativeRecordObjects(metadata,{...pin,array:false,container:'single'},value[i],visit,budget,depth+1);if(next!==value[i]){if(output===value)output=value.slice();output[i]=next;}}return output;}
 if(pin.type==='object')return visit(value,pin);
 if(pin.type==='hit'){const actor=visit(value.actor,{type:'object'});return actor===value.actor?value:{...value,actor};}
 if(pin.type!=='record')return value;
 const definition=nativeRecordDefinition(metadata,pin),fields=referenceFields(metadata,definition);let output=value;
 for(const field of fields){const next=mapNativeRecordObjects(metadata,field,value[field.name],visit,budget,depth+1);if(next!==value[field.name]){if(output===value)output={...value};Object.defineProperty(output,field.name,{value:next,writable:true,configurable:true,enumerable:true});}}
 return output;
}
export function validNativeWireValue(metadata,pin,value,known){
 if(!validNativeRecordPin(metadata,pin,value,{runtime:true})||!validNativeEnumPin(metadata,pin,value,{runtime:true}))return false;
 if(known&&['record','hit','object'].includes(pin.type)){
  let valid=true;mapNativeRecordObjects(metadata,pin,value,id=>{if(id!==null&&!known(id))valid=false;return id;});return valid;
 }
 return true;
}
