import {Euler,Quaternion} from 'three';

const bounds=(value,yLimit=180)=>Array.isArray(value)&&value.length===3&&value.every((v,i)=>Number.isFinite(v)&&Math.abs(v)<=(i===1?yLimit:180));
export const validJointLimit=entry=>!!entry&&typeof entry.bone==='string'&&entry.bone.length>0&&entry.bone.length<=160&&bounds(entry.minimum,90)&&bounds(entry.maximum,90)&&entry.minimum.every((v,i)=>v<=entry.maximum[i]);
export const validJointLimits=entries=>entries===undefined||Array.isArray(entries)&&entries.every(validJointLimit)&&new Set(entries.map(v=>v.bone)).size===entries.length;

// Canonical XYZ angles relative to the imported bind rotation. Y is [-90,90];
// constraints are blended with the input pose by the solver's existing Alpha.
export class JointRotationLimits{
 constructor(bones,hierarchy,entries=[]){this.bones=bones;this.hierarchy=hierarchy;this.rows=null;this.debug=[];for(const entry of entries)this.set(entry);}
 index(bone){const index=this.bones.findIndex(b=>b.name===bone);if(index<0)throw Error('IK 관절 제약 뼈가 체인에 없어요: '+bone);return index;}
 set(entry){if(!validJointLimit(entry))throw Error('IK 기준 포즈 XYZ 회전 범위를 확인하세요.');const index=this.index(entry.bone),value={bone:entry.bone,minimum:[...entry.minimum],maximum:[...entry.maximum]};if(!this.rows){this.rows=new Map();this.delta=new Quaternion();this.rotation=new Quaternion();this.euler=new Euler(0,0,0,'XYZ');}this.rows.set(index,{value,minimum:entry.minimum.map(v=>v*Math.PI/180),maximum:entry.maximum.map(v=>v*Math.PI/180),bind:this.hierarchy.get(this.bones[index]).rotation});this.debug.splice(0,this.debug.length,...[...this.rows.values()].map(r=>r.value));}
 clear(bone){const index=this.index(bone);if(!this.rows)return;this.rows.delete(index);this.debug.splice(0,this.debug.length,...[...this.rows.values()].map(r=>r.value));if(!this.rows.size){this.rows=null;this.delta=null;this.rotation=null;this.euler=null;}}
 has(index){return this.rows?.has(index)||false;}
 apply(index,bone){const row=this.rows?.get(index);if(!row)return;this.delta.copy(row.bind).invert().multiply(bone.quaternion).normalize();this.euler.setFromQuaternion(this.delta,'XYZ');this.euler.set(Math.max(row.minimum[0],Math.min(row.maximum[0],this.euler.x)),Math.max(row.minimum[1],Math.min(row.maximum[1],this.euler.y)),Math.max(row.minimum[2],Math.min(row.maximum[2],this.euler.z)),'XYZ');bone.quaternion.copy(row.bind).multiply(this.rotation.setFromEuler(this.euler)).normalize();}
}
