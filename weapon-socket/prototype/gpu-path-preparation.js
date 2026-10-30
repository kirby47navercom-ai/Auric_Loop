import {ColorManagement,NoToneMapping} from 'three';
// Descriptor compilation must not consume the next real render's uniform epoch.
let compilationEpoch=-2;

// Pipeline compilation restores renderer state before its GPU promises settle (Three r180).
// Keep the raster viewport responsive while optional path filters compile.
export function startGPUPathPreparation(renderer,post,screen){
 const state={pending:true,completed:0,submitted:0,total:1,error:null,cancelled:false,currentStage:'post',started:performance.now(),elapsedMS:0,stages:[],concurrent:true};
 state.cancelledDone=new Promise(resolve=>{state.resolveCancellation=resolve;});
 const compile=(quad,target)=>{const previous={target:renderer.getRenderTarget(),mrt:renderer.getMRT(),tone:renderer.toneMapping,color:renderer.outputColorSpace},frame=renderer._nodes?.nodeFrame,renderId=frame?.renderId,isolateEpoch=Number.isSafeInteger(renderId),update=frame?.updateBeforeNode,owned=frame&&Object.hasOwn(frame,'updateBeforeNode'),device=renderer.backend?.device,create=device?.createRenderPipelineAsync,ownCreate=device&&Object.hasOwn(device,'createRenderPipelineAsync'),pipelines=[];try{renderer.setRenderTarget(target);renderer.setMRT(null);renderer.toneMapping=NoToneMapping;renderer.outputColorSpace=ColorManagement.workingColorSpace;
 // r180 compileAsync also visits RTT update-before hooks. Compile descriptors only;
 // keep those hooks registered for the later real frame, with no preparation draw.
 // r180's pipeline wrapper forwards success only. Observe native rejection too,
 // and restore the device method before asynchronous preparation yields.
 if(create)device.createRenderPipelineAsync=function(...args){const pending=create.apply(this,args);pipelines.push(pending);return pending.catch(()=>undefined);};
 if(frame){frame.updateBeforeNode=()=>false;if(isolateEpoch){frame.renderId=compilationEpoch;compilationEpoch-=2;}}const compilation=renderer.compileAsync(quad,quad.camera);return Promise.all([compilation,...pipelines]);}finally{if(create){if(ownCreate)device.createRenderPipelineAsync=create;else delete device.createRenderPipelineAsync;}if(frame){if(isolateEpoch)frame.renderId=renderId;if(owned)frame.updateBeforeNode=update;else delete frame.updateBeforeNode;}renderer.setRenderTarget(previous.target);renderer.setMRT(previous.mrt);renderer.toneMapping=previous.tone;renderer.outputColorSpace=previous.color;}};
 const jobs=[],stageInfo=job=>({stage:job.stage,elapsedMS:job.elapsedMS,submitMS:job.submitMS,afterSubmitMS:Math.max(0,job.elapsedMS-job.submitMS)});
 state.freezeCancellation=()=>{state.stages=jobs.filter(j=>j.promise).map(j=>j.done?stageInfo(j):{...stageInfo({...j,elapsedMS:performance.now()-j.started}),cancelled:true});};
 const refresh=()=>{if(!state.pending||state.cancelled||state.error)return;state.stages=jobs.filter(j=>j.done).map(stageInfo);const next=jobs.find(j=>!j.done);if(next)state.currentStage=next.stage;};
 const submit=(stage,quad,target)=>{
  const job={stage,started:performance.now(),submitMS:0,done:false};jobs.push(job);state.currentStage=stage;
  const pending=compile(quad,target);job.submitMS=performance.now()-job.started;state.submitted++;
  job.promise=Promise.resolve(pending).then(()=>{job.done=true;job.elapsedMS=performance.now()-job.started;if(state.pending&&!state.cancelled&&!state.error){state.completed++;refresh();}},error=>{
   job.elapsedMS=performance.now()-job.started;if(state.pending&&!state.cancelled&&!state.error){state.error=error;state.currentStage=stage;state.stages=[...jobs.filter(j=>j.done).map(stageInfo),stageInfo(job)];}throw error;
  });
  // A later synchronous submission may throw before Promise.all is reached.
  // Observe every rejection immediately, including those obsolete jobs.
  job.promise.catch(()=>{});
 };
 state.done=(async()=>{try{
  if(renderer._initialized===false)await renderer.init();if(state.cancelled)return;
  post._update();submit('post',post._quadMesh,null);if(state.cancelled)return;
  // r180 restores compileAsync's renderer state before awaiting native pipelines.
  // Its synchronous post build creates RTT descriptors; submit those independent
  // descriptors now rather than waiting for each driver's pipeline completion.
  const nodes=[...new Set(screen.shaderNodes())];state.total+=nodes.length;
  for(const node of nodes.reverse()){if(state.cancelled)return;node._quadMesh.material.fragmentNode=node._rttNode||node.node;submit(node.hbCompileStage||'filter',node._quadMesh,node.renderTarget);}
  refresh();await Promise.all(jobs.map(j=>j.promise));
 }catch(error){if(!state.cancelled)state.error=error;}finally{state.freezeCancellation=null;state.pending=false;state.elapsedMS=performance.now()-state.started;state.currentStage=state.error?'failed':state.cancelled?'cancelled':'ready';}})();
 return state;
}

export function gpuPathPreparationInfo(state){return state?{pending:state.pending,currentStage:state.currentStage,elapsedMS:state.pending?performance.now()-state.started:state.elapsedMS,stages:(state.stages||[]).map(s=>({...s})),completed:state.completed,total:state.total,cancelled:state.cancelled,error:state.error?.message||null,...state.guideMode?{guideMode:state.guideMode}:{},...state.guideCurved===undefined?{}:{guideCurved:state.guideCurved},...state.guideLens===undefined?{}:{guideLens:state.guideLens},...state.parallelSupported===undefined?{}:{parallelSupported:state.parallelSupported},...state.concurrent?{concurrent:true}:{},...state.submitted===undefined?{}:{submitted:state.submitted}}:null;}

export function cancelGPUPathPreparation(state){
 if(!state||state.cancelled)return;if(state.pending)state.freezeCancellation?.();state.freezeCancellation=null;state.cancelled=true;state.currentStage='cancelled';state.resolveCancellation?.();state.resolvePoll?.();
}

// GPU compilation itself cannot be interrupted; obsolete waiters can leave immediately.
export async function waitForGPUPathPreparation(renderer){
 for(;;){const state=renderer.hbPathPreparation;if(state?.error)throw state.error;if(!state?.pending||state.cancelled)return gpuPathPreparationInfo(state);await(state.cancelledDone?Promise.race([state.done,state.cancelledDone]):state.done);}
}

export async function capturePreparedFrame(renderer,capture){
 for(;;){const before=renderer.hbPathPreparation,pendingAtStart=!!before?.pending&&!before.cancelled,image=await capture(),state=renderer.hbPathPreparation;if(state?.error)throw state.error;if(!state?.pending||state.cancelled){if(pendingAtStart)continue;return image;}await waitForGPUPathPreparation(renderer);}

}
