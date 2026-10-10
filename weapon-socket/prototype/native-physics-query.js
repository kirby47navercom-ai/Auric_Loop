import {createRigidPhysics,physicsQueryKeys,validPhysicsSnapshot} from './physics-world.js';
import {serviceApi} from './core-api.js';
import {validValue} from './blueprint-model.js';
import {tilemapColliders} from './tilemap-runtime.js';

// One bounded, read-only query world per C++ call. It shares the game's exact
// collider narrow phase without advancing its time or solving any rigid body.
// Tile processing rebuilds only the C++ snapshot; VM writes remain queued.
export class NativePhysicsQueries {
  constructor(objects,{authorizeWorld}={}){this.ids=new Set(objects.map(o=>o.id));this.authorizeWorld=authorizeWorld;this.objects=[];this.count=0;this.closed=false;}
  async query(request){
    if(this.closed)throw Error('종료된 C++ 물리 질의예요.');
    if(++this.count>128||!physicsQueryKeys.has(request?.key)&&request?.key!=='tileProcessChanges')throw Error('C++ 물리 질의 범위 또는 개수 오류');
    const ids=this.authorizeWorld?new Set(this.authorizeWorld(request).objects.map(o=>o.id)):this.ids;
    const spec=serviceApi.find(s=>s.key===request.key),args=request.args;
    if(!args||spec.inputs.filter(p=>p.type!=='exec').some(p=>!validValue(p.type,args[p.id]))||(request.key==='tileProcessChanges'?!ids.has(args.target):args.ignore!==null&&!ids.has(args.ignore)))throw Error('C++ 물리 질의 입력 오류');
    if(!validPhysicsSnapshot(request.objects)||request.objects.length!==ids.size||request.objects.some(o=>!ids.has(o.id)))throw Error('C++ 물리 월드 범위 오류');
    if(request.key==='tileProcessChanges'){const object=request.objects.find(o=>o.id===args.target);if(!object.runtimeTilemap)throw Error('타일맵이 준비되지 않았어요.');const colliders=tilemapColliders(object.runtimeTilemap);if(!validPhysicsSnapshot(request.objects.map(o=>o===object?{...o,tileColliders:colliders}:o)))throw Error('타일맵 충돌 범위 오류');return colliders;}
    const snapshot=structuredClone(request.objects);this.objects.length=0;for(const object of snapshot)this.objects.push(object);
    this.world??=createRigidPhysics(this.objects,{queryOnly:true});await this.world.ready();if(this.closed)throw Error('종료된 C++ 물리 질의예요.');return this.world.query(request.key,args);
  }
  close(){this.closed=true;this.world?.dispose();}
}
