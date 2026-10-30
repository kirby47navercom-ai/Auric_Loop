import {resolveEffectDefinition} from './effect-scaling.js';

// Share captured samples, not active effects. Eviction never removes a handle.
// Compare serialized content only at application, including in-place source edits.
export class EffectDefinitionLibrary{
 constructor({maxEntries=64,maxBytes=32*1024*1024}={}){if(![maxEntries,maxBytes].every(n=>Number.isSafeInteger(n)&&n>=0))throw Error('효과 정의 캐시 예산을 확인하세요.');this.maxEntries=maxEntries;this.maxBytes=maxBytes;this.entries=new Map();this.bytes=0;this.resolutions=0;this.hits=0;}
 remove(asset){const entry=this.entries.get(asset);if(entry){this.bytes-=entry.bytes;this.entries.delete(asset);}}
 async load(asset,source,read){
  const sourceJSON=JSON.stringify(source),previous=this.entries.get(asset);let inputs;
  if(previous?.sourceJSON===sourceJSON&&previous.read===read){
   if(!previous.done){this.hits++;return previous.promise;}
   inputs=new Map(await Promise.all([...previous.sources].map(async([path])=>[path,await read(path)])));
   if([...previous.sources].every(([path,data])=>JSON.stringify(inputs.get(path))===data)){if(this.entries.get(asset)===previous){this.entries.delete(asset);this.entries.set(asset,previous);}this.hits++;return previous.value;}
   if(this.entries.get(asset)!==previous)return this.load(asset,source,read);
  }
  this.remove(asset);const entry={sourceJSON,read,sources:new Map(),bytes:0,done:false};this.entries.set(asset,entry);this.resolutions++;
  entry.promise=resolveEffectDefinition(source,async path=>{const data=inputs?.has(path)?inputs.get(path):await read(path);entry.sources.set(path,JSON.stringify(data));return data;}).then(value=>{
   entry.done=true;entry.value=value;
   if(this.entries.get(asset)===entry){entry.bytes=(JSON.stringify(value).length+sourceJSON.length+[...entry.sources.values()].reduce((n,s)=>n+s.length,0))*2;this.bytes+=entry.bytes;while(this.entries.size>this.maxEntries||this.bytes>this.maxBytes)this.remove(this.entries.keys().next().value);}
   return value;
  }).catch(error=>{if(this.entries.get(asset)===entry)this.remove(asset);throw error;});
  while(this.entries.size>this.maxEntries)this.remove(this.entries.keys().next().value);
  return entry.promise;
 }
 clear(){this.entries.clear();this.bytes=0;}
 inspect(){return{entries:this.entries.size,bytes:this.bytes,pending:[...this.entries.values()].filter(e=>!e.done).length,resolutions:this.resolutions,hits:this.hits};}
}
