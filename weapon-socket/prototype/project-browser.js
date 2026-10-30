import {editorAnimationFrame,cancelEditorAnimationFrame} from './detached-window.js';
import {storageKey,storage} from './project-session.js';
import {icon,assetIcon} from './icons.js';
import {assetTypes,assetTitle,assetSuffix} from './asset-documents.js';
import {blueprintClasses,derivesFrom} from './class-types.js';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export async function editorRequest(url,options={}){const response=await fetch(url,{...options,headers:{'X-HB-Editor':'1',...options.headers}});if(!response.ok){let message;try{message=(await response.json()).error;}catch{}throw Object.assign(Error(message||'요청 실패: '+response.status),{status:response.status});}return response;}
export const fileUrl=path=>globalThis.hbMobileFileUrl?globalThis.hbMobileFileUrl(path):'/api/file?path='+encodeURIComponent(path);
export async function droppedFiles(transfer){
  const roots=[...transfer.items].filter(i=>i.kind==='file').map(i=>({entry:i.webkitGetAsEntry?.(),file:i.getAsFile()})),files=[];
  const pending=roots.map(root=>root.entry?.isDirectory?{entry:root.entry}:root.file?{file:root.file}:null).filter(Boolean).reverse();
  while(pending.length){const task=pending.pop();if(task.file){files.push(task.file);continue;}const entry=task.entry;if(entry.isFile){const file=await new Promise((resolve,reject)=>entry.file(resolve,reject));files.push({file,relativePath:entry.fullPath.replace(/^\//,'')});}else if(entry.isDirectory){const reader=entry.createReader(),all=[];while(true){const children=await new Promise((resolve,reject)=>reader.readEntries(resolve,reject));if(!children.length)break;for(const child of children)all.push(child);}for(let i=all.length-1;i>=0;i--)pending.push({entry:all[i]});}}
  return files.length?files:[...transfer.files];
}
const browserKey=()=>storageKey('hbengine.project.browsers');
const browserId=id=>/^project(?::[1-9]\d{0,2})?$/.test(id);
const fileKinds={model:'모델',texture:'텍스처',media:'영상·오디오',file:'기타 파일'};
const filterKinds=()=>new Map([['all','모든 타입'],...Object.entries(assetTypes).map(([kind,type])=>[kind,type.label]),...Object.entries(fileKinds)]);
const folderPath=value=>typeof value==='string'&&value.length<=2000&&!/^(?:[A-Za-z]:|[\\/])/.test(value)&&!value.replaceAll('\\','/').split('/').includes('..');
function navigationState(value){
  if(!value||!folderPath(value.folder))return null;
  return {folder:value.folder,query:typeof value.query==='string'?value.query.slice(0,500):'',type:filterKinds().has(value.type)?value.type:'all',contents:value.contents===true,recursive:value.recursive!==false,selected:Array.isArray(value.selected)?value.selected.filter(path=>typeof path==='string'&&path.length<=2000):[]};
}
function browserStore(){
  try{const value=JSON.parse(storage.getItem(browserKey()));if(value?.version===1&&value.instances&&typeof value.instances==='object'&&!Array.isArray(value.instances))return value;}catch{}
  return {version:1,instances:{}};
}
export const savedBrowserIds=()=>Object.keys(browserStore().instances).filter(browserId);
export function projectBrowserOwnsKey(event){if(event.isComposing)return false;const mod=event.ctrlKey||event.metaKey;if(mod&&event.key.toLowerCase()==='f')return true;if(event.target.closest?.('input,textarea,select,[contenteditable]'))return false;return ['ArrowDown','ArrowUp','ArrowLeft','ArrowRight','Home','End','PageDown','PageUp','Enter','Backspace','F2',' '].includes(event.key)&&!event.altKey||mod&&['a','f'].includes(event.key.toLowerCase())||!mod&&!event.altKey&&event.key.length===1;}
export class ProjectBrowser {
  get document(){return this.el.ownerDocument||globalThis.document;}
  constructor(element,breadcrumb,hooks={},options={}){
    this.el=element;this.breadcrumb=breadcrumb;this.hooks=hooks;this.id=browserId(options.id)?options.id:'project';this.disposed=false;
    const saved=browserStore().instances[this.id],fallback={folder:this.id==='project'?storage.getItem(storageKey('hbengine.project.folder'))||'Assets':'Assets',type:'all',recursive:true};
    const initial=navigationState(saved)||navigationState(fallback)||navigationState({folder:'Assets'});
    if(options.folder!==undefined&&folderPath(options.folder)){initial.folder=options.folder;initial.query='';initial.selected=[];}
    this.folder=initial.folder;this.view=saved?.view==='tiles'||!saved&&this.id==='project'&&storage.getItem(storageKey('hbengine.project.view'))==='tiles'?'tiles':'list';this.selected=new Set(initial.selected);this.entries=[];this.request=0;
    this.history=options.folder===undefined&&Array.isArray(saved?.history)?saved.history.map(navigationState).filter(Boolean).slice(-80):[initial];
    if(!this.history.length)this.history=[initial];
    this.historyIndex=options.folder===undefined&&Number.isInteger(saved?.historyIndex)?Math.max(0,Math.min(this.history.length-1,saved.historyIndex)):this.history.length-1;
    this.history[this.historyIndex]=initial;
    const filters=[...filterKinds()].map(([kind,label])=>`<option value="${kind}">${esc(label)}</option>`).join('');
    element.innerHTML='<div class="project-tree" aria-label="프로젝트 폴더"><div class="project-navigation"><button data-project-back aria-label="이전 폴더" title="뒤로 (Alt+왼쪽)">'+icon('chevron')+'</button><button data-project-forward aria-label="다음 폴더" title="앞으로 (Alt+오른쪽)">'+icon('chevron')+'</button><button data-project-up aria-label="상위 폴더" title="상위 폴더">'+icon('chevron')+'</button></div><div data-project-folders></div></div><div class="project-files"><div class="project-tools"><input data-project-search type="search" placeholder="파일 검색" aria-label="프로젝트 파일 검색"><select data-project-type aria-label="파일 타입 필터">'+filters+'</select><label><input type="checkbox" data-contents>내용</label><label><input type="checkbox" data-recursive checked>하위 폴더</label><button data-project-refresh aria-label="프로젝트 새로고침">'+icon('refresh')+'</button><div class="project-view-toggle" role="group" aria-label="파일 표시 방식"><button data-project-view="list" aria-label="목록 보기" title="목록 보기" aria-pressed="false">'+icon('list')+'</button><button data-project-view="tiles" aria-label="타일 보기" title="타일 보기" aria-pressed="false">'+icon('tiles')+'</button></div></div><div class="project-list-heading" aria-hidden="true"><span>이름</span><span>타입</span><span>경로</span></div><div data-project-grid class="asset-grid project-grid" role="listbox" aria-multiselectable="true" aria-label="프로젝트 파일" tabindex="0"></div><div class="project-status"><span data-project-results></span><button data-open-selected>선택 열기</button><button data-create-asset>새 에셋</button><button data-new-folder>새 폴더</button></div></div>';
    if(element.dataset)element.dataset.projectBrowser=this.id;
    this.grid=element.querySelector('[data-project-grid]');this.grid.dataset.virtual='true';this.grid.addEventListener('scroll',this.onScroll=()=>this.scheduleEntries(),{passive:true});this.resizeObserver=new ResizeObserver(()=>this.scheduleEntries());this.resizeObserver.observe(this.grid);
    this.applyNavigation(initial);this.setView(this.view,false);this.updateNavigation();
    element.addEventListener('input',event=>{if(event.target.matches('[data-project-search]')){clearTimeout(this.searchTimer);this.rememberNavigation();this.searchTimer=setTimeout(()=>this.refresh(),180);}});
    element.addEventListener('change',event=>{if(event.target.matches('[data-project-type],[data-contents],[data-recursive]'))this.refresh();});
    element.addEventListener('click',event=>{
      const target=event.target,view=target.closest('[data-project-view]'),folder=target.closest('[data-project-folder]'),card=target.closest('[data-project-entry]');
      if(view)this.setView(view.dataset.projectView);else if(folder)this.navigate(folder.dataset.projectFolder);else if(card)this.select(Number(card.dataset.projectEntry),event);
      else if(target.closest('[data-project-back]'))this.navigateHistory(-1);else if(target.closest('[data-project-forward]'))this.navigateHistory(1);else if(target.closest('[data-project-up]'))this.navigate(this.folder.split('/').slice(0,-1).join('/'));
      else if(target.closest('[data-project-refresh]'))this.refresh();else if(target.closest('[data-open-selected]'))this.openSelected();else if(target.closest('[data-create-asset]'))this.createDialog();else if(target.closest('[data-new-folder]'))this.nameDialog('folder');
    });
    element.addEventListener('dblclick',event=>{const card=event.target.closest('[data-project-entry]');if(card)this.open(this.entries[Number(card.dataset.projectEntry)]);});
    element.addEventListener('keydown',event=>{
      if(event.isComposing)return;const mod=event.ctrlKey||event.metaKey;if(event.target.matches('input,textarea,select,[contenteditable]')&&!(mod&&event.key.toLowerCase()==='f'))return;
      if(mod&&event.key.toLowerCase()==='f'){event.preventDefault();event.stopPropagation();const search=this.el.querySelector('[data-project-search]');search.focus();search.select();}
      else if(mod&&event.key.toLowerCase()==='a'){event.preventDefault();event.stopPropagation();this.selected=new Set(this.entries.map(file=>file.path));this.selection();}
      else if(['ArrowDown','ArrowUp','ArrowLeft','ArrowRight','Home','End','PageDown','PageUp'].includes(event.key)&&this.entries.length){event.preventDefault();event.stopPropagation();const columns=this.virtualLayout?.columns||1,step=Math.max(1,Math.floor(this.grid.clientHeight/(this.virtualLayout?.stride||35)))*columns,current=Number(event.target.closest('[data-project-entry]')?.dataset.projectEntry??this.focusedIndex??this.anchor??0),delta={ArrowDown:columns,ArrowUp:-columns,ArrowLeft:-1,ArrowRight:1,PageDown:step,PageUp:-step}[event.key];this.focusEntry(event.key==='Home'?0:event.key==='End'?this.entries.length-1:current+delta,{select:!mod||event.shiftKey,event});}
      else if(event.key===' '&&this.entries.length){event.preventDefault();event.stopPropagation();const index=Number(event.target.closest('[data-project-entry]')?.dataset.projectEntry??this.focusedIndex??0);this.select(index,{ctrlKey:true});}
      else if(!mod&&!event.altKey&&event.key.length===1&&!/\s/.test(event.key)){event.preventDefault();event.stopPropagation();const now=performance.now(),key=event.key.toLocaleLowerCase();this.typeAhead=now-(this.typeAheadAt||0)<700?(this.typeAhead||'')+key:key;this.typeAheadAt=now;const repeated=[...this.typeAhead].every(c=>c===key),prefix=repeated?key:this.typeAhead,current=Number(event.target.closest('[data-project-entry]')?.dataset.projectEntry??this.focusedIndex??-1);for(let n=1;n<=this.entries.length;n++){const index=(current+n)%this.entries.length;if(this.entries[index].name.toLocaleLowerCase().startsWith(prefix)){this.focusEntry(index);break;}}}
      else if(event.key==='Enter'){event.preventDefault();event.stopPropagation();this.openSelected();}
      else if(event.key==='Backspace'){event.preventDefault();event.stopPropagation();this.navigateHistory(-1);}
      else if(event.key==='F2'){event.preventDefault();event.stopPropagation();this.nameDialog('rename');}
    });
    element.addEventListener('contextmenu',event=>{
      event.preventDefault();event.stopPropagation();const card=event.target.closest('[data-project-entry]'),folder=event.target.closest('[data-project-folder]');
      if(folder){this.menu(event,{folder:folder.dataset.projectFolder});return;}
      if(card&&!this.selected.has(this.entries[Number(card.dataset.projectEntry)].path))this.select(Number(card.dataset.projectEntry),{});
      this.menu(event);
    });
    element.addEventListener('dragstart',event=>{
      const card=event.target.closest('[data-project-entry]');if(!card)return;const file=this.entries[Number(card.dataset.projectEntry)];if(!this.selected.has(file.path))this.select(Number(card.dataset.projectEntry),{});
      event.dataTransfer.setData('application/x-hb-assets',JSON.stringify(this.entries.filter(file=>this.selected.has(file.path)&&file.kind!=='folder')));event.dataTransfer.effectAllowed='copy';
    });
    this.ready=this.refresh();
  }
  snapshot(){return {folder:this.folder,query:this.el.querySelector('[data-project-search]').value,type:this.el.querySelector('[data-project-type]').value,contents:this.el.querySelector('[data-contents]').checked,recursive:this.el.querySelector('[data-recursive]').checked,selected:[...this.selected]};}
  applyNavigation(state){
    this.folder=state.folder;this.selected=new Set(state.selected);this.anchor=undefined;
    this.el.querySelector('[data-project-search]').value=state.query;this.el.querySelector('[data-project-type]').value=state.type;this.el.querySelector('[data-contents]').checked=state.contents;this.el.querySelector('[data-recursive]').checked=state.recursive;
  }
  rememberNavigation(){
    if(this.disposed)return;const state=this.snapshot();this.history[this.historyIndex]=state;const store=browserStore();
    store.instances[this.id]={...state,view:this.view,history:this.history.map((item,index)=>index===this.historyIndex?{...item,selected:[]}:item),historyIndex:this.historyIndex};storage.setItem(browserKey(),JSON.stringify(store));
    if(this.id==='project'){storage.setItem(storageKey('hbengine.project.folder'),this.folder);storage.setItem(storageKey('hbengine.project.view'),this.view);}
  }
  updateNavigation(){
    this.el.querySelector('[data-project-back]').disabled=this.historyIndex<=0;
    this.el.querySelector('[data-project-forward]').disabled=this.historyIndex>=this.history.length-1;
    this.el.querySelector('[data-project-up]').disabled=!this.folder;
    if(this.breadcrumb)this.breadcrumb.textContent=this.folder||'Project';
  }
  setView(view,persist=true){
    if(view!=='list'&&view!=='tiles')return;
    this.view=view;this.el.querySelector('[data-project-grid]').dataset.view=view;this.el.querySelector('.project-list-heading').hidden=view!=='list';
    this.el.querySelectorAll('[data-project-view]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.projectView===view)));
    if(this.grid){this.grid.scrollTop=0;this.renderEntries(true);}
    if(persist)this.rememberNavigation();
  }
  scheduleEntries(){if(this.disposed||this.virtualFrame!==undefined)return;this.virtualFrame=editorAnimationFrame(this.el,()=>{this.virtualFrame=undefined;this.renderEntries();});}
  renderEntries(force=false){
    if(this.disposed||!this.grid)return;const grid=this.grid,list=this.view==='list',gap=list?0:8,padTop=list?0:10,width=Math.max(1,grid.clientWidth-(list?16:20)),columns=list?1:Math.max(1,Math.floor((width+gap)/(118+gap))),stride=(list?35:113)+gap,totalRows=Math.ceil(this.entries.length/columns),startRow=Math.min(Math.max(0,totalRows-1),Math.max(0,Math.floor((grid.scrollTop-padTop)/stride)-3)),endRow=Math.min(totalRows,startRow+Math.ceil(grid.clientHeight/stride)+7),start=Math.min(this.entries.length,startRow*columns),end=Math.min(this.entries.length,endRow*columns),key=[this.view,columns,start,end,this.entries.length].join(':');
    this.virtualLayout={columns,stride,padTop,start,end};if(!force&&key===this.virtualKey)return;this.virtualKey=key;const active=this.document.activeElement,focused=grid.contains(active)?active.closest('[data-project-entry]')?.dataset.projectEntry:null;
    grid.innerHTML='<div class="project-virtual-space" style="height:'+Math.max(0,totalRows*stride-gap)+'px"><div class="project-virtual-items" style="top:'+(startRow*stride)+'px;grid-template-columns:repeat('+columns+',minmax(0,1fr));grid-auto-rows:'+(stride-gap)+'px;gap:'+gap+'px">'+this.entries.slice(start,end).map((file,offset)=>{const index=start+offset;return `<button class="asset-card ${file.kind} ${this.selected.has(file.path)?'selected':''}" data-project-entry="${index}" draggable="${file.kind!=='folder'}" role="option" aria-posinset="${index+1}" aria-setsize="${this.entries.length}" aria-selected="${this.selected.has(file.path)}" title="${esc(file.path+(file.line?':'+file.line+'\n'+file.match:''))}"><span class="project-thumbnail">${file.kind==='texture'?`<img src="${fileUrl(file.path)}" loading="lazy" alt="">`:icon(assetIcon(file.kind))}</span><span class="asset-name">${esc(this.view==='list'?file.name:assetTitle(file.name))}</span><span class="asset-type">${esc(assetTypes[file.kind]?.label||({folder:'폴더',model:'Static Mesh',texture:'Texture',media:'Media',code:'C++',file:'File'}[file.kind]||file.kind))}${file.line?' · '+file.line+'줄':''}</span><span class="asset-path">${esc(file.path)}</span></button>`;}).join('')+'</div></div>';
    if(focused!==null&&focused!==undefined)(grid.querySelector('[data-project-entry="'+focused+'"]')||grid).focus({preventScroll:true});
  }
  focusEntry(index,{select=true,event={}}={}){if(!this.entries.length)return;index=Math.max(0,Math.min(this.entries.length-1,index));this.focusedIndex=index;const layout=this.virtualLayout||{columns:1,stride:35,padTop:0},top=Math.floor(index/layout.columns)*layout.stride+layout.padTop;if(top<this.grid.scrollTop)this.grid.scrollTop=top;else if(top+layout.stride>this.grid.scrollTop+this.grid.clientHeight)this.grid.scrollTop=top+layout.stride-this.grid.clientHeight;this.renderEntries(true);if(select)this.select(index,event);this.grid.querySelector('[data-project-entry="'+index+'"]')?.focus({preventScroll:true});}
  inspect({offset=0,limit=100}={}){if(!Number.isSafeInteger(offset)||offset<0||!Number.isSafeInteger(limit)||limit<1||limit>1000)throw Error('콘텐츠 조회 페이지를 확인하세요.');const {selected,...state}=this.snapshot(),end=Math.min(this.entries.length,offset+limit);return {id:this.id,...state,view:this.view,total:this.entries.length,selectedCount:this.selected.size,offset,nextOffset:end<this.entries.length?end:null,rendered:{start:this.virtualLayout?.start||0,end:this.virtualLayout?.end||0,cards:this.grid.querySelectorAll('[data-project-entry]').length},entries:this.entries.slice(offset,end).map(file=>({...file,selected:this.selected.has(file.path)}))};}
  async navigate(folder){
    if(this.disposed||!folderPath(folder))return false;if(folder===this.folder){await this.refresh();return true;}
    clearTimeout(this.searchTimer);this.rememberNavigation();const state={...this.snapshot(),folder,query:'',selected:[]};
    this.history=this.history.slice(0,this.historyIndex+1);this.history.push(state);if(this.history.length>80)this.history.shift();this.historyIndex=this.history.length-1;
    this.applyNavigation(state);this.updateNavigation();await this.refresh();return true;
  }
  async navigateHistory(direction){
    if(this.disposed||direction!==-1&&direction!==1)return false;const next=this.historyIndex+direction;if(next<0||next>=this.history.length)return false;
    clearTimeout(this.searchTimer);this.rememberNavigation();this.historyIndex=next;this.applyNavigation(this.history[next]);this.updateNavigation();await this.refresh();return true;
  }
  async refresh(){
    if(this.disposed)return;this.rememberNavigation();const request=++this.request,state=this.snapshot();
    try{
      const query=new URLSearchParams({folder:state.folder,q:state.query,type:state.type,contents:state.contents?'1':'0',recursive:state.recursive&&!!state.query?'1':'0'}),data=await (await editorRequest('/api/project?'+query)).json();
      if(this.disposed||request!==this.request)return;this.entries=data.entries;this.anchor=undefined;const available=new Set(this.entries.map(f=>f.path));this.selected=new Set([...this.selected].filter(path=>available.has(path)));
      this.el.querySelector('[data-project-folders]').innerHTML=[{path:'',name:'Project',kind:'folder'},...data.folders].map(folder=>`<button data-project-folder="${esc(folder.path)}" class="${folder.path===this.folder?'active':''}" style="padding-left:${10+folder.path.split('/').length*11}px" title="${esc(folder.path)}">${icon('folder')}<span>${esc(folder.name)}</span></button>`).join('');
      if(this.breadcrumb){this.breadcrumb.textContent=this.folder||'Project';this.breadcrumb.title=data.root;}
      const key=query.toString();if(this.refreshKey!==key){this.grid.scrollTop=0;this.focusedIndex=undefined;}this.refreshKey=key;this.renderEntries(true);
      this.hooks.files?.(data.entries);this.selection();this.updateNavigation();
    }catch(error){if(this.folder&&error.message.includes('ENOENT'))return this.navigate('');this.hooks.error?.(error.message);}
  }
  select(index,event){
    const file=this.entries[index];if(!file)return;
    if(event.shiftKey&&this.anchor!==undefined){if(!event.ctrlKey&&!event.metaKey)this.selected.clear();for(let i=Math.min(this.anchor,index);i<=Math.max(this.anchor,index);i++)this.selected.add(this.entries[i].path);}
    else if(event.ctrlKey||event.metaKey){this.selected.has(file.path)?this.selected.delete(file.path):this.selected.add(file.path);this.anchor=index;}
    else{this.selected=new Set([file.path]);this.anchor=index;}
    this.selection();this.hooks.select?.(file);
  }
  selection(){
    this.el.querySelectorAll('[data-project-entry]').forEach(card=>{const selected=this.selected.has(this.entries[Number(card.dataset.projectEntry)]?.path);card.classList.toggle('selected',selected);card.setAttribute('aria-selected',String(selected));});
    this.el.querySelector('[data-project-results]').textContent=this.entries.length+'개 · '+this.selected.size+'개 선택';this.rememberNavigation();
  }
  async open(file){try{if(!file)return;if(file.kind==='folder')await this.navigate(file.path);else await this.hooks.open?.(file);}catch(error){this.hooks.error?.(error.message);}}
  async openSelected(){for(const file of this.entries.filter(file=>this.selected.has(file.path)))await this.open(file);}
  dispose(){this.rememberNavigation();this.disposed=true;this.request++;clearTimeout(this.searchTimer);if(this.virtualFrame!==undefined)cancelEditorAnimationFrame(this.el,this.virtualFrame);this.virtualFrame=undefined;this.resizeObserver.disconnect();this.grid.removeEventListener('scroll',this.onScroll);this.dismissMenu?.();}
  async reimport(){try{const paths=this.entries.filter(file=>file.kind!=='folder'&&this.selected.has(file.path)).map(file=>file.path);const result=await(await editorRequest('/api/asset/reimport',{method:'POST',body:JSON.stringify({paths})})).json();await this.hooks.reimport?.(result);await this.refresh();}catch(error){this.hooks.error?.(error.message);}}
  async assetInfo(file){try{const info=await(await editorRequest('/api/asset/info?path='+encodeURIComponent(file.path))).json(),dialog=this.document.createElement('dialog');dialog.className='asset-reference-dialog';dialog.innerHTML='<div class="dialog-heading"><h2>'+esc(assetTitle(file.path))+'</h2><button data-close aria-label="에셋 정보 닫기">'+icon('close')+'</button></div><dl><dt>ID</dt><dd>'+esc(info.id)+'</dd><dt>상태</dt><dd>'+esc(info.error||'정상')+'</dd><dt>가져온 시간</dt><dd>'+esc(info.importedAt)+'</dd><dt>원본 SHA-256</dt><dd>'+esc(info.hash)+'</dd></dl>'+[['dependencies','참조하는 에셋'],['referencers','이 에셋을 사용하는 파일']].map(([key,label])=>'<section><h3>'+label+'</h3>'+info[key].map((entry,index)=>'<button data-reference="'+key+':'+index+'" '+(entry.missing?'disabled':'')+'>'+icon(entry.missing?'warning':assetIcon(entry.kind))+esc(entry.path)+(entry.missing?' · 파일 없음':'')+'</button>').join('')+'</section>').join('');dialog.onclick=event=>{if(event.target.closest('[data-close]'))dialog.close();const button=event.target.closest('[data-reference]');if(button){const [key,index]=button.dataset.reference.split(':');dialog.close();this.open(info[key][index]);}};dialog.onclose=()=>dialog.remove();this.document.body.append(dialog);dialog.showModal();}catch(error){this.hooks.error?.(error.message);}}
  nameDialog(mode){const selected=this.entries.find(e=>this.selected.has(e.path));if(mode==='rename'&&this.selected.size!==1)return;const suffix=mode==='rename'?Object.values(assetSuffix).find(s=>selected.name.endsWith(s))||'':'';const dialog=this.document.createElement('dialog');dialog.innerHTML=`<form><div class="dialog-heading"><h2>${mode==='folder'?'새 폴더':'이름 변경'}</h2></div><input aria-label="이름" required maxlength="120" value="${mode==='rename'?esc(suffix?assetTitle(selected.name):selected.name):''}"><div class="dialog-footer"><button type="button" data-cancel>취소</button><button class="primary-button">확인</button></div></form>`;this.document.body.append(dialog);dialog.querySelector('[data-cancel]').onclick=()=>dialog.close();dialog.onclose=()=>dialog.remove();
    dialog.querySelector('form').onsubmit=async e=>{e.preventDefault();try{const name=dialog.querySelector('input').value.trim();if(!name||name.includes('/')||name.includes('\\'))throw Error('이름을 확인하세요.');const parent=mode==='rename'?selected.path.split('/').slice(0,-1).join('/'):this.folder;const relative=(parent?parent+'/':'')+name+(suffix&&!name.endsWith(suffix)?suffix:'');await editorRequest(mode==='folder'?'/api/folder':'/api/rename',{method:'POST',body:JSON.stringify(mode==='folder'?{path:relative}:{from:selected.path,to:relative})});if(mode==='rename')this.hooks.rename?.(selected.path,relative);dialog.close();await this.refresh();}catch(error){this.hooks.error?.(error.message);}};dialog.showModal();dialog.querySelector('input').focus();dialog.querySelector('input').select();}
  menu(e,{folder=this.folder}={}){
    this.dismissMenu?.();this.document.querySelector('.project-menu')?.remove();const menu=this.document.createElement('div');menu.className='project-menu';menu.role='menu';
    const header=this.document.createElement('div');header.className='menu-location';header.textContent=folder||'Project';menu.append(header);
    const add=(label,ic,action)=>{const b=this.document.createElement('button');b.role='menuitem';b.innerHTML=icon(ic)+'<span>'+esc(label)+'</span>';b.onclick=()=>{this.dismissMenu?.();action();};menu.append(b);};
    if(this.hooks.newBrowser)add('새 콘텐츠 브라우저에서 열기','folder',()=>this.hooks.newBrowser(folder));
    if(this.hooks.windowMenu)add('다른 창 추가','layers',()=>this.hooks.windowMenu(e));
    const selectedFiles=this.entries.filter(file=>this.selected.has(file.path)&&file.kind!=='folder');if(folder===this.folder&&selectedFiles.length){add('다시 가져오기','refresh',()=>this.reimport());if(selectedFiles.length===1){add('에셋 정보','data',()=>this.assetInfo(selectedFiles[0]));if(selectedFiles[0].kind==='model'&&this.hooks.modelImport)add('가져오기 설정','settings',()=>this.hooks.modelImport(selectedFiles[0]).catch(error=>this.hooks.error?.(error.message)));if(this.hooks.references)add('참조 뷰어','nodes',()=>this.hooks.references(selectedFiles[0]));}}
    if(this.selected.size&&folder===this.folder){add('열기','external',()=>this.openSelected());add('이름 변경','file',()=>this.nameDialog('rename'));const file=this.entries.find(f=>this.selected.has(f.path));if(this.selected.size===1&&file?.kind==='blueprint')add('자식 블루프린트 생성','blueprint',()=>this.createDialog('blueprint',file.path));if(this.selected.size===1&&file?.kind==='code')add('이 클래스로 블루프린트 생성','blueprint',()=>this.hooks.wrap?.(file));add('에셋 경로 복사','copy',()=>this.document.defaultView.navigator.clipboard.writeText([...this.selected].join('\n')));}
    const label=this.document.createElement('div');label.className='menu-section';label.textContent='새로 만들기';menu.append(label);
    for(const [kind,type] of Object.entries(assetTypes).filter(([,type])=>!type.sourceOnly))add(type.label,assetIcon(kind),async()=>{await this.navigate(folder);this.createDialog(kind);});
    add('새 폴더','folder',async()=>{await this.navigate(folder);this.nameDialog('folder');});add('가져오기','upload',()=>this.hooks.import?.());
    this.document.body.append(menu);menu.style.left=Math.max(6,Math.min(e.clientX,this.document.defaultView.innerWidth-menu.offsetWidth-6))+'px';menu.style.top=Math.max(6,Math.min(e.clientY,this.document.defaultView.innerHeight-menu.offsetHeight-6))+'px';
    const close=()=>{menu.remove();this.document.removeEventListener('pointerdown',dismiss);this.dismissMenu=null;},dismiss=e=>{if(!menu.contains(e.target))close();};this.dismissMenu=close;this.document.addEventListener('pointerdown',dismiss);menu.onkeydown=e=>{if(e.key==='Escape'){e.preventDefault();close();}else if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)){e.preventDefault();const buttons=[...menu.querySelectorAll('button')],i=buttons.indexOf(this.document.activeElement);buttons[e.key==='Home'?0:e.key==='End'?buttons.length-1:(i+(e.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length]?.focus();}};menu.querySelector('button')?.focus();
  }
  createDialog(kind='blueprint',blueprintParent=''){
    const dialog=this.document.createElement('dialog');dialog.className='create-asset-dialog';
    dialog.innerHTML='<form><header><div><h2>에셋 만들기</h2><span>'+esc(this.folder||'Project')+'</span></div><button type="button" data-cancel aria-label="닫기">'+icon('close')+'</button></header><div class="create-asset-body"><nav class="asset-type-list" aria-label="에셋 종류">'+[...new Set(Object.values(assetTypes).filter(t=>!t.sourceOnly).map(t=>t.group||'기타'))].map(group=>'<div class="asset-type-group">'+esc(group)+'</div>'+Object.entries(assetTypes).filter(([,t])=>!t.sourceOnly&&(t.group||'기타')===group).map(([k,t])=>'<button type="button" data-kind="'+k+'">'+icon(assetIcon(k))+'<span>'+t.label+'</span></button>').join('')).join('')+'</nav><section><div data-parents class="parent-class-grid" aria-label="부모 클래스">'+Object.entries(blueprintClasses).map(([k,t])=>'<button type="button" data-parent="'+k+'">'+icon(t.icon)+'<strong>'+t.label+'</strong><span>'+t.ko+'</span></button>').join('')+'</div><label class="asset-name-field" data-blueprint-parents>프로젝트 블루프린트<select data-blueprint-parent aria-label="블루프린트 부모 클래스"><option value="">기본 클래스</option></select></label><label class="asset-name-field">이름<input data-name aria-label="새 에셋 이름" required maxlength="80"></label><label class="asset-tick-field" data-code-tick hidden><input type="checkbox" data-native-tick>매 프레임 업데이트 (Tick)</label><p class="create-error" role="alert"></p></section></div><footer><button type="button" data-cancel>취소</button><button class="primary-button" type="submit">만들기</button></footer></form>';
    this.document.body.append(dialog);let selectedKind=kind,parent='Actor';const select=next=>{selectedKind=next;dialog.querySelectorAll('[data-kind]').forEach(b=>b.classList.toggle('selected',b.dataset.kind===next));dialog.querySelector('[data-parents]').hidden=!['blueprint','code'].includes(next);dialog.querySelector('[data-blueprint-parents]').hidden=next!=='blueprint';dialog.querySelector('[data-code-tick]').hidden=next!=='code';if(next==='code'&&parent.startsWith('Assets/')){parent='Actor';dialog.querySelector('[data-blueprint-parent]').value='';}const tick=dialog.querySelector('[data-native-tick]');tick.disabled=!derivesFrom(parent,'Actor');if(tick.disabled)tick.checked=false;dialog.querySelector('[data-name]').value=assetTypes[next].prefix+'New'+(next==='code'?'Actor':'Asset');};select(kind);
    dialog.querySelector('[data-parent="Actor"]').classList.add('selected');dialog.onclick=e=>{const b=e.target.closest('button');if(!b)return;if(b.hasAttribute('data-cancel'))dialog.close();if(b.dataset.kind)select(b.dataset.kind);if(b.dataset.parent){dialog.querySelector('[data-blueprint-parent]').value='';parent=b.dataset.parent;const tick=dialog.querySelector('[data-native-tick]');tick.disabled=!derivesFrom(parent,'Actor');if(tick.disabled)tick.checked=false;dialog.querySelectorAll('[data-parent]').forEach(x=>x.classList.toggle('selected',x===b));dialog.querySelector('[data-name]').value=assetTypes[selectedKind].prefix+'New'+parent;}};
    const parentSelect=dialog.querySelector('[data-blueprint-parent]');parentSelect.onchange=()=>{parent=parentSelect.value||'Actor';dialog.querySelectorAll('[data-parent]').forEach(b=>b.classList.toggle('selected',b.dataset.parent===parent));};editorRequest('/api/project?recursive=1').then(r=>r.json()).then(data=>{if(!dialog.isConnected)return;for(const file of data.entries.filter(f=>f.kind==='blueprint')){const option=this.document.createElement('option');option.value=file.path;option.textContent=assetTitle(file.path)+' · '+file.path;parentSelect.append(option);}if(blueprintParent){parentSelect.value=blueprintParent;parentSelect.onchange();dialog.querySelector('[data-name]').value='BP_'+assetTitle(blueprintParent).replace(/^BP_/,'')+'_Child';}}).catch(error=>{if(dialog.isConnected)dialog.querySelector('.create-error').textContent=error.message;});
    dialog.querySelector('form').onsubmit=async e=>{e.preventDefault();const button=dialog.querySelector('[type=submit]');button.disabled=true;try{const name=dialog.querySelector('[data-name]').value.trim(),file=await (await editorRequest('/api/asset/create',{method:'POST',body:JSON.stringify({folder:this.folder,kind:selectedKind,name,parent,...(selectedKind==='code'?{tick:dialog.querySelector('[data-native-tick]').checked}:{})})})).json();dialog.close();await this.refresh();this.selected=new Set([file.path]);this.selection();const index=this.entries.findIndex(f=>f.path===file.path);if(index>=0)this.focusEntry(index,{select:false});await this.open(file);}catch(error){dialog.querySelector('.create-error').textContent=error.message;}finally{button.disabled=false;}};
    dialog.onclose=()=>dialog.remove();dialog.showModal();dialog.querySelector('[data-name]').select();
  }
}
