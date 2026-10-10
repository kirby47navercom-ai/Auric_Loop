// Browser preview of the shared API. C++ implementation lives in Game.hpp.
import {catalog,basePins,fieldsFor,defaultInputValue,validValue} from './blueprint-model.js';
import {libraryByKey} from './library-spec.js';
const eq=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export const blueprintPure={random:a=>({return:a.min+Math.random()*(a.max-a.min)}),greater:a=>({return:a.a>a.b}),less:a=>({return:a.a<a.b}),equal:a=>({return:eq(a.a,a.b)}),notEqual:a=>({return:!eq(a.a,a.b)}),and:a=>({return:a.a&&a.b}),or:a=>({return:a.a||a.b}),not:a=>({return:!a.value}),select:a=>({return:a.condition?a.a:a.b}),concat:a=>({return:a.a+a.b}),stringLength:a=>({return:a.value.length}),contains:a=>({return:a.value.includes(a.search)}),toString:a=>({return:String(a.value)}),arrayLength:a=>({return:a.array.length}),arrayFind:a=>({return:a.array.findIndex(v=>eq(v,a.item))}),arrayContains:a=>({return:a.array.some(v=>eq(v,a.item))}),makeTransform:a=>({return:{position:a.position,rotation:a.rotation,scale:a.scale}}),makeColor:a=>({return:[a.r,a.g,a.b,a.a]}),reroute:a=>({value:a.value})};
const add=(a,b)=>a.map((v,i)=>v+b[i]),sub=(a,b)=>a.map((v,i)=>v-b[i]),scale=(a,s)=>a.map(v=>v*s),dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0),length=a=>Math.hypot(...a),clamp=(v,a,b)=>{if(a>b)throw Error('최소값이 최대값보다 커요.');return Math.max(a,Math.min(b,v));},lerp=(a,b,t)=>a+(b-a)*t;
const normalize=a=>length(a)>1e-8?scale(a,1/length(a)):a.map(()=>0),move=(a,b,d)=>{const v=sub(b,a),s=length(v);return s<=Math.max(0,d)||s<1e-8?b:add(a,scale(v,Math.max(0,d)/s));};
export function createCorePreview(now=()=>performance.now()/1000){return {time:0,delta:0,scale:1,paused:false,epoch:now(),now,next:0,timers:new Map(),watches:new Map(),values:new Map(),events:[],advance(dt){if(!Number.isFinite(dt)||dt<0)throw Error('프레임 시간을 확인하세요.');this.delta=this.paused?0:dt*this.scale;this.time+=this.delta;for(const t of this.timers.values())if(t.active&&!t.paused){t.elapsed+=this.delta;if(t.elapsed>=t.duration){this.events.push(t.event);if(t.loop)t.elapsed%=t.duration;else{t.elapsed=t.duration;t.active=false;}}}}};}
export function evaluateCore(key,a,c){
  const spec=catalog.find(s=>s.key===key&&s.cppName);if(!spec)throw Error('공통 C++ API가 아니에요.');
  const valid=(p,value)=>p.array?Array.isArray(value)&&value.length<=128&&value.every(v=>validValue(p.type,v)):validValue(p.type,value);
  for(const p of spec.inputs.filter(p=>p.type!=='exec'))if(!valid(p,a[p.id]))throw Error(p.label+' 입력값을 확인하세요.');
  const output=evaluateRaw(key,a,c);
  for(const p of spec.outputs.filter(p=>p.type!=='exec'))if(!valid(p,output[p.id]))throw Error('계산 결과가 유효 범위를 벗어났어요.');
  return output;
}
function evaluateRaw(key,a,c){
  if(libraryByKey.has(key))return {return:libraryByKey.get(key).run(a)};
  const scalar={add:()=>a.a+a.b,subtract:()=>a.a-a.b,multiply:()=>a.a*a.b,divide:()=>{if(a.b===0)throw Error('0으로 나눌 수 없어요.');return a.a/a.b;},min:()=>Math.min(a.a,a.b),max:()=>Math.max(a.a,a.b),power:()=>a.a**a.b,abs:()=>Math.abs(a.value),sqrt:()=>{if(a.value<0)throw Error('음수의 제곱근이에요.');return Math.sqrt(a.value);},sin:()=>Math.sin(a.value),cos:()=>Math.cos(a.value),floor:()=>Math.floor(a.value),ceil:()=>Math.ceil(a.value),round:()=>Math.sign(a.value)*Math.round(Math.abs(a.value)),clamp:()=>clamp(a.value,a.min,a.max),lerp:()=>lerp(a.a,a.b,a.alpha),nearlyEqual:()=>Math.abs(a.a-a.b)<=Math.max(0,a.tolerance),mapRange:()=>{if(a.inMin===a.inMax)throw Error('입력 범위가 0이에요.');return lerp(a.outMin,a.outMax,(a.value-a.inMin)/(a.inMax-a.inMin));},smoothStep:()=>{if(a.min===a.max)throw Error('보간 범위가 0이에요.');const t=clamp((a.value-a.min)/(a.max-a.min),0,1);return t*t*(3-2*t);},degreesToRadians:()=>a.value*Math.PI/180,radiansToDegrees:()=>a.value*180/Math.PI,floatInterp:()=>a.speed<=0?a.target:lerp(a.current,a.target,clamp(Math.max(0,a.delta)*a.speed,0,1))};
  if(scalar[key])return {return:scalar[key]()};
  const vectors={vec3:()=>[a.x,a.y,a.z],vec2:()=>[a.x,a.y],vectorAdd:()=>add(a.a,a.b),vectorSubtract:()=>sub(a.a,a.b),vectorScale:()=>scale(a.value,a.scale),vectorLength:()=>length(a.value),vectorLengthSquared:()=>dot(a.value,a.value),normalize:()=>normalize(a.value),distance:()=>length(sub(a.a,a.b)),distanceSquared:()=>dot(sub(a.a,a.b),sub(a.a,a.b)),dot:()=>dot(a.a,a.b),cross:()=>[a.a[1]*a.b[2]-a.a[2]*a.b[1],a.a[2]*a.b[0]-a.a[0]*a.b[2],a.a[0]*a.b[1]-a.a[1]*a.b[0]],vectorLerp:()=>add(a.a,scale(sub(a.b,a.a),a.alpha)),vectorInterp:()=>a.speed<=0?a.target:add(a.current,scale(sub(a.target,a.current),clamp(Math.max(0,a.delta)*a.speed,0,1))),vectorMoveTowards:()=>move(a.current,a.target,a.distance),vectorReflect:()=>{const n=normalize(a.normal);return sub(a.value,scale(n,2*dot(a.value,n)));},vectorProject:()=>dot(a.onto,a.onto)>1e-16?scale(a.onto,dot(a.value,a.onto)/dot(a.onto,a.onto)):[0,0,0],vectorClampLength:()=>length(a.value)>Math.max(0,a.maxLength)&&length(a.value)>1e-8?scale(a.value,Math.max(0,a.maxLength)/length(a.value)):a.value,vector2Length:()=>length(a.value),vector2Normalize:()=>normalize(a.value)};
  if(vectors[key])return {return:vectors[key]()};
  switch(key){
    case 'time':return {return:c.time};case 'deltaSeconds':return {return:c.delta};case 'realTime':return {return:c.now()-c.epoch};
    case 'timeScale':if(!Number.isFinite(a.scale)||a.scale<0)throw Error('유효한 시간 배율을 입력하세요.');c.scale=a.scale;return {};
    case 'gamePaused':c.paused=a.paused;return {};
    case 'timer':if(!Number.isFinite(a.duration)||a.duration<=0)throw Error('타이머는 0초보다 길어야 해요.');{const handle='timer_'+(++c.next);c.timers.set(handle,{duration:a.duration,loop:a.loop,event:a.event,elapsed:0,active:true,paused:false});return {handle};}
    case 'clearTimer':c.timers.delete(a.handle);return {};
    case 'pauseTimer':case 'resumeTimer':if(c.timers.has(a.handle))c.timers.get(a.handle).paused=key==='pauseTimer';return {};
    case 'timerElapsed':return {return:c.timers.get(a.handle)?.elapsed||0};
    case 'timerRemaining':{const t=c.timers.get(a.handle);return {return:t?Math.max(0,t.duration-t.elapsed):0};}
    case 'timerActive':{const t=c.timers.get(a.handle);return {return:!!(t?.active&&!t.paused)};}
    case 'startStopwatch':{const handle=a.name+'_'+(++c.next);c.watches.set(handle,{start:c.now(),elapsed:0,running:true});return {handle};}
    case 'stopwatchElapsed':case 'stopStopwatch':{const w=c.watches.get(a.handle),elapsed=w?w.running?c.now()-w.start:w.elapsed:0;if(w&&key==='stopStopwatch'){w.running=false;w.elapsed=elapsed;}return {return:elapsed};}
  }
  const o=c.object?.(a.target);if(!o)throw Error('Target 오브젝트가 없어요.');
  switch(key){
    case 'location':return {return:[...o.position]};case 'getRotation':return {return:[...o.rotation]};case 'getScale':return {return:[...o.scale]};case 'getTransform':return {return:{position:[...o.position],rotation:[...o.rotation],scale:[...o.scale]}};
    case 'setPosition':o.position=[...a.position];break;case 'setRotation':o.rotation=[...a.value];break;case 'setScale':o.scale=[...a.value];break;case 'setTransform':Object.assign(o,JSON.parse(JSON.stringify(a.value)));break;case 'translate':o.position=add(o.position,a.value);break;case 'rotate':o.rotation=add(o.rotation,a.value);break;
    case 'moveActorTowards':o.position=move(o.position,a.destination,Math.max(0,a.speed)*Math.max(0,a.delta));c.updateObject?.(o);return {return:dot(sub(o.position,a.destination),sub(o.position,a.destination))<1e-12};
    default:throw Error('이 API의 미리보기 호출은 없어요.');
  }c.updateObject?.(o);return {};
}

