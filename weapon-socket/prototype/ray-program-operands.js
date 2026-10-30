// Only the engine's generated instruction blocks enter this pass. Loads from
// hbGeometryLoad and register aliases are pure; arithmetic/order are untouched.
const names=source=>new Set(source.match(/[A-Za-z_]\w*/g)||[]);
function endOfBlock(source,start){let depth=1;for(let i=start+1;i<source.length;i++){if(source[i]==='{')depth++;else if(source[i]==='}'&&!--depth)return i;}throw Error('생성된 광선 명령의 끝을 확인하세요.');}
function declarations(text){const out=[];let start=0,depth=0;for(let i=0;i<text.length;i++){if(text[i]==='('||text[i]==='[')depth++;else if(text[i]===')'||text[i]===']')depth--;else if(text[i]===','&&depth===0){out.push(text.slice(start,i));start=i+1;}}out.push(text.slice(start));return out.map(s=>{const at=s.indexOf('=');return {name:s.slice(0,at),expression:s.slice(at+1)};});}
export function pruneGeneratedRayOperands(source){
 const header=/\{vec4 (value=hbGeometryLoad\(pointer\+\d+\.0\),meta=vec4\([^;]+?\),a=(?:r\d+|vec4\(0,0,0,0\)),b=(?:r\d+|vec4\(0,0,0,0\)),c=(?:r\d+|vec4\(0,0,0,0\)),d=(?:r\d+|vec4\(0,0,0,0\)));/g;let match,first=true,last=0,out='';
 while((match=header.exec(source))){const end=endOfBlock(source,match.index),body=source.slice(header.lastIndex,end),used=names(body),keep=declarations(match[1]).filter(d=>used.has(d.name)||first&&d.name==='value');first=false;out+=source.slice(last,match.index)+'{'+keep.map(d=>'vec4 '+d.name+'='+d.expression+';').join('')+body+'}';last=end+1;header.lastIndex=last;}
 source=out+source.slice(last);
 const delta=/\{((?:vec4 [abcd][XY]=(?:r[XY]\d+|vec4\(0,0,0,0\));){4})/g;last=0;out='';
 while((match=delta.exec(source))){const end=endOfBlock(source,match.index),body=source.slice(delta.lastIndex,end),used=names(body);out+=source.slice(last,match.index)+'{'+match[1].split(';').filter(Boolean).filter(d=>used.has(d.slice(5,d.indexOf('=')))).map(d=>d+';').join('')+body+'}';last=end+1;delta.lastIndex=last;}
 return out+source.slice(last);
}
