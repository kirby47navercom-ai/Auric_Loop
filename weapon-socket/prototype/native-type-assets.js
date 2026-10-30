import {parseNativeHeader} from './native-model.js';
import {validValue,defaultsFor} from './pin-values.js';
import {nativeRecordDefault,validNativeRecordValue} from './native-records.js';
import {isNativeTypeAssetKind} from './native-type-paths.js';
import {nativeTypeClosure,nativeTypeImports} from './native-type-graph.js';

const uuid=value=>typeof value==='string'&&/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/.test(value);
const keywords=new Set(('alignas alignof and and_eq asm auto bitand bitor bool break case catch char char16_t char32_t class compl const constexpr const_cast continue decltype default delete do double dynamic_cast else enum explicit export extern false float for friend goto if inline int long mutable namespace new noexcept not not_eq nullptr operator or or_eq private protected public register reinterpret_cast return short signed sizeof static static_assert static_cast struct switch template this thread_local throw true try typedef typeid typename union unsigned using virtual void volatile wchar_t while xor xor_eq constructor prototype __proto__').split(' '));
const symbol=value=>typeof value==='string'&&/^[A-Za-z][A-Za-z\d_]{0,79}$/.test(value)&&!value.includes('__')&&!keywords.has(value);
const text=(value,max=80)=>typeof value==='string'&&value.length<=max&&!value.includes('\0');
const fail=message=>{throw Error('타입 라이브러리: '+message);};
export const nativeAssetValueTypes=Object.freeze(['bool','int','float','string','vec2','vec3','color','transform','object','hit']);
const cppTypes={bool:'bool',int:'int',float:'float',string:'std::string',vec2:'hb::Vec2',vec3:'hb::Vec3',color:'hb::Color',transform:'hb::Transform',object:'hb::Actor*',hit:'hb::HitResult'};
export const nativeTypeHeaderPath=data=>'Source/HBGenerated/Types_'+data.id.replaceAll('-','')+'.hpp';
export const nativeTypeMarker=data=>'// HBEngine type library '+data.id+'\n';
export function createNativeTypeAsset(name){const id=crypto.randomUUID();return {version:1,name,id,namespace:'Types_'+id.slice(0,8),enums:[],structs:[]};}
export function createNativeTypeDeclaration(name,kind){
 if(!['enumasset','structasset'].includes(kind))fail('개별 선언 종류를 확인하세요.');
 const data=createNativeTypeAsset(name),enumType=kind==='enumasset',definition={id:crypto.randomUUID(),symbol:symbol(name)?name:enumType?'State':'Data',label:name,tooltip:''};
 data.primary={kind:enumType?'enum':'struct',id:definition.id};
 if(enumType)data.enums.push({...definition,flags:false,entries:[{id:crypto.randomUUID(),symbol:'None',label:'없음',tooltip:'',value:0,hidden:false}]});
 else data.structs.push({...definition,fields:[{id:crypto.randomUUID(),symbol:'Value',label:'값',tooltip:'',type:'float',array:false,readOnly:false,value:0}]});
 return data;
}
export function nativeTypeAssetField(data,field,{libraries}={}){const owner=(libraries?nativeTypeClosure(data,libraries):[data]).find(d=>[...d.enums,...d.structs].some(v=>v.id===field.typeId)),definition=owner&&[...owner.enums,...owner.structs].find(d=>d.id===field.typeId);return {...field,type:field.type==='enum'?'int':field.type,...definition?{[field.type==='enum'?'enumName':'structName']:owner.namespace+'::'+definition.symbol}:{}};}
export function nativeTypeAssetDefault(data,field,options={}){if(field.array)return [];const pin=nativeTypeAssetField(data,field,options);if(field.type==='enum'){const owner=nativeTypeClosure(data,options.libraries).find(d=>d.enums.some(v=>v.id===field.typeId));return owner?.enums.find(d=>d.id===field.typeId)?.entries[0]?.value??0;}if(field.type==='record'){const built=compileNativeTypeAsset(data,options);return nativeRecordDefault(built.metadata,{type:'record',structName:pin.structName,array:false});}return structuredClone(defaultsFor(field.type));}

