import {validWidgetAsset,validWidgetProperties,widgetDefaults,widgetDescendants} from './ui-assets.js';
import {widgetParentMount,applyWidgetDefaults} from './widget-class.js';
import {widgetRowBindings} from './widget-row.js';
const plain=v=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.getPrototypeOf(v)===Object.prototype;
export function widgetOverrideMap(text='{}'){const value=JSON.parse(text);if(!plain(value)||JSON.stringify(value).length>262144||Object.entries(value).some(([name,properties])=>!name||name.length>1024||!plain(properties)||Object.keys(properties).some(k=>!Object.hasOwn(widgetDefaults,k)||['widgetAsset','widgetOverrides','widgetEvents','widgetBindings'].includes(k))))throw Error('재사용 위젯의 요소별 속성을 확인하세요.');return value;}
const fillSlot={anchors:[0,0,1,1],offset:[0,0,0,0],alignment:[0,0],zIndex:0,fill:1};
// Runtime replacement preserves existing node identities outside the slot, so
// in-flight HUD updates and animations do not get overwritten by an asset load.
export function replaceNamedSlotContent(data,element,content){
 const slot=data.nodes.find(n=>n.id===element||n.name===element);if(slot?.type!=='NamedSlot')throw Error('교체할 명명 슬롯을 선택하세요.');
 if(content&&!validWidgetAsset(content,{expanded:true}))throw Error('슬롯 내용 위젯을 확인하세요.');
 const removed=new Set(widgetDescendants(data,slot.id));removed.delete(slot.id);
 const nodes=data.nodes.filter(n=>!removed.has(n.id));if(content)nodes.push(...graft(structuredClone(content),slot.id,slot.id+'/runtime',slot.name+'/Content',slot.compositionOwner||slot.id));
 const next={...data,nodes};if(!validWidgetAsset(next,{expanded:true}))throw Error('교체된 슬롯의 이름·계층·속성을 확인하세요.');
 return {data:next,removed};
}
// The reference-size wrapper has the same layout contract for normal instances
// and named-slot content. Only clones are changed; source assets stay intact.
function graft(child,parent,idPrefix,namePrefix,owner){
 const root=child.nodes.find(n=>!n.parent),ids=new Map(child.nodes.map(n=>[n.id,idPrefix+'/'+n.id]));
 for(const row of child.nodes){const old=row.id;row.id=ids.get(old);row.parent=row===root?parent:ids.get(row.parent);row.name=namePrefix+'/'+row.name;if(owner)row.compositionOwner=owner;if(row===root){row.properties.widgetReferenceSize=[...child.referenceSize];row.slot=structuredClone(fillSlot);}}
 return child.nodes;
}
export async function resolveWidgetComposition(data,read,{maxNodes=10000,maxDepth=16}={}){
 if(!validWidgetAsset(data))throw Error('원본 위젯 검증 실패');const cache=new Map();let count=0;
 async function referenced(asset,stack){
  if(stack.includes(asset))throw Error('재사용 위젯 순환 참조: '+asset);
  if(!cache.has(asset))cache.set(asset,Promise.resolve().then(()=>read(asset)).then(value=>{if(!validWidgetAsset(value))throw Error('참조 위젯 검증 실패: '+asset);return value;}));
  return expand(await cache.get(asset),[...stack,asset]);
 }
 async function expand(source,stack){
  if(stack.length>maxDepth)throw Error('재사용 위젯 깊이 제한을 넘었어요.');const next=structuredClone(source),output=[],parentMount=widgetParentMount(next);if(parentMount)next.nodes.splice(1,0,parentMount);
  for(const node of next.nodes){
   if(++count>maxNodes)throw Error('펼친 위젯 요소 예산을 넘었어요.');output.push(node);
   delete node.rowTemplate;if(['ListView','TreeView'].includes(node.type)&&node.properties.rowWidget){node.rowTemplate=await referenced(node.properties.rowWidget,stack);widgetRowBindings(node.properties.rowBindings||'{}',node.rowTemplate);}
   if(node.type!=='Widget'||!node.properties.widgetAsset)continue;
   const child=await referenced(node.properties.widgetAsset,stack),slots=JSON.parse(node.properties.widgetSlots||'{}');
   if(node===parentMount){next.lifecycle={...child.lifecycle,...next.lifecycle};next.inheritedWidget=node.id;}
   const targets=new Map(child.nodes.filter(n=>n.type==='NamedSlot').map(n=>[n.name,n]));
   for(const name of Object.keys(slots))if(!targets.has(name))throw Error('참조 위젯에 없는 명명 슬롯이에요: '+name);
   const replaced=new Set();for(const name of Object.keys(slots)){const slot=targets.get(name);for(const id of widgetDescendants(child,slot.id))if(id!==slot.id)replaced.add(id);}
   for(const name of Object.keys(slots))if(replaced.has(targets.get(name).id))throw Error('교체할 내용 안의 슬롯을 함께 지정할 수 없어요: '+name);
   child.nodes=child.nodes.filter(n=>!replaced.has(n.id));
   for(const [name,asset] of Object.entries(slots)){
    if(asset===null)continue;const slot=targets.get(name),filled=await referenced(asset,[...stack,node.properties.widgetAsset]);
    child.nodes.push(...graft(filled,slot.id,slot.id+'/content',slot.name+'/Content'));
   }
   const overrides=widgetOverrideMap(node.properties.widgetOverrides||'{}'),used=new Set(),events=JSON.parse(node.properties.widgetEvents||'{}'),bindings=JSON.parse(node.properties.widgetBindings||'{}');
   for(const row of child.nodes){if(Object.hasOwn(overrides,row.name)){row.properties={...row.properties,...overrides[row.name]};row.properties.styleOverrides=[...new Set([...(row.properties.styleOverrides||'').split(',').filter(Boolean),...Object.keys(overrides[row.name])])].join(',');used.add(row.name);if(!validWidgetProperties(row))throw Error('재사용 위젯 오버라이드 값 오류: '+row.name);}row.events=Object.fromEntries(Object.entries(row.events).map(([key,value])=>[key,events[value]||value]));row.bindings=Object.fromEntries(Object.entries(row.bindings).map(([key,value])=>[key,bindings[value]||value]));}
   for(const key of Object.keys(overrides))if(!used.has(key))throw Error('참조 위젯에 없는 요소예요: '+key);
   output.push(...graft(child,node.id,node.id,node.name,node.id));
  }
  next.nodes=output;return applyWidgetDefaults(next,next.preConstruct||{});
 }
 const result=await expand(data,[]);if(!validWidgetAsset(result,{expanded:true}))throw Error('펼친 위젯 이름·계층·속성 검증 실패');return result;
}
