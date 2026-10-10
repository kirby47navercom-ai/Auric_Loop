import {catalog,basePins,defaultInputValue,fieldsFor,graphContext} from './blueprint-model.js';
import {evaluateCore,blueprintPure} from './core-preview.js';
import {libraryByKey} from './library-spec.js';
import {nativeMember,nativeTargetPin} from './native-model.js';
import {cloneNativeValue} from './native-transport.js';

const plans=new WeakMap(),clone=cloneNativeValue;
const pureKeys=new Set([...Object.keys(blueprintPure).filter(key=>key!=='random'),...catalog.filter(s=>s.pure&&!s.service&&(/^hb::(?:Math|VectorMath)::/.test(s.cppName||'')||libraryByKey.has(s.key))).map(s=>s.key)]);
// ponytail: terminal native events can batch without graph continuations. Branches,
// world reads and used return pins keep their existing ordered execution boundary.
export function nativeTickPlan(root,key='tick'){
  if(!plans.has(root))plans.set(root,new Map());const cache=plans.get(root);if(cache.has(key))return cache.get(key);
  const nodes=root.nodes.filter(n=>n.key===key),result=[];let calls=0,valid=true;
  const safe=(node,pin,seen=new Set())=>{const id=node.id+':'+pin;if(seen.has(id))return false;seen=new Set(seen).add(id);const edge=root.edges.find(e=>e.to.node===node.id&&e.to.pin===pin);if(!edge)return true;const source=root.nodes.find(n=>n.id===edge.from.node);return source?.key===key&&nodes.includes(source)||['getVariable','self'].includes(source?.key)||source?.key==='reroute'&&safe(source,'value',seen);};
  for(const tick of nodes){const edges=root.edges.filter(e=>e.from.node===tick.id&&e.from.pin==='then');if(!edges.length){result.push({tick});continue;}const node=edges.length===1&&root.nodes.find(n=>n.id===edges[0].to.node),{f}=node?nativeMember(root,node):{};if(!node||node.key!=='nativeCall'||!f||f.pure||f.event!=='none'||root.edges.some(e=>e.from.node===node.id)||basePins(node,'in',root).some(p=>p.type!=='exec'&&(!safe(node,p.id)||node.splitPins?.includes('in:'+p.id)))){valid=false;break;}result.push({tick,node,fn:f,inputs:basePins(node,'in',root).filter(p=>p.type!=='exec')});if(++calls>1){valid=false;break;}}
  let plan=valid?result:null;
  if(!plan){const expanded=[];let complete=true;for(const tick of nodes){const edges=root.edges.filter(e=>e.from.node===tick.id&&e.from.pin==='then');if(!edges.length){expanded.push({tick});continue;}const start=edges.length===1&&root.nodes.find(n=>n.id===edges[0].to.node),chain=start&&nativeChainPlan(root,root,start);if(!chain?.length||root.edges.some(e=>e.from.node===chain.at(-1).node.id&&e.from.pin==='then')){complete=false;break;}expanded.push({tick,chain});}if(complete)plan=expanded;}
  if(plan)plan.overrides=root.nodes.filter(n=>n.key==='nativeEvent').map(n=>n.nativeId);cache.set(key,plan);return plan;
}
export function nativeTickBlock(binding,plan,delta,eventArgs){
  const root=binding.root,jobs=[];let request;
  for(const item of plan){const {tick,node,fn}=item,elapsed=(binding.ticks.get(tick.id)||0)+delta,interval=tick.options?.tickInterval??root.settings?.tickInterval??0,due=eventArgs!==undefined||elapsed+1e-9>=interval&&delta>0,reads=new Map();const job={...item,elapsed,due,reads,readCount:0};if(item.chain&&due){const outputs=new Map([[tick.id,eventArgs??{delta:elapsed}]]),chain=nativeChainBlock(binding,root,item.chain,outputs,'');for(const entry of chain)jobs.push({...entry,tick,elapsed,due});continue;}jobs.push(job);if(!due||!node||node.enabled===false)continue;if(node.breakpoint)return null;
    const read=(n,p)=>{const edge=root.edges.find(e=>e.to.node===n.id&&e.to.pin===p.id);if(!edge)return clone(defaultInputValue(n,p));const source=root.nodes.find(n=>n.id===edge.from.node),[id,...path]=edge.from.pin.split('.');let output;
      if(source===tick)output=eventArgs??{delta:elapsed};else if(source.key==='getVariable')output={value:binding.variables.get(source.variableId)};else if(source.key==='self')output={return:binding.self};else if(source.key==='reroute')output={value:read(source,basePins(source,'in',root).find(p=>p.id==='value'))};else throw Error('C++ 묶음 데이터 의존성');
      if(source!==tick){job.readCount++;output=clone(output);reads.set(source.id,output);}let value=output[id];if(path.length){let type=basePins(source,'out',root).find(p=>p.id===id)?.type;for(const field of path){const fields=fieldsFor(type),i=fields.findIndex(p=>p.id===field);value=Array.isArray(value)?value[i]:value?.[field];type=fields[i]?.type;}}if(value===undefined)throw Error('출력 값이 없어요: '+edge.from.pin);return source===tick?clone(value):value;};
    const args={};for(const p of item.inputs){const value=read(node,p);if(p.id==='__proto__')Object.defineProperty(args,p.id,{value,writable:true,enumerable:true,configurable:true});else args[p.id]=value;}const receiver=nativeTargetPin(fn);if(!fn.static)args[receiver]=args[receiver]==='self'||args[receiver]===null?binding.self:args[receiver];request={key:'nativeCall',nativeId:node.nativeId,args,self:binding.self,scope:'',overrides:plan.overrides};job.request=request;
  }
  const requests=jobs.filter(j=>j.request).map(j=>j.request);return {binding,jobs,request:requests[0],requests};
}

