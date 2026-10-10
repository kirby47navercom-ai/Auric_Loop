import {motionBuffer,resetMotion} from './animation-root-motion.js';
const clamp=v=>Math.max(0,Math.min(1,v));
const compare=(value,c)=>({true:()=>value===true,false:()=>value===false,eq:()=>value===c.value,ne:()=>value!==c.value,gt:()=>value>c.value,ge:()=>value>=c.value,lt:()=>value<c.value,le:()=>value<=c.value}[c.op]());
export function animationCurve(value,type){const x=clamp(value);return type==='smooth'?x*x*(3-2*x):type==='easeIn'?x*x:type==='easeOut'?1-(1-x)*(1-x):x;}
export function crossedAnimationExit(previous,current,exit,loop){
  if(current<previous)return false;if(exit===0&&previous===0)return true;
  if(!loop||exit>=1)return previous<exit&&current>=exit;
  return Math.floor(current-exit)>Math.floor(previous-exit);
}

// Each state owns its clocks and intermediate pose buffers, including shared pose nodes.
export class AnimationPoseMachine {
  constructor(owner,node,context,key){this.owner=owner;this.node=node;this.key=key;this.context=context;this.states=new Map(node.properties.states.map(s=>[s.id,s]));this.contexts=new Map(node.properties.states.map(s=>[s.id,owner.makeContext(node.inputs[s.input],key+'/'+s.id)]));this.ordered=[...node.properties.transitions].sort((a,b)=>a.priority-b.priority||node.properties.transitions.indexOf(a)-node.properties.transitions.indexOf(b));this.current='';this.transition=null;this.lastFrame=-1;this.initialized=false;this.motion=owner.hasRootMotion?motionBuffer():null;this.frozen=owner.allocatePose();this.lastPose=owner.allocatePose();this.frozenSprites=new Map();this.lastResult=null;this.limited=false;}
  event(name,phase,state,transition){if(name)this.owner.queueEvent({name,phase,machine:this.key,state:state?.id||'',stateName:state?.name||'',transition:transition?.id||''});}
  stateContext(id){return this.contexts.get(id);}
  enter(id,offset=0,force=false){const s=this.states.get(id),ctx=this.stateContext(id);if(force||s.resetOnEntry||offset){this.owner.resetContext(ctx,offset||s.offset);ctx.time=0;}this.event(s.onEnter,'enter',s);return s;}
  timing(id,delta=0){const s=this.states.get(id),ctx=this.stateContext(id),root=this.node.inputs[s.input],clips=this.owner.poseClipWeights(root,ctx),dominant=[...clips].sort((a,b)=>b[1]-a[1])[0];if(!dominant)return {time:ctx.time,length:1,normalized:ctx.time,previous:ctx.time,loop:false,clip:''};const [{id:clip,context:clipContext}]=dominant,p=this.owner.nodes.get(clip).properties,length=this.owner.clips.get(clip).length,elapsed=clipContext.elapsed.get(clip)||0,absolute=elapsed+p.offset;return {time:ctx.time,length:p.rate>0?length/(p.rate*s.speed||1):length,normalized:(absolute+delta*s.speed*p.rate)/length,previous:absolute/length,loop:p.loop,clip};}
  eligible(t,source,delta){if(t.to===source&&!t.allowSelf)return false;const timing=this.timing(source,delta);if(t.hasExitTime&&!crossedAnimationExit(timing.previous,timing.normalized,t.exitTime,timing.loop))return false;return t.conditions.every(c=>compare(this.owner.parameters.get(c.parameter),c));}
  candidates(){const active=this.transition,any=this.ordered.filter(t=>t.from==='any');if(!active)return [...any,...this.ordered.filter(t=>t.from===this.current)];const groups={none:[],current:[active.from],next:[active.to],currentNext:[active.from,active.to],nextCurrent:[active.to,active.from]}[active.rule.interrupt];return [...any,...groups.flatMap(id=>this.ordered.filter(t=>t.from===id))];}
  begin(rule,source,{duration,offset,initial=false}={}){
    const active=this.transition,from=source||this.current,to=rule.to;
    if((active||from===to)&&this.lastResult){for(let i=0;i<this.frozen.length;i++)this.frozen[i].set(this.lastResult.pose[i]);this.frozenSprites=new Map(this.lastResult.sprites);}
    if(active){this.event(active.rule.onInterrupt,'interrupt',this.states.get(active.to),active.rule);this.event(this.states.get(active.to).onExit,'exit',this.states.get(active.to));}
    else this.event(this.states.get(from).onExit,'exit',this.states.get(from));
    this.current=from;const target=this.enter(to,offset??rule.offset),length=this.timing(from).length,seconds=initial?0:duration??(rule.fixedDuration?rule.duration:rule.duration*length);
    this.transition={rule,from,to,time:0,duration:seconds,weight:0,frozen:!!active||from===to};this.event(rule.onStart,'transitionStart',target,rule);
    for(const c of rule.conditions)if(this.owner.parameterType(c.parameter)==='trigger')this.owner.parameters.set(c.parameter,false);
    if(!seconds)this.finish();
  }
  finish(){const t=this.transition;if(!t)return;this.current=t.to;this.transition=null;this.event(t.rule.onEnd,'transitionEnd',this.states.get(t.to),t.rule);this.event(this.states.get(t.to).onFullyBlended,'fullyBlended',this.states.get(t.to));}
  initialize(){this.current=this.node.properties.entry;this.transition=null;this.enter(this.current,0,true);this.initialized=true;this.event(this.states.get(this.current).onFullyBlended,'fullyBlended',this.states.get(this.current));}
  crossFade(state,duration,offset){const found=this.states.get(state)||[...this.states.values()].find(s=>s.name===state);if(!found||!Number.isFinite(duration)||duration<0||duration>60||!Number.isFinite(offset)||offset<0||offset>1000)throw Error('포즈 상태·전이 시간·시작 비율을 확인하세요.');if(!this.initialized)this.initialize();this.lastFrame=this.owner.frame;this.begin({id:'command',to:found.id,duration,fixedDuration:true,offset,curve:'linear',conditions:[],interrupt:'none',ordered:false,onStart:'',onEnd:'',onInterrupt:''},undefined,{duration,offset});}
  prepare(delta){
    if(this.preparedFrame===this.owner.frame)return;this.preparedFrame=this.owner.frame;
    const first=!this.initialized||this.node.properties.reinitialize&&this.lastFrame!==this.owner.frame-1;if(first)this.initialize();this.lastFrame=this.owner.frame;this.limited=false;
    let decisions=0;for(;decisions<this.node.properties.maxTransitions;decisions++){
      let choice,source;for(const t of this.candidates()){if(this.transition&&t.id===this.transition.rule.id){if(this.transition.rule.ordered)break;continue;}const from=t.from==='any'?(this.transition?.to||this.current):t.from;if(this.eligible(t,from,delta)){choice=t;source=from;break;}}
      if(!choice)break;this.begin(choice,source,{initial:first&&this.node.properties.skipFirstTransition});if(this.transition)break;
    }this.limited=decisions===this.node.properties.maxTransitions;
    const t=this.transition,ids=t?[t.from,t.to]:[this.current];for(const id of new Set(ids))this.stateContext(id).time+=delta*this.states.get(id).speed;
    if(t){t.time+=delta;t.weight=animationCurve(t.duration?t.time/t.duration:1,t.rule.curve);}
  }
  evaluate(delta,out,evaluate){
    this.prepare(delta);if(this.motion)resetMotion(this.motion);const t=this.transition;
    const sample=id=>{const s=this.states.get(id);return evaluate(this.node.inputs[s.input],this.stateContext(id),delta*s.speed);};
    let result;if(t){const a=t.frozen?{pose:this.frozen,sprites:this.frozenSprites}:sample(t.from),b=sample(t.to);this.owner.mix(out,a.pose,b.pose,t.weight);if(this.motion)this.owner.mixRootMotion(this.motion,a.rootMotion,b.rootMotion,t.weight);result={pose:out,sprites:this.owner.mergeSprites(a.sprites,b.sprites,t.weight),rootMotion:this.motion};if(t.time>=t.duration)this.finish();}else{const value=sample(this.current);for(let i=0;i<out.length;i++)out[i].set(value.pose[i]);if(this.motion)this.motion.set(value.rootMotion||resetMotion(this.motion));result={pose:out,sprites:value.sprites,rootMotion:this.motion};}for(let i=0;i<this.lastPose.length;i++)this.lastPose[i].set(result.pose[i]);this.lastResult={pose:this.lastPose,sprites:result.sprites};return result;
  }
  snapshot(){const t=this.transition,current=this.states.get(this.current),next=t&&this.states.get(t.to);return {id:this.node.id,name:this.node.name,key:this.key,state:current?.id||'',stateName:current?.name||'',nextState:next?.id||'',nextName:next?.name||'',...this.current?this.timing(this.current):{time:0,normalized:0,length:0},transition:t?{id:t.rule.id,from:t.from,to:t.to,time:t.time,duration:t.duration,progress:t.duration?clamp(t.time/t.duration):1,weight:t.weight}:null,limited:this.limited,states:[...this.states.values()].map(s=>({id:s.id,name:s.name,time:this.stateContext(s.id).time,weight:t?s.id===t.to&&s.id===t.from?1:s.id===t.to?t.weight:s.id===t.from?1-t.weight:0:s.id===this.current?1:0}))};}
}
