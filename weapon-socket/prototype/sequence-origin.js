import {Vector3,Quaternion,Euler,MathUtils} from 'three';
import {sceneWorldMatrix} from './scene-runtime.js';
import {sequenceMayWriteTransform} from './sequence-animation-transforms.js';
export const sequenceOriginDefaults=()=>({mode:'inherit',actor:'',position:[0,0,0],rotation:[0,0,0]});
const inheritedOrigin=Object.freeze({mode:'inherit',actor:'',position:Object.freeze([0,0,0]),rotation:Object.freeze([0,0,0])});
const vector=v=>Array.isArray(v)&&v.length===3&&v.every(n=>Number.isFinite(n)&&Math.abs(n)<=100000);
export function validSequenceOrigin(origin){return origin===undefined||origin&&typeof origin==='object'&&!Array.isArray(origin)&&Object.keys(origin).every(k=>['mode','actor','position','rotation'].includes(k))&&['inherit','transform','actor'].includes(origin.mode)&&typeof origin.actor==='string'&&origin.actor.length<=200&&(origin.mode!=='actor'||origin.actor.length>0)&&vector(origin.position)&&vector(origin.rotation);}
export const sequenceTransformField=track=>['position','rotation'].includes(track.type)?track.type:track.type==='component'&&track.componentType==='Transform'&&['position','rotation'].includes(track.property)?track.property:null;
export function configureSequenceOrigin(data,origin){if(!validSequenceOrigin(origin))throw Error('시퀀스 기준점의 모드·대상·위치·회전을 확인하세요.');if(origin===undefined)delete data.origin;else data.origin=structuredClone(origin);return data.origin??null;}
// Origins affect absolute/root transform channels. Attached actors keep local
// tracks, so an animated parent transports its children exactly once.
export class SequenceOrigin{
 constructor(data,owner,vm,parent=null){
  this.vm=vm;this.parent=parent;this.config=data.origin??inheritedOrigin;this.actor=this.config.mode==='actor'?vm.object(this.config.actor==='self'?owner:this.config.actor):null;
  if(this.config.mode==='actor'&&!this.actor)throw Error('시퀀스 기준 액터가 없어요: '+this.config.actor);
  this.animatedTargets=this.actor?new Set(data.tracks.filter(t=>sequenceMayWriteTransform(t)&&(t.keys.length||t.clips.length)).map(t=>t.target||owner)):null;
  this.enabled=this.config.mode!=='inherit'||!!parent?.enabled;
  if(!this.enabled)return;
  this.offset=new Vector3(...this.config.position);this.offsetRotation=new Quaternion().setFromEuler(new Euler(...this.config.rotation.map(MathUtils.degToRad),'XYZ'));
  this.position=new Vector3();this.rotation=new Quaternion();this.scale=new Vector3();this.value=new Vector3();this.valueRotation=new Quaternion();this.euler=new Euler();
  this.validate();
 }
 validate(){if(!this.enabled)return;if(this.actor&&this.vm.object(this.actor.id)!==this.actor)throw Error('시퀀스 기준 액터의 수명이 바뀌었어요.');if(this.actor){let at=this.vm.object(this.actor.parentId||this.actor.parent),depth=0;while(at){if(++depth>64)throw Error('시퀀스 기준 액터의 부모 계층을 확인하세요.');if(this.animatedTargets.has(at.id))throw Error('기준 액터의 부모를 같은 시퀀스의 변환 대상으로 쓸 수 없어요.');at=this.vm.object(at.parentId||at.parent);}}this.parent?.validate();}
 prepare(){
  if(!this.enabled)return;this.validate();
  if(this.actor){sceneWorldMatrix(this.actor,this.vm.objects).decompose(this.position,this.rotation,this.scale);}
  else if(this.parent?.enabled){this.parent.prepare();this.position.copy(this.parent.position);this.rotation.copy(this.parent.rotation);}
  else{this.position.set(0,0,0);this.rotation.identity();}
  if(this.config.mode!=='inherit'){this.position.add(this.value.copy(this.offset).applyQuaternion(this.rotation));this.rotation.multiply(this.offsetRotation).normalize();}
 }
 indexedBasis(field,basis,object){if(!this.enabled||field!=='rotation'||object.parent||object.parentId||this.isOriginActor(object))return basis;const rotation=new Quaternion().setFromEuler(new Euler(...basis.map(MathUtils.degToRad),'XYZ')).premultiply(this.rotation.clone().invert()),angles=new Euler().setFromQuaternion(rotation,'XYZ');return [angles.x,angles.y,angles.z].map(MathUtils.radToDeg);}
 applyPartial(field,sample,basis,object){
  if(!this.enabled||field!=='position'||object.parent||object.parentId||this.isOriginActor(object))return sample;
  // Fill unauthored local axes by inverse-transforming the shared world basis.
  const local=new Vector3().fromArray(basis).sub(this.position).applyQuaternion(this.rotation.clone().invert()),mask=[false,false,false];for(let k=0;k<3;k++)if(sample.mask[k]){local.setComponent(k,sample.value[k]);const axis=new Vector3().setComponent(k,1).applyQuaternion(this.rotation);for(let j=0;j<3;j++)mask[j]||=Math.abs(axis.getComponent(j))>1e-10;}
  return {indexedTransform:true,value:local.applyQuaternion(this.rotation).add(this.position).toArray(),mask};
 }
 isOriginActor(object){return this.enabled&&(this.actor===object||!!this.parent?.isOriginActor(object));}
 apply(track,value,object){
  if(!this.enabled)return value;const field=sequenceTransformField(track);if(!field||value===undefined||object.parent||object.parentId||this.isOriginActor(object))return value;
  if(field==='position')return this.value.fromArray(value).applyQuaternion(this.rotation).add(this.position).toArray();
  this.valueRotation.setFromEuler(this.euler.set(...value.map(MathUtils.degToRad),'XYZ')).premultiply(this.rotation).normalize();this.euler.setFromQuaternion(this.valueRotation,'XYZ');return [this.euler.x,this.euler.y,this.euler.z].map(MathUtils.radToDeg);
 }
}
