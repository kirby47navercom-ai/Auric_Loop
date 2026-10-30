import {validScene,defaultSurface} from './model.js';
import {sceneWorldMatrix} from './scene-runtime.js';
import {Vector3,Quaternion,Euler,MathUtils} from 'three';
import {remapActorReferences} from './actor-references.js';
import {SequenceSpawnProgram} from './sequence-spawn-program.js';

// A Take creates presentation copies. User scripts, physics and automatic
// gameplay components never run again merely because the recording is viewed.
const visualTypes=new Set(['MeshRenderer','SpriteRenderer','TilemapRenderer','Camera','Light2D','DirectionalLight','PointLight','SpotLight','RectLight','SkyLight','SkyAtmosphere','VolumetricCloud','ExponentialHeightFog','Decal']);
const fields=['id','name','kind','visible','position','rotation','scale','asset','spriteAsset','tilemapAsset','materialAsset','materialSurface','parent','tags'];
export function recordedSpawnObject(object,objects,recorded){
 const row={};for(const key of fields)if(object[key]!==undefined)row[key]=structuredClone(object[key]);row.components=(object.components||[]).filter(c=>visualTypes.has(c.type)).map(c=>structuredClone(c));
 if(row.parent&&!recorded.has(row.parent)){const p=new Vector3(),q=new Quaternion(),s=new Vector3();sceneWorldMatrix(object,objects).decompose(p,q,s);row.position=p.toArray();row.rotation=new Euler().setFromQuaternion(q).toArray().slice(0,3).map(MathUtils.radToDeg);row.scale=s.toArray();delete row.parent;}
 if(!validSpawnObject(row))throw Error('생성 오브젝트의 녹화 데이터를 확인하세요: '+object.id);return row;
}
export function validSpawnObject(row){if(!row||typeof row.id!=='string'||row.id.length>200||row.parent!==undefined&&(typeof row.parent!=='string'||row.parent.length>200)||Object.keys(row).some(k=>![...fields,'components'].includes(k))||row.components?.some(c=>!visualTypes.has(c.type)))return false;const copy={...row};delete copy.parent;return validScene({version:1,objects:[copy],surface:defaultSurface})&&JSON.stringify(row).length<=262144;}
export function validSpawnTrack(track){return !!track.target&&track.object?.id===track.target&&validSpawnObject(track.object)&&(track.sourceLifetime===undefined||typeof track.sourceLifetime==='boolean')&&Array.isArray(track.keys)&&track.keys.every(k=>typeof k?.value==='boolean'&&(!k.interpolation||k.interpolation==='step')&&(k.object===undefined||k.value&&k.object?.id===track.target&&validSpawnObject(k.object)));}
export function validSpawnBindings(data){if(!Array.isArray(data?.tracks)||data.tracks.some(t=>!t||typeof t!=='object'))return false;const rows=data.tracks.filter(t=>t.type==='spawn'),ids=new Map(rows.map(t=>[t.target,t.object]));if(ids.size!==rows.length||rows.some(t=>!validSpawnTrack(t)))return false;
 const parents=new Map(rows.map(t=>[t.target,t.object.parent||''])),valid=changed=>{for(const id of changed){const seen=new Set([id]);let parent=parents.get(id);while(parent&&parents.has(parent)){if(seen.has(parent))return false;seen.add(parent);parent=parents.get(parent);}}return true;};if(!valid(parents.keys()))return false;
 const events=rows.flatMap(t=>t.keys.filter(k=>k.object!==undefined).map(k=>({time:k.time,id:t.target,parent:k.object.parent||''}))).sort((a,b)=>a.time-b.time);for(let i=0;i<events.length;){let end=i;const changed=new Set();while(end<events.length&&events[end].time===events[i].time){const event=events[end++];parents.set(event.id,event.parent);changed.add(event.id);}if(!valid(changed))return false;i=end;}
 return data.tracks.every(t=>!ids.has(t.target)||!['variable','nativeProperty'].includes(t.type))&&data.tracks.every(t=>!ids.has(t.target)||t.type!=='component'||visualTypes.has(t.componentType))&&data.tracks.every(t=>!ids.has(t.target)||t.type!=='componentState'||Array.isArray(t.keys)&&t.keys.every(k=>k&&(k.value===null||visualTypes.has(k.value?.type))));}
export function spawnTrackValue(keys,time){let result=false,at=-Infinity;for(const key of keys)if(key.time<=time&&key.time>=at){at=key.time;result=key.value;}return result;}
export class SequenceSpawns {
 constructor(tracks,hooks){this.tracks=tracks.filter(t=>t.type==='spawn');this.programs=new Map(this.tracks.map(t=>[t,new SequenceSpawnProgram(t)]));this.hooks=hooks;this.ids=new Map();this.live=new Map();this.liveTemplates=new Map();this.inspection=[];const prefix='take_'+crypto.randomUUID().replaceAll('-','')+'_';this.tracks.forEach((t,i)=>this.ids.set(t.target,prefix+i));}
 resolve(id){return this.ids.get(id)||id;}
 snapshot(){return this.inspection;}
 changed(){this.inspection=[...this.live].map(([source,o])=>({source,id:o.id}));this.hooks.changed?.();}
 async sample(time,vm){if(!this.tracks.length)return;const wanted=new Map();for(const track of this.tracks){const sample=this.programs.get(track).sample(time);if(sample.value)wanted.set(track.target,sample.object);}for(const [id,object]of this.live)if(!wanted.has(id)||this.liveTemplates.get(id)!==wanted.get(id)){this.hooks.remove(object,vm);this.live.delete(id);this.liveTemplates.delete(id);}const removed=this.inspection.length-this.live.size,added=[];try{for(const [id,template]of wanted){if(this.live.has(id))continue;const object=structuredClone(template);object.id=this.resolve(id);object.sequencePlayback=true;object.collisionEnabled=false;this.live.set(id,object);this.liveTemplates.set(id,template);vm.objects.push(object);added.push(object);}remapActorReferences(added,[],this.ids);for(const object of added)await this.hooks.build(object,vm);if(!vm.active||vm.stopping)throw Error('녹화 재생 중 실행이 종료됐어요.');for(const object of this.live.values())this.hooks.attach?.(object,vm);if(removed||added.length)this.changed();}catch(error){for(const object of added){this.hooks.remove(object,vm);for(const [id,row]of this.live)if(row===object){this.live.delete(id);this.liveTemplates.delete(id);}}throw error;}}
 clear(vm){if(!this.live.size)return;let first;for(const object of this.live.values())try{this.hooks.remove(object,vm);}catch(error){first??=error;}this.live.clear();this.liveTemplates.clear();this.changed();if(first)throw first;}
}
