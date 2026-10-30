import {cancelGPUPathPreparation,gpuPathPreparationInfo} from './gpu-path-preparation.js';

export const nativeShaderPreparationContract=Object.freeze({
 version:2,backend:'D3D11',stages:Object.freeze(['path','guide','filter','photons','temporal','auxiliary']),
 timing:'elapsedMS freezes at current cycle completion/cancellation; cycles counts nonoverlapping pending cycles within the same revision; preparationMS sums those cycle wall durations, excludes idle gaps and is not GPU execution or whole application startup',
 states:Object.freeze(['unused','queued','compiling','ready','failed']),queueBudgetBytes:8*1024*1024,
 idleWorkerMS:1000,workerCount:1,renderWhilePending:'raster',commitPendingHistory:false,
 rasterStages:Object.freeze(['material','material-shadow','raster-vertex','raster-surface','raster-shadow','probe-prefilter','probe-brdf','probe-diffuse','probe-panorama','particle-vertex','particle-surface','particle-compaction','particle-sort-initial','particle-sort-step','particle-simulation','particle-free-slots','particle-emission','particle-clear']),
 baseRaster:Object.freeze({optIn:'SceneRenderer fifth constructor argument; desktop asyncShaderPreparation',stages:3,preparation:'same lazy worker; no GPU ownership in jobs',pending:'clear and present; no base draws, dependent captures or screen history',defaultSDK:'synchronous'}),
 rasterPreparation:'same lazy compiler worker; shader bytecode off-thread, device adoption on owner; pending objects skip drawing, dependent shadows/probes and screen history wait',
 probeFiltering:Object.freeze({preparation:'same lazy compiler worker; requested only for probes/sky',stages:4,adoption:'owner thread; one fresh compile retry per rejected stage',pending:'dependent sky/cube filtering and captures, shadow and screen history wait; base raster continues',diagnostics:'shaderPreparation.raster.probeFiltering',defaultSDK:'synchronous; async opt-in callers pollProbePreparation before filtering'}),
 particleRendering:Object.freeze({optIn:'ParticleRenderer fifth constructor argument; desktop asyncShaderPreparation',preparation:'same lazy compiler worker; no jobs until particle draw/count requested; sorting stages only when used',stages:5,adoption:'owner thread; one fresh compile retry per rejected stage',pending:'particle drawing, dependent capture and screen history wait; ordinary raster continues; explicit count waits asynchronously without replaying commands',diagnostics:'shaderPreparation.raster.particleRendering',defaultSDK:'synchronous; async opt-in callers pollPreparation before drawing/count'}),
 particleSimulation:Object.freeze({preparation:'Particles::prepare uses four existing compileAsync jobs; per-device shared shaders and per-pool independent constant rings',request:'desktop async asset factory awaits hbPrepareParticles including render stages and requested sorting before constructing simulation or starting birth clocks',stages:4,cancellation:'scene generation invalidates pending JavaScript creation; native reset drops requests',diagnostics:'shaderPreparation.raster.particleSimulation',defaultSDK:'synchronous; optional Particles::Preparation and prepared constructors; legacy raw commands without preparation stay synchronous'}),
 lightCulling:Object.freeze({preparation:'same lazy compiler worker',fallback:'all-lights',historyWait:false,diagnostics:'shaderPreparation.raster.lightCulling',adoption:'owner thread; one fresh compile retry after device rejection'}),
 compilerCancellation:'finish active compilation; discard obsolete renderer result'
});

// Native readiness is a decision made before drawing this frame. A worker finishing
// during present is adopted on the next frame, never reported as an already drawn path.
function settleNativePreparation(state,clock){
 if(state.settled)return;
 state.elapsedMS=Math.max(0,clock()-state.started);
 state.preparationMS=state.priorPreparationMS+state.elapsedMS;
 state.settled=true;
}
export function updateNativePathPreparation(previous,packet,clock=()=>performance.now()){
 if(!packet?.enabled){cancelGPUPathPreparation(previous);return null;}
 const stages=packet.stages.map((state,i)=>({stage:nativeShaderPreparationContract.stages[i],state:nativeShaderPreparationContract.states[state]})).filter(s=>s.state!=='unused');
 for(const row of packet.raster?.stages||[])if(row.total)stages.push({...row,state:row.failed?'failed':row.compiling?'compiling':row.queued?'queued':'ready'});
 const pending=!!packet.pending,error=packet.error?new Error(packet.error):null;
 let state=previous;
 if(!state||state.cancelled||state.revision!==packet.revision||!state.pending&&pending){
  const continuing=state&&!state.cancelled&&state.revision===packet.revision;
  const priorPreparationMS=continuing?state.preparationMS:0,cycles=(continuing?state.cycles:0)+(pending?1:0);
  cancelGPUPathPreparation(state);
  state={revision:packet.revision,pending:true,error:null,cancelled:false,started:clock(),elapsedMS:0,concurrent:false,settled:false,priorPreparationMS,preparationMS:priorPreparationMS,cycles};
  state.freezeCancellation=()=>{settleNativePreparation(state,clock);state.pending=false;};
  state.done=new Promise(resolve=>{state.resolveDone=resolve;});
  state.cancelledDone=new Promise(resolve=>{state.resolveCancellation=()=>{state.resolveDone();resolve();};});
 }
 state.stages=stages;state.queue=packet.queue;state.rasterPending=!!packet.raster?.pending;state.total=stages.reduce((n,s)=>n+(s.total??1),0);state.completed=stages.reduce((n,s)=>n+(s.ready??(s.state==='ready'?1:0)),0);
 state.submitted=stages.reduce((n,s)=>n+(s.total!==undefined?s.total-s.queued:s.state!=='queued'?1:0),0);state.error=error;state.pending=pending;
 state.currentStage=error?'failed':pending?(stages.find(s=>s.state==='compiling')||stages.find(s=>s.state==='queued'))?.stage||'queued':'ready';
 if(!pending){settleNativePreparation(state,clock);state.resolveDone();}
 return state;
}
export function nativePathPreparationInfo(state){const info=gpuPathPreparationInfo(state);return info?{...info,cycles:state.cycles,preparationMS:state.pending?state.priorPreparationMS+info.elapsedMS:state.preparationMS,rasterPending:state.rasterPending,queue:{...state.queue}}:null;}

// A capture can pause the game loop. Polling compiler status must therefore work
// without drawing another frame or advancing simulation/path history.
export function pollNativePathPreparation(renderer,poll){
 const state=renderer.hbPathPreparation;if(!state?.pending||state.polling)return;
 state.polling=true;
 (async()=>{
  while(state.pending&&!state.cancelled&&renderer.hbPathPreparation===state){
   await Promise.race([new Promise(resolve=>setTimeout(resolve,25)),state.cancelledDone]);
   if(state.cancelled||renderer.hbPathPreparation!==state)return;
   const packet=await poll();if(state.cancelled||renderer.hbPathPreparation!==state)return;
   const next=updateNativePathPreparation(state,packet);renderer.hbPathPreparation=next;
   if(next!==state){pollNativePathPreparation(renderer,poll);return;}
  }
 })().catch(error=>{if(renderer.hbPathPreparation!==state||state.cancelled)return;
  state.error=error;state.pending=false;state.currentStage='failed';settleNativePreparation(state,()=>performance.now());state.resolveDone();});
}
