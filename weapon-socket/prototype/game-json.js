export function validGameJson(value,{object=true}={}){
  let count=0;
  const visit=(item,depth=0)=>{
    if(depth>32||++count>10000)return false;
    if(item===null||typeof item==='boolean')return true;
    if(typeof item==='number')return Number.isFinite(item);
    if(typeof item==='string')return item.length<=65536;
    if(Array.isArray(item))return item.length<=4096&&item.every(v=>visit(v,depth+1));
    return item&&Object.getPrototypeOf(item)===Object.prototype&&Object.keys(item).length<=1024&&Object.entries(item).every(([key,v])=>key.length<=200&&!['__proto__','constructor','prototype'].includes(key)&&visit(v,depth+1));
  };
  return (!object||value&&typeof value==='object'&&!Array.isArray(value))&&visit(value)&&JSON.stringify(value).length<=262144;
}
export function parseGameJson(text,options){if(typeof text!=='string'||text.length>262144)throw Error('게임 JSON 크기를 확인하세요.');const value=JSON.parse(text);if(!validGameJson(value,options))throw Error('게임 JSON 형식·깊이·크기를 확인하세요.');return value;}
