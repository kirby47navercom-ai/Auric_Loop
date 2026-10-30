// Only renderer-owned clones opt in. Editor/external graphs still invalidate
// on content changes. Parameters and surface remain mutable.
const graphIds=new WeakMap();let serial=0;
export function captureMaterialGraph(data){
  if(!data?.graph||graphIds.has(data.graph))return data;
  const seen=new WeakSet(),active=new WeakSet(),objects=[];
  const plain=value=>{if(value===null||typeof value!=='object')return !['function','symbol','bigint'].includes(typeof value);if(active.has(value))return false;if(seen.has(value))return true;if(![Object.prototype,Array.prototype,null].includes(Object.getPrototypeOf(value)))return false;active.add(value);for(const descriptor of Object.values(Object.getOwnPropertyDescriptors(value)))if(!Object.hasOwn(descriptor,'value')||!plain(descriptor.value))return false;active.delete(value);seen.add(value);objects.push(value);return true;};
  // Date/Map/typed arrays can change internal state even when Object.freeze is
  // applied. Keep the original content key for such extension metadata.
  if(!plain(data.graph))return data;for(const value of objects)Object.freeze(value);
  graphIds.set(data.graph,++serial);return data;
}
export function rayMaterialSourceKey(data){
  const id=data?.graph&&graphIds.get(data.graph);
  return id?'graph:'+id+':'+JSON.stringify({...data,graph:undefined}):JSON.stringify(data);
}
