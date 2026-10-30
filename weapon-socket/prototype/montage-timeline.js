import {SequenceEventIndex} from './sequence-event-index.js';
// Captured Play data. Section order/boundaries are prepared once, and dense
// point-notify arrays reuse the existing range index and reentrant iterator.
export class MontageTimeline{
 constructor(data){
  this.sections=[...data.sections].sort((a,b)=>a.time-b.time);this.names=new Map(this.sections.map(s=>[s.name,s]));this.ends=new Map();const times=[],first=[];
  for(let index=0;index<this.sections.length;){const from=index,time=this.sections[index].time;times.push(time);first.push(this.sections[index]);while(index<this.sections.length&&this.sections[index].time===time)index++;const end=this.sections[index]?.time??data.length;for(let i=from;i<index;i++)this.ends.set(this.sections[i],end);}
  this.times=Float64Array.from(times);this.first=first;this.rawNotifies=data.notifies;this.eventTrack=data.notifies.length>=32?{type:'event',keys:data.notifies}:null;this.eventIndex=this.eventTrack?new SequenceEventIndex([this.eventTrack]):null;
 }
 section(name){return this.names.get(name);}
 end(section){return this.ends.get(section);}
 at(time){let low=0,high=this.times.length;while(low<high){const middle=(low+high)>>>1;if(this.times[middle]<=time)low=middle+1;else high=middle;}return this.first[low-1];}
 notifies(begin,end,initial){return this.eventIndex?this.eventIndex.range(this.eventTrack,{begin,end,initial}):this.rawNotifies;}
}
