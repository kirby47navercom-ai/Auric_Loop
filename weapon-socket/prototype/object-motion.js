import {Matrix4,DataTexture,FloatType,RGBAFormat,NearestFilter} from 'three';
export const objectMotionEnabled=p=>!!(p&&(p.antiAliasing==='taa'&&p.aaStrength>0||p.motionBlurEnabled&&p.motionBlurStrength>0));
export function motionPose(object){
 const bones=[],m=new Matrix4();if(object.isSkinnedMesh&&object.skeleton){object.skeleton.update();for(let i=0;i<object.skeleton.bones.length;i++)bones.push(m.fromArray(object.skeleton.boneMatrices,i*16).premultiply(object.bindMatrixInverse).multiply(object.bindMatrix).toArray());}
 return {bones,weights:Array.from(object.morphTargetInfluences||[]),bindTranslation:object.isSkinnedMesh?object.bindMatrixInverse.elements.slice(12,15):[0,0,0],instances:object.isInstancedMesh?Array.from(object.instanceMatrix.array.slice(0,object.count*16)):null};
}
const textureFor=values=>{const width=4,height=Math.max(1,Math.ceil(values.length/16)),data=new Float32Array(width*height*4);data.set(values);const texture=new DataTexture(data,width,height,RGBAFormat,FloatType);texture.minFilter=texture.magFilter=NearestFilter;texture.needsUpdate=true;return texture;};
export class ObjectMotionHistory{
 constructor(){this.records=new Map();this.pending=new Set();this.serial=0;}
 clear(){for(const r of this.records.values()){r.boneTexture?.dispose();r.instanceTexture?.dispose();r.weightsTexture?.dispose();}this.records.clear();}
 begin(reset=false){if(reset)this.clear();this.pending.clear();this.serial++;}
 get(object,world=object.matrixWorld){
  const mode=object.userData.hbMotionVectors||'perObject';if(mode==='none')return {world,flag:2};if(mode==='camera')return {world,flag:0};
  const materials=Array.isArray(object.material)?object.material:[object.material];
  // shortcut: custom vertex shaders, displacement and compact projectile streams need their own previous-vertex contract.
  if(object.morphTexture||!object.isMesh||object.isSkinnedMesh&&!object.skeleton||object.geometry?.isInstancedBufferGeometry&&!object.isInstancedMesh||object.userData.sprite||object.userData.draw2d||materials.some(m=>m?.isShaderMaterial||m?.displacementMap||m?.positionNode))return {world,flag:0};
  const geometry=object.geometry,position=geometry?.attributes.position,index=geometry?.index,signature=[position,position?.version,index,index?.version,object.skeleton,object.skeleton?.bones.length,object.count,...Object.values(geometry?.morphAttributes||{}).flatMap(list=>list.flatMap(a=>[a,a.version])),geometry?.attributes.skinIndex,geometry?.attributes.skinWeight,geometry?.attributes.skinIndex?.version,geometry?.attributes.skinWeight?.version];let r=this.records.get(object);
  if(!r){r={world:new Matrix4(),next:new Matrix4(),frame:-1};this.records.set(object,r);}
  if(r.prepared!==this.serial){const pose=motionPose(object),valid=r.frame===this.serial-1&&r.geometry===geometry&&r.signature?.length===signature.length&&signature.every((v,i)=>v===r.signature[i]);r.result={world:valid?r.world:world,flag:valid?1:-1,pose:valid?r.pose:pose,record:r};r.next.copy(world);r.nextGeometry=geometry;r.nextSignature=signature;r.nextPose=pose;r.prepared=this.serial;this.pending.add(r);}
  return r.result;
 }
 textures(result){const r=result.record;if(!r)return null;if(r.texturesPrepared===this.serial)return {bones:r.boneTexture,instances:r.instanceTexture,weights:r.weightsTexture};r.texturesPrepared=this.serial;const pose=result.pose;for(const [key,values]of [['boneTexture',pose.bones.flat()],['instanceTexture',pose.instances||[]],['weightsTexture',pose.weights]]){if(!values.length)continue;if(r[key]?.image.data.length<values.length){r[key].dispose();r[key]=null;}r[key]??=textureFor(values);r[key].image.data.fill(0);r[key].image.data.set(values);r[key].needsUpdate=true;}return {bones:r.boneTexture,instances:r.instanceTexture,weights:r.weightsTexture};}
 end(success=true){for(const [o,r]of this.records){if(success&&this.pending.has(r)){r.world.copy(r.next);Object.assign(r,{frame:this.serial,geometry:r.nextGeometry,signature:r.nextSignature,pose:r.nextPose});}else{r.boneTexture?.dispose();r.instanceTexture?.dispose();r.weightsTexture?.dispose();this.records.delete(o);}}this.pending.clear();if(!success)this.clear();}
}
