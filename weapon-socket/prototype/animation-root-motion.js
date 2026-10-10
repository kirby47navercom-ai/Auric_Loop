import {Vector3,Quaternion,Euler,Matrix4} from 'three';
import {sampleTimeline} from './blueprint-model.js';

export const rootMotionModes=['none','ignore','all','montages'];
export const rootMotionDefaults=()=>({enabled:false,bone:'',lock:'first',forceLock:false});
export const validRootMotion=p=>p===undefined||!!p&&typeof p==='object'&&!Array.isArray(p)&&typeof p.enabled==='boolean'&&typeof p.bone==='string'&&p.bone.length<=120&&['first','reference','zero'].includes(p.lock)&&typeof p.forceLock==='boolean';
export const motionBuffer=()=>new Float64Array([0,0,0,0,0,0,1]);
export function resetMotion(out){out.fill(0);out[6]=1;return out;}
export function mixMotion(out,a,b,w){for(let i=0;i<3;i++)out[i]=(a?.[i]||0)*(1-w)+(b?.[i]||0)*w;Quaternion.slerpFlat(out,3,a||identityMotion,3,b||identityMotion,3,w);return out;}
export const identityMotion=motionBuffer();
export function appendMotion(out,value,weight=1){const q=new Quaternion().fromArray(out,3),p=new Vector3(...value.slice(0,3)).multiplyScalar(weight).applyQuaternion(q);for(let i=0;i<3;i++)out[i]+=p.getComponent(i);q.multiply(new Quaternion().slerp(new Quaternion().fromArray(value,3),weight)).normalize().toArray(out,3);return out;}

// Only enabled root tracks allocate sampling scratch. A loop is a transform power,
// not subtraction of wrapped endpoints; it retains turns and arbitrary cycle counts.
export class AnimationRootTrack {
  constructor(owner,id){
    this.owner=owner;this.id=id;this.p=owner.nodes.get(id).properties.rootMotion;const tracks=owner.compiled.get(id);
    const root=t=>{let parent=t?.parent;while(parent&&parent!==owner.group){if(parent.isBone)return false;parent=parent.parent;}return true;};
    const target=this.p.bone?owner.group?.getObjectByName(this.p.bone):tracks.find(t=>owner.slots[t.slot].key==='root|position')?owner.group:tracks.map(t=>owner.slots[t.slot].target).find(t=>t?.isBone&&root(t));
    this.tracks=tracks.filter(t=>{const s=owner.slots[t.slot];return this.p.bone?s.target===target:s.key.startsWith('root|')||target&&s.target===target;}).filter(t=>{const s=owner.slots[t.slot],property=s.binding?.parsedPath.propertyName||s.key.slice(5);return ['position','quaternion'].includes(property);});
    if(!this.tracks.length||this.p.bone&&(!target||!root(target)))throw Error('루트 모션의 최상위 뼈·트랙을 확인하세요: '+(this.p.bone||owner.nodes.get(id).name));
    this.indices=this.tracks.map(t=>t.slot);this.actorRoot=this.indices.some(i=>owner.slots[i].key.startsWith('root|'));
    for(const t of this.tracks){const s=owner.slots[t.slot],property=s.binding?.parsedPath.propertyName||s.key.slice(5);if(s.rest.length!==(property==='quaternion'?4:3)||s.binding?.propertyIndex!==undefined)throw Error('루트 모션에는 전체 위치·Quaternion 트랙이 필요해요.');}
    this.position=new Vector3();this.rotation=new Quaternion();this.scale=new Vector3(1,1,1);this.matrix=new Matrix4();this.first=new Matrix4();this.end=new Matrix4();this.cycle=new Matrix4();this.previous=new Matrix4();this.current=new Matrix4();this.power=new Matrix4();this.factor=new Matrix4();this.deltaMatrix=new Matrix4();this.basis=new Quaternion();this.parentMatrix=new Matrix4();this.lockValues=new Map();this.length=owner.clips.get(id).length;
    this.sample(0,this.first);this.sample(this.length,this.end);this.cycle.copy(this.first).invert().multiply(this.end);
    this.first.decompose(this.position,this.basis,this.scale);if(target&&target!==owner.group){let parent=target.parent;this.parentMatrix.identity();while(parent&&parent!==owner.group){parent.updateMatrix();this.parentMatrix.premultiply(parent.matrix);parent=parent.parent;}this.parentMatrix.decompose(this.position,this.rotation,this.scale);this.basis.premultiply(this.rotation);}
    for(const t of this.tracks){const s=owner.slots[t.slot],q=s.type==='quaternion',value=this.p.lock==='reference'?s.rest:this.p.lock==='zero'?(q?[0,0,0,1]:[0,0,0]):this.value(t,0);this.lockValues.set(t.slot,new Float64Array(value));}
  }
  value(t,time){const v=t.interpolant?t.interpolant.evaluate(time):sampleTimeline(t.track,time);return t.rotation?new Quaternion().setFromEuler(new Euler(...v.map(x=>x*Math.PI/180))).toArray():v;}
  sample(time,out){this.position.set(0,0,0);this.rotation.identity();for(const t of this.tracks){const s=this.owner.slots[t.slot],v=this.value(t,time);if(s.type==='quaternion')this.rotation.fromArray(v).normalize();else this.position.fromArray(v);}return out.compose(this.position,this.rotation,this.scale.set(1,1,1));}
  unwrapped(time,loop,out){
    if(!loop)return this.sample(Math.max(0,Math.min(this.length,time)),out).premultiply(this.deltaMatrix.copy(this.first).invert());
    const cycles=Math.floor(time/this.length);if(!Number.isSafeInteger(cycles))throw Error('루트 모션 반복 시간 범위 오류');this.power.identity();this.factor.copy(this.cycle);let n=Math.abs(cycles);if(cycles<0)this.factor.invert();while(n){if(n%2)this.power.multiply(this.factor);n=Math.floor(n/2);if(n)this.factor.multiply(this.factor);}this.sample(time-cycles*this.length,out).premultiply(this.deltaMatrix.copy(this.first).invert());return out.premultiply(this.power);
  }
  extract(previous,current,loop,out){resetMotion(out);if(previous===current)return out;this.unwrapped(previous,loop,this.previous);this.unwrapped(current,loop,this.current);this.deltaMatrix.copy(this.previous).invert().multiply(this.current).decompose(this.position,this.rotation,this.scale);this.position.applyQuaternion(this.basis).toArray(out);this.rotation.premultiply(this.basis).multiply(this.rotationScratch??=this.basis.clone().invert()).normalize().toArray(out,3);if(!out.every(Number.isFinite))throw Error('루트 모션 계산 오류');return out;}
  lock(pose){for(const [index,value] of this.lockValues)pose[index].set(value);}
}
