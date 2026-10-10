export const virtualTypes=new Set(['TouchButton','Joystick','DPad','TouchPad']);
export const virtualDefaults={inputKey:'space',inputMode:'keys',axisX:'MoveX',axisY:'MoveY',keyUp:'w',keyDown:'s',keyLeft:'a',keyRight:'d',deadZone:.15,floating:false,deviceVisibility:'all'};
export function stickValue(x,y,deadZone=.15){const length=Math.hypot(x,y);if(length<=deadZone)return [0,0];const scale=Math.min(1,(length-deadZone)/(1-deadZone))/length;return [x*scale,y*scale];}

// Each control owns its pointers and input source; one finger lifting cannot
// cancel another button, joystick, keyboard or gamepad contribution.
export function drawVirtualControl(element,node){
  const doc=element.ownerDocument;element.style.touchAction='none';element.setAttribute('aria-label',node.name);element.setAttribute('role',node.type==='TouchButton'?'button':'group');
  let knob,label;
  if(node.type==='Joystick'){knob=doc.createElement('span');knob.className='hb-ui-stick-knob';element.append(knob);}
  if(node.type==='DPad'){for(const [direction,path] of [['up','M6 9L12 3L18 9'],['down','M6 15L12 21L18 15'],['left','M9 6L3 12L9 18'],['right','M15 6L21 12L15 18']]){const mark=doc.createElement('span');mark.className='hb-ui-dpad-'+direction;mark.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="'+path+'"/></svg>';element.append(mark);}}
  if(node.type==='TouchButton'){label=doc.createElement('span');label.className='hb-ui-touch-label';label.textContent=node.properties.text;element.append(label);}
  return {knob,label};
}
export function bindVirtualControl(element,node,{input=()=>{},event=()=>{},accept=()=>true,source='virtual:'+crypto.randomUUID(),signal}={}){
  const win=element.ownerDocument.defaultView,doc=element.ownerDocument,p={...virtualDefaults,...node.properties},pointers=new Map(),values=new Map(),listeners=[];let detached=false,lastRect;
  const listen=(target,type,fn,options)=>{target.addEventListener(type,fn,options);listeners.push({target,remove:()=>target.removeEventListener(type,fn,options)});};
  const {knob,label}=drawVirtualControl(element,node);
  const write=next=>{for(const key of new Set([...values.keys(),...next.keys()])){const value=next.get(key)||0;if(value!==(values.get(key)||0))input(key,value,source);}values.clear();for(const [k,v] of next)if(v)values.set(k,v);};
  const output=()=>{const next=new Map();let x=0,y=0;for(const state of pointers.values()){x+=state.value[0];y+=state.value[1];}x=Math.max(-1,Math.min(1,x));y=Math.max(-1,Math.min(1,y));
    if(node.type==='TouchButton'){if(pointers.size)next.set(p.inputKey,1);}
    else if(node.type==='TouchPad'){next.set(p.axisX,x);next.set(p.axisY,y);}
    else if(p.inputMode==='axes'){next.set(p.axisX,x);next.set(p.axisY,y);}
    else{next.set(p.keyRight,Math.max(0,x));next.set(p.keyLeft,Math.max(0,-x));next.set(p.keyUp,Math.max(0,y));next.set(p.keyDown,Math.max(0,-y));}
    write(next);element.classList.toggle('is-held',pointers.size>0);if(knob)knob.style.transform=`translate(${x*75}%,${-y*75}%)`;if(label)label.textContent=node.properties.text;node.properties.value=node.type==='TouchButton'?Number(pointers.size>0):Math.min(1,Math.hypot(x,y));event('changed');
  };
  const move=(e,state)=>{const r=detached?lastRect:element.getBoundingClientRect();lastRect=r;if(node.type==='TouchButton'){state.value=[0,0];return;}
    if(node.type==='TouchPad'){state.value=[Math.max(-1,Math.min(1,(e.clientX-state.last[0])/Math.max(1,r.width/4))),Math.max(-1,Math.min(1,(state.last[1]-e.clientY)/Math.max(1,r.height/4)))];state.last=[e.clientX,e.clientY];return;}
    const cx=p.floating?state.origin[0]:r.left+r.width/2,cy=p.floating?state.origin[1]:r.top+r.height/2,x=(e.clientX-cx)/Math.max(1,r.width/2),y=(cy-e.clientY)/Math.max(1,r.height/2);state.value=node.type==='DPad'?[Math.abs(x)>.25?Math.sign(x):0,Math.abs(y)>.25?Math.sign(y):0]:stickValue(x,y,p.deadZone);if(node.type==='DPad'&&state.value.every(Boolean)){state.value=state.value.map(v=>v/Math.SQRT2);}
  };
  const down=e=>{if(!accept()||e.button!==0||node.type==='Joystick'&&pointers.size)return;e.preventDefault();e.stopPropagation();const first=!pointers.size,state={value:[0,0],origin:[e.clientX,e.clientY],last:[e.clientX,e.clientY]};pointers.set(e.pointerId,state);try{element.setPointerCapture(e.pointerId);}catch{}move(e,state);output();if(first)event('pressed');};
  const drag=e=>{const state=pointers.get(e.pointerId);if(!state)return;e.preventDefault();e.stopPropagation();if(!accept()){if(!detached)reset();return;}move(e,state);output();};
  const up=e=>{if(!pointers.has(e.pointerId))return;e.preventDefault();e.stopPropagation();pointers.delete(e.pointerId);output();try{element.releasePointerCapture(e.pointerId);}catch{}if(!pointers.size){event('released');if(detached)cleanup();}};
  function reset(emit=true){const ids=[...pointers.keys()];pointers.clear();if(emit)write(new Map());else values.clear();element.classList.remove('is-held');if(knob)knob.style.transform='translate(0,0)';node.properties.value=0;for(const id of ids)try{element.releasePointerCapture(id);}catch{}if(emit&&ids.length)event('released');}
  if(node.type==='TouchButton'){const keyboard=e=>[' ','Enter'].includes(e.key);listen(element,'keydown',e=>{if(!keyboard(e)||!accept())return;e.preventDefault();e.stopPropagation();if(pointers.has('keyboard'))return;const first=!pointers.size;pointers.set('keyboard',{value:[0,0]});output();if(first)event('pressed');});listen(element,'keyup',e=>{if(!keyboard(e)||!pointers.has('keyboard'))return;e.preventDefault();e.stopPropagation();pointers.delete('keyboard');output();if(!pointers.size)event('released');});listen(element,'blur',()=>reset());}
  listen(element,'pointerdown',down);listen(element,'pointermove',drag);listen(doc,'pointermove',e=>{if(e.target!==element)drag(e);},{capture:true});listen(element,'pointerup',up);listen(doc,'pointerup',up);listen(element,'pointercancel',up);listen(element,'lostpointercapture',up);listen(element,'contextmenu',e=>e.preventDefault());listen(win,'blur',()=>reset());listen(doc,'visibilitychange',()=>{if(doc.hidden)reset();});listen(win,'resize',()=>reset());listen(win,'orientationchange',()=>reset());
  function cleanup(){listeners.splice(0).forEach(item=>item.remove());signal?.removeEventListener('abort',cancel);}
  function cancel(){reset();cleanup();}
  signal?.addEventListener('abort',cancel,{once:true});
  return {source,reset,update(){if(label)label.textContent=node.properties.text;},endFrame(){if(node.type==='TouchPad'){for(const state of pointers.values())state.value=[0,0];write(new Map());}},dispose(reason){if(reason==='LevelTransition'&&pointers.size&&!signal?.aborted){detached=true;lastRect??=element.getBoundingClientRect();for(const item of [...listeners])if(item.target===element){item.remove();listeners.splice(listeners.indexOf(item),1);}return;}cancel();}};
}
