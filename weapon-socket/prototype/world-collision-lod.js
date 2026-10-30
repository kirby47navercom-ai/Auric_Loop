import {componentDefaults,enabledComponent} from './scene-components.js';
import {worldAssetKind,worldCollisionGeometry} from './world-rendering.js';
import {meshColliderChunks} from './world-assets.js';

// Geometry is shared by source+level. Actor flags and collision events remain
// owned by the existing physics world; only a validated replacement is installed.
export class WorldCollisionLODs {
 constructor(read,{cacheBytes=33554432}={}){if(!Number.isSafeInteger(cacheBytes)||cacheBytes<0)throw Error('충돌 LOD 캐시 예산을 확인하세요.');this.read=read;this.cacheBytes=cacheBytes;this.clock=0;this.geometry=new Map();this.applied=new WeakMap();this.pending=new WeakMap();this.disposed=false;}
 async chunks(asset,level){
  const key=asset+'#'+(level??'fixed');let entry=this.geometry.get(key);if(!entry){
   entry={bytes:0,lastUse:++this.clock,promise:null};this.geometry.set(key,entry);
   entry.promise=worldCollisionGeometry(asset,this.read,[],{level}).then(data=>{
    const chunks=data?meshColliderChunks(data):[];entry.bytes=chunks.reduce((bytes,chunk)=>bytes+chunk.vertices.length*64+chunk.indices.length*8,0);this.trim();return chunks;
   }).catch(error=>{if(this.geometry.get(key)===entry)this.geometry.delete(key);throw error;});
  }entry.lastUse=++this.clock;return entry.promise;
 }
 trim(){let bytes=[...this.geometry.values()].reduce((sum,entry)=>sum+entry.bytes,0);for(const [key,entry]of [...this.geometry].sort((a,b)=>a[1].lastUse-b[1].lastUse)){if(bytes<=this.cacheBytes)break;if(entry.bytes){this.geometry.delete(key);bytes-=entry.bytes;}}}
 stats(){return {entries:this.geometry.size,estimatedBytes:[...this.geometry.values()].reduce((sum,entry)=>sum+entry.bytes,0),budgetBytes:this.cacheBytes};}
 async update(object,level){
  if(this.disposed)return false;const settings=enabledComponent(object,'WorldCollision'),mesh=enabledComponent(object,'MeshRenderer')?.mesh,previous=this.applied.get(object);
  if(!settings||!worldAssetKind(mesh)){this.pending.delete(object);if(object.gameplayDebug?.runtimeLOD){delete object.gameplayDebug.runtimeLOD.collisionLevel;delete object.gameplayDebug.runtimeLOD.collisionReason;}if(previous){object.tileColliders=(object.tileColliders||[]).filter(c=>!c.id.startsWith('worldCollider_'));this.applied.delete(object);return true;}return false;}
  const body=enabledComponent(object,'Rigidbody')||enabledComponent(object,'Rigidbody2D'),dynamic=body&&body.bodyType==='dynamic'&&!body.isKinematic,automatic=settings.lodMode==='runtime'&&!dynamic,selected=automatic?level:undefined,signature=JSON.stringify([mesh,selected,settings]);
  if(previous===signature)return false;
  const token=Symbol();this.pending.set(object,token);const chunks=await this.chunks(mesh,selected);if(this.disposed||this.pending.get(object)!==token||object.poolActive===false)return false;
  const {lodMode,...collisionSettings}=settings,colliders=chunks.map((chunk,i)=>({id:'worldCollider_'+i,name:'World geometry',type:'MeshCollider',properties:{...componentDefaults('MeshCollider'),...collisionSettings,vertices:chunk.vertices,indices:chunk.indices,mode:'mesh'}}));
  object.tileColliders=[...(object.tileColliders||[]).filter(c=>!c.id.startsWith('worldCollider_')),...colliders];this.applied.set(object,signature);
  if(object.gameplayDebug?.runtimeLOD)object.gameplayDebug.runtimeLOD={...object.gameplayDebug.runtimeLOD,collisionLevel:selected??'fixed',collisionReason:settings.lodMode==='runtime'&&dynamic?'dynamic-body':''};return true;
 }
 release(object){this.applied.delete(object);this.pending.delete(object);}
 has(object){return this.applied.has(object);}
 dispose(){this.disposed=true;this.geometry.clear();this.applied=new WeakMap();this.pending=new WeakMap();}
}
