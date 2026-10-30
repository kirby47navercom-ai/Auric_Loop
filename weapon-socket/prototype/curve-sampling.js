import {validCurveInfinityDomain,curveDomainBase} from './curve-infinity-domain.js';
// A segment already selected by the caller's binary search. Slopes are units/s,
// independent of key spacing; undefined handles use the neighbouring secant.
export const curveModes=['auto','clampedAuto','user','break','linear','constant','step'];
export const curveInfinityModes=['constant','linear','cycle','cycleOffset','oscillate'];
export function validCurveInfinity(track,numeric=true){return (track.infinityDomain===undefined||numeric)&&validCurveInfinityDomain(track)&&['preInfinity','postInfinity'].every(p=>track[p]===undefined||curveInfinityModes.includes(track[p])&&(numeric||track[p]==='constant'))&&(!numeric||track.keys===undefined||validCurveTimeHandles(track.keys,track.interpolation||'linear'));}
// Default/inside samples keep the old path. Only explicit outside modes do work.
export function sampleCurveOutside(keys,time,track={},defaultMode='linear',skipDomain=false){
 const base=skipDomain?null:curveDomainBase(keys,track,time);if(base){const value=sampleCurveOutside(base,time,track,defaultMode,true);return value===undefined?structuredClone(time<track.infinityDomain.start?base[0].value:base.at(-1).value):value;}if(keys.length<2)return undefined;const first=keys[0],last=keys.at(-1);if(time>=first.time&&time<=last.time)return undefined;const before=time<first.time,mode=track[before?'preInfinity':'postInfinity'];if(!mode||mode==='constant')return undefined;
 const duration=last.time-first.time;if(!(duration>0))return undefined;
 const component=(v,c)=>Array.isArray(v)?v[c]:v;
 if(mode==='linear'){const index=before?0:keys.length-1,key=keys[index],interpolation=key.interpolation||track.interpolation||defaultMode;return Array.isArray(key.value)?key.value.map((v,c)=>v+(time-key.time)*(['constant','step'].includes(interpolation)?0:curveKeyTangent(keys,index,c,before?'arriveTangent':'leaveTangent',track.interpolation||defaultMode))):key.value+(time-key.time)*(['constant','step'].includes(interpolation)?0:curveKeyTangent(keys,index,0,before?'arriveTangent':'leaveTangent',track.interpolation||defaultMode));}
 const cycles=Math.floor((time-first.time)/duration),phase=time-first.time-cycles*duration,mapped=mode==='oscillate'&&Math.abs(cycles%2)===1?last.time-phase:first.time+phase;
 let low=0,high=keys.length;while(low<high){const middle=(low+high)>>>1;if(keys[middle].time<=mapped)low=middle+1;else high=middle;}const value=sampleCurveSegment(keys,Math.max(0,low-1),mapped,track.interpolation||defaultMode);if(mode!=='cycleOffset')return value;
 return Array.isArray(value)?value.map((v,c)=>v+cycles*(component(last.value,c)-component(first.value,c))):value+cycles*(last.value-first.value);
}
export const curveWeightLimit=4/3;
export function curveTimeMonotone(w0,w1){if(![w0,w1].every(v=>Number.isFinite(v)&&v>=0&&v<=curveWeightLimit+1e-12))return false;const a=3*(w0+w1)-2,b=2*(1-w1-2*w0),t=a>0?-b/(2*a):-1;return t<=0||t>=1||w0+b*t+a*t*t>=-1e-12;}
export function validCurveTimeHandles(keys,defaultMode='linear'){if(!Array.isArray(keys)||keys.some(k=>!k||typeof k!=='object'))return false;for(let i=0;i<keys.length-1;i++){const a=keys[i],b=keys[i+1];if(!a||!b)return false;const mode=a.interpolation||defaultMode;if(['linear','constant','step'].includes(mode))continue;for(let c=0;c<(Array.isArray(a.value)?a.value.length:1);c++)if(!curveTimeMonotone(mode==='clampedAuto'?1/3:curveKeyWeight(a,c,'leaveWeight'),(b.interpolation||defaultMode)==='clampedAuto'?1/3:curveKeyWeight(b,c,'arriveWeight')))return false;}return true;}
export function validCurveWeights(key,value){if(!key||typeof key!=='object')return false;return ['arriveWeight','leaveWeight','arriveControl','leaveControl'].every(p=>{const valid=v=>Number.isFinite(v)&&(p.endsWith('Weight')?v>=0&&v<=curveWeightLimit+1e-12:Math.abs(v)<=1e12);return key[p]===undefined||(Array.isArray(value)?Array.isArray(key[p])&&key[p].length===value.length&&key[p].every(valid):typeof value==='number'&&valid(key[p]));});}
export function curveKeyWeight(key,channel,field){const value=key[field];return (Array.isArray(value)?value[channel]:value)??1/3;}
// Weighted handles store horizontal fractions of the adjacent time interval.
// Invert monotone Bezier time; no tables, allocations or per-frame preparation.
function bezier(a,b,c,d,t){const s=1-t;return s*s*s*a+3*s*s*t*b+3*s*t*t*c+t*t*t*d;}
export function curveBezierParameter(u,w0,w1){
 if(u<=0)return 0;if(u>=1)return 1;
 // At a stationary cubic, ordinary x equality loses cube-root accuracy.
 // Use its centered form and snap only the floating-point critical time.
 const a=3*(w0+w1)-2,b=2*(1-w1-2*w0),c=w0,t0=a>0?-b/(2*a):-1;
 if(t0>=0&&t0<=1&&Math.abs(c+b*t0+a*t0*t0)<=Number.EPSILON*16*Math.max(1,Math.abs(a),Math.abs(b),Math.abs(c))){const x0=bezier(0,w0,1-w1,1,t0),difference=u-x0;return Math.max(0,Math.min(1,t0+(Math.abs(difference)<=Number.EPSILON*4?0:Math.cbrt(difference/a))));}
 let low=0,high=1,t=u;
 for(let i=0;i<48;i++){const x=bezier(0,w0,1-w1,1,t);if(x===u)break;if(x<u)low=t;else high=t;const d=3*((1-t)**2*w0+2*(1-t)*t*(1-w1-w0)+t*t*w1),next=t-(x-u)/d;t=i<8&&Number.isFinite(next)&&next>low&&next<high?next:(low+high)/2;}
 return t;
}
function weightedValue(u,start,end,m0,m1,duration,w0,w1,control0,control1){
 return bezier(start,start+(control0??duration*m0*w0),end+(control1??-duration*m1*w1),end,curveBezierParameter(u,w0,w1));
}
// PCHIP slopes preserve each monotone interval, including uneven key spacing.
// No precomputed tangent cache: neighbour edits cannot leave stale derivatives.
function clampedTangent(keys,index,part){
 if(keys.length<2)return 0;const slope=i=>(part(keys[i+1].value)-part(keys[i].value))/(keys[i+1].time-keys[i].time);
 if(keys.length===2)return slope(0);
 if(index===0||index===keys.length-1){const reverse=index!==0,a=reverse?keys.length-2:0,b=reverse?a-1:1,h0=keys[a+1].time-keys[a].time,h1=keys[b+1].time-keys[b].time,d0=slope(a),d1=slope(b),m=((2*h0+h1)*d0-h0*d1)/(h0+h1);return Math.sign(m)!==Math.sign(d0)?0:Math.sign(d0)!==Math.sign(d1)&&Math.abs(m)>3*Math.abs(d0)?3*d0:m;}
 const left=slope(index-1),right=slope(index);if(left===0||right===0||Math.sign(left)!==Math.sign(right))return 0;const h0=keys[index].time-keys[index-1].time,h1=keys[index+1].time-keys[index].time,w0=2*h1+h0,w1=h1+2*h0;return (w0+w1)/(w0/left+w1/right);
}
export function curveKeyTangent(keys,index,channel,field,defaultMode='auto'){const part=v=>Array.isArray(v)?v[channel]:v,key=keys[index];if((key.interpolation||defaultMode)==='clampedAuto')return clampedTangent(keys,index,part);if(key.arriveControl!==undefined||key.leaveControl!==undefined){const base=field==='arriveTangent'?'arrive':'leave',control=part(key[base+'Control']);if(control!==undefined){const neighbour=keys[index+(base==='arrive'?-1:1)],dx=neighbour?(neighbour.time-key.time)*curveKeyWeight(key,channel,base+'Weight'):0;if(dx!==0)return control/dx;}}const explicit=part(key[field]);if(explicit!==undefined)return explicit;const lo=keys[Math.max(0,index-1)],hi=keys[Math.min(keys.length-1,index+1)];return hi.time===lo.time?0:(part(hi.value)-part(lo.value))/(hi.time-lo.time);}
export function curveStoredTangent(keys,index,channel,field,defaultMode='auto'){const value=curveKeyTangent(keys,index,channel,field,defaultMode),control=keys[index][field.replace('Tangent','Control')];return control!==undefined&&(!Number.isFinite(value)||Math.abs(value)>100000)?0:value;}
export function curveControlValue(keys,index,channel,base,defaultMode='auto'){const key=keys[index],part=v=>Array.isArray(v)?v[channel]:v,mode=key.interpolation||defaultMode,explicit=mode==='clampedAuto'?undefined:part(key[base+'Control']);if(explicit!==undefined)return explicit;const neighbour=keys[index+(base==='arrive'?-1:1)];return neighbour?(neighbour.time-key.time)*(mode==='clampedAuto'?1/3:curveKeyWeight(key,channel,base+'Weight'))*curveKeyTangent(keys,index,channel,base+'Tangent',defaultMode):0;}
export function updateCurveControl(keys,index,channel,base,slope){const key=keys[index],field=base+'Control',neighbour=keys[index+(base==='arrive'?-1:1)];if(key[field]===undefined)return;const value=(neighbour?neighbour.time-key.time:0)*curveKeyWeight(key,channel,base+'Weight')*slope;if(Array.isArray(key[field]))key[field][channel]=value;else key[field]=value;}
export const curveControlContract={fields:['arriveControl','leaveControl'],units:'Optional signed Y offsets from key value to control point, matching scalar/vector shape, finite within ±1e12. Weight remains horizontal fraction of adjacent interval.',time:'Each weight0..4/3; both endpoint controls must give nonnegative Bezier time derivative over the entire segment. Validation rejects reversing-time pairs, not just individual fields.',vertical:'Weight0 with nonzero value control is exact vertical geometry. Finite stored tangent is only a compatibility proxy; UI shows vertical placeholder. Explicit value controls override slopes, except clampedAuto ignores explicit controls/weights.',editing:'Vertical pointer drag keeps zero weight and outgoing linear interpolation for incoming-only handles. Numeric tangent converts that side to its finite slope; weight edit moves X while explicit Y stays authored. Time/value transforms and selected-axis tools/clipboard preserve offsets.',compatibility:'Absent fields keep old Hermite/weighted sampling, without migration or new caches. New explicit controls require an updated engine. Exact subdivision may emit controls and extended weights; outside-key-domain partial bake supports constant/linear tails through ordinary keys; periodic outside-domain partial bake stores an explicit original infinityDomain plus finite bake ranges, retaining ordinary visible keys.'};
export function sampleCurveSegment(keys,index,time,defaultMode='linear'){
 const a=keys[index],b=keys[index+1],mode=a.interpolation||defaultMode;
 if(!b||time<=a.time||mode==='step'||mode==='constant')return structuredClone(a.value);
 const duration=b.time-a.time,u=Math.max(0,Math.min(1,(time-a.time)/duration)),part=(v,c)=>Array.isArray(v)?v[c]:v;
 const interpolate=(v,c)=>{const end=part(b.value,c);if(mode==='linear')return v+(end-v)*u;const m0=curveKeyTangent(keys,index,c,'leaveTangent',defaultMode),m1=curveKeyTangent(keys,index+1,c,'arriveTangent',defaultMode),w0=mode==='clampedAuto'?1/3:curveKeyWeight(a,c,'leaveWeight'),w1=(b.interpolation||defaultMode)==='clampedAuto'?1/3:curveKeyWeight(b,c,'arriveWeight'),control0=mode==='clampedAuto'?undefined:part(a.leaveControl,c),control1=(b.interpolation||defaultMode)==='clampedAuto'?undefined:part(b.arriveControl,c);if(w0!==1/3||w1!==1/3||control0!==undefined||control1!==undefined)return weightedValue(u,v,end,m0,m1,duration,w0,w1,control0,control1);return (2*u**3-3*u*u+1)*v+(u**3-2*u*u+u)*duration*m0+(-2*u**3+3*u*u)*end+(u**3-u*u)*duration*m1;};
 return Array.isArray(a.value)?a.value.map(interpolate):interpolate(a.value,0);
}