// Ordered native chains also occur inside input/collision/custom events and BP
// functions. Stop before any data read that can observe an earlier native write.
const chains=new WeakMap(),entries=new Set([...catalog.filter(s=>s.kind==='event').map(s=>s.key),'functionInput','macroInput']);
export function nativeChainPlan(root,g,start){
  if(!chains.has(g))chains.set(g,new Map());const cache=chains.get(g);if(cache.has(start.id))return cache.get(start.id);
  const jobs=[],visited=new Set();let node=start;
  const safe=(n,pin,seen=new Set())=>{const id=n.id+':'+pin;if(seen.has(id))return false;seen=new Set(seen).add(id);const edge=g.edges.find(e=>e.to.node===n.id&&e.to.pin===pin);if(!edge)return true;const source=g.nodes.find(n=>n.id===edge.from.node);return ['getVariable','self'].includes(source?.key)||entries.has(source?.key)||source?.key==='reroute'&&safe(source,'value',seen)||pureKeys.has(source?.key)&&!source.splitPins?.some(p=>p.startsWith('in:'))&&basePins(source,'in',g).every(p=>p.type!=='exec'&&safe(source,p.id,seen));};
  while(node&&!visited.has(node.id)&&jobs.length<1000){
    visited.add(node.id);const {f}=nativeMember(root,node),inputs=basePins(node,'in',g).filter(p=>p.type!=='exec');
    if(node.key!=='nativeCall'||node.enabled===false||node.breakpoint||!f||f.pure||f.event!=='none'||inputs.some(p=>!safe(node,p.id)||node.splitPins?.includes('in:'+p.id)))break;
    jobs.push({node,fn:f,inputs});const next=g.edges.filter(e=>e.from.node===node.id&&e.from.pin==='then');if(next.length!==1||next[0].to.pin!=='exec')break;node=g.nodes.find(n=>n.id===next[0].to.node);
  }
  cache.set(start.id,jobs);return jobs;
}
export function nativeChainBlock(binding,g,plan,outputs,scope){
  const overrides=binding.root.nodes.filter(n=>n.key==='nativeEvent').map(n=>n.nativeId),jobs=[];
  for(const item of plan){if(item.node.enabled===false||item.node.breakpoint)throw Error('C++ 실행·중단점 경계');const reads=new Map(),job={...item,reads,readCount:0};
    const read=(n,p)=>{const edge=g.edges.find(e=>e.to.node===n.id&&e.to.pin===p.id);if(!edge)return clone(defaultInputValue(n,p));const source=g.nodes.find(n=>n.id===edge.from.node),[id,...path]=edge.from.pin.split('.');let output;
      if(entries.has(source.key))output=outputs.get(source.id);else if(source.key==='getVariable')output={value:binding.variables.get(source.variableId)};else if(source.key==='self')output={return:binding.self};else if(source.key==='reroute')output={value:read(source,basePins(source,'in',g).find(p=>p.id==='value'))};else if(pureKeys.has(source.key)){const args=Object.fromEntries(basePins(source,'in',g).filter(p=>p.type!=='exec').map(p=>[p.id,read(source,p)]));output=blueprintPure[source.key]?blueprintPure[source.key](args):evaluateCore(source.key,args);}else throw Error('C++ 묶음 데이터 의존성');
      if(!output)throw Error('먼저 실행해야 하는 출력: '+source.key);if(!entries.has(source.key)){job.readCount++;output=clone(output);reads.set(source.id,output);}let value=output[id];if(path.length){let type=basePins(source,'out',g).find(p=>p.id===id)?.type;for(const field of path){const fields=fieldsFor(type),i=fields.findIndex(p=>p.id===field);value=Array.isArray(value)?value[i]:value?.[field];type=fields[i]?.type;}}if(value===undefined)throw Error('출력 값이 없어요: '+edge.from.pin);return clone(value);
    };
    const args=Object.fromEntries(item.inputs.map(p=>[p.id,read(item.node,p)])),receiver=nativeTargetPin(item.fn);if(!item.fn.static)args[receiver]=args[receiver]==='self'||args[receiver]===null?binding.self:args[receiver];job.request={key:'nativeCall',nativeId:item.node.nativeId,args,self:binding.self,scope,overrides};jobs.push(job);
  }
  return jobs;
}

