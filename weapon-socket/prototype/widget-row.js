import {validWidgetProperties,widgetDefaults} from './ui-assets.js';
const blocked=new Set(['__proto__','constructor','prototype','widgetAsset','widgetOverrides','widgetEvents','widgetBindings','rowWidget','rowBindings']);
export function widgetRowBindings(text='{}',template){
 const map=JSON.parse(text);if(!map||typeof map!=='object'||Array.isArray(map)||text.length>262144)throw Error('목록 행 바인딩을 확인하세요.');
 for(const [name,properties]of Object.entries(map)){
  if(blocked.has(name)||!name||!properties||typeof properties!=='object'||Array.isArray(properties)||template&&!template.nodes.some(node=>node.name===name))throw Error('목록 행 요소를 확인하세요: '+name);
  for(const [key,path]of Object.entries(properties))if(blocked.has(key)||!Object.hasOwn(widgetDefaults,key)||typeof path!=='string'||path.length>160||!/^\$(?:index|item)$|^[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*$/.test(path)||path.split('.').some(key=>blocked.has(key)))throw Error('목록 행 자료 경로를 확인하세요: '+name+'.'+key);
 }
 return map;
}
export function bindWidgetRow(data,template,bindings,item,index){
 for(let i=0;i<data.nodes.length;i++){
  const node=data.nodes[i],base=template.nodes[i];node.properties=structuredClone(base.properties);
  for(const [key,path]of Object.entries(bindings[node.name]||{})){
   let value=path==='$index'?index:path==='$item'?item:path.split('.').reduce((at,key)=>at&&typeof at==='object'&&Object.hasOwn(at,key)?at[key]:undefined,item);
   if(value===undefined||value===null)continue;if(key==='text'||key==='ariaLabel'||key==='tooltip')value=String(value).slice(0,10000);
   const prior=node.properties[key];node.properties[key]=value;if(!validWidgetProperties(node))node.properties[key]=prior;
  }
 }
 return data;
}
export function widgetRowEvent(node){
 if(node.rowIndex===undefined)return {};const json=JSON.stringify(node.rowItem)??'null',itemTruncated=json.length>10000;
 return{rowIndex:node.rowIndex,rowElement:node.rowElement,item:itemTruncated?'null':json,itemTruncated};
}

// Only existing own fields can be written. Read-only/generated bindings and
// type changes cannot create object paths or replace an item's schema.
export function writeWidgetRowItem(item,bindings,child,type){
 const key={TextInput:'text',Slider:'value',CheckBox:'checked'}[child.type];if(type!=='changed'||!key)return item;
 const path=bindings[child.name]?.[key];if(!path||path==='$index')return item;
 const value=child.properties[key],compatible=old=>old!==null&&typeof old===typeof value&&['string','number','boolean'].includes(typeof old)&&(typeof value!=='number'||Number.isFinite(value));
 if(path==='$item')return compatible(item)?value:item;
 const parts=path.split('.');if(parts.some(k=>blocked.has(k)))return item;let at=item;const chain=[];
 for(const key of parts){if(!at||typeof at!=='object'||Array.isArray(at)||!Object.hasOwn(at,key))return item;chain.push([at,key]);at=at[key];}
 if(!compatible(at)||Object.is(at,value))return item;
 let next=value;for(let i=chain.length-1;i>=0;i--){const [source,key]=chain[i];next={...source,[key]:next};}return next;
}
