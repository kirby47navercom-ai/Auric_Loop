// A reference ID alone is insufficient for preanimated state: a new actor can
// reuse that ID before a lower layer or the baseline becomes visible again.
// Tokens exist only while sampled channels retain them; no world-wide history.
const snapshots=new WeakMap();
const samples=new WeakMap();
export function sampleSequenceReferences(owner,target,key,value,map,vm,{self,refresh=false,sample=value}={}){
 let targets=samples.get(owner);if(!targets){targets=new WeakMap();samples.set(owner,targets);}let rows=targets.get(target);if(!rows){rows=new Map();targets.set(target,rows);}const previous=rows.get(key);if(!refresh&&previous?.sample===sample)return previous.token;
 const token=captureSequenceReferences(value,map,vm,{self});rows.set(key,{sample,token});return token;
}
export function captureSequenceReferences(value,map,vm,{self}={}){
 const actors=new Map(),captured=map(structuredClone(value),id=>{
  if(id===null||id==='')return id;
  const actor=vm.object(id==='self'&&self?self:id),key=actor?.id??id;
  actors.set(key,actor??null);return key;
 });
 const token={};snapshots.set(token,{value:captured,actors,map});return token;
}
export function resolveSequenceReferences(token,vm,{restoring=true,missing=null}={}){
 const snapshot=token&&typeof token==='object'?snapshots.get(token):null;
 if(!snapshot)return token;
 const value=restoring?snapshot.map(snapshot.value,id=>{
  if(id===null||id==='')return id;
  const actor=snapshot.actors.get(id);return actor&&vm.object(id)===actor&&!actor.destroying?id:missing;
 }):snapshot.value;
 return structuredClone(value);
}
export const sequenceReferenceStateContract={scope:'sampled BP/C++ object, hit and nested reflected record references; component objectReference scalar fields and whole-component snapshots',identity:'retain referenced actor identity with each channel sample and the shared baseline; lower-layer takeover, reprioritization and restore never bind a replacement actor merely because its ID matches',missing:'retired, destroying or initially missing references restore as null in typed values and empty string in component text references; null and empty stay empty; ordinary strings are not actor references',lifetime:'private weak tokens retained only by sampled leases; no whole-world snapshot, resident polling or actor-history cache',limits:['arbitrary asynchronous external setter/notify side effects','nonreflected custom C++ values and external references']};
