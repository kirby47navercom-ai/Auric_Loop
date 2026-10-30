import {nativeReflectionSyntax,nativeEnumDefinition,nativeEnumInitializer} from './native-enums.js';
import {nativeInitializer} from './native-initializer.js';
import {nativeRecordDefault,nativeRecordDefinition,validNativeRecordValue,resetNativeRecordTemplate} from './native-records.js';
const {tokens,closeIndex,parts,stringValue}=nativeReflectionSyntax;
export function nativeRecordInitializer(source,metadata,pin,stack=[]){
 if(typeof source!=='string'||source.length>100000)throw Error('구조체 기본값 크기를 확인하세요.');
 if(stack.length>16)throw Error('구조체 기본값 중첩 깊이를 확인하세요.');
 const parse=(list,field)=>{
  if(field.array){
   if(list[0]?.text!=='{'||closeIndex(list,0,'{','}')!==list.length-1)throw Error('배열 기본값은 중괄호 목록을 사용하세요.');
   const values=[],budget={left:20000,bytes:2097152},element={...field,array:false};for(const item of parts(list.slice(1,-1))){if(values.length>=128)throw Error('배열 기본값 항목은128개까지예요.');const value=parse(item,element);if(!validNativeRecordValue(metadata,element,value,budget))throw Error('구조체 배열 기본값의 크기를 확인하세요.');values.push(value);}return values;
  }
  const text=list.map(token=>token.text).join('');
  if(field.enumName)return nativeEnumInitializer(text,nativeEnumDefinition(metadata,field));
  if(field.type==='string'&&list.length&&list.every(token=>token.kind==='string'))return list.map(stringValue).join('');
  if(field.type==='int')return nativeEnumInitializer(text,{name:'',underlying:{bits:32,unsigned:false},entries:[]});
  if(field.type!=='record')return nativeInitializer(text,field.type,false);
  const definition=nativeRecordDefinition(metadata,field);if(!definition)throw Error('구조체 선언이 없어요: '+field.structName);
  if(stack.includes(definition.name))throw Error('구조체 기본값이 순환해요.');
  if(list[0]?.kind==='id'){
   let at=1;while(list[at]?.text==='::'&&list[at+1]?.kind==='id')at+=2;
   const name=list.slice(0,at).map(token=>token.text).join('');
   if(![definition.name,definition.name.split('::').at(-1)].includes(name))throw Error('구조체 초기화 자료형이 달라요.');list=list.slice(at);
  }
  if(list[0]?.text!=='{'||closeIndex(list,0,'{','}')!==list.length-1)throw Error('구조체 기본값은 값 초기화 중괄호를 사용하세요.');
  const values=parts(list.slice(1,-1));if(values.length>definition.fields.length)throw Error('구조체 초기화 필드가 너무 많아요.');
  // Explicit aggregate elements start with their type's member defaults, not
  // the containing field's initializer (or its array of initialized records).
  const defaults=nativeRecordDefault(metadata,{type:'record',structName:definition.name},[...stack]);
  for(let index=0;index<values.length;index++){
   const child=definition.fields[index],text=values[index].map(token=>token.text).join('');
   Object.defineProperty(defaults,child.name,{value:child.type==='record'||child.array?nativeRecordInitializer(text,metadata,child,[...stack,definition.name]):parse(values[index],child),writable:true,configurable:true,enumerable:true});
  }
  return defaults;
 };
 const value=parse(tokens(source),pin);
 if(!validNativeRecordValue(metadata,pin,value))throw Error('구조체 기본값의 자료형과 범위를 확인하세요.');
 return value;
}
export function initializeNativeRecordDefaults(metadata,{budget={left:200000,bytes:8388608}}={}){
 for(const definition of metadata.structs||[])resetNativeRecordTemplate(definition);
 const done=new Set(),active=new Set();
 const visit=definition=>{
  if(done.has(definition.name))return;if(active.has(definition.name))throw Error('구조체 값의 순환을 확인하세요.');active.add(definition.name);
  for(const field of definition.fields)if(field.type==='record'){const child=nativeRecordDefinition(metadata,field);if(!child)throw Error('구조체 필드 선언이 없어요.');visit(child);}
  const definitionBudget={left:20000,bytes:2097152};for(const field of definition.fields){
   const value=field.initializer===undefined?nativeRecordDefault(metadata,field):nativeRecordInitializer(field.initializer,metadata,field);
   if(!validNativeRecordValue(metadata,field,value,definitionBudget)||!validNativeRecordValue(metadata,field,value,budget))throw Error(definition.name+'.'+field.name+' 기본값의 크기·자료형을 확인하세요.');field.value=value;delete field.initializer;
  }
  resetNativeRecordTemplate(definition);active.delete(definition.name);done.add(definition.name);
 };
 for(const definition of metadata.structs||[])visit(definition);return metadata;
}
