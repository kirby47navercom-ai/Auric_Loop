// Immutable prepared keys/templates; no clone or linear key scan on each seek.
export class SequenceSpawnProgram{
 constructor(track){let object=track.object;this.empty={value:false,object};this.keys=[...track.keys].sort((a,b)=>a.time-b.time).map(key=>{if(key.object!==undefined)object=key.object;return {time:key.time,value:key.value,object};});}
 sample(time){let lo=0,hi=this.keys.length;while(lo<hi){const mid=(lo+hi)>>>1;if(this.keys[mid].time<=time)lo=mid+1;else hi=mid;}return this.keys[lo-1]||this.empty;}
}
