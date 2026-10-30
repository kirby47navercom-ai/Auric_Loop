// Explicit opt-in only. Ordinary BlueprintCallable names never imply callbacks.
export const nativeLifecycleEvents=Object.freeze({
  construction:[],beginPlay:[],tick:[['delta','float']],endPlay:[['reason','string']],
  beginOverlap:[['other','object']],endOverlap:[['other','object']],overlapStay:[['other','object'],['delta','float']],
  hitEvent:[['other','object'],['hit','hit']],hitStay:[['other','object'],['hit','hit'],['delta','float']],endHit:[['other','object'],['hit','hit']]
});
export function validNativeLifecycle(fn){
  if(!fn||typeof fn!=='object')return false;
  if(fn.lifecycle===undefined)return true;
  const ports=Object.hasOwn(nativeLifecycleEvents,fn.lifecycle)?nativeLifecycleEvents[fn.lifecycle]:null;
  return !!ports&&!fn.static&&!fn.pure&&fn.event==='none'&&Array.isArray(fn.outputs)&&!fn.outputs.length&&Array.isArray(fn.inputs)&&fn.inputs.length===ports.length&&fn.inputs.every((p,i)=>p&&p.type===ports[i][1]&&!p.array);
}
export function validNativeLifecycles(functions){return functions.every(validNativeLifecycle)&&new Set(functions.filter(f=>f.lifecycle!==undefined).map(f=>f.lifecycle)).size===functions.filter(f=>f.lifecycle!==undefined).length;}

// Called once on the runtime-owned copy, never on an authored/saved graph. Reuse
// the normal event interpreter, pause/debug boundaries and native batch planner.
export function installNativeLifecycle(root,className){
  const definition=root.native?.classes.find(c=>c.name===className),functions=definition?.functions.filter(f=>f.lifecycle!==undefined)||[];
  if(!functions.length)return;
  if(!validNativeLifecycles(functions))throw Error('C++ Lifecycle 선언을 확인하세요.');
  const ids=new Set([...root.nodes,...(root.construction?.nodes||[])].map(n=>n.id));
  const unique=id=>{while(ids.has(id))id+='_';ids.add(id);return id;};
  for(const fn of functions){
    const phase=fn.lifecycle,g=phase==='construction'?root.construction:root;
    if(!g)throw Error('C++ Construction 그래프가 없어요.');
    const event={id:unique('__hbLifecycle_'+phase),key:phase,x:0,y:0,inputValues:{},runtimeLifecycle:true},call={id:unique(event.id+'_call'),key:'nativeCall',nativeId:definition.name+'.'+fn.name,x:0,y:0,inputValues:{},runtimeLifecycle:true};
    // The receiver pin can collide with an authored parameter called target.
    let receiver='target',index=0;while(fn.inputs.some(p=>p.id===receiver))receiver='nativeTarget'+(index++||'');call.inputValues[receiver]='self';
    const edges=[{from:{node:event.id,pin:'then'},to:{node:call.id,pin:'exec'}},...fn.inputs.map((p,i)=>({from:{node:event.id,pin:nativeLifecycleEvents[phase][i][0]},to:{node:call.id,pin:p.id}}))];
    g.nodes.unshift(event,call);g.edges.unshift(...edges);
  }
}
export const nativeLifecycleContract={annotation:'HB_FUNCTION(BlueprintCallable, Lifecycle="tick") void Update(float delta);',events:nativeLifecycleEvents,selection:'explicit phase, one callback per phase on the attached native class; no callback by method name; base methods can be called explicitly in C++',order:'native callback before authored Blueprint events of the same phase; ordinary queued writes and batch boundaries apply',storage:'runtime-owned generated entries only; authored graphs remain unchanged',tick:'same tickEnabled/tickInterval, pause, pool and scaled delta as Blueprint Event Tick',collision:'shared 2D/3D contact events; positional parameter types in events table, C++ parameter names may differ',construction:'runtime/spawn construction after instance defaults, not an editor-time C++ compile or a C++ constructor',unsupported:['automatic base callback chaining','fixed/late update phases','standalone native clock packets dispatching callbacks']};
