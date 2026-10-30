// Prepare only event tracks. Keep authored order within each visited range,
// including unsorted source keys and equal-time duplicates; reverse visits invert authored order.
export class SequenceEventIndex {
  constructor(tracks){
    this.entries=new Map();
    for(const track of tracks)if(track.type==='event'){
      const order=Uint32Array.from({length:track.keys.length},(_,i)=>i);order.sort((a,b)=>track.keys[a].time-track.keys[b].time||a-b);
      this.entries.set(track,{order,keys:Array.from(order,i=>track.keys[i])});
    }
  }
  keys(track){return this.entries.get(track)?.keys;}
  *range(track,{begin,end,initial=false,endExclusive=false,beginExclusive=false}){
    const entry=this.entries.get(track);if(!entry||!Number.isFinite(begin)||!Number.isFinite(end))return;
    const {keys,order}=entry,bound=(value,inclusive)=>{let lo=0,hi=keys.length;while(lo<hi){const mid=(lo+hi)>>>1;if(inclusive?keys[mid].time<=value:keys[mid].time<value)lo=mid+1;else hi=mid;}return lo;};
    const includeInitial=initial&&!beginExclusive,reverse=end<begin,first=reverse?bound(end,endExclusive):bound(begin,!includeInitial);let last=reverse?bound(begin,includeInitial):bound(end,!endExclusive);if(includeInitial&&!reverse)last=Math.max(last,bound(begin,true));
    if(last<=first)return;
    // Private per-iteration candidates stay valid across awaited/reentrant events.
    const matches=Uint32Array.from({length:last-first},(_,i)=>first+i);matches.sort((a,b)=>(reverse?-1:1)*(order[a]-order[b]));
    for(const index of matches)yield keys[index];
  }
  info(){let indexBytes=0;for(const e of this.entries.values())indexBytes+=e.order.byteLength;return {tracks:this.entries.size,indexBytes,rangeScratch:'4 bytes per matching key; no whole-track scan/temporary selection array on empty ranges'};}
}
