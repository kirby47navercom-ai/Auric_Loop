// Validated immutable key arrays own their prepared segments and turning points.
// UI edits replace the array. No per-sample sorting, root solving or PCM copies.
const programs=new WeakMap();
const slope=(keys,i)=>(keys[Math.min(keys.length-1,i+1)].value-keys[Math.max(0,i-1)].value)/(keys[Math.min(keys.length-1,i+1)].time-keys[Math.max(0,i-1)].time);
const valueAt=(s,u)=>u===0?s.value:u===1?s.endValue:s.step?s.value:((s.a*u+s.b)*u+s.c)*u+s.value;
const derivativeAt=(s,u)=>(3*s.a*u+2*s.b)*u+s.c;
const supportedExtension=rate=>Number.isFinite(rate)&&Number.isFinite((86400+rate*86400)*100);
function linearProgram(keys){
 let firstSlope,lastSlope;for(let i=0;i<keys.length-1;i++){const rate=(keys[i+1].value-keys[i].value)/(keys[i+1].time-keys[i].time);if(!Number.isFinite(rate))throw Error('시간 곡선 기울기의 수치 범위를 넘었어요.');if(i===0)firstSlope=rate;lastSlope=rate;}if(!supportedExtension(firstSlope)||!supportedExtension(lastSlope))throw Error('시간 곡선 양 끝 연장의 수치 범위를 넘었어요.');
 const program={linear:true,boundaries:keys.map(k=>k.time),firstSlope,lastSlope,min:Math.min(...keys.map(k=>k.value)),max:Math.max(...keys.map(k=>k.value))};
 // The renderer/edit-only split helpers need descriptors; ordinary linear
 // runtime queries retain only key times, never256 interval objects.
 Object.defineProperty(program,'segments',{configurable:true,get(){const segments=keys.slice(0,-1).map((x,i)=>{const y=keys[i+1],span=y.time-x.time,m=(y.value-x.value)/span;return{time:x.time,end:y.time,span,value:x.value,endValue:y.value,cubic:false,m0:m,m1:m,a:0,b:0,c:y.value-x.value,turns:[]};});Object.defineProperty(program,'segments',{value:segments});return segments;}});return program;
}
function roots(a,b,c){const scale=Math.max(Math.abs(a),Math.abs(b),Math.abs(c));if(!scale)return [];a/=scale;b/=scale;c/=scale;if(a===0)return b===0?[]:[-c/b];const disc=b*b-4*a*c;if(disc<0)return [];if(disc===0)return[-b/(2*a)];const q=-.5*(b+(b<0?-1:1)*Math.sqrt(disc));return[q/a,c/q];}
export function prepareTimeWarp(keys,{refresh=false}={}){
 let program=programs.get(keys);if(program&&!refresh)return program;if(!keys.some((k,i)=>i<keys.length-1&&['cubic','step'].includes(k.interpolation))){program=linearProgram(keys);programs.set(keys,program);return program;}const segments=[],boundaries=keys.map(k=>k.time),jumps=[];let min=Infinity,max=-Infinity;
 for(let i=0;i<keys.length-1;i++){
  const x=keys[i],y=keys[i+1],span=y.time-x.time,cubic=x.interpolation==='cubic',step=x.interpolation==='step',m0=step?0:cubic?(x.outTangent??slope(keys,i)):(y.value-x.value)/span,m1=cubic?(y.inTangent??slope(keys,i+1)):m0,delta=y.value-x.value,t0=m0*span,t1=m1*span,a=cubic?-2*delta+t0+t1:0,b=cubic?3*delta-2*t0-t1:0,c=step?0:cubic?t0:delta,s={time:x.time,end:y.time,span,value:x.value,endValue:y.value,cubic,step,m0,m1,a,b,c,turns:[]};if(step&&x.value!==y.value)jumps.push(y.time);
  if(![span,m0,m1,a,b,c,6*a,2*b].every(Number.isFinite))throw Error('시간 곡선 기울기의 수치 범위를 넘었어요.');
  for(const u of roots(3*a,2*b,c))if(u>0&&u<1){const time=x.time+u*span;if(time>x.time&&time<y.time&&!s.turns.some(t=>t.time===time)){s.turns.push({time,u});boundaries.push(time);}}
  for(const u of[0,1,...s.turns.map(t=>t.u),...(a&&-b/(3*a)>0&&-b/(3*a)<1?[-b/(3*a)]:[])]){const value=valueAt(s,u),rate=derivativeAt(s,u)/span;if(!Number.isFinite(value)||Math.abs(value)>86400||!Number.isFinite(rate))throw Error('시간 곡선 값·기울기가 유한해야 해요.');min=Math.min(min,value);max=Math.max(max,value);}segments.push(s);
 }
 const firstSlope=segments[0].m0,lastSlope=segments.at(-1).m1;for(const rate of[firstSlope,lastSlope])if(!Number.isFinite((86400+rate*86400)*100))throw Error('시간 곡선 양 끝 연장의 수치 범위를 넘었어요.');
 program={segments,boundaries:[...new Set(boundaries)].sort((a,b)=>a-b),jumps,firstSlope,lastSlope,min,max};programs.set(keys,program);return program;
}
function indexAt(keys,time,before=false){let lo=0,hi=keys.length;while(lo<hi){const mid=(lo+hi)>>>1;if(before?keys[mid].time<time:keys[mid].time<=time)lo=mid+1;else hi=mid;}return Math.max(0,Math.min(keys.length-2,lo-1));}
export function sampleTimeWarp(keys,time){const p=prepareTimeWarp(keys),last=keys.at(-1);if(time<0)return p.firstSlope*time;if(time>last.time)return last.value+p.lastSlope*(time-last.time);const i=indexAt(keys,time);if(p.linear){const a=keys[i],b=keys[i+1];return time===a.time?a.value:time===b.time?b.value:a.value+(b.value-a.value)*(time-a.time)/(b.time-a.time);}const s=p.segments[i];return valueAt(s,(time-s.time)/s.span);}
export function timeWarpRate(keys,time,direction=1){const p=prepareTimeWarp(keys);if(time<0)return p.firstSlope;if(time>keys.at(-1).time)return p.lastSlope;const i=indexAt(keys,time,direction<0);if(p.linear)return(keys[i+1].value-keys[i].value)/(keys[i+1].time-keys[i].time);const s=p.segments[i];if(s.turns.some(t=>t.time===time))return 0;const u=(time-s.time)/s.span;return u===0?s.m0:u===1?s.m1:derivativeAt(s,u)/s.span;}
export function timeWarpApproach(keys,time,direction=1){
 const p=prepareTimeWarp(keys);if(p.linear){for(let i=indexAt(keys,time,direction>0);i>=0&&i<keys.length-1;i-=direction){const value=keys[i+1].value-keys[i].value;if(value)return Math.sign(value)*direction;}return 0;}if(p.jumps.includes(time))return 0;if(direction<0&&time>=keys.at(-1).time&&p.lastSlope===0)return 0;if(time<0&&p.firstSlope)return Math.sign(p.firstSlope)*direction;if(time>keys.at(-1).time&&p.lastSlope)return Math.sign(p.lastSlope)*direction;
 for(let i=indexAt(keys,time,direction>0),first=true;i>=0&&i<p.segments.length;i-=direction,first=false){const s=p.segments[i];if(s.step&&s.value!==s.endValue)return 0;const u=first?Math.max(0,Math.min(1,(time-s.time)/s.span)):direction>0?1:0,turn=s.turns.some(t=>t.time===time),d=turn?0:derivativeAt(s,u);if(d)return Math.sign(d)*direction;const second=6*s.a*u+2*s.b;if(second)return-Math.sign(second);if(s.a)return Math.sign(s.a)*direction;}
 return 0;
}
export function timeWarpCuts(keys,start,end){const a=prepareTimeWarp(keys).boundaries;let lo=0,hi=a.length;while(lo<hi){const mid=(lo+hi)>>>1;if(a[mid]<=start)lo=mid+1;else hi=mid;}const result=[];for(;lo<a.length&&a[lo]<end;lo++)result.push(a[lo]);return result;}
export function freezeTimeWarpTangents(keys){const out=keys.map(k=>({...k}));const segments=prepareTimeWarp(keys).segments;for(let i=0;i<segments.length;i++){const s=segments[i];if(s.cubic){out[i].outTangent=s.m0;out[i+1].inTangent=s.m1;}}return out;}

