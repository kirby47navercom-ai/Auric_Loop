import {nativeReflectionSyntax} from './native-enums.js';
import {nativeCppType} from './native-types.js';
const {tokens,metadata,closeIndex,parts,scopesFor}=nativeReflectionSyntax;
const enabled=(flags,key)=>flags.has(key)&&![false,'false','0'].includes(flags.get(key));
const label=(flags,key,fallback='')=>{const value=flags.get(key);if(value===undefined)return fallback;if(typeof value!=='string')throw Error('C++ struct 메타데이터 문자열 오류');return value;};
// Two passes keep field type identity separate from source order. Recursive
// value layouts are rejected before any defaults or editor controls are built.
export function parseNativeStructs(source,{sourcePath='',enums=[],knownStructs=[]}={}){
 if(typeof source!=='string'||source.length>1000000)throw Error('C++ 구조체 헤더 크기를 확인하세요.');
 if(!source.replace(/^[ \t]*#.*$/gm,'').includes('HB_STRUCT'))return [];
 const list=tokens(source),opens=scopesFor(list),scope=[],declarations=[],names=new Set(knownStructs.map(value=>value.name));
 const lines=[0];for(let i=0;i<source.length;i++)if(source[i]==='\n')lines.push(i+1);
 const lineAt=offset=>{let a=0,b=lines.length;while(a<b){const m=(a+b)>>>1;if(lines[m]<=offset)a=m+1;else b=m;}return a;};
 for(let i=0;i<list.length;i++){
  if(list[i].text==='{'){scope.push(opens.get(i)||{kind:'local',names:[]});continue;}
  if(list[i].text==='}'){scope.pop();continue;}
  if(list[i].text!=='HB_STRUCT')continue;
  if(scope.some(value=>value.kind!=='namespace'||value.anonymous))throw Error('HB_STRUCT 값 선언은 전역 또는 이름 있는 namespace에 두세요.');
  if(list[i+1]?.text!=='(')throw Error('HB_STRUCT 괄호를 확인하세요.');
  const flagEnd=closeIndex(list,i+1),flags=metadata(list.slice(i+2,flagEnd));let at=flagEnd+1;
  if(list[at++]?.text!=='struct'||list[at]?.kind!=='id')throw Error('HB_STRUCT 뒤에 이름 있는 struct가 필요해요.');
  const shortName=list[at++].text,name=[...scope.flatMap(value=>value.names),shortName].join('::');
  if(names.has(name))throw Error('C++ struct 이름 중복: '+name);names.add(name);
  if(list[at]?.text!=='{')throw Error('공개 값 struct는 상속 없이 필드를 선언하세요: '+name);
  const end=closeIndex(list,at,'{','}');declarations.push({name,shortName,sourcePath,label:label(flags,'displayname',shortName),tooltip:label(flags,'tooltip'),blueprintType:enabled(flags,'blueprinttype'),line:lineAt(list[i].start),body:list.slice(at+1,end)});i=end;
 }
 const known=[...knownStructs,...declarations],result=[];
 for(const declaration of declarations){
  const fields=[],body=declaration.body;let access='public';
  for(let i=0;i<body.length;i++){
   const token=body[i];if(['public','private','protected'].includes(token.text)&&body[i+1]?.text===':'){access=token.text;i++;continue;}
   if(token.text===declaration.shortName&&body[i+1]?.text==='(')throw Error('공개 값 struct는 생성자 대신 필드 기본값을 사용하세요: '+declaration.name);
   if(token.text===';')continue;
   if(token.text!=='HB_PROPERTY')throw Error('HB_STRUCT에는 HB_PROPERTY 값 필드만 선언하세요. 함수는 Actor·Library에 두세요: '+declaration.name);
   if(access!=='public')throw Error('공개 struct 필드는 public이어야 해요: '+declaration.name);
   if(body[i+1]?.text!=='(')throw Error('HB_PROPERTY 괄호를 확인하세요.');const flagEnd=closeIndex(body,i+1),flags=metadata(body.slice(i+2,flagEnd));let end=flagEnd+1,depth=0;
   for(;end<body.length;end++){const text=body[end].text;if(['{','[','('].includes(text))depth++;if(['}',']',')'].includes(text))depth--;if(text===';'&&depth===0)break;}
   if(end===body.length)throw Error('struct 필드 세미콜론을 확인하세요.');
   const field=body.slice(flagEnd+1,end),initializer=field.findIndex(token=>token.text==='='||token.text==='{'),head=initializer<0?field:field.slice(0,initializer),nameToken=head.at(-1);
   if(nameToken?.kind!=='id'||head.length<2||head.some(token=>['static','mutable','volatile','(',')','[',']',','].includes(token.text)))throw Error('struct 필드는 한 번에 하나의 값·배열로 선언하세요.');
   if(fields.some(field=>field.name===nameToken.text))throw Error('struct 필드 이름 중복: '+nameToken.text);
   const type=source.slice(head[0].start,nameToken.start).trim(),parsed=nativeCppType(type,{enums,structs:known,owner:declaration.name});
   if(flags.has('bitmaskenum')){
    const requested=label(flags,'bitmaskenum'),scope=declaration.name.split('::').slice(0,-1);let definition;
    for(let length=scope.length;length>=0&&!definition;length--)definition=enums.find(value=>value.name===[...scope.slice(0,length),requested].join('::'));
    if(parsed.type!=='int'||parsed.enumName||!definition?.flags)throw Error('BitmaskEnum에는 int 필드와 Bitflags enum이 필요해요.');
    parsed.maskEnumName=definition.name;
   }
   if(type.includes('&')||/\bconst\b/.test(type))throw Error('struct 필드는 const·참조 대신 복사 가능한 값으로 선언하세요.');
   const literal=initializer<0?undefined:source.slice(field[initializer].text==='='?field[initializer].end:field[initializer].start,field.at(-1).end).trim();
   fields.push({name:nameToken.text,label:label(flags,'displayname',nameToken.text),tooltip:label(flags,'tooltip'),...parsed,readOnly:enabled(flags,'blueprintreadonly'),line:lineAt(nameToken.start),...literal!==undefined?{initializer:literal}:{}});i=end;
  }
  if(!fields.length||fields.length>128)throw Error('공개 struct에는1–128개의 HB_PROPERTY 필드가 필요해요.');
  const {body:unusedBody,shortName,...definition}=declaration;result.push({...definition,fields});
 }
 const definitions=new Map([...knownStructs,...result].map(definition=>[definition.name,definition])),done=new Set();
 const visit=(definition,stack=[])=>{if(stack.includes(definition.name)||stack.length>=16)throw Error('struct 값의 순환 또는 중첩 깊이를 확인하세요.');if(done.has(definition.name))return;for(const field of definition.fields||[])if(field.type==='record'){const target=definitions.get(field.structName);if(!target)throw Error('struct 필드 선언이 없어요: '+field.structName);visit(target,[...stack,definition.name]);}done.add(definition.name);};
 for(const definition of result)visit(definition);
 return result;
}
