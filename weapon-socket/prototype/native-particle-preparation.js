// Asset preparation precedes emission clocks. A scene reset invalidates pending
// creation without replaying commands or surfacing an obsolete scene's error.
export function createNativeParticlePreparation(send,{isDisposed=()=>false,onState=()=>{}}={}){
  let generation=0,job=null,wantsSort=false,ready=false,readySort=false;
  return {
    prepare(sorting=false){
      if(typeof sorting!=='boolean')throw Error('파티클 정렬 준비 옵션을 확인하세요.');
      wantsSort=wantsSort||sorting;if(job&&(!ready||!wantsSort||readySort))return job;const token=generation;ready=false;
      const current=(async()=>{
        try{while(!isDisposed()&&token===generation){const sorting=wantsSort,result=await send('prepareParticles',{sorting});if(isDisposed()||token!==generation)return false;if(!result.pending&&sorting!==wantsSort)continue;onState(result.preparation);if(!result.pending){ready=true;readySort=sorting;return true;}await new Promise(resolve=>setTimeout(resolve,25));}return false;}
        catch(error){if(isDisposed()||token!==generation)return false;throw error;}
      })();
      job=current;current.catch(()=>{if(job===current)job=null;});return current;
    },
    reset(){++generation;job=null;wantsSort=ready=readySort=false;}
  };
}
