import {parseGameJson,validGameJson} from './game-json.js';
import {dataContents} from './data-assets.js';

// Each execution owns its cache. Return copies so one component cannot mutate
// another component's authored defaults; failed reads remain retryable.
export function cacheAssetReader(read,{maxEntries=256,maxBytes=32*1024*1024}={}){
  const entries=new Map();let bytes=0;
  const remove=key=>{const entry=entries.get(key);if(entry){bytes-=entry.bytes;entries.delete(key);}};
  const cached=async(...args)=>{
    const key=JSON.stringify(args);let entry=entries.get(key);
    if(entry){entries.delete(key);entries.set(key,entry);}else{
      entry={bytes:0};entries.set(key,entry);
      entry.promise=Promise.resolve().then(()=>read(...args)).then(value=>{
        if(entries.get(key)===entry){entry.bytes=(JSON.stringify(value)?.length||0)*2;bytes+=entry.bytes;while(entries.size>maxEntries||bytes>maxBytes)remove(entries.keys().next().value);}return value;
      },error=>{if(entries.get(key)===entry)remove(key);throw error;});
      while(entries.size>maxEntries)remove(entries.keys().next().value);
    }
    return structuredClone(await entry.promise);
  };
  cached.clear=()=>{entries.clear();bytes=0;};cached.inspect=()=>({entries:entries.size,bytes});return cached;
}

export const persistentQueryKeys=new Set(['saveJsonWrite','saveJsonRead','saveJsonDelete','dataJsonRead','dataTableRead']);
const validPath=path=>typeof path==='string'&&/^(Assets|Source)\//.test(path)&&path.length<=1000&&!/[\\:\x00-\x1f]/.test(path)&&!path.split('/').some(p=>!p||p==='.'||p==='..');
export function createPersistentQueries({readAsset,readSave,writeSave,deleteSave}){
  const cache=new Map();
  const query=async(key,args)=>{
    if(!persistentQueryKeys.has(key))throw Error('저장·데이터 API 범위를 확인하세요.');
    if(key.startsWith('save')){
      if(typeof args.slot!=='string'||!args.slot||args.slot.length>80||/[\\/\x00-\x1f]/.test(args.slot)||['.','..'].includes(args.slot))throw Error('저장 슬롯 이름을 확인하세요.');
      if(key==='saveJsonWrite'){const value=parseGameJson(args.json,{object:false});await writeSave(args.slot,JSON.stringify(value));return true;}
      if(key==='saveJsonDelete'){await deleteSave(args.slot);return true;}
      const text=await readSave(args.slot);return JSON.stringify(text===null?null:parseGameJson(text,{object:false}));
    }
    if(!validPath(args.path))throw Error('데이터 에셋 경로를 확인하세요.');
    if(!cache.has(args.path)){if(cache.size>=256)throw Error('실행 데이터 에셋 256개 제한');const data=await readAsset(args.path);if(!validGameJson(data,{object:false}))throw Error('데이터 에셋 JSON 범위를 확인하세요.');cache.set(args.path,structuredClone(data));}
    const data=dataContents(cache.get(args.path));
    if(key==='dataJsonRead')return JSON.stringify(data);
    if(typeof args.rowId!=='string'||args.rowId.length>200)throw Error('표 행 ID를 확인하세요.');
    const rows=data.rows||data.data?.rows||data.data||data;
    const row=Array.isArray(rows)?rows.find(r=>r.id===args.rowId||r.name===args.rowId):Object.hasOwn(rows,args.rowId)?rows[args.rowId]:null;
    return JSON.stringify(row??null);
  };
  query.clear=()=>cache.clear();return query;
}
