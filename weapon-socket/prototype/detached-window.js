import {storage,storageKey} from './project-session.js';
export function editorAnimationFrame(element,callback){const win=element.ownerDocument.defaultView,manager=win.hbEngineDetachedManager||win.opener?.hbEngineDetachedManager;return manager?manager.requestAnimationFrame(callback):win.requestAnimationFrame(callback);}
export function cancelEditorAnimationFrame(element,handle){const win=element.ownerDocument.defaultView,manager=win.hbEngineDetachedManager||win.opener?.hbEngineDetachedManager;manager?manager.cancelAnimationFrame(handle):win.cancelAnimationFrame(handle);}

// A panel moves, rather than cloning an editor or its AssetDocuments. Its listeners
// and render loop keep their original owner; child events reach owner shortcuts.
export class DetachedWindows {
  constructor(dock){
    this.dock=dock;this.items=new Map();this.frames=new Map();this.owner=globalThis.window;this.document=dock.host.ownerDocument;this.owner.hbEngineDetachedManager=this;
    this.attach=(id,child)=>this.mount(id,child);this.owner.hbEngineAttachWindow=this.attach;
    this.unload=()=>this.dispose();this.owner.addEventListener('pagehide',this.unload);
    this.timer=setInterval(()=>{for(const [id,item] of this.items)if(item.child.closed||dock.entries.get(item.entry.id)!==item.entry)this.restore(id,{close:true});},500);
  }
  documents(){return [...this.items.values()].filter(item=>item.ready&&!item.child.closed).map(item=>item.child.document);}
  query(selector){return this.document.querySelector(selector)||this.documents().map(doc=>doc.querySelector(selector)).find(Boolean)||null;}
  queryAll(selector){return [...this.document.querySelectorAll(selector),...this.documents().flatMap(doc=>[...doc.querySelectorAll(selector)])];}
  get activeElement(){const active=[...this.items.values()].find(item=>item.ready&&!item.child.closed&&item.child.document.hasFocus());return active?.child.document.activeElement||this.document.activeElement;}
  requestAnimationFrame(callback){
    const pending={done:false,children:[]};
    const frame=()=>{if(pending.done)return;this.cancelAnimationFrame(pending.ownerFrame);callback(this.owner.performance.now());};
    pending.ownerFrame=this.owner.requestAnimationFrame(frame);this.frames.set(pending.ownerFrame,pending);
    // Any visible native window must keep shared editing and playback alive.
    for(const {ready,child} of this.items.values())if(ready&&!child.closed){try{pending.children.push({child,handle:child.requestAnimationFrame(frame)});}catch{}}
    return pending.ownerFrame;
  }
  cancelAnimationFrame(handle){this.owner.cancelAnimationFrame(handle);const pending=this.frames.get(handle);if(pending){pending.done=true;for(const {child,handle:childHandle} of pending.children){try{child.cancelAnimationFrame(childHandle);}catch{}}this.frames.delete(handle);}}
  open(id){
    const entry=this.dock.entries.get(id);if(!entry)return false;
    const old=this.items.get(id)||[...this.items.values()].find(item=>item.entry===entry);if(old&&!old.child.closed){old.child.focus();this.dock.focus(id);return true;}
    let bounds={width:1000,height:720};try{const saved=JSON.parse(storage.getItem(storageKey('hbengine.detached.windows')))?.[id];if(saved)bounds={width:Math.max(420,Math.min(7680,saved.width||1000)),height:Math.max(300,Math.min(4320,saved.height||720)),...(Number.isFinite(saved.left)&&Number.isFinite(saved.top)?{left:saved.left,top:saved.top}:{})};}catch{}
    const child=this.owner.open('/prototype/detached-window.html?id='+encodeURIComponent(id),'hbengine-'+crypto.randomUUID(),Object.entries({popup:'yes',...bounds}).map(([key,value])=>key+'='+value).join(','));
    if(!child){this.dock.options.error?.('새 창이 차단됐어요. 팝업을 허용한 뒤 다시 열어 주세요.');return false;}
    const item={child,entry,ready:false};this.items.set(id,item);item.startup=setTimeout(()=>{if(this.items.get(id)===item&&!item.ready){this.restore(id,{close:true});this.dock.options.error?.('작업창을 열지 못했어요.');}},10000);return true;
  }
  mount(id,child){
    const item=this.items.get(id);if(!item||item.child!==child||child.location.origin!==this.owner.location.origin)return false;
    const doc=child.document;item.ready=true;clearTimeout(item.startup);
    for(const link of this.document.querySelectorAll('link[rel="stylesheet"]')){const copy=doc.createElement('link');copy.rel='stylesheet';copy.href=link.href;doc.head.insertBefore(copy,doc.querySelector('link[href$="detached-window.css"]'));}
    // Specific detached sizing must follow all original editor styles.
    doc.head.append(doc.querySelector('link[href$="detached-window.css"]'));
    for(const [key,value] of Object.entries(this.document.body.dataset))doc.body.dataset[key]=value;
    item.entry.detached=true;doc.title=item.entry.title+' — '+this.document.title;doc.querySelector('#detached-title').textContent=item.entry.title;
    if(item.entry.external)item.entry.home.parent.classList.add('detached-'+item.entry.id);
    doc.querySelector('#detached-host').append(item.entry.element);item.entry.element.classList.add('active');
    this.moved(item.entry);
    const focus=()=>this.dock.focus(item.entry.id),resize=()=>this.owner.dispatchEvent(new Event('resize'));
    doc.addEventListener('pointerdown',focus,true);doc.addEventListener('focusin',focus,true);child.addEventListener('focus',focus);child.addEventListener('resize',resize);
    const forward=original=>{
      if(original.target.closest?.('.detached-toolbar'))return;
      const handled=original.defaultPrevented;
      if(original.key?.toLowerCase()==='r'&&(original.ctrlKey||original.metaKey))original.preventDefault();
      const event=new this.owner.Event(original.type,{bubbles:true,cancelable:original.cancelable});
      for(const key of ['target','relatedTarget','key','code','keyCode','repeat','isComposing','button','buttons','clientX','clientY','screenX','screenY','movementX','movementY','pointerId','pointerType','pressure','ctrlKey','metaKey','altKey','shiftKey','deltaX','deltaY','deltaMode','dataTransfer','inputType','data'])Object.defineProperty(event,key,{value:original[key]});
      Object.defineProperty(event,'hbOriginalEvent',{value:original});
      // Blocking the browser's reload is not an editor shortcut being handled.
      if(handled)event.preventDefault();this.document.dispatchEvent(event);if(event.defaultPrevented){original.preventDefault();if(original.type==='keydown'||original.type==='keyup')original.stopImmediatePropagation();}
    };
    for(const type of ['click','dblclick','contextmenu','auxclick','keydown','keyup','pointerdown','pointermove','pointerup','pointercancel','input','change','dragenter','dragover','dragleave','drop','dragend'])doc.addEventListener(type,forward,{passive:false,capture:type==='keydown'||type==='keyup'});
    doc.querySelector('#detached-return').onclick=()=>this.restore(id,{close:true});
    for(const button of doc.querySelectorAll('[data-owner-command]'))button.onclick=()=>{focus();if(this.dock.options.ownerCommand)return this.dock.options.ownerCommand(button.dataset.ownerCommand);const key={save:'s',undo:'z',redo:'y'}[button.dataset.ownerCommand];this.document.dispatchEvent(new this.owner.KeyboardEvent('keydown',{key,code:'Key'+key.toUpperCase(),ctrlKey:true,bubbles:true,cancelable:true}));};
    child.hbEngineRequestClose=()=>{if(this.items.get(id)===item)this.restore(id,{close:false});child.chrome?.webview?.postMessage('hbengine.detached.close');if(!child.chrome?.webview)child.close();};
    child.addEventListener('pagehide',()=>{if(this.items.get(id)===item)this.restore(id,{close:false});},{once:true});
    item.observer=new MutationObserver(()=>{for(const [key,value] of Object.entries(this.document.body.dataset))doc.body.dataset[key]=value;});item.observer.observe(this.document.body,{attributes:true});
    this.dock.render();focus();resize();child.chrome?.webview?.postMessage('hbengine.detached.ready');return true;
  }
  restore(id,{close=false}={}){
    const key=this.items.has(id)?id:[...this.items].find(([,item])=>item.entry.id===id)?.[0],item=this.items.get(key);if(!item)return;this.items.delete(key);clearTimeout(item.startup);item.observer?.disconnect();item.entry.detached=false;
    try{if(!item.child.closed){const key=storageKey('hbengine.detached.windows'),bounds=JSON.parse(storage.getItem(key)||'{}');if(bounds&&typeof bounds==='object'&&!Array.isArray(bounds)){bounds[id]={width:item.child.innerWidth,height:item.child.innerHeight,left:item.child.screenX,top:item.child.screenY};storage.setItem(key,JSON.stringify(bounds));}}}catch{}
    if(this.dock.entries.get(item.entry.id)===item.entry){if(item.entry.external){const home=item.entry.home;home.parent.classList.remove('detached-'+item.entry.id);home.parent.insertBefore(item.entry.element,home.next?.parentNode===home.parent?home.next:null);}else this.dock.parking.append(item.entry.element);this.moved(item.entry);const pane=this.dock.paneFor(item.entry.id);if(pane)pane.active=item.entry.id;this.dock.render();this.dock.focus(item.entry.id);}
    if(close&&!item.child.closed){try{item.child.chrome?.webview?.postMessage('hbengine.detached.close');item.child.close();}catch{}}
  }
  moved(entry){entry.onDocumentMoved?.(entry.element.ownerDocument);entry.element.dispatchEvent(new Event('hb:document-moved'));for(const canvas of entry.element.querySelectorAll('canvas'))canvas.dispatchEvent(new Event('hb:document-moved'));}
  restoreAll(){for(const id of [...this.items.keys()])this.restore(id,{close:true});}
  dispose(){for(const handle of this.frames.keys())this.cancelAnimationFrame(handle);if(this.owner.hbEngineDetachedManager===this)delete this.owner.hbEngineDetachedManager;clearInterval(this.timer);this.restoreAll();this.owner.removeEventListener('pagehide',this.unload);if(this.owner.hbEngineAttachWindow===this.attach)delete this.owner.hbEngineAttachWindow;}
}
