import {validBlueprint,isBlueprintParent,allGraphContexts,basePins,catalog,validValue,legacyTemplateConstruction,makeNode,graphContext} from './blueprint-model.js';
import {nativeMember,nativeSourceReference,validNativeReference,parseNativeHeader,canonicalNativeText} from './native-model.js';
import {componentDefaults,validComponentProperties} from './scene-components.js';
import {inputKey} from './runtime-input.js';

const copy=v=>structuredClone(v),same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const events=new Set([...catalog.filter(n=>n.kind==='event').map(n=>n.key),'nativeEvent','dispatcherEvent']);
export const blueprintEventIdentity=n=>events.has(n.key)?JSON.stringify([n.key,n.nativeId||'',n.symbolId||'',n.options?.action||'',n.options?.componentId||'',n.key==='input'?inputKey(n.options?.key||'E'):n.options?.key||'',n.options?.axis||'',n.key==='customEvent'?(n.options?.eventName||n.title||'Custom Event'):'']):null;
const stableId=text=>{let h=14695981039346656037n;for(const c of text){h^=BigInt(c.codePointAt(0));h=BigInt.asUintN(64,h*1099511628211n);}return 'bp_'+h.toString(16);};
const views=root=>[['event',root],...(root.construction?[['construction',root.construction]]:[]),...(root.functions||[]).map(d=>[d.id,d.graph]),...(root.macros||[]).map(d=>[d.id,d.graph])];
function inheritedRoot(parent,parentPath){
  const root=copy(parent),origins={},maps=new Map();
  // Namespacing is stable across multiple generations; aliases never accumulate.
  for(const [view,g] of views(root)){const map=new Map();for(const n of g.nodes){const origin=parent.inheritance?.nodeOrigins?.[n.id]||{path:parentPath,view,node:n.id},id=stableId(JSON.stringify(origin));if(origins[id])throw Error('상속 노드 ID 충돌');origins[id]=origin;map.set(n.id,id);}maps.set(view,map);}
  const eventMap=new Map([...maps.get('event'),...(maps.get('construction')||[])]);
  for(const [view,g] of views(root)){const map=maps.get(view);for(const n of g.nodes){n.id=map.get(n.id);if(n.parentEntryId)n.parentEntryId=eventMap.get(n.parentEntryId)||n.parentEntryId;}for(const e of g.edges)for(const side of ['from','to'])e[side].node=map.get(e[side].node);for(const c of g.comments||[]){c.id=stableId(parentPath+'|'+view+'|comment|'+c.id);c.nodeIds=c.nodeIds.map(id=>map.get(id));} }
  if(root.watches)root.watches=root.watches.map(w=>({...w,node:maps.get(w.view==='event'?'event':w.view)?.get(w.node)||w.node}));
  delete root.inheritance;return {root,origins};
}
function appendSymbols(root,child,key){const existing=root[key]||[],own=child[key]||[];for(const item of own)if(existing.some(p=>p.id===item.id||p.name===item.name))throw Error('상속된 '+key+' 이름/ID 중복: '+item.name);root[key]=[...existing,...copy(own)];}
const signature=d=>JSON.stringify({pure:!!d.pure,inputs:d.inputs.map(p=>[p.id,p.type,p.array]),outputs:d.outputs.map(p=>[p.id,p.type,p.array])});
function classDefaults(root,child,parent){
  for(const [id,value] of Object.entries(child.settings?.variableDefaults||{})){const v=root.variables.find(v=>v.id===id);if(!parent.variables.some(v=>v.id===id)||!v||(v.container==='array'?!(Array.isArray(value)&&value.length<=128&&value.every(x=>validValue(v.type,x))):!validValue(v.type,value)))throw Error('상속 변수 기본값 자료형 오류: '+id);v.value=copy(value);}
  for(const [id,values] of Object.entries(child.settings?.componentOverrides||{})){const c=root.components.find(c=>c.id===id);if(!parent.components.some(c=>c.id===id)||!c||!values||Array.isArray(values)||typeof values!=='object')throw Error('상속 컴포넌트가 없어요: '+id);const next={...componentDefaults(c.type),...c.properties,...values};if(!validComponentProperties(c.type,next)||Object.keys(values).some(k=>!Object.hasOwn(componentDefaults(c.type),k)))throw Error('상속 컴포넌트 기본값 오류: '+id);c.properties=copy(next);}
}
export function createBlueprintResolver(read,readText){
  const loaded=new Map();
  async function resolve(path,stack=[]){
    // Readers enforce project paths; legacy in-memory readers use names such as A.
    if(typeof path!=='string'||!path||path.length>1000)throw Error('블루프린트 에셋 경로를 확인하세요: '+path);
    if(stack.includes(path))throw Error('블루프린트 순환 상속: '+[...stack,path].join(' → '));if(stack.length>=32)throw Error('블루프린트 상속 깊이 32 초과');
    if(loaded.has(path))return loaded.get(path);
    const child=copy(await read(path));if(!validBlueprint(child))throw Error('블루프린트 검증 실패: '+path);
    if(child.native&&readText){const n=child.native,header=canonicalNativeText(await readText(n.headerPath||'Source/DoorController.h')),source=canonicalNativeText(await readText(n.sourcePath||'Source/DoorController.cpp'));child.native={...parseNativeHeader(header),header,source,headerPath:n.headerPath,sourcePath:n.sourcePath};if(!validBlueprint(child))throw Error('C++ 원본과 블루프린트가 맞지 않아요: '+path);}else if(validNativeReference(child.native))throw Error('C++ 원본 읽기 경로가 필요해요: '+path);
    const parentPath=child.settings?.parentClass;
    if(!isBlueprintParent(parentPath)){loaded.set(path,child);return child;}
    const parent=await resolve(parentPath,[...stack,path]);const root=composeBlueprint(child,parent,path);loaded.set(path,root);return root;
  }
  return resolve;
}

