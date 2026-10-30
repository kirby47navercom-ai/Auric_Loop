export const sequenceKeyLimits={perTrack:65536,defaultTotal:262144,maximumTotal:1000000,propertyPage:32};
export function validSequenceKeyBudget(data){
  const budget=data.keyBudget??sequenceKeyLimits.defaultTotal;
  if(!Number.isSafeInteger(budget)||budget<1||budget>sequenceKeyLimits.maximumTotal||!Array.isArray(data.tracks)||data.tracks.length>256)return false;
  let total=0;for(const track of data.tracks){if(!Array.isArray(track?.keys)||track.keys.length>sequenceKeyLimits.perTrack)return false;total+=track.keys.length;if(total>budget)return false;for(const clip of track.clips||[]){if(clip.volumeCurve===undefined)continue;if(!Array.isArray(clip.volumeCurve)||clip.volumeCurve.length>sequenceKeyLimits.perTrack)return false;total+=clip.volumeCurve.length;if(total>budget)return false;}}if(data.sections!==undefined&&!Array.isArray(data.sections))return false;for(const section of data.sections||[]){if(section?.weightCurve===undefined)continue;if(!Array.isArray(section.weightCurve)||section.weightCurve.length>sequenceKeyLimits.perTrack)return false;total+=section.weightCurve.length;if(total>budget)return false;}return true;
}
// Overview markers are presentation only. All authored indices remain stable.
export function sequenceOverviewKeyIndices(keys,duration,width=800,selected=-1,range){
  if(!keys.length)return [];
  const bins=Math.min(keys.length,Math.max(1,Math.ceil(Math.min(16384,Math.max(1,Number.isFinite(width)?width:800))/8))),first=new Int32Array(bins).fill(-1),last=new Int32Array(bins).fill(-1);
  const start=range?.start??0,end=range?.end??duration;if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start)throw Error('키 개요의 시간 범위를 확인하세요.');
  for(let i=0;i<keys.length;i++){if(keys[i].time<start||keys[i].time>end)continue;const bin=Math.max(0,Math.min(bins-1,Math.floor((keys[i].time-start)/Math.max(Number.MIN_VALUE,end-start)*bins))),a=first[bin],b=last[bin];if(a<0||keys[i].time<keys[a].time)first[bin]=i;if(b<0||keys[i].time>=keys[b].time)last[bin]=i;}
  const keep=new Set();for(const index of [0,keys.length-1])if(keys[index].time>=start&&keys[index].time<=end)keep.add(index);for(let i=0;i<bins;i++)if(first[i]>=0){keep.add(first[i]);keep.add(last[i]);}
  if(Number.isInteger(selected)&&selected>=0&&selected<keys.length&&keys[selected].time>=start&&keys[selected].time<=end)keep.add(selected);
  return [...keep].sort((a,b)=>keys[a].time-keys[b].time||a-b);
}
export function sequenceKeyPage(track,selection,offset=0){
  const count=track.keys.length,size=sequenceKeyLimits.propertyPage,prefix=track.id+':',selected=selection?.startsWith(prefix)?Number(selection.slice(prefix.length)):-1;
  let start=Number.isSafeInteger(offset)?offset:0;
  if(Number.isInteger(selected)&&selected>=0&&selected<count)start=Math.floor(selected/size)*size;
  start=Math.max(0,Math.min(Math.floor(start/size)*size,Math.max(0,Math.ceil(count/size)-1)*size));
  const end=Math.min(count,start+size),entries=[];for(let i=start;i<end;i++)entries.push([i,track.keys[i]]);
  return {start,end,count,size,selected,entries};
}
// Stream the old candidate set; avoid flattened arrays proportional to all keys.
export function nextSequenceKeyTime(data,time,direction){
  let best=time,found=false;const visit=value=>{if(direction>0?value>time+1e-7:value<time-1e-7)if(!found||(direction>0?value<best:value>best)){best=value;found=true;}};
  visit(0);visit(data.length);for(const track of data.tracks){for(const key of track.keys)visit(key.time);for(const clip of track.clips){visit(clip.start);visit(clip.start+clip.duration);if(clip.fadeIn)visit(clip.start+clip.fadeIn);if(clip.fadeOut)visit(clip.start+clip.duration-clip.fadeOut);for(const key of clip.volumeCurve||[])if(key.time<=clip.duration)visit(clip.start+key.time);}}for(const section of data.sections||[]){visit(section.start);visit(section.start+section.duration);for(const key of section.weightCurve||[])if(key.time<=section.duration)visit(section.start+key.time);}return best;
}
export function readSequenceKeys(track,{offset=0,limit=100,values=true}={}){
  if(!Number.isSafeInteger(offset)||offset<0||!Number.isSafeInteger(limit)||limit<1||limit>1000||typeof values!=='boolean')throw Error('키 조회 offset 정수0이상·limit1~1000·values boolean을 확인하세요.');
  const count=track.keys.length,end=Math.min(count,offset+limit),items=[];
  for(let i=offset;i<end;i++)items.push({index:i,key:values?structuredClone(track.keys[i]):{time:track.keys[i].time,...(track.keys[i].interpolation?{interpolation:track.keys[i].interpolation}:{})}});
  return {track:track.id,total:count,offset,limit,values,items,nextOffset:end<count?end:null,readOnly:true};
}
