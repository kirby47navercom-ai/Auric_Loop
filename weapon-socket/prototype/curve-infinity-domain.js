// Explicit authored period plus finite bake intervals. Values remain ordinary
// visible keys; no second copy of the source curve is stored in the asset.
const prepared=new WeakMap();
export function validCurveInfinityDomain(track){
 const d=track.infinityDomain;if(d===undefined)return true;if(!d||typeof d!=='object'||Array.isArray(d)||Object.keys(d).some(k=>!['start','end','ranges'].includes(k))||![d.start,d.end].every(Number.isFinite)||d.end<=d.start||!Array.isArray(d.ranges)||!d.ranges.length||!Array.isArray(track.keys)||d.ranges.length>track.keys.length)return false;
 const times=new Set(track.keys.map(k=>k.time));if(!times.has(d.start)||!times.has(d.end))return false;let end=-Infinity;for(const r of d.ranges){if(!r||Object.keys(r).some(k=>!['start','end'].includes(k))||![r.start,r.end].every(Number.isFinite)||r.start>=r.end||r.start<=end||!times.has(r.start)||!times.has(r.end))return false;end=r.end;}return true;
}
export function curveDomainBase(keys,track,time){
 const d=track.infinityDomain;if(!d||time>=d.start&&time<=d.end)return null;
 let row=prepared.get(keys);if(!row||row.domain!==d){let first=0,last=keys.length-1;while(first<keys.length&&keys[first].time<d.start)first++;while(last>=0&&keys[last].time>d.end)last--;row={domain:d,keys:keys.slice(first,last+1)};prepared.set(keys,row);}
 let low=0,high=d.ranges.length;while(low<high){const mid=(low+high)>>>1;if(d.ranges[mid].start<=time)low=mid+1;else high=mid;}if(low&&time<=d.ranges[low-1].end)return null;return row.keys;
}
export function mergeCurveBakeRanges(ranges,start,end){const rows=[...ranges,{start,end}].sort((a,b)=>a.start-b.start),out=[];for(const row of rows){const previous=out.at(-1);if(previous&&row.start<=previous.end)previous.end=Math.max(previous.end,row.end);else out.push({...row});}return out;}
