const clamp=v=>Math.max(0,Math.min(1,v));
export function animationNotifyPayload(record,notify,cycle,fields){const event={notify:notify.id,clip:record.id,context:record.context.key,group:record.grouped?record.group:'',cycle,...fields};for(const p of notify.parameters||[])event[p.name]=structuredClone(p.value);return event;}
export async function deliverAnimationNotify(vm,binding,event){
  const scope=event.instance||'';
  if(event.phase==='notifyBegin')vm.beginScope(scope);
  else if(event.phase==='notifyEnd')vm.cancelScope(scope);
  if(binding&&event.name)await vm.custom(binding,event.name,event,event.phase==='notifyEnd'?'':scope);
}

// Planned windows and delivered callbacks are separate: a canceled pending Begin
// must never produce an End for gameplay which never received that Begin.
export class AnimationNotifyTrack {
  constructor(owner,limits){this.owner=owner;this.limits=limits;this.active=new Map();this.delivered=new Map();this.hasStates=owner.data.nodes.some(n=>n.properties.notifyStates?.length);}
  event(window,phase,at,fields={}){
    const {record,notify,cycle,instance}=window;
    return animationNotifyPayload(record,notify,cycle,{name:notify[{notifyBegin:'onBegin',notifyTick:'onTick',notifyEnd:'onEnd'}[phase]],phase,instance,time:at-cycle*record.length,weight:record.notifyWeight??record.weight,duration:notify.duration,deltaSeconds:0,progress:clamp((at-window.begin)/notify.duration),reason:'',...fields});
  }
  resolve(weights,pending,delta){
    if(!this.hasStates)return;
    const next=new Map(),ended=new Set(),emit=(window,phase,at,fraction,fields)=>{const event=this.event(window,phase,at,fields);if(pending.length+this.owner.events.length>=this.limits.crossings)throw Error('애니메이션 이벤트 한도4096');if(phase==='notifyEnd')ended.add(window.instance);pending.push({fraction,event,window});};
    for(const [instance,window] of this.active){const {record,notify}=window,weight=weights.get(record)||0,eligible=weight>0&&weight>=notify.minWeight&&(!record.grouped||record.leader||notify.triggerOnFollower);if(!weights.has(record)||!eligible||record.fresh){emit(window,'notifyEnd',window.at,0,{reason:record.fresh?'restarted':!weights.has(record)?'irrelevant':'filtered'});}}
    for(const [record,weight] of weights){if(weight<=0)continue;
      for(const notify of record.notifyStates){if(weight<notify.minWeight||record.grouped&&!record.leader&&!notify.triggerOnFollower)continue;
        const start=record.previous,end=record.absolute;if(end<start)throw Error('구간 알림 시계가 역행했어요.');
        const first=record.p.loop?Math.max(0,Math.floor((start-notify.time-notify.duration)/record.length)+1):0,last=record.p.loop?Math.floor((end-notify.time)/record.length):0;
        if(last-first+1>this.limits.crossings)throw Error('구간 알림 경계 한도4096');
        for(let cycle=first;cycle<=last;cycle++){
          const begin=cycle*record.length+notify.time,finish=begin+notify.duration;if(begin>end||finish<=start)continue;
          const instance=JSON.stringify([record.context.key,record.id,notify.id,cycle,record.epoch||0]),old=this.active.get(instance),window={instance,record,notify,cycle,begin,finish,at:Math.min(end,finish)},fraction=at=>end===start?0:clamp((at-start)/(end-start));
          if(!old||record.fresh)emit(window,'notifyBegin',Math.max(start,begin),fraction(Math.max(start,begin)));
          const overlap=Math.max(0,Math.min(end,finish)-Math.max(start,begin));if(delta>0&&overlap>0)emit(window,'notifyTick',Math.min(end,finish),fraction(Math.min(end,finish)),{deltaSeconds:delta*overlap/(end-start)});
          if(end>=finish)emit(window,'notifyEnd',finish,fraction(finish),{reason:'completed'});
          else {if(next.size>=this.limits.activeNotifyStates)throw Error('활성 구간 알림 한도2048');next.set(instance,window);}
        }
      }
    }
    for(const [instance,window] of this.active)if(!next.has(instance)&&!ended.has(instance))emit(window,'notifyEnd',window.at,0,{reason:'timeChanged'});
    this.active=next;
  }
  acknowledge(event){
    if(event.phase==='notifyBegin')this.delivered.set(event.instance,event);
    else if(event.phase==='notifyEnd')this.delivered.delete(event.instance);
    else if(event.phase==='notifyTick'&&this.delivered.has(event.instance))this.delivered.set(event.instance,event);
  }
  interrupt(pending,time){
    // Callbacks may pause before the planned interval finishes. Keep only
    // windows whose Begin actually ran, at the cursor visible to that callback.
    const windows=new Map(this.active),ends=[];for(const item of pending)if(item.window)windows.set(item.window.instance,item.window);
    this.active.clear();for(const instance of this.delivered.keys()){const w=windows.get(instance);if(!w)continue;if(time>=w.finish)ends.push(this.event(w,'notifyEnd',w.finish,{reason:'completed'}));else this.active.set(instance,{...w,at:time});}return ends;
  }
  cancel(reason='stopped'){const events=[...this.delivered.values()].map(event=>({...event,name:this.owner.nodes.get(event.clip).properties.notifyStates.find(n=>n.id===event.notify).onEnd,phase:'notifyEnd',deltaSeconds:0,reason}));this.delivered.clear();this.active.clear();return events;}
  snapshot(){return [...this.active.values()].map(w=>({instance:w.instance,id:w.notify.id,name:w.notify.name,clip:w.record.id,context:w.record.context.key,cycle:w.cycle,time:w.at-w.cycle*w.record.length,duration:w.notify.duration,progress:clamp((w.at-w.begin)/w.notify.duration),weight:w.record.notifyWeight??w.record.weight}));}
  dispose(){this.active.clear();this.delivered.clear();}
}
