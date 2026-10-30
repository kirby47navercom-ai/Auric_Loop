import {Box3,Sphere,Vector3} from 'three';

const meshes=new WeakMap(),skeletons=new WeakMap(),point=new Vector3();
const same=(a,b)=>a?.length===b.length&&a.every((v,i)=>Object.is(v,b[i]));
function skeletonVersion(skeleton){
 if(!skeleton)return 0;const values=[];for(let i=0;i<skeleton.bones.length;i++)values.push(...(skeleton.bones[i]?.matrixWorld.elements||[]),...(skeleton.boneInverses[i]?.elements||[]));if(values.length!==skeleton.bones.length*32||!values.every(Number.isFinite))return null;let state=skeletons.get(skeleton);if(!state||!same(state.values,values)){skeleton.update();state={values,version:(state?.version||0)+1};skeletons.set(skeleton,state);}return state.version;
}
// CPU pose data only. Stable weights/bones compare small stamps, not vertices.
// Shader-authored displacement and per-instance morph textures need their owner.
export function reflectionProbeDeformedBounds(mesh){
 if(mesh.morphTexture||mesh.isInstancedMesh||!mesh.getVertexPosition)return null;const g=mesh.geometry,attributes=[g?.attributes.position,...(g?.morphAttributes.position||[])];if(mesh.isSkinnedMesh)attributes.push(g?.attributes.skinIndex,g?.attributes.skinWeight);if(attributes.some(a=>!a))return null;
 const key=[g,g.morphTargetsRelative,mesh.skeleton,skeletonVersion(mesh.skeleton),...(mesh.morphTargetInfluences||[]),...(mesh.bindMatrix?.elements||[]),...(mesh.bindMatrixInverse?.elements||[])];if(key[3]===null)return null;for(const a of attributes){const data=a.isInterleavedBufferAttribute?a.data:a;key.push(a,data,data.array,data.version,a.count);}
 let cached=meshes.get(mesh);if(!cached||!same(cached.key,key)){
  const box=new Box3();for(let i=0;i<g.attributes.position.count;i++){mesh.getVertexPosition(i,point);if(!Number.isFinite(point.x)||!Number.isFinite(point.y)||!Number.isFinite(point.z))return null;box.expandByPoint(point);}if(box.isEmpty())return null;cached={key,box};meshes.set(mesh,cached);
  // Frustum tests must use this pose too, including negative morph weights.
  (mesh.boundingBox??=new Box3()).copy(box);box.getBoundingSphere(mesh.boundingSphere??=new Sphere());mesh.boundingSphere.radius*=1+8*Number.EPSILON;
 }
 return cached.box;
}
