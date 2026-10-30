function slotsFor(owner){
 owner.objectLookup??=new WeakMap();let slots=owner.objectLookup.get(owner.objects);
 if(!slots){slots=new Map();owner.objectLookup.set(owner.objects,slots);}if(slots.size>owner.objects.length)slots.clear();return slots;
}
export function lookupRuntimeObject(owner,id){
 if(!owner.objectLookup&&owner.objects[0]?.id===id)return owner.objects[0];
 const slots=slotsFor(owner),cached=slots.get(id);if(cached!==undefined&&owner.objects[cached]?.id===id)return owner.objects[cached];
 slots.delete(id);const index=owner.objects.findIndex(o=>o.id===id);if(index<0)return undefined;
 if(slots.size>=owner.objects.length)slots.delete(slots.keys().next().value);slots.set(id,index);return owner.objects[index];
}
// A batch of new targets scans the world once, not once for each target.
export function primeRuntimeObjectLookup(owner,ids){
 const slots=slotsFor(owner),snapshot=new Map();let missing;
 for(const id of ids){const index=slots.get(id);if(index!==undefined&&owner.objects[index]?.id===id){slots.delete(id);slots.set(id,index);snapshot.set(id,owner.objects[index]);}else{slots.delete(id);snapshot.set(id,undefined);(missing??=new Set()).add(id);}}
 if(!missing)return snapshot;
 for(let index=0;index<owner.objects.length;index++){const id=owner.objects[index].id;if(!missing.has(id))continue;slots.set(id,index);snapshot.set(id,owner.objects[index]);missing.delete(id);if(slots.size>owner.objects.length)slots.delete(slots.keys().next().value);if(!missing.size)break;}return snapshot;
}