// Event descriptors are read-only until their completed native prefix is visited.
// Input key maps and construction callbacks stay at their original event boundary.
export function nativeEventBlock(binding,g,descriptors){
  const entries=[],jobs=[];
  for(const descriptor of descriptors){const {n,args,pin='then',scope=''}=descriptor,edges=g.edges.filter(e=>e.from.node===n.id&&e.from.pin===pin);let chain=[];
    let wrapper;
    if(edges.length){if(edges.length!==1||edges[0].to.pin!=='exec')return null;const start=g.nodes.find(n=>n.id===edges[0].to.node);
      if(['callFunction','callMacro'].includes(start?.key)){
        const definition=[...binding.root.functions,...binding.root.macros].find(d=>d.id===start.definitionId),inputs=basePins(start,'in',g).filter(p=>p.type!=='exec');if(!definition||definition.pure||definition.inputs.filter(p=>p.type==='exec').length!==1||definition.inputs.find(p=>p.type==='exec')?.id!=='exec'||definition.outputs.length!==1||definition.outputs[0].id!=='then'||definition.outputs.some(p=>p.type!=='exec')||start.enabled===false||start.breakpoint||g.edges.some(e=>e.from.node===start.id)||inputs.some(p=>p.array||!['bool','int','float','string','object'].includes(p.type)||start.splitPins?.includes('in:'+p.id)))return null;
        const subgraph=graphContext(binding.root,definition.id),entry=subgraph.nodes.find(n=>n.key=== (start.key==='callMacro'?'macroInput':'functionInput')),exit=subgraph.nodes.find(n=>n.key===(start.key==='callMacro'?'macroOutput':'functionOutput')),links=subgraph.edges.filter(e=>e.from.node===entry?.id&&e.from.pin==='exec'),first=links.length===1&&links[0].to.pin==='exec'&&subgraph.nodes.find(n=>n.id===links[0].to.node),plan=first&&nativeChainPlan(binding.root,subgraph,first),tail=plan?.length&&subgraph.edges.filter(e=>e.from.node===plan.at(-1).node.id&&e.from.pin==='then');
        if(!plan?.length||!exit||exit.enabled===false||exit.breakpoint||tail.length!==1||tail[0].to.node!==exit.id||tail[0].to.pin!=='then')return null;
        const prefix=nativeChainBlock(binding,g,[{node:start,fn:{static:true},inputs}],new Map([[n.id,args]]),scope)[0];wrapper={node:start,definition,subgraph,entry,prefix};chain=nativeChainBlock(binding,subgraph,plan,new Map([[entry.id,prefix.request.args]]),scope);
      }else{const plan=start&&nativeChainPlan(binding.root,g,start);if(!plan?.length||g.edges.some(e=>e.from.node===plan.at(-1).node.id&&e.from.pin==='then'))return null;chain=nativeChainBlock(binding,g,plan,new Map([[n.id,args]]),scope);}
    }
    const entry={...descriptor,pin,jobs:chain,wrapper};entries.push(entry);jobs.push(...chain);
  }
  return {binding,g,entries,jobs,stepCost:jobs.reduce((sum,j)=>sum+1+j.readCount,0)+entries.reduce((sum,e)=>sum+(e.wrapper?2+e.wrapper.prefix.readCount:0),0),requests:jobs.map(j=>j.request)};
}
