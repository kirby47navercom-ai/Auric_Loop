import {createWidgetNode,validWidgetProperties,widgetDefaults} from './ui-assets.js';
import {validAssetPath} from './material-runtime.js';
export const widgetLifecycle=['initialized','preConstruct','construct','destruct'];
const plain=value=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.getPrototypeOf(value)===Object.prototype;
const safe=key=>!['__proto__','constructor','prototype'].includes(key);
export function validWidgetClass(data){
 if(data.parent!==undefined&&(!validAssetPath(data.parent)||data.parent&&!data.parent.endsWith('.hbwidget.json')))return false;
 for(const key of ['parentOverrides','parentSlots','preConstruct'])if(data[key]!==undefined&&(!plain(data[key])||JSON.stringify(data[key]).length>262144||Object.keys(data[key]).some(name=>!name||name.length>2048||!safe(name))))return false;
 for(const key of ['parentOverrides','preConstruct'])for(const properties of Object.values(data[key]||{})){
  if(!plain(properties)||Object.keys(properties).some(name=>!safe(name)||!Object.hasOwn(widgetDefaults,name)||['widgetAsset','widgetOverrides','widgetEvents','widgetBindings'].includes(name)))return false;
  const sample=createWidgetNode('Text','value','root');Object.assign(sample.properties,properties);if(!validWidgetProperties(sample))return false;
 }
 if(data.parentSlots&&Object.values(data.parentSlots).some(path=>path!==null&&(!path||!validAssetPath(path)||!path.endsWith('.hbwidget.json'))))return false;
 if(data.lifecycle!==undefined&&(!plain(data.lifecycle)||Object.entries(data.lifecycle).some(([key,value])=>!widgetLifecycle.includes(key)||typeof value!=='string'||value.length>80)))return false;
 return true;
}
export function widgetParentMount(data){
 if(!data.parent)return null;
 let id='@parent',name='Parent';while(data.nodes.some(node=>node.id===id||node.name===name)){id+='@';name+='@';}
 const mount=createWidgetNode('Widget',id,data.nodes.find(node=>!node.parent).id);mount.name=name;
 mount.slot={anchors:[0,0,1,1],offset:[0,0,0,0],alignment:[0,0],zIndex:0,fill:1};
 Object.assign(mount.properties,{widgetAsset:data.parent,widgetOverrides:JSON.stringify(data.parentOverrides||{}),widgetSlots:JSON.stringify(data.parentSlots||{})});
 return mount;
}
// Local cosmetic defaults run in both designer and player. Game callbacks are
// dispatched only by WidgetSystem, so a preview cannot access the game world.
export function applyWidgetDefaults(data,values={}){
 if(!plain(values))throw Error('위젯 초기 표시 값을 확인하세요.');
 for(const [name,properties]of Object.entries(values)){
  const node=data.nodes.find(node=>node.name===name);if(!node||!plain(properties)||Object.keys(properties).some(key=>!safe(key)||!Object.hasOwn(node.properties,key)||['widgetAsset','widgetSlots','widgetOverrides','widgetEvents','widgetBindings'].includes(key)))throw Error('위젯 초기 표시 요소·속성을 확인하세요: '+name);
  node.properties={...node.properties,...properties};node.properties.styleOverrides=[...new Set([...(node.properties.styleOverrides||'').split(',').filter(Boolean),...Object.keys(properties)])].join(',');
  if(!validWidgetProperties(node))throw Error('위젯 초기 표시 값 오류: '+name);
 }
 return data;
}
