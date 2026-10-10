const clamp=v=>Math.max(0,Math.min(1,v));
import {animationCurve} from './animation-state-runtime.js';
import {updateAnimationBlendContext} from './animation-blend-space.js';
export function animationBlendSamples(owner,node){const samples=owner.sortedSamples.get(node.id),value=owner.parameters.get(node.properties.parameter);let hi=samples.findIndex(s=>s.threshold>=value);if(hi<0)hi=samples.length-1;const lo=Math.max(0,hi-1),weight=hi===lo||value<=samples[0].threshold?0:clamp((value-samples[lo].threshold)/(samples[hi].threshold-samples[lo].threshold));return {low:samples[lo].input,high:samples[hi].input,weight};}
export function animationSelectionIndex(owner,node){const index=owner.parameters.get(node.properties.parameter);return node.type==='selectEnum'?Math.max(0,node.properties.samples.findIndex(s=>s.value===index)):index>=0&&index<node.properties.samples.length?index:0;}
function updateSelection(owner,node,context,step){
  const p=node.properties,index=animationSelectionIndex(owner,node);let state=context.selections.get(node.id);
  if(!state){state={weights:new Float64Array(p.samples.length),from:new Float64Array(p.samples.length),target:index,time:0};state.weights[index]=state.from[index]=1;context.selections.set(node.id,state);}
  if(state.frame!==owner.frame){
    if(index!==state.target){if(p.childUpdate==='reset'&&state.weights[index]===0)owner.resetContext(context.children.get(node.id).get(p.samples[index].input));state.from.set(state.weights);state.target=index;state.time=0;}
    state.time+=step;const duration=p.samples[index].duration,alpha=animationCurve(duration?state.time/duration:1,p.curve);
    for(let i=0;i<state.weights.length;i++)state.weights[i]=state.from[i]*(1-alpha)+(i===index?alpha:0);state.frame=owner.frame;
  }return state;
}
export function planAnimationPose(owner,delta){
  const memo=new Map(),policy=owner.hasNotifyPolicy;
  const visit=(id,context=owner.mainContext,step=delta,group='')=>{
    if(!id)return new Map();const key=context.key+'|'+id+'|'+group;if(memo.has(key))return memo.get(key);const node=owner.nodes.get(id),p=node.properties,result=new Map();if(policy)result.notifyWeights=new Map();memo.set(key,result);
    const merge=(input,weight=1,ctx=context,childStep=step,childGroup=group,notify=true)=>{const source=visit(node.inputs[input],ctx,childStep,childGroup);for(const [record,value] of source)result.set(record,(result.get(record)||0)+value*weight);if(policy&&notify)for(const [record,value] of source.notifyWeights||[])result.notifyWeights.set(record,(result.notifyWeights.get(record)||0)+value*weight);};
    if(node.type==='clip'){
      const record=context.clipRecords.get(id),effective=record.sync.method==='group'?record.sync.group:record.sync.method==='graph'?group:'';
      if(record.sync.method==='graph'&&!effective)throw Error('Graph 동기화 클립에 Sync 포즈 노드를 연결하세요.');
      if(record.frame===owner.frame&&record.group!==effective)throw Error('공유 클립을 서로 다른 Sync 그룹에 연결할 수 없어요.');
      if(record.frame!==owner.frame){record.frame=owner.frame;record.previous=(context.elapsed.get(id)||0)+p.offset;record.absolute=record.previous+step*p.rate;context.elapsed.set(id,record.absolute-p.offset);record.group=effective;}result.set(record,1);if(policy)result.notifyWeights.set(record,1);
    }else if(node.type==='stateMachine'){
      const machine=context.machines.get(id);machine.prepare(step);const t=machine.transition;
      if(t){if(!t.frozen){const s=machine.states.get(t.from);merge(s.input,1-t.weight,machine.stateContext(s.id),step*s.speed);}const s=machine.states.get(t.to);merge(s.input,t.weight,machine.stateContext(s.id),step*s.speed);}
      else{const s=machine.states.get(machine.current);merge(s.input,1,machine.stateContext(s.id),step*s.speed);}
    }else if(node.type==='sync')merge('pose',1,context,step,p.group);
    else if(node.type==='slot'){const inserted=owner.slotPose?.(p.group,p.slot),weight=inserted?.weight||0;if(weight<1||p.alwaysUpdateSource)merge('pose',1-weight);}
    else if(node.type==='blend'||node.type==='layer'){const w=owner.alpha(p);if(w<1||node.type==='layer')merge(node.type==='layer'?'base':'a',1-w);if(w>0)merge(node.type==='layer'?'overlay':'b',w);}
    else if(node.type==='select'){
      const desired=owner.parameters.get(p.parameter)?1:0;let s=context.selections.get(id);if(!s){s={weight:desired,from:desired,target:desired,time:0};context.selections.set(id,s);}if(s.frame!==owner.frame){if(desired!==s.target){s.from=s.weight;s.target=desired;s.time=0;}s.time+=step;s.weight=p.duration?s.from+(s.target-s.from)*clamp(s.time/p.duration):desired;s.frame=owner.frame;}
      if(s.weight<1)merge('false',1-s.weight);if(s.weight>0)merge('true',s.weight);
    }else if(['selectInt','selectEnum'].includes(node.type)){const state=updateSelection(owner,node,context,step),children=context.children.get(id);p.samples.forEach((s,i)=>{if(state.weights[i]||p.childUpdate==='all')merge(s.input,state.weights[i],children.get(s.input));});}
    else if(node.type==='blend1d'){const s=animationBlendSamples(owner,node),mode=p.notifyMode||'all',chosen=s.weight>.5?s.high:s.low,allowed=input=>mode==='all'||mode==='highest'&&input===chosen;if(s.weight<1)merge(s.low,1-s.weight,context,step,group,allowed(s.low));if(s.weight>0)merge(s.high,s.weight,context,step,group,allowed(s.high));}
    else if(node.type==='blend2d'){const state=updateAnimationBlendContext(context.blendSpaces.get(id),owner.parameters,step,owner.frame),mode=p.notifyMode||'all';let chosen=0;if(mode==='highest')for(let i=1;i<state.weights.length;i++)if(state.weights[i]>state.weights[chosen]+1e-12)chosen=i;state.notifyInput=mode==='highest'?p.samples[chosen].input:'';p.samples.forEach((s,i)=>{if(state.weights[i])merge(s.input,state.weights[i],context,step,group,mode==='all'||mode==='highest'&&i===chosen);});}
    else if(node.type==='direct'){const values=p.samples.map(s=>clamp(s.parameter?owner.parameters.get(s.parameter):s.weight)),sum=values.reduce((a,b)=>a+b,0);p.samples.forEach((s,i)=>{if(values[i])merge(s.input,values[i]/(p.normalize&&sum?sum:1));});}
    else if(node.type==='additive'){merge('base');merge('additive',owner.alpha(p));}
    else for(const input of Object.keys(node.inputs))merge(input);
    return result;
  };
  const weights=visit(owner.data.output);if(policy)for(const record of weights.keys())if(!weights.notifyWeights.has(record))weights.notifyWeights.set(record,0);owner.syncGroups.resolve(weights,delta,weights.notifyWeights);return weights;
}
