import {validValue} from './blueprint-model.js';
import {AnimationNotifyTrack,animationNotifyPayload} from './animation-notify-runtime.js';
const clamp=v=>Math.max(0,Math.min(1,v));
const mod=(v,n)=>((v%n)+n)%n;
const name=v=>typeof v==='string'&&v.length>0&&v.length<=80;
const identity=v=>typeof v==='string'&&v.length>0&&v.length<=120;
export const animationSyncLimits={markers:64,notifies:64,notifyStates:64,notifyParameters:8,activeNotifyStates:2048,crossings:4096};
export const animationNotifyTypes=['bool','int','float','string','vec2','vec3','color','object'];
export const animationSyncMethods=['none','group','graph'];
export const animationSyncRoles=['canLeader','follower','leader','transitionLeader','transitionFollower'];
export const defaultAnimationSync=()=>({method:'none',group:'',role:'canLeader',markers:[]});
export const makeAnimationNotify=(event='Notify',time=0)=>({id:crypto.randomUUID(),name:event,time,minWeight:.00001,triggerOnFollower:false,parameters:[]});
export const makeAnimationNotifyState=(event='NotifyState',time=0,duration=.25)=>({...makeAnimationNotify(event,time),duration,onBegin:event+'Begin',onTick:event+'Tick',onEnd:event+'End'});
export const animationNotifyReservedNames=['name','phase','notify','clip','context','group','time','cycle','weight','duration','deltaSeconds','progress','reason','instance','__proto__','constructor','prototype'];
const reserved=new Set(animationNotifyReservedNames);
const validParameters=list=>list===undefined||Array.isArray(list)&&list.length<=animationSyncLimits.notifyParameters&&new Set(list.map(p=>p?.name)).size===list.length&&list.every(p=>p&&typeof p.name==='string'&&/^[A-Za-z_][A-Za-z0-9_]{0,79}$/.test(p.name)&&!reserved.has(p.name)&&animationNotifyTypes.includes(p.type)&&validValue(p.type,p.value));
const validNotifies=(list,state=false)=>list===undefined||Array.isArray(list)&&list.length<=64&&new Set(list.map(n=>n?.id)).size===list.length&&list.every(n=>identity(n?.id)&&name(n.name)&&Number.isFinite(n.time)&&n.time>=0&&n.time<=100000&&Number.isFinite(n.minWeight)&&n.minWeight>=0&&n.minWeight<=1&&typeof n.triggerOnFollower==='boolean'&&validParameters(n.parameters)&&(!state||Number.isFinite(n.duration)&&n.duration>0&&n.duration<=100000&&['onBegin','onTick','onEnd'].every(k=>typeof n[k]==='string'&&n[k].length<=80)));
export function validAnimationSync(p){
  const s=p.sync;if(s!==undefined&&(!s||!animationSyncMethods.includes(s.method)||typeof s.group!=='string'||s.group.length>80||s.method==='group'&&!name(s.group)||!animationSyncRoles.includes(s.role)||!Array.isArray(s.markers)||s.markers.length>animationSyncLimits.markers||new Set(s.markers.map(m=>m?.id)).size!==s.markers.length||new Set(s.markers.map(m=>m?.time)).size!==s.markers.length||s.markers.some(m=>!identity(m?.id)||!name(m.name)||!Number.isFinite(m.time)||m.time<0||m.time>100000)))return false;
  return validNotifies(p.notifies)&&validNotifies(p.notifyStates,true);
}
export function compileAnimationSync(properties,length){
  const sync=properties.sync||defaultAnimationSync(),markers=[...sync.markers].sort((a,b)=>a.time-b.time),notifies=[...(properties.notifies||[])].sort((a,b)=>a.time-b.time),notifyStates=[...(properties.notifyStates||[])].sort((a,b)=>a.time-b.time);
  if([...markers,...notifies].some(m=>m.time>=length))throw Error('동기화 마커·알림 시간은 클립 길이보다 짧아야 해요.');
  if(notifyStates.some(n=>n.time>=length||n.time+n.duration>length+1e-9))throw Error('구간 알림은 클립 안에 있어야 해요.');
  return {sync,markers,notifies,notifyStates};
}
function markerSegment(record,absolute,common){
  const list=record.markers.filter(m=>common.has(m.name));if(list.length<2)return null;
  const length=record.length,cycle=record.p.loop?Math.floor(absolute/length):0,time=record.p.loop?mod(absolute,length):Math.min(length,absolute);let index=list.findLastIndex(m=>m.time<=time),turn=cycle;
  if(index<0){if(!record.p.loop)return null;index=list.length-1;turn--;}
  if(!record.p.loop&&index===list.length-1)return null;
  const next=(index+1)%list.length,start=list[index].time+turn*length,end=list[next].time+(turn+(next===0?1:0))*length;
  return {list,index,turn,segment:turn*list.length+index,ratio:clamp((absolute-start)/(end-start)),previous:list[index].name,next:list[next].name};
}
// Match repeated marker pairs by proximity, then advance whole marker intervals.
// This preserves interval order when one locomotion clip contains more steps.
function markerSpan(leader,start,end,follower,previous,common){
  const a=markerSegment(leader,start,common),b=markerSegment(leader,end,common);if(!a||!b||b.segment<a.segment)return null;
  const list=follower.markers.filter(m=>common.has(m.name));let best;
  for(let index=0;index<list.length;index++){
    const next=(index+1)%list.length;if(!follower.p.loop&&next===0)continue;if(list[index].name!==a.previous||list[next].name!==a.next)continue;
    const duration=list[next].time+(next===0?follower.length:0)-list[index].time,base=list[index].time+a.ratio*duration,turn=follower.p.loop?Math.round((previous-base)/follower.length):0,value=base+turn*follower.length,distance=Math.abs(previous-value);
    if(!best||distance<best.distance)best={index,turn,value,distance};
  }
  if(!best)return null;const count=b.segment-a.segment;if(count>animationSyncLimits.crossings)throw Error('동기화 마커 경계 한도4096');
  let {index,turn}=best;
  for(let step=0;step<count;step++){
    index++;if(index===list.length){if(!follower.p.loop)return null;index=0;turn++;}
    const li=mod(a.index+step+1,a.list.length),next=(index+1)%list.length;
    if(!follower.p.loop&&next===0||list[index].name!==a.list[li].name||list[next].name!==a.list[(li+1)%a.list.length].name)return null;
  }
  const next=(index+1)%list.length,startTime=list[index].time+turn*follower.length,endTime=list[next].time+(turn+(next===0?1:0))*follower.length;
  return {start:best.value,end:startTime+b.ratio*(endTime-startTime)};
}
function lengthSpan(leader,start,end,follower){const phase=v=>leader.p.loop?v/leader.length:clamp(v/leader.length);return {start:phase(start)*follower.length,end:phase(end)*follower.length};}
export class AnimationSyncGroups {
  constructor(owner){this.owner=owner;this.groups=new Map();this.notifies=new AnimationNotifyTrack(owner,animationSyncLimits);}
  resolve(weights,delta=0,notifyWeights=weights){
    const frame=this.owner.frame,groups=new Map();
    for(const [record,weight] of weights){record.weight=weight;record.notifyWeight=notifyWeights.get(record)||0;record.leader=true;record.grouped=false;
      if(record.lastRelevantFrame!==frame-1||record.fresh)record.syncReady=false;
      if(weight<=0){record.syncReady=false;continue;}record.lastRelevantFrame=frame;if(weight>=1-1e-6)record.syncReady=true;
      if(!record.group||record.sync.role.startsWith('transition')&&!record.syncReady)continue;if(!groups.has(record.group))groups.set(record.group,[]);groups.get(record.group).push(record);
    }
    const next=new Map();
    for(const [name,records] of groups){
      const forced=records.filter(r=>['leader','transitionLeader'].includes(r.sync.role)),eligible=records.filter(r=>r.sync.role==='canLeader');const leader=forced.at(-1)||eligible.reduce((a,b)=>!a||b.weight>a.weight?b:a,null)||records[0];
      let common=new Set(leader.markers.map(m=>m.name));for(const record of records)common=new Set([...common].filter(n=>record.markers.some(m=>m.name===n)));
      const previous=this.groups.get(name);
      if(previous?.frame===frame-1&&previous.record!==leader){const aligned=markerSpan(previous.record,previous.absolute,previous.absolute,leader,leader.previous,common)||lengthSpan(previous.record,previous.absolute,previous.absolute,leader);const advance=leader.absolute-leader.previous;leader.previous=aligned.end;leader.absolute=aligned.end+advance;}
      let marked=!!markerSegment(leader,leader.absolute,common);const mapped=[];
      for(const record of records){record.leader=record===leader;record.grouped=true;if(record===leader)continue;const span=markerSpan(leader,leader.previous,leader.absolute,record,record.previous,common);if(!span)marked=false;mapped.push([record,span]);}
      for(const [record,span] of mapped){const value=marked?span:lengthSpan(leader,leader.previous,leader.absolute,record);record.previous=value.start;record.absolute=value.end;}
      for(const record of records)record.context.elapsed.set(record.id,record.absolute-record.p.offset);
      const marker=marked?markerSegment(leader,leader.absolute,common):null;
      next.set(name,{name,frame,record:leader,absolute:leader.absolute,phase:leader.p.loop?mod(leader.absolute,leader.length)/leader.length:clamp(leader.absolute/leader.length),method:marked?'markers':'length',marker:marker?{previous:marker.previous,next:marker.next,ratio:marker.ratio}:null,records});
    }
    this.groups=next;
    const pending=[];
    for(const [record,weight] of notifyWeights){
      if(weight>0)for(const notify of record.notifies){if(weight<notify.minWeight||record.grouped&&!record.leader&&!notify.triggerOnFollower)continue;
        const start=record.previous,end=record.absolute,initial=record.fresh&&Math.abs(start-notify.time)<1e-9;
        const first=record.p.loop?Math.floor((start-notify.time)/record.length)+(initial?0:1):0,last=record.p.loop?Math.floor((end-notify.time)/record.length):0;
        const count=last-first+1;if(count>animationSyncLimits.crossings)throw Error('애니메이션 알림 경계 한도4096');
        for(let cycle=first;cycle<=last;cycle++){const at=cycle*record.length+notify.time;if(at<0||at>end||!(at>start||initial&&at===start))continue;if(pending.length+this.owner.events.length>=4096)throw Error('애니메이션 이벤트 한도4096');pending.push({fraction:end===start?0:(at-start)/(end-start),event:animationNotifyPayload(record,notify,cycle,{name:notify.name,phase:'notify',time:notify.time,weight})});}
      }
    }
    this.notifies.resolve(notifyWeights,pending,delta);for(const record of weights.keys())record.fresh=false;
    pending.sort((a,b)=>a.fraction-b.fraction);for(const item of pending)this.owner.queueEvent(item.event);
  }
  snapshot(){return [...this.groups.values()].map(g=>({name:g.name,phase:g.phase,method:g.method,marker:g.marker,leader:{id:g.record.id,name:this.owner.nodes.get(g.record.id).name,context:g.record.context.key},participants:g.records.map(r=>({id:r.id,context:r.context.key,weight:r.weight,notifyWeight:r.notifyWeight,role:r.sync.role,time:r.absolute,leader:r.leader}))}));}
  dispose(){this.groups.clear();this.notifies.dispose();}
}
