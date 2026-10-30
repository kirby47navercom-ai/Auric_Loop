import {selectStreamingCells} from './streaming-budget.js';
import * as THREE from 'three';
import {validScene} from './model.js';
import {componentDefinitions,componentDefaults} from './scene-components.js';
import {sceneWorldMatrix,sceneWorldPosition} from './scene-runtime.js';
import {spawnTransformValid,initializeSpawn} from './runtime-spawn.js';
import {remapActorReferences,remapActorValue} from './actor-references.js';
export const levelKeys=new Set(['levelLoad','levelUnload','levelLoaded','levelActor','levelInstances','levelVisible']);
export const validLevelInstance=id=>typeof id==='string'&&/^[A-Za-z0-9_-]{1,60}$/.test(id);
export function levelActorId(instance,local){let a=2166136261,b=2246822507;for(const n of new TextEncoder().encode(local)){a=Math.imul(a^n,16777619)>>>0;b=Math.imul(b^n,3266489909)>>>0;}return 'level_'+instance+'_'+a.toString(16).padStart(8,'0')+b.toString(16).padStart(8,'0');}
const rootObject=(instance,transform)=>({id:'level_'+instance+'_root',name:instance,kind:'empty',group:'LEVELS',visible:true,...structuredClone(transform),components:[],levelInstance:instance});
const worldTransform=(o,objects)=>{const p=new THREE.Vector3(),q=new THREE.Quaternion(),s=new THREE.Vector3();sceneWorldMatrix(o,objects).decompose(p,q,s);return {position:p.toArray(),rotation:new THREE.Euler().setFromQuaternion(q).toArray().slice(0,3).map(THREE.MathUtils.radToDeg),scale:s.toArray()};};
export class RuntimeLevels{
 constructor(hooks){this.hooks=hooks;this.records=new Map();this.cells=new Map();this.disposed=false;this.epoch=0;}
 initializingAncestor(instance,owner,vm){let id=vm.object(owner)?.levelInstance,depth=0;while(id&&depth++<17){if(id===instance)return true;id=this.records.get(id)?.parent;}return false;}
 current(vm,epoch){if(this.disposed||!vm.active||vm.stopping||vm.generation!==epoch)throw Error('레벨 처리 중 실행이 종료됐어요.');}
 publish(vm){if(vm.hooks.game)vm.hooks.game.state={...vm.hooks.game.state,streamingLevels:[...this.records.values()].map(r=>({instance:r.instance,scene:r.path||r.name,status:r.status,root:r.root?.id||'',count:r.objects?.length||0,visible:r.root?.visible!==false}))};}
 async load(name,instance,transform,vm,owner){
  if(!validLevelInstance(instance)||typeof name!=='string'||!name||name.length>1000||!spawnTransformValid(transform))throw Error('추가 레벨·인스턴스·변환 값을 확인하세요.');this.current(vm,vm.generation);
  const existing=this.records.get(instance);if(existing){if(existing.name!==name&&existing.path!==name)throw Error('같은 레벨 인스턴스 이름을 다른 장면이 사용해요.');if(existing.busy&&this.initializingAncestor(instance,owner,vm))throw Error('레벨 초기화 중 상위 레벨 순환 요청을 거부했어요.');if(existing.status==='unloading')throw Error('내리는 중인 레벨은 완료 후 다시 불러오세요.');await existing.task;return;}
  const epoch=vm.generation,parent=vm.object(owner)?.levelInstance||'',record={instance,name,parent,status:'loading',busy:true,objects:[],bindings:[],groups:new Map(),cancelled:false};let ancestor=parent,depth=0;while(ancestor){const row=this.records.get(ancestor);if(++depth>16||row?.name===name||row?.path===name)throw Error('추가 레벨 참조가 순환해요.');ancestor=row?.parent||'';}this.records.set(instance,record);this.publish(vm);
  const check=()=>{this.current(vm,epoch);if(record.cancelled)throw Error('추가 레벨 읽기를 취소했어요.');};
  record.task=(async()=>{try{
   record.path=await this.hooks.asset(name,'scene');if(!record.path)throw Error('추가 레벨이 없어요: '+name);const data=await this.hooks.read(record.path);if(!validScene(data))throw Error('추가 레벨 검증 실패: '+record.path);check();
   for(let p=parent;p;p=this.records.get(p)?.parent)if(this.records.get(p)?.path===record.path)throw Error('추가 레벨 경로가 순환해요.');
   const ids=new Map(data.objects.map(o=>[o.id,levelActorId(instance,o.id)]));if(new Set(ids.values()).size!==ids.size)throw Error('레벨 오브젝트 ID가 충돌해요.');record.root=rootObject(instance,transform);const rows=structuredClone(data.objects);for(const o of rows){const local=o.id;o.id=ids.get(local);o.levelInstance=instance;o.levelSourceId=local;}remapActorReferences(rows,[],ids);
   const loaded=await this.hooks.prepare(rows);check();remapActorReferences(rows,loaded.bindings,ids);for(const o of rows)if(!o.parent&&!o.parentId)o.parent=record.root.id;
   record.objects=[record.root,...rows];if(record.objects.some(o=>vm.object(o.id)))throw Error('추가 레벨 오브젝트 ID가 이미 있어요.');vm.objects.push(...record.objects);record.inserted=true;record.bindings=vm.addBindings(loaded.bindings,loaded.inputAssets);
   for(const o of record.objects){const group=await this.hooks.build(o);record.groups.set(o.id,group);await group?.userData.ready;check();await this.hooks.update?.(o);}
   for(const o of rows){const group=this.hooks.mesh(o.id),parent=this.hooks.mesh(o.parent||o.parentId);if(group&&parent)parent.add(group);await this.hooks.update?.(o);}await this.hooks.preparePhysics(rows,vm);check();record.status='loaded';this.publish(vm);
   await initializeSpawn(vm,record.bindings,{startActor:this.hooks.startActor,startSystems:this.hooks.startSystems},rows);check();record.busy=false;this.publish(vm);this.hooks.changed?.();
  }catch(error){let cleanup;for(const child of [...this.records.values()].filter(r=>r.parent===instance))try{await this.unload(child.instance,vm,owner);}catch(e){cleanup??=e;}try{await this.remove(record,vm,false);}catch(e){cleanup=e;}this.records.delete(instance);this.publish(vm);if(!this.disposed)this.hooks.changed?.();if(cleanup)error.message+=' / 레벨 정리: '+cleanup.message;throw error;}})();
  await record.task;
 }
 async remove(record,vm,events=true){
  if(!record.inserted)return;const rows=vm.objects.filter(o=>o.levelInstance===record.instance),owned=new Set(rows.map(o=>o.id));for(const o of vm.objects)if(owned.has(o.owner))owned.add(o.id);let firstError;
  // Persistent children keep their world transform when the streamed parent leaves.
  for(const o of vm.objects)if(!this.disposed&&!owned.has(o.id)&&(owned.has(o.parent)||owned.has(o.parentId))){const matrix=sceneWorldMatrix(o,vm.objects),p=new THREE.Vector3(),q=new THREE.Quaternion(),scale=new THREE.Vector3();matrix.decompose(p,q,scale);delete o.parent;delete o.parentId;o.position=p.toArray();o.rotation=new THREE.Euler().setFromQuaternion(q).toArray().slice(0,3).map(THREE.MathUtils.radToDeg);o.scale=scale.toArray();const group=this.hooks.mesh(o.id);if(group)this.hooks.scene?.()?.attach(group);await this.hooks.update?.(o);}
  for(const item of vm.objects.filter(o=>owned.has(o.id)).reverse()){item.destroying=true;try{if(events)for(const b of vm.bindings.filter(b=>b.self===item.id))await vm.emit(b,'endPlay',{reason:'LevelUnloaded'});}catch(e){firstError??=e;}try{await this.hooks.release(item,vm);}catch(e){firstError??=e;}}
  vm.bindings=vm.bindings.filter(b=>!owned.has(b.self));for(let i=vm.objects.length-1;i>=0;i--)if(owned.has(vm.objects[i].id)){const [o]=vm.objects.splice(i,1);this.cells.delete(o.id);try{if(!this.disposed||record.groups.get(o.id)===this.hooks.mesh(o.id))this.hooks.remove(o);}catch(e){firstError??=e;}}
  const removed=new Map([...owned].map(id=>[id,null]));for(const o of vm.objects){for(const key of ['owner','controller','pawn'])if(owned.has(o[key]))o[key]=null;for(const c of o.components||[])for(const [key,field] of Object.entries(componentDefinitions[c.type]?.properties||{}))if(field.objectReference&&owned.has(c.properties?.[key]))c.properties[key]=componentDefaults(c.type)[key];const b=vm.bindings.find(b=>b.self===o.id);for(const p of b?.root.native?.classes.find(c=>c.name===o.nativeClass)?.properties||[])if(p.type==='object'&&Object.hasOwn(o.nativeProperties||{},p.name))o.nativeProperties[p.name]=remapActorValue(o.nativeProperties[p.name],removed);}
  vm.refreshActorReferences();if(!this.disposed)await this.hooks.synchronize?.();if(firstError)throw firstError;
 }
 async unload(instance,vm,owner){if(!validLevelInstance(instance))throw Error('레벨 인스턴스 이름을 확인하세요.');const record=this.records.get(instance);if(!record)return;if(record.busy){if(this.initializingAncestor(instance,owner,vm))throw Error('레벨 초기화 콜백에서 자기 레벨이나 상위 레벨을 내릴 수 없어요.');record.cancelled=true;try{await record.task;}catch{}return;}if(record.status==='unloading')return;record.status='unloading';this.publish(vm);let firstError;for(const child of [...this.records.values()].filter(r=>r.parent===instance))try{await this.unload(child.instance,vm,owner);}catch(e){firstError??=e;}try{await this.remove(record,vm);}catch(e){firstError??=e;}finally{this.records.delete(instance);this.publish(vm);if(!this.disposed)this.hooks.changed?.();}if(firstError)throw firstError;}
 async register(o,vm){const cells=(o.components||[]).filter(c=>c.type==='LevelStreaming'&&c.properties?.enabled!==false);if(!cells.length)return;this.cells.set(o.id,{object:o,elapsed:0});for(const c of cells){const p={...componentDefaults('LevelStreaming'),...c.properties};if(p.scene&&p.mode==='always')await this.load(p.scene,p.instance||'cell_'+levelActorId('',o.id+'_'+c.id).slice(-16),worldTransform(o,vm.objects),vm,o.id);}}
 async tick(delta,vm){
  if(!this.cells.size&&!this.records.size)return;this.elapsed=(this.elapsed||0)+delta;if(this.elapsed<.25)return;this.elapsed=0;
  const settings=vm.objects.find(o=>!o.destroying&&o.components?.some(c=>c.type==='WorldStreamingBudget'&&c.properties?.enabled!==false))?.components.find(c=>c.type==='WorldStreamingBudget'&&c.properties?.enabled!==false),p=settings?{...componentDefaults('WorldStreamingBudget'),...settings.properties}:null,candidates=[],controlled=new Set();
  for(const [id,cell] of this.cells){const o=vm.object(id);if(o!==cell.object){this.cells.delete(id);continue;}
   for(const c of o.components||[]){if(c.type!=='LevelStreaming')continue;const v={...componentDefaults(c.type),...c.properties};if(v.enabled===false||v.mode!=='distance'||!v.scene)continue;
    const instance=v.instance||'cell_'+levelActorId('',o.id+'_'+c.id).slice(-16),record=this.records.get(instance);controlled.add(instance);const target=vm.object(v.target||this.hooks.pawn?.())||vm.objects.find(n=>n.kind==='camera');if(!target)continue;
    const distance=new THREE.Vector3(...sceneWorldPosition(o,vm.objects)).distanceTo(new THREE.Vector3(...sceneWorldPosition(target,vm.objects)));if(distance>(record?v.unloadRadius:v.loadRadius))continue;
    candidates.push({instance,object:o,properties:v,loaded:!!record,distance,costMB:v.estimatedMB,priority:v.streamingPriority});
   }
  }
  const selection=selectStreamingCells(candidates,p?{budgetMB:p.budgetMB,maxCells:p.maxCells}:{});
  for(const [instance,record] of [...this.records])if(record.autoOwner&&!record.busy&&!selection.selected.has(instance))await this.unload(instance,vm,record.autoOwner);
  let loads=0;for(const row of candidates.filter(r=>selection.selected.has(r.instance)).sort((a,b)=>b.priority-a.priority||a.distance-b.distance)){
   if(vm.object(row.object.id)!==row.object||this.records.has(row.instance)||loads>=(p?.loadsPerTick||Infinity))continue;await this.load(row.properties.scene,row.instance,worldTransform(row.object,vm.objects),vm,row.object.id);const record=this.records.get(row.instance);if(record){record.autoOwner=row.object.id;record.estimatedMB=row.costMB;}loads++;
  }
  if(vm.hooks.game)vm.hooks.game.state={...vm.hooks.game.state,streamingBudget:{estimatedMB:selection.costMB,budgetMB:p?.budgetMB??null,selected:selection.selected.size,active:[...this.records.values()].filter(r=>r.autoOwner).length,loads}};
 }
 async operation(key,a,b,vm){if(!levelKeys.has(key))return;if(key==='levelInstances')return {return:[...this.records.values()].filter(r=>r.status==='loaded').map(r=>r.instance)};if(!validLevelInstance(a.instance))throw Error('레벨 인스턴스 이름을 확인하세요.');if(key==='levelLoaded')return {return:this.records.get(a.instance)?.status==='loaded'};if(key==='levelActor'){if(typeof a.localId!=='string'||a.localId.length>1000)throw Error('레벨 내부 ID를 확인하세요.');const row=this.records.get(a.instance),id=levelActorId(a.instance,a.localId);return {return:row?.status==='loaded'&&vm.object(id)?id:null};}if(key==='levelLoad')await this.load(a.scene,a.instance,a.transform,vm,b.self);else if(key==='levelUnload')await this.unload(a.instance,vm,b.self);else{if(typeof a.visible!=='boolean')throw Error('레벨 표시 값을 확인하세요.');const row=this.records.get(a.instance);if(!row?.root||row.status!=='loaded')throw Error('불러온 레벨이 없어요.');row.root.visible=a.visible;await this.hooks.update?.(row.root);this.publish(vm);}return {};}
 dispose(vm){this.disposed=true;for(const r of this.records.values())r.cancelled=true;this.records.clear();this.cells.clear();if(vm?.hooks.game)vm.hooks.game.state={...vm.hooks.game.state,streamingLevels:[]};}
}
