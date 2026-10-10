import * as THREE from 'three';
import {validSpriteRig,validateSpriteRigProgram,rigMatrices,inverse2D} from './sprite-rig-assets.js';
import {SpriteRigIK} from './sprite-rig-ik.js';

export class SpriteRigPose{
  constructor(data,{geometry,requireSprite=false}={}){
    if(!validSpriteRig(data))throw Error('스프라이트 리그 데이터 오류');if(requireSprite)validateSpriteRigProgram(data);
    this.data=structuredClone(data);this.group=new THREE.Group();this.bones=new Map();this.labels=new Map();this.geometry=geometry;this.positions=new Float32Array(data.vertices.length*3);this.inverseBind=rigMatrices(data);for(const [id,matrix] of this.inverseBind)this.inverseBind.set(id,inverse2D(matrix));
    for(const b of data.bones){const bone=new THREE.Bone();bone.name='rig_'+b.id;bone.userData.rigBoneId=b.id;bone.userData.rigBoneName=b.name;bone.position.set(...b.position,0);bone.rotation.z=THREE.MathUtils.degToRad(b.rotation);bone.scale.set(...b.scale,1);this.bones.set(b.id,bone);this.labels.set(b.name,b.id);}
    for(const b of data.bones)(b.parent?this.bones.get(b.parent):this.group).add(this.bones.get(b.id));
    this.matrices=data.bones.map(()=>new Float64Array(6));this.previous=new Float64Array(data.bones.length*7).fill(NaN);this.ids=new Map(data.bones.map((b,i)=>[b.id,i]));this.weights=data.vertices.map(v=>v.weights.map(w=>({index:this.ids.get(w.bone),weight:w.weight})));this.inverseRoot=new THREE.Matrix4();this.matrix=new THREE.Matrix4();this.revision=0;
    this.ik=new SpriteRigIK(this);
    this.animations=data.clips.map(clip=>new THREE.AnimationClip(clip.name,clip.length,clip.tracks.map(track=>{
      const target=this.bones.get(track.bone).name,times=track.keys.map(k=>k.time),values=track.keys.flatMap(k=>track.property==='rotation'?[THREE.MathUtils.degToRad(k.value)]:[...k.value,track.property==='scale'?1:0]);
      const type=track.property==='rotation'?THREE.NumberKeyframeTrack:THREE.VectorKeyframeTrack,key=track.property==='rotation'?'.rotation[z]':'.'+track.property,result=new type(target+key,times,values),keys=track.keys;
      result.createInterpolant=function(buffer){const interpolant=new THREE.LinearInterpolant(this.times,this.values,this.getValueSize(),buffer),linear=interpolant.interpolate_;interpolant.interpolate_=function(index,start,time,end){return keys[index-1].interpolation==='step'?this.copySampleValue_(index-1):linear.call(this,index,start,time,end);};return interpolant;};return result;
    })));
    if(geometry)this.attachGeometry(geometry);
    this.update(true);
  }
  attachGeometry(geometry){this.geometry=geometry;geometry.setAttribute('position',new THREE.BufferAttribute(this.positions,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(this.data.vertices.flatMap(v=>v.uv),2));geometry.setAttribute('normal',new THREE.Float32BufferAttribute(this.data.vertices.flatMap(()=>[0,0,1]),3));geometry.setIndex(this.data.triangles);this.update(true);}
  bone(id){return this.bones.get(id)||this.bones.get(this.labels.get(id));}
  get(id){const bone=this.bone(id);if(!bone)throw Error('리그 뼈가 없어요: '+id);return {position:[bone.position.x,bone.position.y],rotation:THREE.MathUtils.radToDeg(bone.rotation.z),scale:[bone.scale.x,bone.scale.y]};}
  set(id,pose){const bone=this.bone(id);if(!bone||!pose||!Array.isArray(pose.position)||pose.position.length!==2||!Array.isArray(pose.scale)||pose.scale.length!==2||!pose.position.every(v=>Number.isFinite(v)&&Math.abs(v)<=10000)||!Number.isFinite(pose.rotation)||Math.abs(pose.rotation)>360000||!pose.scale.every(v=>Number.isFinite(v)&&v>=.0001&&v<=1000))throw Error('리그 뼈 포즈 오류');bone.position.set(...pose.position,0);bone.rotation.z=THREE.MathUtils.degToRad(pose.rotation);bone.scale.set(...pose.scale,1);this.update();}
  reset(){for(const b of this.data.bones){const bone=this.bones.get(b.id);bone.position.set(...b.position,0);bone.rotation.z=THREE.MathUtils.degToRad(b.rotation);bone.scale.set(...b.scale,1);}this.update();}
  update(force=false){
    if(this.disposed)return false;let changed=force,index=0;const check=value=>{if(this.previous[index]!==value){this.previous[index]=value;changed=true;}index++;};for(const bone of this.bones.values()){check(bone.position.x);check(bone.position.y);check(bone.rotation.z);check(bone.scale.x);check(bone.scale.y);check(bone.position.z);check(bone.scale.z);}if(!changed)return false;
    this.group.updateWorldMatrix(true,true);this.inverseRoot.copy(this.group.matrixWorld).invert();
    for(const [id,bone] of this.bones){this.matrix.multiplyMatrices(this.inverseRoot,bone.matrixWorld);const e=this.matrix.elements,b=this.inverseBind.get(id),m=this.matrices[this.ids.get(id)];m[0]=e[0]*b[0]+e[4]*b[1];m[1]=e[1]*b[0]+e[5]*b[1];m[2]=e[0]*b[2]+e[4]*b[3];m[3]=e[1]*b[2]+e[5]*b[3];m[4]=e[0]*b[4]+e[4]*b[5]+e[12];m[5]=e[1]*b[4]+e[5]*b[5]+e[13];}
    for(let i=0;i<this.data.vertices.length;i++){const p=this.data.vertices[i].position,weights=this.weights[i];let x=0,y=0;for(const w of weights){const m=this.matrices[w.index];x+=(m[0]*p[0]+m[2]*p[1]+m[4])*w.weight;y+=(m[1]*p[0]+m[3]*p[1]+m[5])*w.weight;}this.positions[i*3]=weights.length?x:p[0];this.positions[i*3+1]=weights.length?y:p[1];}
    if(this.geometry){this.geometry.attributes.position.needsUpdate=true;this.geometry.computeBoundingBox();this.geometry.computeBoundingSphere();}this.revision++;return true;
  }
  snapshot({vertices=false}={}){this.update();return {revision:this.revision,bones:this.data.bones.map(b=>({id:b.id,name:b.name,parent:b.parent,...this.get(b.id)})),ik:this.ik.snapshot(),...vertices?{positions:Array.from(this.positions)}:{}};}
  dispose(){this.disposed=true;this.ik.dispose();this.group.removeFromParent();this.group.clear();this.bones.clear();this.labels.clear();this.weights.length=0;}
}