export function resolveCachedBlueprint(path,read,stack=[]){
  if(stack.includes(path)||stack.length>=32)throw Error('블루프린트 순환 상속: '+[...stack,path].join(' → '));
  const child=copy(read(path));if(!validBlueprint(child))throw Error('블루프린트 검증 실패: '+path);
  return isBlueprintParent(child.settings?.parentClass)?composeBlueprint(child,resolveCachedBlueprint(child.settings.parentClass,read,[...stack,path]),path):child;
}
function composeBlueprint(child,parent,path){
    const parentPath=child.settings.parentClass;if(child.native&&!same(child.native,parent.native))throw Error('BP 부모의 C++ 소스를 자식에 다시 정의할 수 없어요: '+path);
    const {root,origins}=inheritedRoot(parent,parentPath),inherited={variables:root.variables.map(v=>v.id),components:root.components.map(c=>c.id),functions:(root.functions||[]).filter(d=>!d.parentImplementation).map(d=>d.id),macros:(root.macros||[]).map(d=>d.id),dispatchers:(root.dispatchers||[]).map(d=>d.id),interfaces:(root.interfaces||[]).map(d=>d.id),comments:views(root).flatMap(([,g])=>(g.comments||[]).map(c=>c.id)),nodes:Object.keys(origins)};
    const defaultValues={settings:copy(parent.settings||{}),variables:Object.fromEntries(parent.variables.map(v=>[v.id,copy(v.value)])),components:Object.fromEntries(parent.components.map(c=>[c.id,{...componentDefaults(c.type),...copy(c.properties||{})}])),nativeDefaults:copy(parent.settings?.nativeDefaults||{})};
    for(const key of ['variables','components']){for(const own of child[key])if(root[key].some(p=>p.id===own.id||p.name===own.name))throw Error('상속된 '+key+' 이름/ID 중복: '+own.name);root[key].push(...copy(child[key]));}
    for(const key of ['macros','dispatchers','interfaces'])appendSymbols(root,child,key);
    const parentFunctions=new Map();root.functions??=[];
    for(const own of child.functions||[]){const inheritedDefinition=root.functions.find(d=>!d.parentImplementation&&d.id===own.id);if(inheritedDefinition){if(inheritedDefinition.name!==own.name||signature(inheritedDefinition)!==signature(own))throw Error('상속 함수 시그니처 불일치: '+own.name);const oldId=inheritedDefinition.id,parentId=stableId(parentPath+'|function|'+oldId);inheritedDefinition.id=parentId;inheritedDefinition.name='Parent_'+parentId;inheritedDefinition.parentImplementation=true;for(const n of inheritedDefinition.graph.nodes)if(['functionInput','functionOutput'].includes(n.key)&&n.definitionId===oldId)n.definitionId=parentId;for(const w of root.watches||[])if(w.view===oldId)w.view=parentId;parentFunctions.set(oldId,parentId);inherited.functions=inherited.functions.filter(id=>id!==oldId);}else if(root.functions.some(d=>d.name===own.name))throw Error('상속 함수 이름 중복: '+own.name);root.functions.push(copy(own));}
    const parentEvents=new Map(root.nodes.filter(n=>events.has(n.key)).map(n=>[blueprintEventIdentity(n),n])),ownEvents=child.nodes.filter(n=>events.has(n.key));
    for(const n of ownEvents){const inheritedEvent=parentEvents.get(blueprintEventIdentity(n));if(inheritedEvent){inheritedEvent.parentKey=inheritedEvent.key;inheritedEvent.key='parentEntry';}}
    root.nodes.push(...copy(child.nodes));root.edges.push(...copy(child.edges));root.comments=[...(root.comments||[]),...copy(child.comments||[])];
    if(child.watches)root.watches=[...(root.watches||[]),...copy(child.watches)];
    if(legacyTemplateConstruction(parent.construction)&&root.construction){root.construction.nodes=root.construction.nodes.slice(0,1);root.construction.edges=[];}
    if(child.construction){for(const n of root.construction?.nodes||[])if(n.key==='construction'){n.parentKey=n.key;n.key='parentEntry';}root.construction={nodes:[...(root.construction?.nodes||[]),...copy(child.construction.nodes)],edges:[...(root.construction?.edges||[]),...copy(child.construction.edges)],comments:[...(root.construction?.comments||[]),...copy(child.construction.comments||[])]};}
    root.name=child.name;root.settings={...copy(parent.settings||{}),...copy(child.settings||{}),parentClass:parent.settings?.parentClass||'Actor',nativeDefaults:{...copy(parent.settings?.nativeDefaults||{}),...copy(child.settings?.nativeDefaults||{})}};delete root.settings.variableDefaults;delete root.settings.componentOverrides;classDefaults(root,child,parent);
    root.inheritance={path,parentClass:parentPath,baseClass:root.settings.parentClass,ancestors:[parentPath,...(parent.inheritance?.ancestors||[])],inherited,nodeOrigins:origins,defaults:defaultValues,authored:child};
    for(const [,g] of views(root))for(const n of g.nodes){if(n.key!=='callParent'||inherited.nodes.includes(n.id))continue;delete n.parentEntryId;delete n.parentDefinitionId;if(n.parentFunctionId){const inheritedDefinition=parentFunctions.get(n.parentFunctionId);if(!inheritedDefinition)throw Error('재정의한 부모 함수가 없어요: '+n.parentFunctionId);n.parentDefinitionId=inheritedDefinition;}
      else if(n.parentEvent){const entry=n.parentEvent.key==='construction'?root.construction?.nodes.find(n=>n.key==='parentEntry'&&n.parentKey==='construction'):parentEvents.get(blueprintEventIdentity(n.parentEvent));if(!entry)throw Error('부모 이벤트가 없어요: '+n.parentEvent.key);n.parentEntryId=entry.id;const pins=basePins(entry,'out',root);n.parentPin??=pins.find(p=>p.type==='exec')?.id;if(!pins.some(p=>p.type==='exec'&&p.id===n.parentPin))throw Error('부모 이벤트 실행 핀을 확인하세요.');}
      else throw Error('부모 호출 대상을 선택하세요.');
    }
    // Serialized children permit unresolved inherited references; execution never does.
    if(!validBlueprint(root,{resolved:true}))throw Error('상속 블루프린트 타입/그래프 검증 실패: '+path);return root;
}

