import {validValue,defaultsFor,boundedBlueprintValue} from './blueprint-model.js';
import {componentDefaults,validComponentProperties,installBlueprintComponents,objectComponents} from './scene-components.js';

const copy=v=>structuredClone(v),record=v=>v&&typeof v==='object'&&!Array.isArray(v);
export const validBlueprintOverrides=v=>v===undefined||record(v)&&Object.keys(v).length<=128&&boundedBlueprintValue(v);
const typed=(definition,value)=>definition.array||definition.container==='array'?Array.isArray(value)&&value.length<=128&&value.every(v=>validValue(definition.type,v)):validValue(definition.type,value);
export function blueprintInstanceDefaults(root,object={}){
  if(!validBlueprintOverrides(object.overrides))throw Error('오브젝트 BP 덮어쓰기 형식 오류: '+object.id);
  const variables=Object.fromEntries(root.variables.map(v=>[v.id,copy(v.value)])),definition=root.native?.classes?.find(c=>c.name===(root.settings?.parentClass||'Actor')),nativeProperties=Object.fromEntries((definition?.properties||[]).map(p=>[p.name,copy(root.settings?.nativeDefaults?.[definition.name+'.'+p.name]??p.value??(p.array?[]:defaultsFor(p.type)))])),components={},values=object.overrides||{};
  const variable=(key,value)=>{const d=root.variables.find(v=>v.id===key||v.name===key);if(!d||!typed(d,value))throw Error('오브젝트 BP 변수 자료형 오류: '+key);variables[d.id]=copy(value);};
  const native=(key,value)=>{const d=definition?.properties.find(p=>p.name===key||definition.name+'.'+p.name===key);if(!d||!typed(d,value))throw Error('오브젝트 C++ 속성 자료형 오류: '+key);nativeProperties[d.name]=copy(value);};
  // Existing authored nativeProperties remain explicit instance values.
  if(definition)for(const [key,value] of Object.entries(object.nativeProperties||{}))native(key,value);
  for(const [namespace,apply] of [['variables',variable],['nativeProperties',native]])if(Object.hasOwn(values,namespace)){if(!record(values[namespace]))throw Error('오브젝트 BP 덮어쓰기 형식 오류: '+namespace);for(const [key,value] of Object.entries(values[namespace]))apply(key,value);}
  for(const [key,value] of Object.entries(values)){if(['variables','nativeProperties','components'].includes(key))continue;const vars=root.variables.filter(v=>v.id===key||v.name===key),props=definition?.properties.filter(p=>p.name===key||definition.name+'.'+p.name===key)||[];if(vars.length+props.length!==1)throw Error('오브젝트 BP 속성 없음/중복: '+key);(vars.length?variable:native)(key,value);}
  if(values.components!==undefined){if(!record(values.components))throw Error('오브젝트 컴포넌트 덮어쓰기 형식 오류');for(const [id,properties] of Object.entries(values.components)){const c=root.components.find(c=>c.id===id),defaults=c&&componentDefaults(c.type);if(!c||!record(properties)||Object.keys(properties).some(key=>!Object.hasOwn(defaults,key))||!validComponentProperties(c.type,{...defaults,...c.properties,...properties}))throw Error('오브젝트 컴포넌트 덮어쓰기 오류: '+id);components[id]=copy(properties);}}
  return {variables,nativeProperties,components};
}
export function installBlueprintInstances(objects,bindings){
  installBlueprintComponents(objects,bindings.filter(b=>!b.retained));
  for(const b of bindings){const object=objects.find(o=>o.id===b.self);if(!object)continue;for(const [id,properties] of Object.entries(b.componentOverrides||{})){const c=objectComponents(object).find(c=>c.id===id||c.blueprintSources?.some(s=>s.name===b.root.name&&s.id===id));if(!c)throw Error('오브젝트 상속 컴포넌트가 없어요: '+id);Object.assign(c.properties,copy(properties));}}
  return objects;
}
