import {isNativeTypeAssetPath} from './native-type-paths.js';
import {registerNativeTypeSnapshot} from './native-type-index.js';
import {nativeCppType} from './native-types.js';
import {nativeClassScopes} from './native-class-scopes.js';
import {nativeReflectionSyntax} from './native-enums.js';
import {parseNativeStructs} from './native-structs.js';
import {initializeNativeRecordDefaults,nativeRecordInitializer} from './native-record-initializer.js';
import {validNativeRecordDefinitions,validNativeRecordPin,annotateNativeRecordPin,nativeRecordDefault,validNativeRecordValue} from './native-records.js';
import {parseNativeEnums,validNativeEnum,nativeEnumDefinition,validNativeEnumValue,nativeEnumInitializer} from './native-enums.js';
import {nativeHeaderClosure,readNativeHeaderFiles} from './native-header-files.js';
import {validValue as validPinValue} from './pin-values.js';
import {validNativeLifecycles} from './native-lifecycle.js';
import {nativeInitializer} from './native-initializer.js';
export const canonicalNativeText=text=>text.replace(/^\uFEFF/,'').replaceAll('\r\n','\n').replaceAll('\r','\n');
// Header declarations become editor metadata; this is not a C++ compiler.
// Other modules remain reachable as Actors, but only their owner loads native state.
export function nativeWorld(objects,assetPaths){return objects.filter(o=>!['widget','component'].includes(o.kind)).map(o=>{if(assetPaths.has(o.blueprintAsset||o.nativeBuildAsset)||!Object.hasOwn(o,'nativeClass')&&!Object.hasOwn(o,'nativeProperties'))return o;const {nativeClass,nativeProperties,...actor}=o;return actor;});}
// Protocol 2 clock/reset replies carry no actors. Avoid serializing the scene
// on this path all the way from the browser; old packaged workers keep theirs.
export function nativeRequestWorld(objects,assetPaths,request,metadata,spriteSkin){if(metadata?.workerProtocol>=2&&['frame','reset'].includes(request.command))return [];const world=nativeWorld(objects,assetPaths);return spriteSkin?world.map(o=>{const pose=spriteSkin(o.id);return pose?{...o,gameplayDebug:{...o.gameplayDebug,spriteSkin:pose}}:o;}):world;}
export function nativeTypeReference(m){return m?.version===1&&m.sourceReference===true&&Array.isArray(m.typeLibraries)&&m.typeLibraries.length>0&&m.typeLibraries.length<=32&&new Set(m.typeLibraries).size===m.typeLibraries.length&&m.typeLibraries.every(p=>typeof p==='string'&&p.length<=1000&&/^Assets\//.test(p)&&isNativeTypeAssetPath(p)&&!/[\\:\x00-\x1f]/.test(p)&&!p.split('/').some(v=>!v||v==='.'||v==='..'))&&Object.keys(m).every(k=>['version','sourceReference','typeLibraries'].includes(k));}
export function nativeSourceMatches(a,b){if(a?.typeLibrariesOnly||b?.typeLibrariesOnly||nativeTypeReference(a)||nativeTypeReference(b))return JSON.stringify(a?.typeLibraries)===JSON.stringify(b?.typeLibraries);return a?.headerPath===b?.headerPath&&a?.sourcePath===b?.sourcePath;}
export function validNativeReference(m){if(nativeTypeReference(m))return true;const source=p=>typeof p==='string'&&p.length<=1000&&/^Source\/.+\.(?:h|hpp|cpp|cc|cxx)$/.test(p)&&!/[\\:\x00-\x1f]/.test(p)&&!p.split('/').some(v=>v==='.'||v==='..');return m?.version===1&&m.sourceReference===true&&source(m.headerPath)&&source(m.sourcePath)&&[m.headerHash,m.sourceHash].every(v=>v===undefined||typeof v==='string'&&/^[a-f0-9]{16,64}$/.test(v));}
export function nativeSourceReference(m){if(m?.typeLibrariesOnly){const ref={version:1,sourceReference:true,typeLibraries:structuredClone(m.typeLibraries)};if(!nativeTypeReference(ref))throw Error('타입 라이브러리 참조를 확인하세요.');return ref;}if(!m?.headerPath||!m?.sourcePath)return structuredClone(m);const hash=text=>{let h=14695981039346656037n;for(const c of canonicalNativeText(text)){h^=BigInt(c.codePointAt(0));h=BigInt.asUintN(64,h*1099511628211n);}return h.toString(16).padStart(16,'0');};return {version:1,sourceReference:true,headerPath:m.headerPath,sourcePath:m.sourcePath,...(typeof m.header==='string'?{headerHash:hash(m.header)}:m.headerHash?{headerHash:m.headerHash}:{}),...(typeof m.source==='string'?{sourceHash:hash(m.source)}:m.sourceHash?{sourceHash:m.sourceHash}:{})};}
const id=s=>typeof s==='string'&&/^[A-Za-z_][A-Za-z0-9_]{0,79}$/.test(s);
const cppQualified=s=>typeof s==='string'&&s.length<=2000&&s.split('::').every(id),cppScope=c=>(c.cppName===undefined||cppQualified(c.cppName))&&(c.cppNamespace===undefined||Array.isArray(c.cppNamespace)&&c.cppNamespace.length<=32&&c.cppNamespace.every(n=>n===''||id(n))),cppAccess=m=>m.cppAccess===undefined||['public','protected','private'].includes(m.cppAccess);
const types=new Set(['bool','int','float','string','vec2','vec3','color','transform','object','hit','record']);
const portValid=p=>p&&id(p.id)&&typeof p.label==='string'&&p.label.length<=80&&types.has(p.type)&&typeof p.array==='boolean'&&(p.className===undefined||id(p.className));
const runtimeMetadata=new WeakSet();
export function snapshotNativeMetadata(metadata){
 if(runtimeMetadata.has(metadata))return metadata;
 if(!validNative(metadata))throw Error('C++ 런타임 메타데이터를 확인하세요.');
 const snapshot=structuredClone(metadata),pending=[snapshot],seen=new Set();
 while(pending.length){const value=pending.pop();if(seen.has(value))continue;seen.add(value);Object.freeze(value);for(const child of Object.values(value))if(child&&typeof child==='object')pending.push(child);}
 registerNativeTypeSnapshot(snapshot);runtimeMetadata.add(snapshot);return snapshot;
}
export function validNative(m,validValue=validPinValue){
  if(validValue===validPinValue&&m&&runtimeMetadata.has(m))return true;
  if(validNativeReference(m))return true;
  if(!m||m.version!==1||!Array.isArray(m.classes)||m.classes.length>64||new Set(m.classes.map(c=>c?.name)).size!==m.classes.length)return false;
  if(m.enums!==undefined&&(!Array.isArray(m.enums)||m.enums.some(value=>!validNativeEnum(value))||new Set(m.enums.map(value=>JSON.stringify([value.name,value.sourcePath]))).size!==m.enums.length))return false;
  if(!validNativeRecordDefinitions(m))return false;
  const enumPin=p=>p.enumName===undefined?p.enumSource===undefined&&(p.maskEnumName===undefined||p.type==='int'&&!!nativeEnumDefinition(m,{enumName:p.maskEnumName})?.flags):p.type==='int'&&!!nativeEnumDefinition(m,p),enumValue=(p,value)=>p.enumName===undefined||validNativeEnumValue(nativeEnumDefinition(m,p),value);
  return m.classes.every(c=>c&&cppScope(c)&&id(c.name)&&id(c.base)&&typeof c.blueprintable==='boolean'&&Array.isArray(c.properties)&&c.properties.length<=512&&Array.isArray(c.functions)&&c.functions.length<=500&&new Set([...c.properties,...c.functions].map(x=>x?.name)).size===c.properties.length+c.functions.length&&c.properties.every(p=>p&&cppAccess(p)&&validNativeRecordPin(m,p,p.value,{identityOnly:p.value===undefined})&&enumPin(p)&&id(p.name)&&types.has(p.type)&&typeof p.array==='boolean'&&typeof p.readOnly==='boolean'&&(p.className===undefined||id(p.className))&&(p.value===undefined||!validValue||(p.array?Array.isArray(p.value)&&p.value.length<=128&&p.value.every(v=>validValue(p.type,v)&&enumValue(p,v)):validValue(p.type,p.value)&&enumValue(p,p.value))))&&validNativeLifecycles(c.functions)&&c.functions.every(f=>f&&cppAccess(f)&&id(f.name)&&typeof f.label==='string'&&f.label.length<=80&&typeof f.category==='string'&&f.category.length<=80&&typeof f.pure==='boolean'&&typeof f.static==='boolean'&&['none','native','implementable'].includes(f.event)&&Array.isArray(f.inputs)&&Array.isArray(f.outputs)&&f.inputs.length<=30&&f.outputs.length<=30&&[f.inputs,f.outputs].every(ps=>ps.every(p=>portValid(p)&&validNativeRecordPin(m,p,p.default,{identityOnly:p.default===undefined})&&enumPin(p)&&(p.default===undefined||(p.array?Array.isArray(p.default)&&p.default.length<=128&&p.default.every(v=>validValue(p.type,v)&&enumValue(p,v)):validValue(p.type,p.default)&&enumValue(p,p.default))))&&new Set(ps.map(p=>p.id)).size===ps.length)&&(!f.pure||f.event==='none')&&(f.event==='none'||!f.outputs.length)));
}
function commaParts(s){let group=0,angle=0,quoted=false,escaped=false,defaulted=false,part='',parts=[];for(const c of s){if(quoted){part+=c;if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c==='"')quoted=false;continue;}if(c==='"')quoted=true;else{if('({['.includes(c))group++;if(')}]'.includes(c))group--;if(!defaulted&&c==='<')angle++;if(!defaulted&&c==='>')angle--;if(c==='='&&group===0&&angle===0)defaulted=true;if(c===','&&group===0&&angle===0){parts.push(part.trim());part='';defaulted=false;continue;}}part+=c;}if(part.trim())parts.push(part.trim());return parts;}

const cppType=(source,enums=[],owner='',structs=[],classes=[])=>nativeCppType(source,{enums,owner,structs,classes});
const metadata=(flags,key,fallback)=>flags.match(new RegExp(key+'\\s*=\\s*"([^"]*)"'))?.[1]||fallback;
export function parseNativeHeader(source,{maxLength=100000,sourcePath='',files=[],typesOnly=false}={}){
  if(!Number.isInteger(maxLength)||maxLength<1||maxLength>1000000||typeof source!=='string'||source.length>maxLength)throw Error(maxLength===100000?'헤더는 100 KB 이하로 입력하세요.':'헤더 크기 제한: '+maxLength+'자');
  const closure=nativeHeaderClosure(source,{sourcePath,files}),enums=closure.flatMap(file=>parseNativeEnums(file.content,{sourcePath:file.path}));if(new Set(enums.map(value=>value.name)).size!==enums.length)throw Error('C++ enum 이름이 중복돼요. namespace로 구분하세요.');const structs=[];for(const file of closure)structs.push(...parseNativeStructs(file.content,{sourcePath:file.path,enums,knownStructs:structs}));const defaultBudget={left:200000,bytes:8388608},reflected=initializeNativeRecordDefaults({enums,structs},{budget:defaultBudget});
  const enumDefault=(literal,parsed)=>{if(parsed.type==='record'){const value=nativeRecordInitializer(literal,reflected,parsed);if(!validNativeRecordValue(reflected,parsed,value,defaultBudget))throw Error('공개 C++ 기본값의 전체 크기를 확인하세요.');return value;}return parsed.enumName?nativeEnumInitializer(literal,enums.find(value=>value.name===parsed.enumName),parsed.array):nativeInitializer(literal,parsed.type,parsed.array);};
  const syntax=nativeClassScopes(source),lexed=nativeReflectionSyntax.tokens(source);let text='',at=0;for(const token of lexed){text+=source.slice(at,token.start).replace(/[^\r\n]/g,' ')+source.slice(token.start,token.end);at=token.end;}text+=source.slice(at).replace(/[^\r\n]/g,' ');const classes=[];
  const re=/HB_CLASS\(([^)]*)\)\s*class\s+(\w+)\s*:\s*public\s+(?:hb::)?(\w+)\s*\{/g;let match;
  while((match=re.exec(text))){const scope=syntax.reflected.find(value=>value.annotation===match.index);if(!scope)continue;
    const c={name:match[2],base:match[3],blueprintable:/\bBlueprintable\b/.test(match[1]),...scope.cppName!==scope.name?{cppName:scope.cppName}:{},...scope.namespaces.length?{cppNamespace:scope.namespaces}:{},properties:[],functions:[]},cppOwner=scope.cppName;
    const props=/^HB_PROPERTY\(([^)]*)\)\s*([\s\S]+);$/;
    for(const member of scope.members.filter(m=>m.kind==='HB_PROPERTY'&&m.direct)){const p=props.exec(text.slice(member.start,member.end));if(!p)continue;const declaration=p[2].trim().match(/^(.+?)\s+(\w+)\s*(?:(?:=\s*|(?=\{))(.+))?$/);if(!declaration)throw Error('속성 선언을 확인하세요: '+p[2]);const [,type,name,literal]=declaration,parsed=cppType(type,enums,cppOwner,structs,syntax.reflected),property={name,...parsed,...member.access!=='public'?{cppAccess:member.access}:{},readOnly:/\bBlueprintReadOnly\b/.test(p[1])};if(/\bBitmaskEnum\s*=/.test(p[1])){const name=metadata(p[1],'BitmaskEnum',''),resolved=cppType(name,enums,cppOwner,structs,syntax.reflected),definition=enums.find(e=>e.name===resolved.enumName);if(parsed.type!=='int'||parsed.enumName||!definition?.flags)throw Error('BitmaskEnum에는 int 속성과 Bitflags enum이 필요해요.');property.maskEnumName=definition.name;}if(/AssetType\s*=/.test(p[1]))property.assetType=metadata(p[1],'AssetType','');if(literal){try{property.value=enumDefault(literal,parsed);}catch(error){throw Error(name+': '+error.message);}}else if(parsed.type==='record'){property.value=nativeRecordDefault(reflected,parsed);if(!validNativeRecordValue(reflected,parsed,property.value,defaultBudget))throw Error('공개 C++ 기본값의 전체 크기를 확인하세요.');}c.properties.push(property);}
    const funcs=/^HB_(?:FUNCTION|NODE)\(([^)]*)\)\s*((?:(?:static|virtual)\s+)*)([^;{}()]+?)\s+(\w+)\s*\(([^)]*)\)\s*(?:const\s*)?(?:override\s*)?;$/;
    for(const member of scope.members.filter(m=>m.kind!=='HB_PROPERTY'&&m.direct)){const f=funcs.exec(text.slice(member.start,member.end));if(!f)continue;const flags=f[1],fn={name:f[4],label:metadata(flags,'DisplayName',f[4]),category:metadata(flags,'Category','C++'),...member.access!=='public'?{cppAccess:member.access}:{},pure:/\bBlueprintPure\b/.test(flags),static:/\bstatic\b/.test(f[2]),event:/BlueprintNativeEvent/.test(flags)?'native':/BlueprintImplementableEvent/.test(flags)?'implementable':'none',inputs:[],outputs:[]};
      fn.returnType=f[3].trim();fn.parameters=[];
      if(/\bLifecycle\s*=/.test(flags))fn.lifecycle=metadata(flags,'Lifecycle','');
      if(/NodeKey\s*=/.test(flags))fn.nodeKey=metadata(flags,'NodeKey','');
      if(/KoreanName\s*=/.test(flags))fn.ko=metadata(flags,'KoreanName',fn.label);
      if(/\bEngineService\b/.test(flags))fn.service=true;
      if(f[3].trim()!=='void')fn.outputs.push({id:metadata(flags,'ReturnPin','result'),label:'Return value',...cppType(f[3].trim(),enums,cppOwner,structs,syntax.reflected)});
      for(const param of commaParts(f[5])){if(param==='void')continue;const declaration=param.split('=')[0].trim().match(/^(.+?)\s+(\w+)$/);if(!declaration)throw Error('매개변수 선언을 확인하세요: '+param);const [,type,name]=declaration;if(type.includes('&&'))throw Error('공개 인자는 값·const 참조·출력 참조를 사용하세요.');const out=type.includes('&')&&!/\bconst\b/.test(type);fn.parameters.push({name,cppType:type,out});const pin={id:name,label:name,...cppType(type,enums,cppOwner,structs,syntax.reflected)},literal=param.includes('=')?param.slice(param.indexOf('=')+1).trim():undefined;if(literal!==undefined){try{pin.default=enumDefault(literal,pin);}catch(error){if(pin.type==='record')throw Error(name+': '+error.message);/* Other C++ expressions need an explicit pin value. */}}fn[out?'outputs':'inputs'].push(pin);}
      if(!validNativeLifecycles([...c.functions,fn]))throw Error(fn.name+' Lifecycle 단계·중복·반환·인자 자료형을 확인하세요.');
      if(fn.event!=='none'&&fn.outputs.length)throw Error(fn.name+' 이벤트에는 반환·출력 매개변수를 둘 수 없어요.');c.functions.push(fn);
    }
    if(scope.members.filter(m=>m.kind!=='HB_PROPERTY').length!==c.functions.length||scope.members.filter(m=>m.kind==='HB_PROPERTY').length!==c.properties.length)throw Error('공개 멤버는 함수 본문 없이 헤더 선언으로 입력하세요.');
    classes.push(c);
  }
  const manifest={version:1,classes,...enums.length?{enums}:{},...structs.length?{structs}:{}};if(!classes.length&&!typesOnly||!validNative(manifest))throw Error('HB_CLASS·HB_FUNCTION·HB_PROPERTY 선언을 확인하세요.');return manifest;
}
export function nativeMember(root,n){const [className,name]=(typeof n.nativeId==='string'?n.nativeId:'').split('.'),c=root.native?.classes?.find(c=>c.name===className);return {c,f:c?.functions.find(f=>f.name===name),p:c?.properties.find(p=>p.name===name)};}
export async function readNativeHeader(source,{sourcePath='',readText,maxLength}={}){const files=await readNativeHeaderFiles(source,{sourcePath,readText});return parseNativeHeader(source,{sourcePath,files,...maxLength?{maxLength}:{}});}
const exec={id:'exec',label:'실행',type:'exec',array:false},then={id:'then',label:'다음',type:'exec',array:false},target={id:'target',label:'Target',type:'object',array:false};
export function nativeTargetPin(f){const names=new Set(f?.inputs?.map(p=>p.id)||[]);let name='target',index=0;while(names.has(name))name='nativeTarget'+(index++||'');return name;}
export function nativePins(root,n,direction){
  const {c,f,p}=nativeMember(root,n);let inputs=[],outputs=[];
  if(n.key==='nativeMembers'&&c){inputs=[{...target,className:c.name}];outputs=c.properties.map(p=>({...p,id:p.name,label:p.name}));}
  else if(n.key==='nativeEvent'&&f&&f.event!=='none'){outputs=[then,...f.inputs];}
  else if(n.key==='nativeCall'&&f){inputs=[...(!f.pure?[exec]:[]),...(!f.static?[{...target,id:nativeTargetPin(f)}]:[]),...f.inputs];outputs=[...(!f.pure?[then]:[]),...f.outputs];}
  else if(p&&n.key==='nativeGet'){inputs=[target];outputs=[{...p,id:'value',label:p.name}];}
  else if(p&&!p.readOnly&&n.key==='nativeSet'){inputs=[exec,target,{...p,id:'value',label:p.name,...(p.enumName||p.type==='record')&&p.value!==undefined?{default:p.value}:{}}];outputs=[then];}
  return (direction==='in'?inputs:outputs).map(value=>{const pin=annotateNativeRecordPin(root.native,value);return pin.enumName?{...pin,enumInfo:nativeEnumDefinition(root.native,pin)}:pin.maskEnumName?{...pin,maskInfo:nativeEnumDefinition(root.native,{enumName:pin.maskEnumName})}:pin;});
}
export function nativeEntries(root){return (root.native?.classes||[]).flatMap(c=>[
  ...c.functions.flatMap(f=>['nativeCall',...(f.event!=='none'&&root.settings?.parentClass===c.name?['nativeEvent']:[])].map(key=>({key,nativeId:c.name+'.'+f.name,title:(key==='nativeEvent'?'Event ':'')+f.label,ko:key==='nativeEvent'?'C++ 이벤트 재정의':'C++ 함수',group:c.name+' / '+f.category,keywords:c.name+' '+f.name+' '+f.label+' cpp c++ 재정의',kind:key==='nativeEvent'?'event':undefined,inputs:nativePins(root,{key,nativeId:c.name+'.'+f.name},'in'),outputs:nativePins(root,{key,nativeId:c.name+'.'+f.name},'out')}))),
  ...c.properties.flatMap(p=>['nativeGet',...(!p.readOnly?['nativeSet']:[])].map(key=>({key,nativeId:c.name+'.'+p.name,title:(key==='nativeGet'?'Get ':'Set ')+p.name,ko:'C++ 속성 '+(key==='nativeGet'?'읽기':'쓰기'),group:c.name+' / 속성',keywords:c.name+' '+p.name+' cpp 속성',inputs:nativePins(root,{key,nativeId:c.name+'.'+p.name},'in'),outputs:nativePins(root,{key,nativeId:c.name+'.'+p.name},'out')})))
]);}
export const nativeExample=`#include <HBEngine/Game.hpp>
using namespace hb;

HB_CLASS(Blueprintable)
class DoorController : public Actor {
public:
    HB_PROPERTY(BlueprintReadWrite)
    float OpenAngle = 90.0f;

    HB_FUNCTION(BlueprintCallable, DisplayName="문 열기", Category="Door")
    void Open(float Angle);

    HB_FUNCTION(BlueprintPure, DisplayName="문 위치", Category="Door")
    Vec3 GetDoorPosition() const;

    HB_FUNCTION(BlueprintPure, DisplayName="문 대상", Category="Door")
    DoorController* GetDoorTarget() const;

    HB_FUNCTION(BlueprintNativeEvent, DisplayName="문이 열렸을 때", Category="Door")
    virtual void OnOpened(const Vec3& Position);
};`;