// The authored IDs survive labels/order/file moves. C++ symbols are separate;
// the save boundary prevents changing an existing ID's wire/C++ identity.
export function compileNativeTypeAsset(data,{libraries=new Map()}={}){
 const closure=nativeTypeClosure(data,libraries),files=[],built=new Map();
 for(const own of closure){const dependencies=nativeTypeClosure(own,libraries).filter(d=>d!==own),result=compileLocalNativeTypeAsset(own,{dependencies,files});built.set(own,result);files.push({path:result.path,content:result.header});}
 return {...built.get(data),dependencies:closure.filter(d=>d!==data),files};
}
function compileLocalNativeTypeAsset(data,{dependencies=[],files=[],deferred=false}={}){
 if(!data||data.version!==1||!uuid(data.id)||!text(data.name)||!data.name||!symbol(data.namespace)||['std','hb'].includes(data.namespace)||!Array.isArray(data.enums)||!Array.isArray(data.structs)||data.enums.length+data.structs.length>512)fail('이름·ID·namespace·선언 수를 확인하세요.');
 const imports=nativeTypeImports(data),ids=new Set([data.id]),names=new Set(),definitions=new Map(),owners=new Map();
 for(const owner of dependencies)for(const definition of [...owner.enums,...owner.structs]){if(definitions.has(definition.id))fail('가져온 선언 ID가 중복돼요.');definitions.set(definition.id,definition);owners.set(definition.id,owner);ids.add(definition.id);}
 const external=field=>!definitions.has(field.typeId)&&deferred&&imports.length&&uuid(field.typeId);
 const qualified=field=>{const definition=definitions.get(field.typeId);if(!definition)fail('가져온 선언이 없어요.');return owners.get(field.typeId).namespace+'::'+definition.symbol;};
 const identify=(entry,set)=>{if(!entry||!uuid(entry.id)||ids.has(entry.id)||!symbol(entry.symbol)||set.has(entry.symbol)||!text(entry.label)||!text(entry.tooltip,1000))fail('중복 ID·C++ 이름·표시 이름을 확인하세요.');ids.add(entry.id);set.add(entry.symbol);};
 for(const definition of [...data.enums,...data.structs]){identify(definition,names);definitions.set(definition.id,definition);owners.set(definition.id,data);}
 if(data.primary!==undefined&&(!data.primary||Object.keys(data.primary).length!==2||!['enum','struct'].includes(data.primary.kind)||!(data.primary.kind==='enum'?data.enums:data.structs).some(d=>d.id===data.primary.id)))fail('대표 선언의 종류·ID를 확인하세요.');
 for(const e of data.enums){if(!Array.isArray(e.entries)||!e.entries.length||e.entries.length>512||typeof e.flags!=='boolean')fail('열거형 항목·플래그를 확인하세요.');const entries=new Set();for(const entry of e.entries){identify(entry,entries);if(!Number.isInteger(entry.value)||entry.value< -2147483648||entry.value>2147483647||typeof entry.hidden!=='boolean')fail('열거형 값은32비트 정수예요.');}}
 for(const s of data.structs){if(!Array.isArray(s.fields)||!s.fields.length||s.fields.length>128)fail('구조체 필드를 확인하세요.');const fields=new Set();for(const field of s.fields){identify(field,fields);if(typeof field.array!=='boolean'||typeof field.readOnly!=='boolean'||!nativeAssetValueTypes.includes(field.type)&&!['record','enum'].includes(field.type))fail('필드 자료형을 확인하세요.');if(['record','enum'].includes(field.type)){const owner=owners.get(field.typeId);if(!external(field)&&(!owner||!(field.type==='record'?owner.structs:owner.enums).includes(definitions.get(field.typeId))))fail('필드가 참조하는 선언이 없어요.');}else if(field.typeId!==undefined)fail('기본 자료형에 타입 참조가 있어요.');}}
 const sorted=[],complete=new Set(),active=new Set();
 const visit=(s,depth=0)=>{if(depth>=16||active.has(s.id))fail('구조체 값의 순환·16단계 깊이를 확인하세요.');if(complete.has(s.id))return;active.add(s.id);for(const f of s.fields)if(f.type==='record'&&!external(f)&&owners.get(f.typeId)===data)visit(definitions.get(f.typeId),depth+1);active.delete(s.id);complete.add(s.id);sorted.push(s);};data.structs.forEach(s=>visit(s));
 let budget=200000;const number=(value,float=false)=>{if(typeof value!=='number'||!Number.isFinite(value)||float&&Math.abs(value)>3.4028234663852886e38)fail('유한한 숫자 범위를 확인하세요.');const n=Object.is(value,-0)?'0':String(value);return float?(/[.eE]/.test(n)?n:n+'.0')+'f':n;};
 const literal=(field,value,depth=0)=>{
  if(--budget<0||depth>16)fail('기본값의 크기·깊이를 확인하세요.');
  if(field.array){if(!Array.isArray(value)||value.length>128)fail('배열 기본값은128항목까지예요.');return '{'+value.map(v=>literal({...field,array:false},v,depth+1)).join(',')+'}';}
  if(field.type==='record'){if(external(field)){const walk=(value,depth)=>{if(--budget<0||depth>16)fail('기본값의 크기·깊이를 확인하세요.');if(value===null||typeof value==='boolean'||typeof value==='number'&&Number.isFinite(value)||typeof value==='string'&&value.length<=65536)return;if(Array.isArray(value)&&value.length<=128){value.forEach(v=>walk(v,depth+1));return;}if(value&&Object.getPrototypeOf(value)===Object.prototype&&Object.keys(value).length<=128){Object.values(value).forEach(v=>walk(v,depth+1));return;}fail('구조체 기본값을 확인하세요.');};if(!value||Object.getPrototypeOf(value)!==Object.prototype)fail('구조체 기본값을 확인하세요.');walk(value,depth);return '{}';}const d=definitions.get(field.typeId);if(!value||Object.getPrototypeOf(value)!==Object.prototype||Object.keys(value).length!==d.fields.length||d.fields.some(f=>!Object.hasOwn(value,f.symbol)))fail('구조체 기본값의 필드를 확인하세요.');return '{'+d.fields.map(f=>literal(f,value[f.symbol],depth+1)).join(',')+'}';}
  if(field.type==='enum'){if(!Number.isInteger(value)||value< -2147483648||value>2147483647)fail('열거형 기본값을 확인하세요.');return (external(field)?'int':qualified(field))+'{'+number(value)+'}';}
  if(!validValue(field.type,value))fail('기본값 자료형이 달라요: '+field.symbol);
  if(field.type==='object'){if(value!==null)fail('선언의 Actor 기본값은 null이어야 해요.');return 'nullptr';}
  if(field.type==='hit'){if(value.actor!==null)fail('선언의 Hit Actor 기본값은 null이어야 해요.');return '{'+[String(value.hit),literal({type:'vec3'},value.position,depth+1),literal({type:'vec3'},value.normal,depth+1),'nullptr'].join(',')+'}';}
  if(field.type==='transform')return '{'+['position','rotation','scale'].map(k=>literal({type:'vec3'},value[k],depth+1)).join(',')+'}';
  if(['vec2','vec3','color'].includes(field.type))return '{'+value.map(v=>number(v,true)).join(',')+'}';
  if(field.type==='string'){if(value.length>65536||/[\x00-\x08\x0b-\x1f]/.test(value))fail('문자열 기본값의 길이·제어 문자를 확인하세요.');return 'u8'+JSON.stringify(value);}
  if(field.type==='bool')return String(value);
  if(field.type==='int'&&(!Number.isInteger(value)||value< -2147483648||value>2147483647))fail('정수 기본값 범위를 확인하세요.');
  return number(value,field.type==='float');
 };
 const meta=d=>'DisplayName='+JSON.stringify(d.label)+',Tooltip='+JSON.stringify(d.tooltip);
 const enums=data.enums.map(e=>'HB_ENUM(BlueprintType'+(e.flags?',Bitflags,UseEnumValuesAsMaskValuesInEditor':'')+','+meta(e)+') enum class '+e.symbol+':std::int32_t {'+e.entries.map(v=>v.symbol+'='+number(v.value)+' HB_ENUM_VALUE('+meta(v)+(v.hidden?',Hidden':'')+')').join(',')+'};');
 const structs=sorted.map(s=>'HB_STRUCT(BlueprintType,'+meta(s)+') struct '+s.symbol+' {\n'+s.fields.map(f=>{let type=cppTypes[f.type]||(external(f)?'int':qualified(f));if(f.array)type='std::vector<'+type+'>';return ' HB_PROPERTY('+(f.readOnly?'BlueprintReadOnly':'BlueprintReadWrite')+','+meta(f)+') '+type+' '+f.symbol+'='+literal(f,f.value)+';';}).join('\n')+'\n};');
 if(deferred)return {shapeValid:true};
 const path=nativeTypeHeaderPath(data),header=nativeTypeMarker(data)+'#pragma once\n#include <HBEngine/Game.hpp>\n#include <HBEngine/Struct.hpp>\n'+(dependencies.length?dependencies.map(d=>'#include "'+nativeTypeHeaderPath(d).slice(7)+'"').join('\n')+'\n':'')+'namespace '+data.namespace+' {\n'+[...enums,...structs].join('\n')+'\n}\n';
 if(header.length>100000)fail('생성된 헤더는100KB까지예요.');
 const metadata=parseNativeHeader(header,{sourcePath:path,typesOnly:true,files});
 for(const s of data.structs){const d=metadata.structs.find(d=>d.name===data.namespace+'::'+s.symbol);for(const f of s.fields){const pin=d.fields.find(p=>p.name===f.symbol);if(!validNativeRecordValue(metadata,pin,f.value))fail('기본값 자료형·참조를 확인하세요.');}}
 return {path,header,metadata};
}
export function validNativeTypeAsset(data,kind,options){try{if(nativeTypeImports(data).length&&!options)compileLocalNativeTypeAsset(data,{deferred:true});else compileNativeTypeAsset(data,options);return kind===undefined||isNativeTypeAssetKind(kind)&&(kind==='typelibrary'?data.primary===undefined:data.primary?.kind===(kind==='enumasset'?'enum':'struct'));}catch{return false;}}
export function checkNativeTypeIdentity(before,after){
 if(before.id!==after.id||before.namespace!==after.namespace)fail('저장된 라이브러리의 ID·namespace는 유지해야 해요.');
 if(JSON.stringify(before.primary)!==JSON.stringify(after.primary))fail('저장된 대표 선언의 종류·ID는 유지해야 해요.');
 const check=(old,next)=>{const current=new Map(next.map(d=>[d.id,d]));for(const d of old){const n=current.get(d.id);if(!n)fail('저장된 선언·필드를 삭제하려면 참조 이관이 필요해요.');if(d.symbol!==n.symbol||d.type!==n.type||d.typeId!==n.typeId||d.array!==n.array||d.value!==undefined&&Number.isInteger(d.value)&&!d.type&&d.value!==n.value)fail('저장된 ID의 C++ 이름·자료형·열거형 값은 유지해야 해요.');}};
 check(before.enums,after.enums);check(before.structs,after.structs);
 for(const e of before.enums)check(e.entries,after.enums.find(d=>d.id===e.id).entries);
 for(const s of before.structs){const fields=after.structs.find(d=>d.id===s.id).fields;check(s.fields,fields);if(s.fields.some((f,i)=>fields[i]?.id!==f.id))fail('저장된 C++ 필드 순서는 유지하고 새 필드를 뒤에 추가하세요.');}
}
