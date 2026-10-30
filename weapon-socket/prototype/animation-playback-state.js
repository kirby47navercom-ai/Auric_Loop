// Legacy value snapshots remain supported for standalone callers. Production
// sequence leases retain detached evaluators (animation-playback-lease.js).
export const animationPlaybackToken='hb.preanimated.simple.v1';
export function captureAnimationPlayback({object,group,animation,mixer,unsupported=false}){
  const base={kind:animationPlaybackToken,object,group,type:'none'};
  if(unsupported)return {...base,type:'unsupported'};
  if(animation){const {type,timeline,tracks,animation:data,time,length,loop,lastFrame,controlled,source}=animation;return {...base,type:type==='sprite'?'sprite':'timeline',state:{type,timeline,tracks,animation:data,time,length,loop,lastFrame,controlled,source}};}
  if(mixer){const {action}=mixer;return {...base,type:'mixer',clip:action.getClip(),length:mixer.length,controlled:mixer.controlled,source:mixer.source,clock:mixer.mixer.time,speed:mixer.mixer.timeScale,action:{time:action.time,loop:action.loop,repetitions:action.repetitions,paused:action.paused,enabled:action.enabled,clampWhenFinished:action.clampWhenFinished,timeScale:action.timeScale,weight:action.weight}};}
  return base;
}
export function restoreMixerPlayback(THREE,group,snapshot){
  const mixer=new THREE.AnimationMixer(group),action=mixer.clipAction(snapshot.clip),saved=snapshot.action;
  action.setLoop(saved.loop,saved.repetitions);action.clampWhenFinished=saved.clampWhenFinished;action.play();
  // update(0) evaluates the saved pose without advancing a loop or wall clock.
  Object.assign(action,saved);mixer.time=snapshot.clock;mixer.timeScale=snapshot.speed;mixer.update(0);
  return {mixer,action,length:snapshot.length,controlled:snapshot.controlled,source:snapshot.source};
}
function inspectBlend(blend,limit){return blend?{blend:{kind:blend.kind,layerCount:blend.layers.length,layers:blend.layers.slice(0,limit).map(row=>({...row})),excludedCount:blend.excluded.length,excluded:blend.excluded.slice(0,limit).map(row=>({...row}))}}:{};}
export function inspectAnimationPlayback(animations,mixers,stats,{target,limit=64}={}, {graphs=new Map(),leases=new Set(),montages=()=>[]}={}){
  if(target!==undefined&&typeof target!=='string'||!Number.isInteger(limit)||limit<1||limit>512)throw Error('애니메이션 대상과 조회 개수를 확인하세요.');
  const rows=[];let total=0;
  for(const [actor,state]of animations){if(target!==undefined&&actor!==target)continue;total++;if(rows.length<limit)rows.push({actor,type:state.type==='sprite'?'sprite':'timeline',source:state.source??null,time:state.time,length:state.length,loop:!!state.loop,controlled:!!state.controlled,...inspectBlend(state.sequenceBlend,limit)});}
  for(const [actor,state]of mixers){if(target!==undefined&&actor!==target)continue;total++;if(rows.length<limit)rows.push({actor,type:'mixer',source:state.source??state.action.getClip().name,time:state.action.time,length:state.length,loop:state.action.repetitions===Infinity,paused:state.action.paused,controlled:!!state.controlled,...inspectBlend(state.sequenceBlend,limit)});}
  for(const [actor,state]of graphs){if(target!==undefined&&actor!==target)continue;total++;if(rows.length<limit)rows.push({actor,type:'graph',source:state.path,time:state.time,paused:state.paused,controlled:false,montages:montages(actor).length});}
  const preanimated=[];let retained=0;for(const lease of leases){if(target!==undefined&&lease.object?.id!==target)continue;retained++;if(preanimated.length<limit)preanimated.push({actor:lease.object.id,type:lease.type,phase:lease.phase,time:lease.graph?.time??lease.mixer?.action.time??lease.animation?.time??null,montages:lease.montages?.states.length||0});}
  return {total,rows,restoration:{...stats,retained},preanimated,notifyPolicy:'sequence suspension ends active notify windows and cancels scoped latent work; resume re-enters relevant windows on the next animation tick; callbacks are not rolled back',unsupported:['unmanaged additional mixer actions','arbitrary external asynchronous setter rollback']};
}
