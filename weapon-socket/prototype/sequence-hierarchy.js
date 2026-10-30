export function validParentTracks(tracks){const rows=tracks.filter(t=>t.type==='parent');return new Set(rows.map(t=>t.target)).size===rows.length&&rows.every(t=>t.keys.every(k=>typeof k.value==='string'&&k.value.length<=200&&(!t.target||k.value!==t.target)&&(!k.interpolation||k.interpolation==='step')));}
export function captureSequenceTargets(tracks,owner,objects){const wanted=new Set();for(const track of tracks){wanted.add(track.target||owner);if(['parent','camera'].includes(track.type))for(const key of track.keys)if(key.value)wanted.add(key.value);}return new Map(objects.filter(o=>wanted.has(o.id)).map(o=>[o.id,o]));}
// Validate the resulting graph before changing any edge, including swaps that
// are valid together but would be cyclic if applied one at a time.
export function applySequenceParents(changes,objects,attach,{restore=false,dryRun=false}={}){
 if(!changes.length)return;const byId=new Map(objects.map(o=>[o.id,o])),desired=new Map();for(const row of changes){if(byId.get(row.object.id)!==row.object)continue;if(row.parent&&!byId.has(row.parent)&&!restore)throw Error('시퀀스 부모 대상이 없어요: '+row.parent);desired.set(row.object.id,row.parent&&byId.has(row.parent)?row.parent:'');}
 const cycle=()=>{const done=new Set();for(const id of desired.keys()){const path=new Set();let at=id;while(at&&!done.has(at)){if(path.has(at)){const rows=[];let inside=false;for(const id of path){if(id===at)inside=true;if(inside)rows.push(id);}return rows;}path.add(at);at=desired.has(at)?desired.get(at):byId.get(at)?.parent;}for(const id of path)done.add(id);}return null;};
 let loop;while((loop=cycle())){const owned=loop.filter(id=>desired.has(id));if(!restore||!owned.length)throw Error('시퀀스 부모 연결 순환');for(const id of owned)desired.set(id,'');}
 if(dryRun)return;
 const changed=[];for(const[id,parent]of desired){const object=byId.get(id);if((object.parent||'')===parent)continue;if(parent)object.parent=parent;else delete object.parent;changed.push(object);}for(const object of changed)attach?.(object,true);for(const object of changed)attach?.(object,false);
}
