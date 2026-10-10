// Deadline pacing uses wall time. Late work never triggers a catch-up burst.
export function createFrameLoop(callback,settings,host=globalThis){
  const period=1000/settings.targetFrameRate;let active=false,pending=null,deadline=0,generation=0;
  const fixed=settings.framePacing==='fixed';
  function schedule(){if(!active||pending!==null)return;const epoch=generation;
    const next=async()=>{pending=null;if(!active||epoch!==generation)return;const now=host.performance.now();
      if(now+.25<deadline){schedule();return;}
      deadline+=Math.max(1,Math.floor((now-deadline)/period)+1)*period;
      try{await callback(now);}finally{if(epoch===generation)schedule();}
    };
    pending=fixed?host.setTimeout(next,Math.max(1,Math.ceil(deadline-host.performance.now()))):host.requestAnimationFrame(next);
  }
  return {start(){if(active)return;active=true;generation++;deadline=host.performance.now();schedule();},stop(){active=false;generation++;if(pending!==null)(fixed?host.clearTimeout:host.cancelAnimationFrame).call(host,pending);pending=null;}};
}
