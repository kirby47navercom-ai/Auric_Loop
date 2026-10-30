// One small policy per scripted actor; no timer, scene scan or root clone per tick.
export function bindActorTick(binding,object){
  if(!object)return;
  object.gameplayDebug??={};
  binding.tickControl=object.gameplayDebug.tick??={enabled:binding.root.settings?.tickEnabled!==false,interval:binding.root.settings?.tickInterval??0,enabledOverride:false,intervalOverride:false};
}
export const bindingTickEnabled=b=>b.tickControl?.enabledOverride?b.tickControl.enabled:b.root.settings?.tickEnabled!==false;
export const bindingTickInterval=(b,node)=>b.tickControl?.intervalOverride?b.tickControl.interval:node?.options?.tickInterval??b.root.settings?.tickInterval??0;
// C++ intervals cross the bridge as float32. One ULP must not postpone an exact
// 0.1 + 0.1 second accumulation by an entire additional game frame.
export const bindingTickDue=(elapsed,interval,delta)=>delta>0&&elapsed+Math.max(1e-9,Math.abs(interval)*1.1920928955078125e-7)>=interval;
export function actorTickOperation(key,args,object,bindings){
  const rows=bindings.filter(b=>b.self===object.id);object.gameplayDebug??={};const state=object.gameplayDebug.tick??={enabled:rows[0]?.root.settings?.tickEnabled!==false,interval:rows[0]?.root.settings?.tickInterval??0,enabledOverride:false,intervalOverride:false};
  if(key==='sceneTickEnabled')return {return:rows[0]?bindingTickEnabled(rows[0]):state.enabled};
  if(key==='sceneTickInterval')return {return:state.intervalOverride?state.interval:rows[0]?.root.settings?.tickInterval??state.interval};
  if(key==='sceneSetTickEnabled'){if(typeof args.enabled!=='boolean')throw Error('Tick 활성화 값은 bool이어야 해요.');state.enabled=args.enabled;state.enabledOverride=true;}
  else if(key==='sceneSetTickInterval'){if(!Number.isFinite(args.seconds)||args.seconds<0||args.seconds>3600)throw Error('Tick 간격은 0–3600초로 입력하세요.');state.interval=args.seconds;state.intervalOverride=true;for(const b of rows)b.ticks.clear();}
  else throw Error('Tick 작업 오류');
  for(const b of rows)b.tickControl=state;return {};
}
export const actorTickContract={cpp:'Scene::SetTickEnabled/IsTickEnabled/SetTickInterval/GetTickInterval',scope:'runtime actor overrides apply to all its Blueprint/native lifecycle Tick entries; authored class/node settings remain unchanged',interval:'0 every scaled frame, maximum3600 seconds; setting resets accumulated tick time; callback receives accumulated scaled delta',execution:'queued C++ setters; getters latest processed snapshot; current native batch finishes before queued changes apply',lifetime:'runtime world only; scene pause/inactive pool still suppresses ticks; disabling preserves accumulated elapsed time',cost:'one small policy per scripted/touched actor, cached batch paths preserved; no automatic empty Tick in default class template'};