export function serializeBlueprint(root){
  if(!root.inheritance){const authored=copy(root);if(authored.native)authored.native=nativeSourceReference(authored.native);return authored;}const {authored,inherited,defaults}=root.inheritance,child=copy(authored);
  child.name=root.name;child.nodes=copy(root.nodes.filter(n=>!inherited.nodes.includes(n.id)));child.edges=copy(root.edges.filter(e=>!inherited.nodes.includes(e.from.node)&&!inherited.nodes.includes(e.to.node)));child.comments=copy((root.comments||[]).filter(c=>!inherited.comments.includes(c.id)));
  child.variables=copy(root.variables.filter(v=>!inherited.variables.includes(v.id)));child.components=copy(root.components.filter(c=>!inherited.components.includes(c.id)));
  child.functions=copy((root.functions||[]).filter(d=>!d.parentImplementation&&!inherited.functions.includes(d.id)));child.macros=copy((root.macros||[]).filter(d=>!inherited.macros.includes(d.id)));
  for(const key of ['dispatchers','interfaces'])child[key]=copy((root[key]||[]).filter(d=>!inherited[key].includes(d.id)));
  for(const [key,baseline] of Object.entries(defaults.variables)){const value=root.variables.find(v=>v.id===key)?.value;if(value!==undefined&&!same(value,baseline)){child.settings.variableDefaults??={};child.settings.variableDefaults[key]=copy(value);}}
  for(const [id,baseline] of Object.entries(defaults.components)){const c=root.components.find(c=>c.id===id);for(const [key,value] of Object.entries(c?.properties||{}))if(!same(value,baseline[key])){child.settings.componentOverrides??={};child.settings.componentOverrides[id]??={};child.settings.componentOverrides[id][key]=copy(value);}}
  for(const [key,value] of Object.entries(root.settings?.nativeDefaults||{}))if(!same(value,defaults.nativeDefaults[key])){child.settings.nativeDefaults??={};child.settings.nativeDefaults[key]=copy(value);}
  for(const [key,value] of Object.entries(root.settings||{}))if(!['parentClass','nativeDefaults','variableDefaults','componentOverrides'].includes(key)&&(Object.hasOwn(child.settings,key)||!same(value,defaults.settings[key])))child.settings[key]=copy(value);
  if(root.construction){const nodes=root.construction.nodes.filter(n=>!inherited.nodes.includes(n.id));if(nodes.length||authored.construction)child.construction={nodes:copy(nodes),edges:copy(root.construction.edges.filter(e=>!inherited.nodes.includes(e.from.node)&&!inherited.nodes.includes(e.to.node))),comments:copy((root.construction.comments||[]).filter(c=>!inherited.comments.includes(c.id)))};else delete child.construction;}
  if(root.watches!==undefined)child.watches=copy(root.watches.filter(w=>!inherited.nodes.includes(w.node)));
  const originalNodes=new Map(allGraphContexts(authored).flatMap(g=>g.nodes).map(n=>[n.id,n]));
  for(const g of allGraphContexts(child))for(const n of g.nodes){delete n.parentEntryId;delete n.parentDefinitionId;if(n.key==='callParent'&&n.parentEvent&&!Object.hasOwn(originalNodes.get(n.id)||{},'parentPin'))delete n.parentPin;}delete child.native;delete child.inheritance;return child;
}

