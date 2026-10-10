import {loadMaterialTexture,texturePlaceholder} from './texture-assets.js';

// Keep only installed textures. Stage every sampler before publishing a parameter.
export function materialTextureBindings(THREE,{resources,fileUrl,renderer,onError=()=>{}}){
  const slots=[],owned=new Set(),generations=new Map();let disposed=false,loads=0;
  const release=map=>{if(owned.delete(map))map.dispose();};
  const load=(b,r=resources)=>{loads++;return loadMaterialTexture(THREE,b,r,fileUrl,renderer);};
  function add(binding,write){
    const {placeholder,...properties}=binding,slot={...properties,write,loaded:false,map:placeholder||texturePlaceholder(THREE,binding.type)};slots.push(slot);owned.add(slot.map);write(slot.map);
    if(!binding.path)return Promise.resolve();
    return slot.ready=load(binding).then(map=>{if(disposed){map.dispose();return;}const old=slot.map;owned.add(map);slot.map=map;slot.loaded=true;write(map);release(old);},error=>{onError('텍스처를 읽을 수 없어요: '+binding.path+' · '+error.message);if(binding.type!=='texture2d')throw error;});
  }
  async function prepare(parameter,path,nextResources){
    if(disposed)throw Error('해제된 머테리얼이에요.');const selected=slots.filter(s=>s.parameter===parameter);if(!selected.length)throw Error('사용 중인 텍스처 파라미터가 없어요: '+parameter);
    const generation=(generations.get(parameter)||0)+1;generations.set(parameter,generation);await Promise.all(selected.map(s=>s.ready));if(disposed)throw Error('해제된 머테리얼이에요.');
    const unchanged=selected.every(s=>s.loaded&&s.path===path&&(s.type==='texture2d'||JSON.stringify(nextResources?.[path])===JSON.stringify(resources?.[path])));
    const results=await Promise.allSettled(unchanged?[]:selected.map(s=>load({...s,path},nextResources))),maps=results.filter(r=>r.status==='fulfilled').map(r=>r.value);let finished=false;
    const cancel=()=>{if(finished)return;finished=true;for(const map of maps)map.dispose();};
    const failure=results.find(r=>r.status==='rejected');if(failure){cancel();throw failure.reason;}
    const valid=()=>!finished&&!disposed&&generations.get(parameter)===generation;
    return {valid,cancel,commit:()=>{if(!valid()){cancel();return false;}finished=true;const old=[];if(!unchanged)selected.forEach((s,i)=>{old.push(s.map);s.map=maps[i];s.loaded=true;s.path=path;owned.add(maps[i]);s.write(maps[i]);});for(const map of old)release(map);resources=Object.fromEntries(slots.filter(s=>s.type!=='texture2d').map(s=>[s.path,nextResources?.[s.path]??resources?.[s.path]]));return true;}};
  }
  return {add,prepare,state:()=>({disposed,loads,owned:owned.size,bindings:slots.map(({parameter,type,path})=>({parameter,type,path}))}),dispose:()=>{if(disposed)return;disposed=true;for(const map of [...owned])release(map);}};
}
