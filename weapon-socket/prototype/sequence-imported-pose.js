import {Quaternion,Euler,MathUtils} from 'three';
import {importedTransformBindings,sampleImportedTransform} from './sequence-indexed-transforms.js';
import {skeletalBoneIndex} from './sequence-state.js';

// Keep the importer's interpolants (including GLTF cubic splines) and buffers.
// Complete and indexed bone bindings enter the existing shared pose channels.
export class ImportedSequencePoseProgram{
 constructor(group,clip){this.clip=clip;this.bindings=new WeakMap();this.track={importedPose:this};this.bindings.set(group,new ImportedPoseBinding(group,this));}
 binding(group){let binding=this.bindings.get(group);if(!binding){binding=new ImportedPoseBinding(group,this);this.bindings.set(group,binding);}binding.validateBinding();return binding;}
}
class ImportedPoseBinding{
 constructor(group,program){this.group=group;this.program=program;this.q=new Quaternion();this.bind();}
 bind(){
  let index;const resolved=importedTransformBindings(this.group,this.program.clip,node=>node?.isBone&&(index??=skeletalBoneIndex(this.group)).get(node.name)===node),rows=new Map();for(const value of resolved.rows){let row=rows.get(value.node.name);if(!row){row={bone:value.node,fields:new Map(),indexed:false};rows.set(value.node.name,row);}row.fields.set(value.field,value);row.indexed||=value.indexed;}
  this.rows=rows;this.tracks=resolved.tracks;this.indexedBones=new Set([...rows].filter(([,row])=>row.indexed).map(([name])=>name));this.signature={names:[...rows.keys()]};this.bones=[...rows.values()].map(row=>row.bone);this.edges=resolved.edges;this.owner=this.group?.userData?.objectId;
 }
 prepare(time){if(!Number.isFinite(time))throw Error('골격 시간 값을 확인하세요.');}
 rebind(){this.bind();}
 validateBinding(){if(this.owner!==this.group?.userData?.objectId||this.edges.some(([node,[parent,owner,name]])=>node.parent!==parent||node.userData?.objectId!==owner||node.name!==name)||this.bones.some((bone,i)=>bone.name!==this.signature.names[i]))this.bind();}
 sampleBone(time,name,{basis,bone}={}){const row=this.rows.get(name);if(!row||bone&&bone!==row.bone)throw Error('클립 뼈의 수명이 바뀌었어요: '+name);bone=row.bone;const base=basis?.(bone)||{position:bone.position.toArray(),quaternion:bone.quaternion.toArray(),scale:bone.scale.toArray()},pose={bone};for(const field of ['position','rotation','scale']){const binding=row.fields.get(field);let basis=field==='rotation'?undefined:base[field];if(field==='rotation'&&binding?.indexed){const angles=new Euler().setFromQuaternion(this.q.fromArray(base.quaternion),'XYZ');basis=[angles.x,angles.y,angles.z].map(MathUtils.radToDeg);}const key=field==='rotation'?'quaternion':field;pose[key]=binding?sampleImportedTransform(binding,time,this.program.clip.duration,basis,field==='rotation'):base[key].slice();}if(row.indexed)pose.mask={position:row.fields.get('position')?.mask,quaternion:row.fields.has('rotation'),scale:row.fields.get('scale')?.mask};return pose;}
 sample(time,{boneNames,basis,validated=false,updateMatrices=true}={}){if(!validated)this.validateBinding();const values=[];for(const name of this.signature.names)if(!boneNames||boneNames.has(name))values.push(this.sampleBone(time,name,{basis}));for(const value of values){value.bone.position.fromArray(value.position);value.bone.quaternion.fromArray(value.quaternion);value.bone.scale.fromArray(value.scale);}if(updateMatrices)this.group?.updateWorldMatrix(true,true);}
}
export const importedSequencePoseContract={channels:'Managed imported full/indexed position/rotation/quaternion/scale bone tracks use the same skeletalPose:<bone name> leases as recorded poses. Missing TRS components use the shared preanimated local pose; full poses retain per-bone rules; indexed position/scale arbitrate authored components and rotation remains one orientation.',storage:'Weak clip/group descriptors and importer interpolants reference original typed key buffers; no baked pose keys, extra evaluator, timer or new public C++ API.',remaining:['Renderer-property aliases','Independent Euler-axis layer composition and unmanaged additional actions','Arbitrary external setter/notify rollback']};