// Resolve only data dependencies. Execution pins are deliberately not a game VM.
export function evaluateCoreNode(graph,id,context){
  const memo=new Map(),visiting=new Set();
  function readInput(n,p){
    const edge=graph.edges.find(e=>e.to.node===n.id&&e.to.pin===p.id);
    if(edge)return readOutput(edge.from);
    if(n.splitPins?.includes('in:'+p.id)){
      const fields=fieldsFor(p.type),values=fields.map(f=>readInput(n,{...f,id:p.id+'.'+f.id}));
      return ['vec2','vec3','color'].includes(p.type)?values:Object.fromEntries(fields.map((f,i)=>[f.id,values[i]]));
    }
    return structuredClone(defaultInputValue(n,p));
  }
  function readOutput(from){
    const n=graph.nodes.find(n=>n.id===from.node);if(!n)throw Error('연결된 노드가 없어요.');
    const spec=catalog.find(s=>s.key===n.key);
    const output=spec?.cppName&&!spec.pure?context.values.get(n.id):run(n);
    if(!output)throw Error('먼저 연결된 호출 노드를 미리보기에서 실행하세요.');
    const [base,...path]=from.pin.split('.');let value=output[base],type=basePins(n,'out',graph).find(p=>p.id===base)?.type;
    for(const part of path){const fields=fieldsFor(type),index=fields.findIndex(f=>f.id===part);if(index<0)throw Error('출력 필드가 없어요.');value=Array.isArray(value)?value[index]:value?.[part];type=fields[index].type;}
    return structuredClone(value);
  }
  function run(n){
    if(memo.has(n.id))return memo.get(n.id);if(visiting.has(n.id))throw Error('순환 데이터 연결이에요.');if(n.enabled===false)throw Error('비활성 노드예요.');visiting.add(n.id);
    let output;
    if(n.key==='getVariable')output={value:structuredClone(graph.variables.find(v=>v.id===n.variableId)?.value)};
    else if(n.key==='reroute')output={value:readInput(n,basePins(n,'in',graph)[0])};
    else output=evaluateCore(n.key,Object.fromEntries(basePins(n,'in',graph).filter(p=>p.type!=='exec').map(p=>[p.id,readInput(n,p)])),context);
    memo.set(n.id,output);context.values.set(n.id,output);visiting.delete(n.id);return output;
  }
  const node=graph.nodes.find(n=>n.id===id);if(!node)throw Error('노드가 없어요.');return run(node);
}
