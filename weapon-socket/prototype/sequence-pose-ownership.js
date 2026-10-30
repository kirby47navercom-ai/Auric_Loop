import {skeletalBoneIndex,traverseSkeletalBones} from './sequence-state.js';
const row=bone=>({bone:bone.name,position:bone.position.toArray(),quaternion:bone.quaternion.toArray(),scale:bone.scale.toArray()});
// Bone objects are weak keys: replaced models do not accumulate until Stop.
export class SequencePoseOwnership{
 constructor(){this.baselines=new Map();this.tokens=new WeakMap();}
 capture(id,group,names){const bones=skeletalBoneIndex(group);let state=this.baselines.get(id),created=!state;if(!state){state={pose:[],initial:new WeakMap(),written:new WeakMap(),restored:false};this.tokens.set(state.pose,state);this.baselines.set(id,state);}state.pose.length=0;const selected=names?new Set(names):null;for(const bone of bones.values()){if(selected&&!selected.has(bone.name))continue;const value=row(bone);state.pose.push(value);state.initial.set(bone,value);state.written.delete(bone);}return {pose:state.pose,rows:state.pose.length,created};}
 touch(id,bones){const state=this.baselines.get(id);if(!state)return;for(const bone of bones)if(!state.written.has(bone))state.written.set(bone,state.initial.get(bone)||row(bone));}
 basis(id,bone){return this.baselines.get(id)?.written.get(bone);}
 restore(id,pose,group,name,updateMatrices=true){const state=this.tokens.get(pose);if(!state||this.baselines.get(id)!==state)return {accepted:false,bones:0,first:false};let restored=0;traverseSkeletalBones(group,bone=>{const value=state.written.get(bone);if(!value||name!==undefined&&(name instanceof Set?!name.has(value.bone):value.bone!==name))return;bone.position.fromArray(value.position);bone.quaternion.fromArray(value.quaternion).normalize();bone.scale.fromArray(value.scale);restored++;});if(restored&&updateMatrices)group?.updateWorldMatrix(true,true);const first=!state.restored;state.restored=true;return {accepted:true,bones:restored,first};}
 clear(id){this.baselines.delete(id);}
 dispose(){this.baselines.clear();this.tokens=new WeakMap();}
}
export const sequencePoseOwnershipContract=Object.freeze({
 owner:'prototype/sequence-pose-ownership.js',channels:'skeletalPose:<bone name>; recorded poses and managed imported full/indexed bone TRS share priority/start-order, normalized weights and completion per sampled bone.',
 restore:'Only bone objects written under the shared capture token are restored. Missing, replaced or other-actor bones are untouched; same-name replacement never receives old TRS. Captures and touched model bone references are weak.',
 weight:'Optional skeletalPose track poseWeight0..1, default1. Zero releases its bone channels. Intermediate values blend local TRS from the shared preanimated pose, quaternion shortest-arc Slerp; higher-priority tracks still win each bone. Optional sequence normalized mode mixes same-priority per-bone local TRS after each track poseWeight; zero layer weight retains its shared capture token for reactivation.',
 topology:'Bound bone names, ancestor parent edges and actor ownership markers checked on sampling; stale bindings re-resolve atomically before writes. Unrelated duplicate insertion still follows existing activation/query validation.',
 limits:['Independent Euler-axis layer composition and renderer-property aliases','Arbitrary external setter/notify rollback']
});
