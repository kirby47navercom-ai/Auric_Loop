import {makeSequenceTrack} from './gameplay-assets.js';
import {recordedSpawnObject} from './sequence-spawn.js';
const shapeFields=['kind','asset','spriteAsset','tilemapAsset','materialAsset','materialSurface','tags'];
const active=o=>!!o&&o.poolActive!==false&&!o.destroying;
export class TakeLifetimeCapture{
 constructor(){this.identities=new WeakMap();this.serial=0;this.last=new Map();}
 sample(recorder,time,objects,owners){
  const snapshots=new Map();
  for(const target of recorder.spawnTargets){const source=owners.get(target),present=active(source),key=target+'|spawn';let track=recorder.tracks.get(key);if(!source&&!track)continue;
   if(source&&['widget','component'].includes(source.kind))throw Error('수명 녹화는 시각 액터를 대상으로 사용하세요. 위젯·컴포넌트는 지원하지 않아요.');
   let template,changed=false;if(source&&!source.destroying){let identity=this.identities.get(source);if(identity===undefined){identity=++this.serial;this.identities.set(source,identity);}const signature=JSON.stringify(shapeFields.map(p=>source[p]??null)),previous=this.last.get(target);changed=!!previous&&(previous.identity!==identity||previous.signature!==signature);if(present||!previous)this.last.set(target,{identity,signature});if(present||!track){template=recordedSpawnObject(source,objects,recorder.spawnTargets);snapshots.set(target,template);}}
   if(!track){if(!template)continue;track=makeSequenceTrack('spawn');track.target=target;track.object=template;track.name=(source.name+' · 수명').slice(0,80);if(recorder.lifetimeTargets.has(target))track.sourceLifetime=true;track.keys=[{time:0,value:present&&recorder.initiallyActive.has(target),interpolation:'step'}];recorder.tracks.set(key,track);}
   const last=track.keys.at(-1);if(last.value!==present||present&&changed){const entry={time,value:present,interpolation:'step',...(present&&changed?{object:template}:{})};if(last.time===time)Object.assign(last,entry);else track.keys.push(entry);}
  }
  return snapshots;
 }
}
export const takeLifetimeContract=Object.freeze({record:'Optional includeLifetime:boolean, defaultfalse. Explicit selected targets are captured even if present at recording start; initial true/false presence, pool activation, deletion and same-ID replacement are recorded. New-object discovery remains includeSpawned with its own admission filter.',asset:'spawn.sourceLifetime marks a selected-source visual copy; optional true spawn key.object stores an immutable validated visual template on actor identity or root visual shape changes. Visual component state is recorded automatically for selected lifetime copies.',playback:'Owned IDs only, scripts/physics excluded from copies. Same-ID/template changes replace only the owned presentation copy. Source visibility uses ordinary per-object sequence leases and captured actor identity; last release restores original visibility, another owner resumes first. Source simulation is not paused.',hierarchy:'Recorded copied parents retain logical references and remap to owned IDs; external parents flatten to world TRS. Template parent graphs validate at every authored template boundary.',compatibility:'Missing fields keep legacy post-start spawn capture/replay. Existing presets keep old defaults; lifetime is an explicit checkbox. Copy targets do not record BP/native variable channels, and widgets/components are rejected.',cost:'One WeakMap identity token per seen live object, per admitted-ID signature, per-sample visual snapshot reused for transform/components. Spawn timelines prepare once and seek via binary search; no new background worker/timer/GPU resources.'});