// Explicit edits are retained even when their value equals the parent's value.
export function editInheritedDefault(root,kind,id,value,key){
  const inheritance=root.inheritance;if(!inheritance) return;
  const settings=inheritance.authored.settings;
  if(kind==='variable'&&inheritance.inherited.variables.includes(id)){settings.variableDefaults??={};settings.variableDefaults[id]=copy(value);}
  else if(kind==='component'&&inheritance.inherited.components.includes(id)){settings.componentOverrides??={};settings.componentOverrides[id]??={};settings.componentOverrides[id][key]=copy(value);}
  else if(kind==='native'){settings.nativeDefaults??={};settings.nativeDefaults[id]=copy(value);}
}
export function setBlueprintDefault(root,kind,id,value,key){
  if(kind==='variable'){const v=root.variables.find(v=>v.id===id);if(!v||(v.container==='array'?!(Array.isArray(value)&&value.length<=128&&value.every(x=>validValue(v.type,x))):!validValue(v.type,value)))throw Error('변수 기본값 자료형 오류');v.value=copy(value);}
  else if(kind==='component'){const c=root.components.find(c=>c.id===id),defaults=c&&componentDefaults(c.type),next={...defaults,...c?.properties,[key]:value};if(!c||!Object.hasOwn(defaults,key)||!validComponentProperties(c.type,next))throw Error('컴포넌트 기본값 오류');c.properties=copy(next);}
  else if(kind==='native'){const {p}=nativeMember(root,{nativeId:id});if(!p||(p.array?!(Array.isArray(value)&&value.length<=128&&value.every(x=>validValue(p.type,x))):!validValue(p.type,value)))throw Error('C++ 속성 기본값 자료형 오류');root.settings??={};root.settings.nativeDefaults??={};root.settings.nativeDefaults[id]=copy(value);}
  else throw Error('기본값 종류 오류');editInheritedDefault(root,kind,id,value,key);
}
export function resetInheritedDefault(root,kind,id,key){
  if(!root.inheritance)throw Error('부모 클래스가 없어요.');const {defaults,authored}=root.inheritance,s=authored.settings;
  if(kind==='variable'){delete s.variableDefaults?.[id];const v=root.variables.find(v=>v.id===id);v.value=copy(defaults.variables[id]);}
  else if(kind==='component'){delete s.componentOverrides?.[id]?.[key];if(s.componentOverrides?.[id]&&!Object.keys(s.componentOverrides[id]).length)delete s.componentOverrides[id];root.components.find(c=>c.id===id).properties[key]=copy(defaults.components[id][key]);}
  else if(kind==='native'){delete s.nativeDefaults?.[id];if(Object.hasOwn(defaults.nativeDefaults,id))root.settings.nativeDefaults[id]=copy(defaults.nativeDefaults[id]);else delete root.settings.nativeDefaults[id];}
  for(const key of ['variableDefaults','componentOverrides','nativeDefaults'])if(s[key]&&!Object.keys(s[key]).length)delete s[key];
}

