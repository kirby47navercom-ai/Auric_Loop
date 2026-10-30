// Remap value sampling only. Event ranges, clips, parent/spawn references and
// skeletal-state lifetimes keep their original sequence clock.
export function repeatedSequenceTime(keys,time,track){
 if(keys.length<2)return time;const first=keys[0].time,last=keys.at(-1).time;
 if(time>=first&&time<=last)return time;const mode=track[time<first?'preInfinity':'postInfinity'],duration=last-first;
 if(mode!=='cycle'&&mode!=='oscillate'||!(duration>0))return time;
 const cycles=Math.floor((time-first)/duration),phase=time-first-cycles*duration;
 return mode==='oscillate'&&Math.abs(cycles%2)===1?last-phase:first+phase;
}
