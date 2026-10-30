// Immutable playback snapshots: one winner for each half-open interval. Build
// once at Play; point queries allocate nothing and never sort overlapping clips.
export class IntervalSelectionIndex{
 constructor(items,{compare,threshold=32}={}){
  this.items=items;this.ranks=null;this.starts=null;this.ends=null;this.winners=null;
  if(compare){this.ranks=new Uint32Array(items.length);items.map((item,index)=>({item,index})).sort((a,b)=>compare(a.item,b.item)||a.index-b.index).forEach((row,rank)=>this.ranks[row.index]=rank);}
  if(items.length<threshold)return;
  const events=[];for(let index=0;index<items.length;index++){const item=items[index],end=item.start+item.duration;if(end>item.start){events.push({time:item.start,index,begin:true},{time:end,index,begin:false});}}
  events.sort((a,b)=>a.time-b.time||Number(a.begin)-Number(b.begin)||a.index-b.index);
  const active=new Uint8Array(items.length),heap=[],rank=index=>this.ranks?this.ranks[index]:index,starts=[],ends=[],winners=[];
  const push=index=>{let at=heap.length;heap.push(index);while(at){const parent=(at-1)>>>1;if(rank(heap[parent])<=rank(index))break;heap[at]=heap[parent];at=parent;}heap[at]=index;};
  const pop=()=>{const last=heap.pop();if(!heap.length)return;let at=0;while(at*2+1<heap.length){let next=at*2+1;if(next+1<heap.length&&rank(heap[next+1])<rank(heap[next]))next++;if(rank(last)<=rank(heap[next]))break;heap[at]=heap[next];at=next;}heap[at]=last;};
  for(let at=0;at<events.length;){const time=events[at].time;do{const event=events[at++];active[event.index]=Number(event.begin);if(event.begin)push(event.index);}while(at<events.length&&events[at].time===time);while(heap.length&&!active[heap[0]])pop();const end=events[at]?.time;if(!heap.length||end===undefined||end<=time)continue;const winner=heap[0],last=winners.length-1;if(last>=0&&winners[last]===winner&&ends[last]===time)ends[last]=end;else{starts.push(time);ends.push(end);winners.push(winner);}}
  this.starts=Float64Array.from(starts);this.ends=Float64Array.from(ends);this.winners=Uint32Array.from(winners);
 }
 first(time,metrics){
  if(metrics)Object.assign(metrics,{items:0,comparisons:0,sourceItems:this.items.length,segments:this.starts?.length??0});if(!Number.isFinite(time))return undefined;
  if(!this.starts){let winner;for(let index=0;index<this.items.length;index++){if(metrics)metrics.items++;const item=this.items[index];if(item.start<=time&&time<item.start+item.duration&&(winner===undefined||this.ranks[index]<this.ranks[winner])){winner=index;if(!this.ranks||this.ranks[index]===0)break;}}return winner===undefined?undefined:this.items[winner];}
  let low=0,high=this.starts.length;while(low<high){if(metrics)metrics.comparisons++;const middle=(low+high)>>>1;if(this.starts[middle]<=time)low=middle+1;else high=middle;}const index=low-1;return index>=0&&time<this.ends[index]?this.items[this.winners[index]]:undefined;
 }
}
const shotPriority=(a,b)=>a.row-b.row||b.start-a.start||(a.id<b.id?-1:a.id>b.id?1:0);
export class SequenceSectionSampler{
 constructor(sections){const shots=sections.filter(s=>s.kind==='shot'&&!s.muted);this.selection=new IntervalSelectionIndex(shots,{compare:shotPriority});this.boundaries=Float64Array.from([...new Set(shots.flatMap(s=>[s.start,s.start+s.duration]))].sort((a,b)=>a-b));}
 shot(time,metrics){return this.selection.first(time,metrics)?.id;}
 boundariesBetween(start,end){let low=0,high=this.boundaries.length;while(low<high){const middle=(low+high)>>>1;if(this.boundaries[middle]<=start)low=middle+1;else high=middle;}const result=[];while(low<this.boundaries.length&&this.boundaries[low]<end)result.push(this.boundaries[low++]);return result;}
}
