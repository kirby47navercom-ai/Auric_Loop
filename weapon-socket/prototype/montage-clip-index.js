import {IntervalSelectionIndex} from './sequence-interval-selection.js';
const authored=(a,b)=>a.index-b.index;
// Dense per-slot schedules benefit from prepared queries regardless of slot count.
// Invalid overlaps, sparse per-slot documents and dense crossed ranges keep traversal.
export class MontageClipIndex{
 constructor(data){
  this.enabled=false;this.groups=[];this.samples=[];this.ranges=[];this.rangeBusy=false;this.count=data.clips.length;this.length=data.length;
  if(this.count<32||!Number.isFinite(data.length)||data.length<=0)return;const groups=new Map();
  data.clips.forEach((segment,index)=>{const name=segment.slot||'DefaultSlot';if(!groups.has(name))groups.set(name,[]);groups.get(name).push({segment,index,start:segment.start,duration:segment.duration});});
  if(this.count/groups.size<32)return;
  for(const entries of groups.values()){
   entries.sort((a,b)=>a.start-b.start||a.index-b.index);
   if(entries.some((entry,i)=>!Number.isFinite(entry.start)||!Number.isFinite(entry.duration)||entry.duration<=0||entry.start<0||entry.start+entry.duration>data.length||i&&entries[i-1].start+entries[i-1].duration>entry.start)){this.groups.length=0;return;}
   this.groups.push({entries,selection:new IntervalSelectionIndex(entries),final:entries.find(e=>e.start+e.duration===data.length),from:0,to:0});
  }this.enabled=true;
 }
 sample(time){
  if(!this.enabled||!Number.isFinite(time))return null;this.samples.length=0;
  for(const group of this.groups){const entry=group.selection.first(time)||(time===this.length?group.final:null);if(entry)this.samples.push(entry);}
  this.samples.sort(authored);return this.samples;
 }
 range(previous,current,metrics){
  if(!this.enabled||this.rangeBusy||!Number.isFinite(previous)||!Number.isFinite(current))return null;
  this.ranges.length=0;if(metrics)Object.assign(metrics,{comparisons:0,candidates:0,sourceItems:this.count,denseFallback:false});if(current<=previous)return this.ranges;
  if(previous<=0&&current>=this.length){if(metrics)Object.assign(metrics,{candidates:this.count,denseFallback:true});return null;}
  let count=0;for(const group of this.groups){const items=group.entries;let low=0,high=items.length;while(low<high){if(metrics)metrics.comparisons++;const middle=(low+high)>>>1;if(items[middle].start+items[middle].duration<=previous)low=middle+1;else high=middle;}group.from=low;low=0;high=items.length;while(low<high){if(metrics)metrics.comparisons++;const middle=(low+high)>>>1;if(items[middle].start<current)low=middle+1;else high=middle;}group.to=low;count+=Math.max(0,group.to-group.from);}
  if(metrics)metrics.candidates=count;if(count>this.count/4){if(metrics)metrics.denseFallback=true;return null;}
  for(const group of this.groups)for(let i=group.from;i<group.to;i++)this.ranges.push(group.entries[i]);this.ranges.sort(authored);return this.ranges;
 }
}
