import {inputKey} from './runtime-input.js';
export const inputTriggers=['pressed','held','released','hold','holdRelease','tap','doubleTap','pulse'];
export const inputActionDefaults=Object.freeze({holdTime:.5,tapTime:.2,tapInterval:.3,pulseInterval:.2,oneShot:false});
const zero=a=>a.valueType==='bool'?false:a.valueType==='vec2'?[0,0]:a.valueType==='vec3'?[0,0,0]:0;
const on=v=>Array.isArray(v)?v.some(Boolean):!!v;
export function validActionSettings(a){
  return inputTriggers.includes(a.trigger)&&['holdTime','tapTime','tapInterval','pulseInterval'].every(k=>a[k]===undefined||Number.isFinite(a[k])&&a[k]>0&&a[k]<=60)
    &&(a.oneShot===undefined||typeof a.oneShot==='boolean')&&(a.chordAction===undefined||typeof a.chordAction==='string'&&a.chordAction.length<=1000)
    &&(a.modifiers===undefined||Array.isArray(a.modifiers)&&a.modifiers.length<=16&&a.modifiers.every(m=>m&&(['scale','negate'].includes(m.type)&&Array.isArray(m.axes)&&m.axes.length===3&&m.axes.every(v=>Number.isFinite(v)&&Math.abs(v)<=100)||m.type==='swizzle'&&['xyz','xzy','yxz','yzx','zxy','zyx'].includes(m.order)||m.type==='normalize'||m.type==='exponential'&&Number.isFinite(m.exponent)&&m.exponent>0&&m.exponent<=10)));
}
export function modifyActionValue(vector,action){
  let v=[...vector];for(const m of action.modifiers||[]){if(m.type==='scale')v=v.map((n,i)=>n*m.axes[i]);else if(m.type==='negate')v=v.map((n,i)=>m.axes[i]? -n:n);else if(m.type==='swizzle')v=[...m.order].map(axis=>v['xyz'.indexOf(axis)]);else if(m.type==='normalize'){const n=Math.hypot(...v);if(n)v=v.map(x=>x/n);}else if(m.type==='exponential')v=v.map(n=>Math.sign(n)*Math.abs(n)**m.exponent);}
  v=v.slice(0,action.valueType==='vec3'?3:action.valueType==='vec2'?2:1).map(n=>Math.max(-1,Math.min(1,n)));if(Math.hypot(...v)<=action.deadZone)v=v.map(()=>0);
  return action.valueType==='bool'?v.some(Boolean):v.length===1?v[0]:v;
}
// Input assets are shared by the editor and game; keyboard repeat never drives held actions.
export class InputActions {
  constructor(contexts=[],actions=new Map()){this.contexts=contexts.map((c,i)=>({...c,path:c.path||'initial:'+i})).sort((a,b)=>b.priority-a.priority);this.actions=actions;this.keys=new Map();this.previous=new Map();this.states=new Map();this.time=0;this.events=new Map();}
  set(key,value){this.keys.set(inputKey(key),value);}
  clear(){this.keys.clear();this.previous.clear();this.states.clear();this.events.clear();this.time=0;}
  addContext(path,context,priority=context.priority){this.removeContext(path);this.contexts.push({...context,path,priority});this.contexts.sort((a,b)=>b.priority-a.priority);}
  removeContext(path){this.contexts=this.contexts.filter(c=>c.path!==path);}
  preview(frame=false,delta=0,key,value){const next=Object.assign(Object.create(InputActions.prototype),this);for(const field of ['keys','previous','states','events'])next[field]=structuredClone(this[field]);if(key!==undefined)next.set(key,value);return {input:next,events:next.sample(frame,delta)};}
  commit(next){for(const field of ['keys','previous','states','events']){this[field].clear();for(const [key,value] of next[field])this[field].set(key,value);}this.time=next.time;}
  snapshot(){return [...this.actions].map(([path,a])=>{const s=this.states.get(path);return {path,value:structuredClone(s?.value??zero(a)),state:s?.state||'none',elapsed:s?.elapsed||0,events:[...(this.events.get(path)||[])]};});}
  endFrame(){this.events.clear();}
  sample(frame=false,delta=0){
    if(frame)this.time+=Math.max(0,Math.min(1,delta));
    const values=new Map(),consumed=new Set(),claimed=new Set(),blocked=new Set();
    for(const context of this.contexts){
      const grouped=new Map();for(const mapping of context.mappings){if(!grouped.has(mapping.action))grouped.set(mapping.action,[]);grouped.get(mapping.action).push(mapping);}
      for(const [path,mappings] of grouped){const action=this.actions.get(path);if(!action||claimed.has(path))continue;claimed.add(path);const vector=[0,0,0],used=[];
        for(const m of mappings){const key=inputKey(m.key);if(consumed.has(key)){if(this.keys.get(key))blocked.add(path);continue;}const v=this.keys.get(key)||0;vector[m.axis]+=v*m.scale;if(v)used.push(key);}
        const value=modifyActionValue(vector,action);values.set(path,value);if(on(value)&&action.consumeInput)used.forEach(k=>consumed.add(k));
      }
    }
    const result=[],evaluated=new Set(),visiting=new Set();
    const evaluate=path=>{
      if(evaluated.has(path))return this.states.get(path);if(visiting.has(path))throw Error('Input Action 조합 순환: '+path);visiting.add(path);
      const a=this.actions.get(path);if(!a){visiting.delete(path);return null;}const value=values.get(path)??zero(a),raw=on(value),chord=a.chordAction?evaluate(a.chordAction):null,active=raw&&(!a.chordAction||chord?.qualified),s=this.states.get(path)||{active:false,elapsed:0,fired:false,pendingTap:null,value:zero(a),state:'none'},events=[];
      const rising=active&&!s.active,falling=!active&&s.active;if(rising){s.elapsed=0;s.fired=false;s.nextPulse=0;if(a.trigger!=='doubleTap'||s.pendingTap===null)events.push('started');}
      if(active&&frame)s.elapsed=Math.min(86400,s.elapsed+Math.max(0,Math.min(1,delta)));let trigger=false,ongoing=false;
      const hold=a.holdTime??inputActionDefaults.holdTime,tap=a.tapTime??inputActionDefaults.tapTime,gap=a.tapInterval??inputActionDefaults.tapInterval,interval=a.pulseInterval??inputActionDefaults.pulseInterval;
      if(a.trigger==='pressed')trigger=rising;
      else if(a.trigger==='held')trigger=frame&&active;
      else if(a.trigger==='released')trigger=falling;
      else if(a.trigger==='hold'){trigger=active&&s.elapsed+1e-9>=hold&&(!a.oneShot||!s.fired)&&(frame||rising);ongoing=active&&s.elapsed<hold;}
      else if(a.trigger==='holdRelease'){trigger=falling&&s.elapsed+1e-9>=hold;ongoing=active;}
      else if(a.trigger==='tap'){trigger=falling&&s.elapsed<=tap+1e-9;ongoing=active&&s.elapsed<=tap;}
      else if(a.trigger==='doubleTap'){
        if(s.pendingTap!==null&&this.time-s.pendingTap>gap+1e-9){s.pendingTap=null;events.push('canceled');}
        if(falling&&s.elapsed<=tap+1e-9){if(s.pendingTap!==null){trigger=true;s.pendingTap=null;}else s.pendingTap=this.time;}
        ongoing=active||s.pendingTap!==null;
      }else if(a.trigger==='pulse'){trigger=active&&(rising||frame&&s.elapsed+1e-9>=s.nextPulse);if(trigger)s.nextPulse=s.elapsed+interval;}
      const removed=(s.active||s.pendingTap!==null)&&(!claimed.has(path)||blocked.has(path)&&!on(value));if(removed){trigger=false;ongoing=false;s.pendingTap=null;if(!falling&&!events.includes('canceled'))events.push('canceled');}
      if(trigger){events.push('triggered');s.fired=true;}else if(ongoing&&frame)events.push('ongoing');
      if(falling&&!(a.trigger==='doubleTap'&&s.pendingTap!==null))events.push(!removed&&(s.fired||['pressed','held','released'].includes(a.trigger))?'completed':'canceled');
      s.qualified=active&&(s.fired||a.trigger==='held');s.state=trigger?'triggered':ongoing?'ongoing':active&&s.fired?'triggered':'none';s.active=active;s.value=value;
      for(const event of events){result.push({path,event,value:structuredClone(value),elapsed:s.elapsed,state:s.state});if(!this.events.has(path))this.events.set(path,new Set());this.events.get(path).add(event);}
      if(falling)s.elapsed=0;this.states.set(path,s);this.previous.set(path,value);visiting.delete(path);evaluated.add(path);return s;
    };
    for(const path of this.actions.keys())evaluate(path);return result;
  }
}
