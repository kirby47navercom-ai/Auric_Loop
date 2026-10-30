// CPU demand hints only. Shader evaluation/sampling is never changed here.
// Exact affine UV chains are supported; an unproved/nonlinear chain asks for
// level0 and still obeys the existing pool budget. No graph walk per pixel.
const finite=v=>Number.isFinite(v)&&Math.abs(v)<=1e12;
const constant=value=>{const v=Array.isArray(value)?value:[value];return v.length&&v.every(finite)?{v:[...v],x:v.map(()=>0),y:v.map(()=>0)}:null;};
const uniform=a=>a&&a.x.every(v=>v===0)&&a.y.every(v=>v===0);
function cast(a,n){if(!a)return null;const expand=v=>Array.from({length:n},(_,i)=>v.length===1?v[0]:v[i]??0);return {v:expand(a.v),x:expand(a.x),y:expand(a.y)};}
function binary(a,b,op){
 if(!a||!b)return null;const n=Math.max(a.v.length,b.v.length);a=cast(a,n);b=cast(b,n);const out={v:[],x:[],y:[]};
 for(let i=0;i<n;i++){
  if(op==='multiply'&&!uniform(a)&&!uniform(b)||op==='divide'&&(!uniform(b)||b.v[i]===0))return null;
  for(const k of ['v','x','y'])out[k][i]=op==='add'?a[k][i]+b[k][i]:op==='subtract'?a[k][i]-b[k][i]:op==='multiply'?(k==='v'?a.v[i]*b.v[i]:a[k][i]*b.v[i]+a.v[i]*b[k][i]):a[k][i]/b.v[i];
 }
 return Object.values(out).every(v=>v.every(finite))?out:null;
}
function select(a,indices){if(!a)return null;return Object.fromEntries(['v','x','y'].map(k=>[k,indices.map(i=>a[k][i]??0)]));}
export function makeTextureGraphDemand(data,{keyOf,pinsOf,parameterKey,edges}){
 const graph=data.graph||{nodes:[],edges:[]},nodes=new Map(graph.nodes.map(n=>[n.id,n])),incoming=new Map(edges.map(e=>[e.to.node+':'+e.to.pin,e.from])),pinCache=new Map();
 const {usesTime,parameterKeys}=(()=>{const parents=new Map(),queue=[],seen=new Set(),keys=new Set();let usesTime=false;for(const e of edges){const p=parents.get(e.to.node)||[];p.push(e.from.node);parents.set(e.to.node,p);}for(const n of graph.nodes)if(['texture','sampleArray','sampleVolume','sampleCube'].includes(keyOf(n))){const mode=n.mipMode||'auto',inputs=mode==='lod'?['lod']:mode==='gradient'?['gradientX','gradientY']:mode==='bias'?['uv','bias']:['uv'];for(const pin of inputs){const from=incoming.get(n.id+':'+pin);if(from)queue.push(from.node);}}while(queue.length){const id=queue.pop();if(seen.has(id))continue;seen.add(id);const n=nodes.get(id);if(!n)continue;const key=keyOf(n);if(key==='time'||key==='panner'&&n.inputValues?.time===undefined&&!incoming.has(id+':time'))usesTime=true;const parameter=parameterKey(n);if(typeof parameter==='string')keys.add(parameter);queue.push(...parents.get(id)||[]);}return {usesTime,parameterKeys:[...keys]};})();const parameterValues=parameterKeys.map(()=>undefined);let clock=NaN,cache=new Map(),visiting=new Set(),hints=new Map();
 const pins=node=>{let p=pinCache.get(node);if(!p){p=pinsOf(node,graph);pinCache.set(node,p);}return p;};
 function input(node,id,depth){const edge=incoming.get(node.id+':'+id),spec=pins(node).inputs.find(p=>p.id===id);if(!spec)return null;let a;if(edge)a=read(edge.node,edge.pin,depth+1);else if(id==='uv'&&spec.type==='vec2'&&node.inputValues?.uv===undefined)a={v:[0,0],x:[1,0],y:[0,1]};else if(id==='time'&&node.inputValues?.time===undefined)a=constant(clock);else a=constant(node.inputValues?.[id]??spec.value??0);return spec.type==='vec2'?cast(a,2):spec.type==='vec3'?cast(a,3):spec.type==='vec4'?cast(a,4):spec.type==='float'?cast(a,1):a;}
 function read(id,pin='value',depth=0){
  const token=id+':'+pin;if(cache.has(token))return cache.get(token);if(depth>128||visiting.has(token))return null;const node=nodes.get(id);if(!node)return null;visiting.add(token);const key=keyOf(node),arg=p=>input(node,p,depth),scalar=p=>{const a=arg(p);return uniform(a)?a.v[0]:null;};let a=null;
  if(['scalar','vector2','vector3','vector4','scalarParameter','vectorParameter'].includes(key))a=constant(data.parameters?.[parameterKey(node)]??node.value??.5);
  else if(key==='uv')a={v:[0,0],x:[1,0],y:[0,1]};else if(key==='time')a=constant(clock);
  else if(['add','subtract','multiply','divide'].includes(key))a=binary(arg('a'),arg('b'),key);
  else if(key==='oneMinus')a=binary(constant(1),arg('value'),'subtract');
  else if(key==='tilingOffset')a=binary(binary(arg('uv'),arg('tiling'),'multiply'),arg('offset'),'add');
  else if(key==='panner')a=binary(arg('uv'),binary(arg('speed'),arg('time'),'multiply'),'add');
  else if(key==='rotateUV'){const angle=scalar('angle'),uv=arg('uv'),center=arg('center');if(angle!==null&&uv&&center){const d=binary(uv,center,'subtract'),c=Math.cos(angle),s=Math.sin(angle),x=select(d,[0]),y=select(d,[1]),u=binary(binary(x,constant(c),'multiply'),binary(y,constant(s),'multiply'),'subtract'),v=binary(binary(x,constant(s),'multiply'),binary(y,constant(c),'multiply'),'add');if(u&&v)a=binary(Object.fromEntries(['v','x','y'].map(k=>[k,[u[k][0],v[k][0]]])),center,'add');}}
  else if(key==='lerp')a=binary(arg('a'),binary(binary(arg('b'),arg('a'),'subtract'),arg('t'),'multiply'),'add');
  else if(key==='split'){const i='xyzw'.indexOf(pin);if(i>=0)a=select(arg('value'),[i]);}
  else if(key==='combine'){const ids=pin==='rg'?['x','y']:pin==='rgb'?['x','y','z']:['x','y','z','w'],parts=ids.map(arg);if(parts.every(Boolean))a=Object.fromEntries(['v','x','y'].map(k=>[k,parts.map(p=>p[k][0])]));}
  else if(key==='dot'){const x=arg('a'),y=arg('b'),product=binary(x,y,'multiply');if(product)a=Object.fromEntries(['v','x','y'].map(k=>[k,[product[k].reduce((n,v)=>n+v,0)]]));}
  if(a&&!Object.values(a).every(v=>v.every(finite)))a=null;visiting.delete(token);cache.set(token,a);return a;
 }
 return (id,time=0)=>{
  const nextClock=usesTime?time:0;let changed=false;for(let index=0;index<parameterKeys.length;index++){const value=data.parameters?.[parameterKeys[index]],prior=parameterValues[index];let same=Object.is(value,prior);if(Array.isArray(value)&&Array.isArray(prior)&&value.length===prior.length){same=true;for(let lane=0;lane<value.length;lane++)if(!Object.is(value[lane],prior[lane])){same=false;break;}}if(!same){parameterValues[index]=Array.isArray(value)?value.slice():value;changed=true;}}if(changed||clock!==nextClock){clock=nextClock;cache=new Map();visiting=new Set();hints=new Map();}if(hints.has(id))return hints.get(id);
  const node=nodes.get(id);let hint={mode:'conservative',reason:'unsupported-or-varying-coordinate'};
  if(node){const mode=node.mipMode||'auto',value=pin=>{const a=input(node,pin,0);return uniform(a)?a.v:null;};
   if(mode==='lod'){const lod=value('lod')?.[0];if(finite(lod))hint={mode:'lod',lod:Math.max(0,Math.min(15.99,lod))};}
   else if(mode==='gradient'){const x=value('gradientX'),y=value('gradientY');if(x&&y)hint={mode:'gradient',gradientX:x,gradientY:y};}
   else{const uv=input(node,'uv',0),bias=mode==='bias'?value('bias')?.[0]:0;if(uv&&finite(bias))hint={mode:'affine',matrix:[uv.x[0],uv.y[0],uv.x[1],uv.y[1]],bias:Math.max(-16,Math.min(15.99,bias))};}
  }
  hints.set(id,hint);return hint;
 };
}
export const textureGraphDemandContract=Object.freeze({version:1,source:'compiled sampler sourceNode plus the same resolved material graph, scoped parameters and material clock for GL/WebGPU/native',affine:'UV, constants/parameters/time, supported affine arithmetic, tiling/panning/rotation, combine/split/dot and lerp; nonlinear/unproved coordinates request level0 subject to pool budget',sampling:'visible explicit LOD, uniform gradients and bias contribute directly; no-mip samplers request level0; current cube/volume demand stays conservative',projection:'exact supported graph coefficients with existing mesh UV/bounding-sphere screen estimate; finer graph-only/texture-matrix interpretation and anisotropy allowance; not local per-triangle or secondary-ray derivatives',cache:'per material normalized node/edge index and dependency cache; only changed upstream scalar/vector snapshots or relevant clock invalidate hints, including in-place edits; unchanged lookups allocate no parameter snapshot; unrelated parameter/clock changes reuse hints; no shader change, extra GPU allocation/readback or disk cache',diagnostics:'profiler.textureResidency items[].demandBasis and desiredBase; basis describes supported demand or conservative fallback',remaining:'nonlinear/local triangle derivatives, arbitrary custom nodes/UV domains and exact secondary-view/optical footprints'});
