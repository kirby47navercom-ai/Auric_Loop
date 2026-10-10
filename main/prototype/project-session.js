// The project identity is loaded before any editor recovery or layout storage is read.
export function validSession(value){
  const relative=path=>typeof path==='string'&&path.length>0&&path.length<=1000&&!/^(?:[A-Za-z]:|[\\/])/.test(path)&&!path.replaceAll('\\','/').split('/').includes('..');
  return value&&typeof value.id==='string'&&value.id.length>0&&value.id.length<=200&&typeof value.name==='string'&&value.name.length>0&&value.name.length<=120&&typeof value.projectFile==='string'&&value.projectFile.length>0&&value.projectFile.length<=2000&&relative(value.startupScene)&&relative(value.startupBlueprint)&&(value.legacyStorage===undefined||typeof value.legacyStorage==='boolean');
}
export function storageKey(key,project=session){return key+'.project.'+encodeURIComponent(project?.id||'standalone');}
function legacyKeys(storage){const keys=['hbengine-ui-scene-v1','hbengine.documents.v2','hbengine.docks.v2','hbengine.detached.windows','hbengine.viewport.presentation','hbengine.viewport.camera','hbengine.project.folder'];for(let i=0;i<storage.length;i++){const key=storage.key(i);if(key?.startsWith('hbengine.savegame.')&&!key.includes('.project.'))keys.push(key);}return keys;}
export function migrateLegacyStorage(storage,project){
  const marker=storageKey('hbengine.storage-migrated.v1',project);if(project?.legacyStorage!==true||storage.getItem(marker))return;
  for(const key of legacyKeys(storage)){const value=storage.getItem(key),next=storageKey(key,project);if(value!==null&&storage.getItem(next)===null)storage.setItem(next,value);}
  storage.setItem(marker,'1');
}
// Browser storage is a synchronous cache backed by project-owned disk data; the
// qualified localStorage keys remain a backup of this origin's last editor state.
export async function createProjectStorage(project,{backup,request=globalThis.fetch,debounce=350,onError=()=>{}}={}){
  const suffix='.project.'+encodeURIComponent(project.id),bases=new Set(['hbengine-ui-scene-v1','hbengine.documents.v2','hbengine.docks.v2','hbengine.detached.windows','hbengine.viewport.presentation','hbengine.viewport.camera','hbengine.project.folder','hbengine.project.view','hbengine.project.browsers','hbengine.editor.preferences','hbengine.editor.shortcuts','hbengine.storage-migrated.v1']);
  const owns=key=>{if(typeof key!=='string'||key.length>1000||!key.endsWith(suffix))return false;const base=key.slice(0,-suffix.length);return bases.has(base)||base.startsWith('hbengine.savegame.')&&base.length>18&&!/[\x00-\x1f]/.test(base);};
  const response=await request('/api/storage?project='+encodeURIComponent(project.id),{cache:'no-store'});
  if(!response.ok)throw Error('프로젝트 복구 저장소를 읽을 수 없어요.');
  const saved=await response.json();if(saved?.version!==1||!saved.items||typeof saved.items!=='object'||Array.isArray(saved.items)||!Object.entries(saved.items).every(([key,value])=>owns(key)&&typeof value==='string'))throw Error('프로젝트 복구 저장소 검증 실패');
  const values=new Map(Object.entries(saved.items)),pending=new Map(),marker=storageKey('hbengine.storage-migrated.v1',project);let timer,inFlight;
  const error=issue=>{onError(issue);return issue;};
  const saveBackup=(key,value)=>{try{if(value===null)backup?.removeItem(key);else backup?.setItem(key,value);}catch(issue){error(issue);}};
  if(!values.has(marker)){
    for(let i=0;i<(backup?.length||0);i++){const key=backup.key(i);if(owns(key)&&!values.has(key)){const value=backup.getItem(key);if(value!==null){values.set(key,value);pending.set(key,value);}}}
    if(backup&&project.legacyStorage===true&&!backup.getItem(marker))for(const key of legacyKeys(backup)){const next=storageKey(key,project),value=backup.getItem(key);if(owns(next)&&value!==null&&!values.has(next)){values.set(next,value);pending.set(next,value);}}
    values.set(marker,'1');pending.set(marker,'1');
  }
  for(const [key,value] of values)saveBackup(key,value);
  const adapter={
    get length(){return values.size;},key:index=>[...values.keys()][index]??null,getItem:key=>values.get(key)??null,
    setItem(key,value){if(!owns(key))throw Error('다른 프로젝트 저장 키는 쓸 수 없어요.');value=String(value);if(values.get(key)===value)return;values.set(key,value);pending.set(key,value);saveBackup(key,value);queue();},
    removeItem(key){if(!owns(key))throw Error('다른 프로젝트 저장 키는 쓸 수 없어요.');values.delete(key);pending.set(key,null);saveBackup(key,null);queue();},
    async flush({keepalive=false}={}){
      clearTimeout(timer);if(inFlight)return inFlight;
      inFlight=(async()=>{while(pending.size){const changes=Object.fromEntries(pending),result=await request('/api/storage',{method:'PUT',headers:{'X-HB-Editor':'1','Content-Type':'application/json'},body:JSON.stringify({id:project.id,items:changes}),keepalive});
        if(!result.ok){let message;try{message=(await result.json()).error;}catch{}throw Error(message||'프로젝트 복구 저장 실패');}
        for(const [key,value] of Object.entries(changes))if(pending.get(key)===value)pending.delete(key);
      }})().catch(issue=>{throw error(issue);}).finally(()=>{inFlight=null;if(!pending.size)clearTimeout(timer);});return inFlight;
    }
  };
  function queue(){clearTimeout(timer);timer=setTimeout(()=>adapter.flush().catch(()=>{}),debounce);}
  if(pending.size)queue();return adapter;
}
const nodeValues=new Map();
const nodeStorage={get length(){return globalThis.localStorage?.length??nodeValues.size;},key:index=>globalThis.localStorage?.key?globalThis.localStorage.key(index):[...nodeValues.keys()][index]??null,getItem:key=>globalThis.localStorage?.getItem?globalThis.localStorage.getItem(key):nodeValues.get(key)??null,setItem(key,value){if(globalThis.localStorage?.setItem)globalThis.localStorage.setItem(key,value);else nodeValues.set(key,String(value));},removeItem(key){if(globalThis.localStorage?.removeItem)globalThis.localStorage.removeItem(key);else nodeValues.delete(key);},flush:async()=>{}};
async function loadSession(){
  const response=await fetch('/api/session',{cache:'no-store'});if(!response.ok)throw Error('프로젝트 세션을 열 수 없어요.');const value=await response.json();if(value===null)throw Error('프로젝트를 선택하세요.');if(!validSession(value))throw Error('프로젝트 세션 정보를 확인하세요.');return value;
}
const browser=typeof window!=='undefined'&&typeof document!=='undefined';let loadedSession,loadedStorage;
if(browser){try{loadedSession=await loadSession();loadedStorage=await createProjectStorage(loadedSession,{backup:localStorage,onError:issue=>window.dispatchEvent(new CustomEvent('hbengine-storage-error',{detail:issue.message}))});}catch(error){if(!loadedSession?.player&&document.body?.dataset.hbPlayer!=='true')window.location.replace('/prototype/project-hub.html?error='+encodeURIComponent(error.message));throw error;}}
export const session=loadedSession||null;
export const storage=loadedStorage||nodeStorage;
export const flushStorage=()=>storage.flush();
if(browser)window.addEventListener('pagehide',()=>storage.flush({keepalive:true}).catch(()=>{}));
