import {nativeInitializer} from './native-initializer.js';
export const canonicalNativeText=text=>text.replace(/^\uFEFF/,'').replaceAll('\r\n','\n').replaceAll('\r','\n');
// Header declarations become editor metadata; this is not a C++ compiler.
// Other modules remain reachable as Actors, but only their owner loads native state.
export function nativeWorld(objects,assetPaths){return objects.filter(o=>!['widget','component'].includes(o.kind)).map(o=>{if(assetPaths.has(o.blueprintAsset||o.nativeBuildAsset)||!Object.hasOwn(o,'nativeClass')&&!Object.hasOwn(o,'nativeProperties'))return o;const {nativeClass,nativeProperties,...actor}=o;return actor;});}
// Protocol 2 clock/reset replies carry no actors. Avoid serializing the scene
// on this path all the way from the browser; old packaged workers keep theirs.
export function nativeRequestWorld(objects,assetPaths,request,metadata,spriteSkin){if(metadata?.workerProtocol>=2&&['frame','reset'].includes(request.command))return [];const world=nativeWorld(objects,assetPaths);return spriteSkin?world.map(o=>{const pose=spriteSkin(o.id);return pose?{...o,gameplayDebug:{...o.gameplayDebug,spriteSkin:pose}}:o;}):world;}
export function validNativeReference(m){const source=p=>typeof p==='string'&&p.length<=1000&&/^Source\/.+\.(?:h|hpp|cpp|cc|cxx)$/.test(p)&&!/[\\:\x00-\x1f]/.test(p)&&!p.split('/').some(v=>v==='.'||v==='..');return m?.version===1&&m.sourceReference===true&&source(m.headerPath)&&source(m.sourcePath)&&[m.headerHash,m.sourceHash].every(v=>v===undefined||typeof v==='string'&&/^[a-f0-9]{16,64}$/.test(v));}
export function nativeSourceReference(m){if(!m?.headerPath||!m?.sourcePath)return structuredClone(m);const hash=text=>{let h=14695981039346656037n;for(const c of canonicalNativeText(text)){h^=BigInt(c.codePointAt(0));h=BigInt.asUintN(64,h*1099511628211n);}return h.toString(16).padStart(16,'0');};return {version:1,sourceReference:true,headerPath:m.headerPath,sourcePath:m.sourcePath,...(typeof m.header==='string'?{headerHash:hash(m.header)}:m.headerHash?{headerHash:m.headerHash}:{}),...(typeof m.source==='string'?{sourceHash:hash(m.source)}:m.sourceHash?{sourceHash:m.sourceHash}:{})};}
const id=s=>typeof s==='string'&&/^[A-Za-z_][A-Za-z0-9_]{0,79}$/.test(s);
const types=new Set(['bool','int','float','string','vec2','vec3','color','transform','object','hit']);
const portValid=p=>p&&id(p.id)&&typeof p.label==='string'&&p.label.length<=80&&types.has(p.type)&&typeof p.array==='boolean'&&(p.className===undefined||id(p.className));
export function validNative(m,validValue){
  if(validNativeReference(m))return true;
  if(!m||m.version!==1||!Array.isArray(m.classes)||m.classes.length>64||new Set(m.classes.map(c=>c?.name)).size!==m.classes.length)return false;
  return m.classes.every(c=>c&&id(c.name)&&id(c.base)&&typeof c.blueprintable==='boolean'&&Array.isArray(c.properties)&&c.properties.length<=512&&Array.isArray(c.functions)&&c.functions.length<=500&&new Set([...c.properties,...c.functions].map(x=>x?.name)).size===c.properties.length+c.functions.length&&c.properties.every(p=>p&&id(p.name)&&types.has(p.type)&&typeof p.array==='boolean'&&typeof p.readOnly==='boolean'&&(p.className===undefined||id(p.className))&&(p.value===undefined||!validValue||(p.array?Array.isArray(p.value)&&p.value.length<=128&&p.value.every(v=>validValue(p.type,v)):validValue(p.type,p.value))))&&c.functions.every(f=>f&&id(f.name)&&typeof f.label==='string'&&f.label.length<=80&&typeof f.category==='string'&&f.category.length<=80&&typeof f.pure==='boolean'&&typeof f.static==='boolean'&&['none','native','implementable'].includes(f.event)&&Array.isArray(f.inputs)&&Array.isArray(f.outputs)&&f.inputs.length<=30&&f.outputs.length<=30&&[f.inputs,f.outputs].every(ps=>ps.every(portValid)&&new Set(ps.map(p=>p.id)).size===ps.length)&&(!f.pure||f.event==='none')&&(f.event==='none'||!f.outputs.length)));
}
function commaParts(s){let level=0,quoted=false,part='',parts=[];for(const c of s){if(c==='"')quoted=!quoted;if(!quoted){if(c==='<')level++;if(c==='>')level--;if(c===','&&level===0){parts.push(part.trim());part='';continue;}}part+=c;}if(part.trim())parts.push(part.trim());return parts;}
function cppType(s){
  s=s.replace(/\bconst\b|[&]/g,'').trim();let array=false;const list=s.match(/^(?:std::vector|vector|Array|TArray)<(.+)>$/);if(list){array=true;s=list[1].trim();}
  const key=s.replace(/^hb::/,'');const type={bool:'bool',int:'int',int32:'int',int32_t:'int',float:'float',double:'float','std::string':'string',string:'string',String:'string',FString:'string',Vec2:'vec2',Vector2:'vec2',FVector2D:'vec2',Vec3:'vec3',Vector3:'vec3',FVector:'vec3',Color:'color',LinearColor:'color',FLinearColor:'color',Transform:'transform',FTransform:'transform',HitResult:'hit',FHitResult:'hit'}[key]||(key.endsWith('*')?'object':null);
  if(!type)throw Error('지원하지 않는 공개 자료형: '+s);return {type,array,...(key.endsWith('*')?{className:key.slice(0,-1).trim()}:{})};
}
const metadata=(flags,key,fallback)=>flags.match(new RegExp(key+'\\s*=\\s*"([^"]*)"'))?.[1]||fallback;
export function parseNativeHeader(source){
  if(typeof source!=='string'||source.length>100000)throw Error('헤더는 100 KB 이하로 입력하세요.');
  const text=source.replace(/\/\*[\s\S]*?\*\//g,'').replace(/\/\/[^\n]*/g,'');const classes=[];
  const re=/HB_CLASS\(([^)]*)\)\s*class\s+(\w+)\s*:\s*public\s+(?:hb::)?(\w+)\s*\{/g;let match;
  while((match=re.exec(text))){let end=re.lastIndex,depth=1;for(;end<text.length&&depth;end++){if(text[end]==='{')depth++;if(text[end]==='}')depth--;}if(depth)throw Error(match[2]+' 클래스의 닫는 중괄호가 없어요.');
    const body=text.slice(re.lastIndex,end-1),c={name:match[2],base:match[3],blueprintable:/\bBlueprintable\b/.test(match[1]),properties:[],functions:[]};
    const props=/HB_PROPERTY\(([^)]*)\)\s*([^;]+);/g;let p;
    while((p=props.exec(body))){const declaration=p[2].trim().match(/^(.+?)\s+(\w+)\s*(?:(?:=\s*|(?=\{))(.+))?$/);if(!declaration)throw Error('속성 선언을 확인하세요: '+p[2]);const [,type,name,literal]=declaration,parsed=cppType(type),property={name,...parsed,readOnly:/\bBlueprintReadOnly\b/.test(p[1])};if(/AssetType\s*=/.test(p[1]))property.assetType=metadata(p[1],'AssetType','');if(literal){try{property.value=nativeInitializer(literal,parsed.type,parsed.array);}catch(error){throw Error(name+': '+error.message);}}c.properties.push(property);}
    const funcs=/HB_(?:FUNCTION|NODE)\(([^)]*)\)\s*((?:(?:static|virtual)\s+)*)([^;{}()]+?)\s+(\w+)\s*\(([^)]*)\)\s*(?:const\s*)?(?:override\s*)?;/g;let f;
    while((f=funcs.exec(body))){const flags=f[1],fn={name:f[4],label:metadata(flags,'DisplayName',f[4]),category:metadata(flags,'Category','C++'),pure:/\bBlueprintPure\b/.test(flags),static:/\bstatic\b/.test(f[2]),event:/BlueprintNativeEvent/.test(flags)?'native':/BlueprintImplementableEvent/.test(flags)?'implementable':'none',inputs:[],outputs:[]};
      fn.returnType=f[3].trim();fn.parameters=[];
      if(/NodeKey\s*=/.test(flags))fn.nodeKey=metadata(flags,'NodeKey','');
      if(/KoreanName\s*=/.test(flags))fn.ko=metadata(flags,'KoreanName',fn.label);
      if(/\bEngineService\b/.test(flags))fn.service=true;
      if(f[3].trim()!=='void')fn.outputs.push({id:metadata(flags,'ReturnPin','result'),label:'Return value',...cppType(f[3].trim())});
      for(const param of commaParts(f[5])){if(param==='void')continue;const declaration=param.split('=')[0].trim().match(/^(.+?)\s+(\w+)$/);if(!declaration)throw Error('매개변수 선언을 확인하세요: '+param);const [,type,name]=declaration,out=type.includes('&')&&!/\bconst\b/.test(type);fn.parameters.push({name,cppType:type,out});const pin={id:name,label:name,...cppType(type)},literal=param.includes('=')?param.slice(param.indexOf('=')+1).trim():undefined;if(literal!==undefined){try{pin.default=JSON.parse(literal==='nullptr'?'null':literal.replace(/([0-9.])f\b/g,'$1'));}catch{/* C++ expressions need a user-supplied pin value. */}}fn[out?'outputs':'inputs'].push(pin);}
      if(fn.event!=='none'&&fn.outputs.length)throw Error(fn.name+' 이벤트에는 반환·출력 매개변수를 둘 수 없어요.');c.functions.push(fn);
    }
    if((body.match(/HB_(?:FUNCTION|NODE)\(/g)||[]).length!==c.functions.length||(body.match(/HB_PROPERTY\(/g)||[]).length!==c.properties.length)throw Error('공개 멤버는 함수 본문 없이 헤더 선언으로 입력하세요.');
    classes.push(c);re.lastIndex=end;
  }
  const manifest={version:1,classes};if(!classes.length||!validNative(manifest))throw Error('HB_CLASS·HB_FUNCTION·HB_PROPERTY 선언을 확인하세요.');return manifest;
}
export function nativeMember(root,n){const [className,name]=(typeof n.nativeId==='string'?n.nativeId:'').split('.'),c=root.native?.classes?.find(c=>c.name===className);return {c,f:c?.functions.find(f=>f.name===name),p:c?.properties.find(p=>p.name===name)};}
const exec={id:'exec',label:'실행',type:'exec',array:false},then={id:'then',label:'다음',type:'exec',array:false},target={id:'target',label:'Target',type:'object',array:false};
export function nativeTargetPin(f){const names=new Set(f?.inputs?.map(p=>p.id)||[]);let name='target',index=0;while(names.has(name))name='nativeTarget'+(index++||'');return name;}
export function nativePins(root,n,direction){
  const {c,f,p}=nativeMember(root,n);let inputs=[],outputs=[];
  if(n.key==='nativeMembers'&&c){inputs=[{...target,className:c.name}];outputs=c.properties.map(p=>({id:p.name,label:p.name,type:p.type,array:p.array,...(p.className?{className:p.className}:{})}));}
  else if(n.key==='nativeEvent'&&f&&f.event!=='none'){outputs=[then,...f.inputs];}
  else if(n.key==='nativeCall'&&f){inputs=[...(!f.pure?[exec]:[]),...(!f.static?[{...target,id:nativeTargetPin(f)}]:[]),...f.inputs];outputs=[...(!f.pure?[then]:[]),...f.outputs];}
  else if(p&&n.key==='nativeGet'){inputs=[target];outputs=[{id:'value',label:p.name,type:p.type,array:p.array,...(p.className?{className:p.className}:{})}];}
  else if(p&&!p.readOnly&&n.key==='nativeSet'){inputs=[exec,target,{id:'value',label:p.name,type:p.type,array:p.array}];outputs=[then];}
  return direction==='in'?inputs:outputs;
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