export function localTimeWarpBoundary(keys,time,offset){const local=time-offset;if(!keys)return local;const a=prepareTimeWarp(keys).boundaries;let lo=0,hi=a.length;while(lo<hi){const mid=(lo+hi)>>>1;if(a[mid]<local)lo=mid+1;else hi=mid;}for(let i=Math.max(0,lo-1);i<=Math.min(a.length-1,lo);i++)if(offset+a[i]===time)return a[i];return local;}
// A step jump is a silent seek: one-sided limits keep the skipped source
// interval out of event visits in either traversal direction.
export function sampleTimeWarpSide(keys,time,side=0){if(side<0){const p=prepareTimeWarp(keys);if(!p.linear){const i=indexAt(keys,time,true),s=p.segments[i];if(s.step&&time===s.end)return s.value;}}return sampleTimeWarp(keys,time);}
export function timeWarpCrossedJump(keys,begin,end,offset=0){if(!keys||begin===end)return false;const jumps=prepareTimeWarp(keys).jumps;if(!jumps?.length)return false;const lo=Math.min(begin,end),hi=Math.max(begin,end);let a=0,b=jumps.length;while(a<b){const mid=(a+b)>>>1;if(offset+jumps[mid]<=lo)a=mid+1;else b=mid;}return a<jumps.length&&offset+jumps[a]<=hi;}
