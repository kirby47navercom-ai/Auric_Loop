import {createRigidPhysics,physicsQueryKeys,validPhysicsSnapshot} from './physics-world.js';
import {serviceApi} from './core-api.js';
import {validValue} from './blueprint-model.js';
import {tilemapColliders} from './tilemap-runtime.js';
import {deformableQueryTargets,deformablePhysicsQueryKey,mergeDeformableQuery,validateDeformableResult} from './deformable-query.js';

// A query world never steps simulation. Each operation installs its own immutable
// snapshot under a queue, so concurrent C++ callers cannot mix their worlds.
export class NativePhysicsQueryWorld {
  constructor(){this.objects=[];this.world=null;this.queue=Promise.resolve();this.closed=false;this.builds=0;this.queries=0;}
  query(snapshot,key,args,options){
    const job=this.queue.then(async()=>{
      if(this.closed)throw Error('종료된 C++ 물리 월드예요.');
      this.objects.length=0;for(const object of snapshot)this.objects.push(object);
      if(!this.world){this.world=createRigidPhysics(this.objects,{queryOnly:true});this.builds++;}
      try{await this.world.ready();if(this.closed)throw Error('종료된 C++ 물리 월드예요.');this.queries++;return this.world.query(key,args,options);}
      catch(error){this.world?.dispose();this.world=null;this.objects.length=0;throw error;}
    });this.queue=job.catch(()=>{});return job;
  }
  dispose(){if(this.closed)return;this.closed=true;this.world?.dispose();this.world=null;this.objects.length=0;}
}

// Share by game session rather than by C++ class. Only idle cache retention is
// bounded; simultaneous games/actors/queries have no additional count cap.
export class NativePhysicsQueryPool {
  constructor({maxIdleWorlds=1}={}){if(!Number.isSafeInteger(maxIdleWorlds)||maxIdleWorlds<0)throw Error('C++ 물리 캐시 예산 오류');this.maxIdleWorlds=maxIdleWorlds;this.entries=new Map();this.retired=new Set();this.clock=0;this.closed=false;}
  acquire(scope){
    if(this.closed)throw Error('종료된 C++ 물리 캐시예요.');
    if(typeof scope!=='string'||!scope||scope.length>160)return null;
    let entry=this.entries.get(scope);if(!entry){entry={cache:new NativePhysicsQueryWorld(),references:0,lastUse:0,retired:false};this.entries.set(scope,entry);}
    const reused=!!entry.cache.world;entry.references++;entry.lastUse=++this.clock;let released=false;
    return {cache:entry.cache,reused,release:()=>{if(released)return;released=true;entry.references--;entry.lastUse=++this.clock;if(entry.retired&&!entry.references){entry.cache.dispose();this.retired.delete(entry);}this.trim();}};
  }
  trim(){const idle=[...this.entries].filter(([,entry])=>entry.references===0).sort((a,b)=>a[1].lastUse-b[1].lastUse);while(idle.length>this.maxIdleWorlds){const [scope,entry]=idle.shift();this.entries.delete(scope);entry.cache.dispose();}}
  invalidate(scope){const entry=this.entries.get(scope);if(!entry)return;this.entries.delete(scope);entry.retired=true;if(!entry.references)entry.cache.dispose();else this.retired.add(entry);}
  clear(){for(const scope of [...this.entries.keys()])this.invalidate(scope);}
  inspect(){const all=[...this.entries.values(),...this.retired];return {worlds:this.entries.size,retiredWorlds:this.retired.size,idleWorlds:[...this.entries.values()].filter(entry=>!entry.references).length,activeContexts:all.reduce((n,entry)=>n+entry.references,0),worldBuilds:all.reduce((n,entry)=>n+entry.cache.builds,0),queries:all.reduce((n,entry)=>n+entry.cache.queries,0),maxIdleWorlds:this.maxIdleWorlds};}
  dispose(){if(this.closed)return;this.closed=true;for(const entry of [...this.entries.values(),...this.retired]){entry.retired=true;entry.cache.dispose();}this.entries.clear();this.retired.clear();}
}

// Authorization and the 128-operation budget remain local to every C++ call.
// Tile processing rebuilds only that call's snapshot; VM writes remain queued.
// Soft surfaces are queried in the live world, then merged by time-of-impact.
// Their particle arrays are never reconstructed or serialized into this world.
export class NativePhysicsQueries {
  constructor(objects,{authorizeWorld,lease,liveQuery}={}){this.ids=new Set(objects.map(o=>o.id));this.authorizeWorld=authorizeWorld;this.liveQuery=liveQuery;this.objects=[];this.count=0;this.closed=false;this.lease=lease;this.cache=lease?.cache||new NativePhysicsQueryWorld();this.queryMs=0;}
  get world(){return this.cache.world;}
  async query(request){
    if(this.closed)throw Error('종료된 C++ 물리 질의예요.');
    if(++this.count>128||!physicsQueryKeys.has(request?.key)&&request?.key!=='tileProcessChanges')throw Error('C++ 물리 질의 범위 또는 개수 오류');
    const ids=this.authorizeWorld?new Set(this.authorizeWorld(request).objects.map(o=>o.id)):this.ids;
    const spec=serviceApi.find(s=>s.key===request.key),args=request.args;
    if(!args||spec.inputs.filter(p=>p.type!=='exec').some(p=>!validValue(p.type,args[p.id]))||(request.key==='tileProcessChanges'?!ids.has(args.target):args.ignore!==null&&!ids.has(args.ignore)))throw Error('C++ 물리 질의 입력 오류');
    if(!validPhysicsSnapshot(request.objects)||request.objects.length!==ids.size||request.objects.some(o=>!ids.has(o.id)))throw Error('C++ 물리 월드 범위 오류');
    if(request.key==='tileProcessChanges'){const object=request.objects.find(o=>o.id===args.target);if(!object.runtimeTilemap)throw Error('타일맵이 준비되지 않았어요.');const colliders=tilemapColliders(object.runtimeTilemap);if(!validPhysicsSnapshot(request.objects.map(o=>o===object?{...o,tileColliders:colliders}:o)))throw Error('타일맵 충돌 범위 오류');return colliders;}
    const at=performance.now(),snapshot=structuredClone(request.objects);this.objects=snapshot;
    try{const targets=deformableQueryTargets(snapshot,args.dimension,args);if(targets.length&&!this.liveQuery)throw Error('변형체 충돌에는 실행 중인 물리 질의 채널이 필요해요.');const result=await this.cache.query(snapshot,request.key,args,targets.length?{withFraction:true}:undefined);if(this.closed)throw Error('종료된 C++ 물리 질의예요.');if(!targets.length)return result;const soft=await this.liveQuery({key:deformablePhysicsQueryKey,args:{kind:request.key,query:args,targets}},snapshot);if(this.closed)throw Error('종료된 C++ 물리 질의예요.');validateDeformableResult(request.key,soft,new Set(targets));return mergeDeformableQuery(request.key,args,result,soft);}finally{this.queryMs+=performance.now()-at;}
  }
  stats(){return {count:this.count,queryMs:this.queryMs,cacheReused:!!this.lease?.reused};}
  close(){if(this.closed)return;this.closed=true;this.objects=[];if(this.lease)this.lease.release();else this.cache.dispose();}
}
