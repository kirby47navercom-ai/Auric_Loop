// Called after clip shape/range validation. Sort references per slot, never authoring data.
export function montageHasOverlap(clips){
 const slots=new Map();for(const clip of clips){const name=clip.slot||'DefaultSlot';let entries=slots.get(name);if(!entries)slots.set(name,entries=[]);entries.push(clip);}
 for(const entries of slots.values()){entries.sort((a,b)=>a.start-b.start||a.duration-b.duration);let end=-Infinity;for(const clip of entries){if(clip.start<end)return true;end=clip.start+clip.duration;}}
 return false;
}
