import {Vector3,Matrix3,Matrix4} from 'three';

// One collection/instance only: no retained poses or cross-frame invalidation.
// Keep per-face fallback and independent output arrays for degenerate normals.
export function rayVertexNormals(object,world){
 const geometry=object.geometry;
 if(!geometry.attributes.normal)return (_index,face)=>face;
 const normalMatrix=new Matrix3().getNormalMatrix(world),normals=geometry.index?new Map():null,bones=new Map();
 return (index,face)=>{
  if(normals?.has(index))return normals.get(index)?.slice()??face;
  const base=new Vector3().fromBufferAttribute(geometry.attributes.normal,index),normal=base.clone();
  for(let i=0;i<(geometry.morphAttributes.normal?.length||0);i++){
   const delta=new Vector3().fromBufferAttribute(geometry.morphAttributes.normal[i],index);
   if(!geometry.morphTargetsRelative)delta.sub(base);
   normal.addScaledVector(delta,object.morphTargetInfluences?.[i]||0);
  }
  if(object.isSkinnedMesh){
   const weighted=new Vector3();
   for(let i=0;i<4;i++){
    const id=geometry.attributes.skinIndex.getComponent(index,i),weight=geometry.attributes.skinWeight.getComponent(index,i);
    let transform=bones.get(id);
    if(!transform){const bone=new Matrix4().fromArray(object.skeleton.boneMatrices,id*16).premultiply(object.bindMatrixInverse).multiply(object.bindMatrix);transform=new Matrix3().setFromMatrix4(bone);bones.set(id,transform);}
    weighted.addScaledVector(normal.clone().applyMatrix3(transform),weight);
   }
   normal.copy(weighted);
  }
  normal.applyNormalMatrix(normalMatrix);
  const result=normal.lengthSq()>1e-16?normal.toArray():null;
  normals?.set(index,result);
  return (normals?result?.slice():result)??face;
 };
}
