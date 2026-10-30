import {nativeReflectionSyntax} from './native-enums.js';
const {tokens,closeIndex,scopesFor}=nativeReflectionSyntax;
// Source-only scope facts; this does not execute preprocessing or infer aliases.
export function nativeClassScopes(source){
 if(typeof source!=='string'||source.length>1000000)throw Error('C++ 클래스 헤더 크기를 확인하세요.');
 const list=tokens(source),opens=scopesFor(list),annotations=new Map(),keywords=new Map(),scope=[],classes=[],members=new Map(),ends=new Map(),braces=[];
 for(let i=0;i<list.length;i++){if(list[i].text==='{')braces.push(i);if(list[i].text==='}'){const begin=braces.pop();if(begin===undefined)throw Error('C++ 클래스 중괄호를 확인하세요.');ends.set(begin,i);}}if(braces.length)throw Error('C++ 클래스 중괄호를 확인하세요.');
 for(let i=0;i<list.length;i++){
  if(['class','struct'].includes(list[i].text)&&list[i-1]?.text!=='enum'&&list[i+1]?.kind==='id'){
   let j=i+2;while(j<list.length&&!['{',';'].includes(list[j].text))j++;
   if(opens.get(j)?.kind==='class'&&opens.get(j).names[0]===list[i+1].text)keywords.set(j,list[i].text);
  }
  if(list[i].text==='HB_CLASS'&&list[i+1]?.text==='('){const end=closeIndex(list,i+1);let j=end+1;while(j<list.length&&!['{',';'].includes(list[j].text))j++;if(opens.get(j)?.kind==='class')annotations.set(j,list[i].start);}
 }
 for(let i=0;i<list.length;i++){
  const token=list[i];
  if(token.text==='{'){
   const info=opens.get(i)||{kind:'local',names:[]};let record;
   if(info.kind==='class'){
    const parents=scope.filter(item=>item.record).map(item=>item.record),namespaces=scope.filter(item=>item.kind==='namespace').flatMap(item=>item.anonymous?['']:item.names),name=info.names[0];
    record={name,cppName:[...scope.flatMap(item=>item.names),name].join('::'),namespaces,bodyStart:token.end,bodyEnd:list[ends.get(i)].start,annotation:annotations.get(i),access:keywords.get(i)==='struct'?'public':'private',parents,grant:false,members:[]};
    if(record.annotation!==undefined){if(scope.some(item=>item.kind==='local'||item.anonymous))throw Error('HB_CLASS는 전역이나 이름 있는 namespace·클래스에 선언하세요.');record.grant=true;parents.forEach(parent=>parent.grant=true);}
    classes.push(record);
   }
   scope.push({...info,record});continue;
  }
  if(token.text==='}'){scope.pop();continue;}
  const owner=scope.findLast(item=>item.record)?.record;
  if(owner&&['public','protected','private'].includes(token.text)&&list[i+1]?.text===':'&&scope.at(-1)?.record===owner)owner.access=token.text;
  if(token.text==='HB_ENUM')for(const item of scope)if(item.record)item.record.grant=true;
  if(owner&&['HB_PROPERTY','HB_FUNCTION','HB_NODE'].includes(token.text)&&list[i+1]?.text==='('){const annotationEnd=closeIndex(list,i+1);let at=annotationEnd+1,depth=0;for(;at<list.length;at++){const text=list[at].text;if(text===';'&&depth===0)break;if(['{','(','['].includes(text))depth++;if(['}',')',']'].includes(text)&&--depth<0)break;}const member={kind:token.text,owner,access:owner.access,start:token.start,end:list[at]?.text===';'?list[at].end:list[annotationEnd].end,direct:scope.at(-1)?.record===owner};members.set(token.start,member);owner.members.push(member);}
 }
 return {classes,members,reflected:classes.filter(record=>record.annotation!==undefined)};
}
export function nativeFriendHeader(source){
 const edits=nativeClassScopes(source).classes.filter(record=>record.grant&&!source.slice(record.bodyStart,record.bodyStart+100).includes('/*HB_NATIVE_ACCESS*/')).map(record=>record.bodyStart).sort((a,b)=>b-a);
 for(const at of edits)source=source.slice(0,at)+' /*HB_NATIVE_ACCESS*/ friend struct HB_ReflectionAccess; '+source.slice(at);return source;
}