export function overrideBlueprintEvent(root,id,position={x:40,y:40}){
  const parent=[...root.nodes,...(root.construction?.nodes||[])].find(n=>n.id===id);
  if(!parent||!root.inheritance?.inherited.nodes.includes(id)||parent.key==='parentEntry'||!events.has(parent.key))throw Error('재정의할 부모 이벤트를 선택하세요.');
  const target=parent.key==='construction'?root.construction:root;
  if(target.nodes.some(n=>!root.inheritance.inherited.nodes.includes(n.id)&&blueprintEventIdentity(n)===blueprintEventIdentity(parent)))throw Error('이미 재정의한 이벤트예요.');
  const n={...copy(parent),...makeNode(parent.key,position.x,position.y)},event={key:parent.key};
  for(const key of ['nativeId','symbolId','options','customInputs','customOutputs','valueType','title'])if(parent[key]!==undefined){n[key]=copy(parent[key]);event[key]=copy(parent[key]);}
  const call={...makeNode('callParent',Math.min(9700,position.x+300),position.y),parentEvent:event,parentEntryId:parent.id};
  const pins=basePins(parent,'out',root),exec=pins.find(p=>p.type==='exec');if(!exec)throw Error('부모 이벤트 실행 핀이 없어요.');call.parentPin=exec.id;
  parent.parentKey=parent.key;parent.key='parentEntry';target.nodes.push(n,call);target.edges.push({from:{node:n.id,pin:exec.id},to:{node:call.id,pin:'exec'}},...pins.filter(p=>p.type!=='exec').map(p=>({from:{node:n.id,pin:p.id},to:{node:call.id,pin:p.id}})));
  return {node:n,call};
}

export function overrideBlueprintFunction(root,id){
  const parent=root.functions?.find(d=>d.id===id&&!d.parentImplementation);
  if(!parent||!root.inheritance?.inherited.functions.includes(id))throw Error('재정의할 부모 함수를 선택하세요.');
  const data=serializeBlueprint(root),entry={...makeNode('functionInput',40,50),definitionId:id},exit={...makeNode('functionOutput',720,50),definitionId:id},call={...makeNode('callParent',360,50),parentFunctionId:id};
  const definition={...copy(parent),graph:{nodes:[entry,call,exit],edges:[...parent.inputs.map(p=>({from:{node:entry.id,pin:p.id},to:{node:call.id,pin:p.id}})),...parent.outputs.map(p=>({from:{node:call.id,pin:p.id},to:{node:exit.id,pin:p.id}}))],comments:[]}};
  delete definition.parentImplementation;data.functions??=[];data.functions.push(definition);return data;
}

export function authoredGraphContext(root,view='event'){
  const g=graphContext(root,view);if(!root.inheritance)return g;const {nodes,comments}=root.inheritance.inherited,ownNode=id=>!nodes.includes(id),ownEdge=e=>ownNode(e.from.node)&&ownNode(e.to.node);
  return {...g,parentNodes:root.nodes,parentConstruction:root.construction,get nodes(){return g.nodes.filter(n=>ownNode(n.id));},set nodes(value){g.nodes=[...g.nodes.filter(n=>!ownNode(n.id)),...value];},get edges(){return g.edges.filter(ownEdge);},set edges(value){g.edges=[...g.edges.filter(e=>!ownEdge(e)),...value];},get comments(){return (g.comments||[]).filter(c=>!comments.includes(c.id));},set comments(value){g.comments=[...(g.comments||[]).filter(c=>comments.includes(c.id)),...value];}};
}
