import {planMeshDistanceFieldLayout} from './mesh-distance-field-layout.js';
import {Box3} from 'three';
import {reflectionProbeMeshBounds} from './reflection-probe-bounds.js';
export const distanceFieldLODContract=Object.freeze({version:1,mode:'fixed (default) or camera',projection:'maximum projected world AABB extent in drawing-buffer pixels; perspective/orthographic; near-plane crossings and missing camera retain maximum; offscreen occluders are never culled',levels:Object.freeze([8,12,16,24,32,48,64]),target:'screen footprint heuristic, not a geometric/pixel-error guarantee; geometry shared by meshes uses maximum demand; instanced meshes use conservative cached aggregate bounds',stability:'upgrade target immediately, downgrade after250ms of stable coarser demand; >=25% target changes; ready field retained during replacement; stale owner/target jobs cancel without discarding ready data',budgets:'old plus replacement CPU payload reserved together; same atlas/local/input budgets and single quality job per viewport; downgrade does not evict a ready field when replacement cannot fit',resources:'no additional GPU resource, render pass, readback, permanent cache or worker'});
export function projectedDistanceFieldResolution(box,frame,maximum,pixels=8){
 const m=frame?.currentVP,size=frame?.size;if(!box||!m||m.length!==16||!m.every(Number.isFinite)||!size||size.length!==2||!size.every(v=>Number.isFinite(v)&&v>0))return maximum;
 let loX=Infinity,loY=Infinity,hiX=-Infinity,hiY=-Infinity,lowW=Infinity,highW=-Infinity;
 for(let i=0;i<8;i++){
  const x=i&1?box.max.x:box.min.x,y=i&2?box.max.y:box.min.y,z=i&4?box.max.z:box.min.z,w=m[3]*x+m[7]*y+m[11]*z+m[15];lowW=Math.min(lowW,w);highW=Math.max(highW,w);
  if(Math.abs(w)<1e-12)return maximum;
  const px=(m[0]*x+m[4]*y+m[8]*z+m[12])/w,py=(m[1]*x+m[5]*y+m[9]*z+m[13])/w;loX=Math.min(loX,px);hiX=Math.max(hiX,px);loY=Math.min(loY,py);hiY=Math.max(hiY,py);
 }
 if(lowW<0&&highW>0)return maximum;
 const ratio=Math.max((hiX-loX)*size[0],(hiY-loY)*size[1])*.5/pixels,required=Math.ceil(ratio-32*Number.EPSILON*Math.abs(ratio))+1;
 if(!Number.isFinite(required))return maximum;for(const level of distanceFieldLODContract.levels)if(level>=required)return Math.min(maximum,level);return maximum;
}
export function distanceFieldLODTarget(entry,demand,now,maximum=Infinity){
 if(entry.targetResolution===undefined){entry.targetResolution=demand;return demand;}
 const old=entry.targetResolution;
 if(demand>old&&(demand>=old*1.25||demand===maximum)){entry.targetResolution=demand;entry.coarseDemand=null;}
 else if(demand<old&&(demand<=old*.8||demand===8)){if(entry.coarseDemand!==demand){entry.coarseDemand=demand;entry.coarseSince=now;}else if(now-entry.coarseSince>=250){entry.targetResolution=demand;entry.coarseDemand=null;}}
 else entry.coarseDemand=null;
 if(entry.targetResolution!==old)delete entry.upgradeCheckedCapacity;
 return entry.targetResolution;
}
export function planDistanceFieldDowngrade(entry,target,available){
 const field=entry.field;if(!field||field.kind||entry.upgrade||target>=field.resolution||available<4)return null;
 try{const plan=planMeshDistanceFieldLayout(field.meshBounds,{resolution:target,minimumResolution:target,byteBudget:Math.floor(available)});return plan.bytes<=field.bytes*.75?plan:null;}
 catch(error){if(error.code==='HB_DISTANCE_FIELD_BUDGET')return null;throw error;}
}

// Weak, per-viewport CPU memo only. Stable frames compare poses rather than
// recomputing bounds/projection; instanced geometry keeps one aggregate record.
function sameProjectedExtent(a,b){
 if(a.length!==20||b.length!==20)return false;
 for(const i of [2,3,6,7,10,11,14,15,16,17,18,19])if(!Object.is(a[i],b[i]))return false;
 let q=3;for(const i of [7,11,15])if(Math.abs(b[i])>Math.abs(b[q]))q=i;if(!b[q])return false;
 const dx=(a[q-3]-b[q-3])/b[q],dy=(a[q-2]-b[q-2])/b[q];
 // A homogeneous screen translation (including TAA jitter) changes position,
 // not projected extent. Keep world/camera motion and zoom in the cache key.
 for(let c=0;c<4;c++)for(const row of [0,1]){const at=c*4+row,delta=(row?dy:dx)*b[c*4+3],expected=b[at]+delta,tolerance=8*Number.EPSILON*(Math.abs(a[at])+Math.abs(b[at])+Math.abs(delta));if(Math.abs(a[at]-expected)>tolerance)return false;}
 return true;
}
export class DistanceFieldLODProjection {
 constructor(){this.entries=new WeakMap();this.projection=[];this.generation=0;this.box=new Box3();}
 begin(frame,maximum,pixels){
  const values=[...(frame?.currentVP||[]),...(frame?.size||[]),maximum,pixels];if(!sameProjectedExtent(values,this.projection)){this.projection=values;this.generation++;}
  this.frame=frame;this.available=values.length===20&&values.every(Number.isFinite)&&values[16]>0&&values[17]>0;this.maximum=maximum;this.pixels=pixels;this.hits=0;this.projected=0;
 }
 demand(mesh){
  const geometry=mesh.geometry,position=geometry.attributes.position,data=position.isInterleavedBufferAttribute?position.data:position,instance=mesh.isInstancedMesh?mesh.instanceMatrix:null,old=this.entries.get(mesh),pose=mesh.matrixWorld.elements;
  if(old&&old.generation===this.generation&&old.geometry===geometry&&old.position===position&&old.data===data&&old.array===data.array&&old.version===data.version&&old.count===position.count&&old.instance===instance&&old.instanceArray===instance?.array&&old.instanceVersion===instance?.version&&old.instances===mesh.count&&pose.every((v,i)=>Object.is(v,old.pose[i]))){this.hits++;return old.target;}
  const target=projectedDistanceFieldResolution(reflectionProbeMeshBounds(mesh,this.box),this.frame,this.maximum,this.pixels);this.projected++;this.entries.set(mesh,{generation:this.generation,geometry,position,data,array:data.array,version:data.version,count:position.count,instance,instanceArray:instance?.array,instanceVersion:instance?.version,instances:mesh.count,pose:Float64Array.from(pose),target});return target;
 }
}
