import {OrthographicCamera} from 'three';

const camera=new OrthographicCamera(-1,1,1,-1,0,1);

// r180 compileAsync's poll rereads material properties after disposal. Capture each
// program instead, so cancelling a view can release it without a stale callback.
export function startGLPathPreparation(renderer,quad,tasks){
 const gl=renderer.getContext(),parallel=renderer.extensions.get('KHR_parallel_shader_compile');
 const state={pending:true,completed:0,total:tasks.length,error:null,cancelled:false,currentStage:tasks[0]?.stage||'post',started:performance.now(),elapsedMS:0,stages:[],parallelSupported:!!parallel,concurrent:true};
 state.cancelledDone=new Promise(resolve=>{state.resolveCancellation=resolve;});
 state.done=(async()=>{const jobs=[];try{
  // Submit all links before polling. Waiting for each material in turn prevents
  // independent guide/image programs from reaching the driver's compiler queue.
  for(const {stage,material,target}of tasks){
   if(state.cancelled)return;
   state.currentStage=stage;const started=state.stageStarted=performance.now();let program;
   const previous={material:quad.material,target:renderer.getRenderTarget(),face:renderer.getActiveCubeFace(),mip:renderer.getActiveMipmapLevel()};
   try{
    quad.material=material;renderer.setRenderTarget(target);renderer.compile(quad._mesh,camera);
    program=renderer.properties.get(material).currentProgram;
   }finally{quad.material=previous.material;renderer.setRenderTarget(previous.target,previous.face,previous.mip);}
   if(!program?.program)throw Error('WebGL 셰이더 프로그램이 준비되지 않았어요: '+stage);
   jobs.push({stage,program,started,submitMS:performance.now()-started,done:false});
  }
  while(state.completed<jobs.length){
   if(state.cancelled)return;
   if(gl.isContextLost())throw Error('WebGL 컨텍스트가 손실됐어요.');
   for(const job of jobs){if(job.done)continue;
    if(parallel&&!gl.getProgramParameter(job.program.program,parallel.COMPLETION_STATUS_KHR))continue;
    state.currentStage=job.stage;state.stageStarted=job.started;
    if(!gl.getProgramParameter(job.program.program,gl.LINK_STATUS))throw Error('WebGL '+job.stage+' 컴파일 실패: '+(gl.getProgramInfoLog(job.program.program)||'프로그램 연결 오류'));
    job.done=true;job.elapsedMS=performance.now()-job.started;state.completed++;
   }
   state.stages=jobs.filter(j=>j.done).map(j=>({stage:j.stage,elapsedMS:j.elapsedMS,submitMS:j.submitMS,afterSubmitMS:Math.max(0,j.elapsedMS-j.submitMS)}));
   const pending=jobs.find(j=>!j.done);if(!pending)break;state.currentStage=pending.stage;state.stageStarted=pending.started;
   await new Promise(resolve=>{const timer=setTimeout(done,10);function done(){clearTimeout(timer);state.resolvePoll=null;resolve();}state.resolvePoll=done;});
  }
 }catch(error){if(!state.cancelled){state.error=error;state.stages=jobs.filter(j=>j.done).map(j=>({stage:j.stage,elapsedMS:j.elapsedMS,submitMS:j.submitMS,afterSubmitMS:Math.max(0,j.elapsedMS-j.submitMS)}));state.stages.push({stage:state.currentStage,elapsedMS:performance.now()-state.stageStarted});}}finally{state.pending=false;state.elapsedMS=performance.now()-state.started;state.currentStage=state.error?'failed':state.cancelled?'cancelled':'ready';}})();
 return state;
}
