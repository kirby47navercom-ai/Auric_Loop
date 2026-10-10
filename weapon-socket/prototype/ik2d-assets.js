export const ik2dTypes={limb:'Limb · 두 관절',ccd:'Chain · CCD',fabrik:'Chain · FABRIK'};
export const ik2dLimits={solvers:32,chain:64,iterations:64,work:8192};
const number=(v,a,b)=>Number.isFinite(v)&&v>=a&&v<=b;
export function rigIKChain(data,root,effector){
  const bones=new Map(data.bones.map(b=>[b.id,b])),chain=[],seen=new Set();let id=effector;
  while(id&&!seen.has(id)&&chain.length<ik2dLimits.chain){const b=bones.get(id);if(!b)break;seen.add(id);chain.unshift(id);if(id===root)return chain;id=b.parent;}
  throw Error('IK 루트와 이펙터의 부모 계층을 확인하세요.');
}
export function makeRigIKSolver(data,{name='IK',type='ccd',root,effector}={}){
  if(!effector)effector=data.bones.at(-1).id;
  const end=data.bones.find(b=>b.id===effector);if(!end)throw Error('IK 이펙터가 없어요.');
  if(!root){root=end.parent;const parent=data.bones.find(b=>b.id===root);if(type==='limb')root=parent?.parent;}
  if(!root)throw Error('IK에는 부모가 연결된 뼈가 필요해요.');
  const chain=rigIKChain(data,root,effector);if(chain.length<2||type==='limb'&&chain.length!==3||!Object.hasOwn(ik2dTypes,type))throw Error('IK 체인 길이·종류를 확인하세요.');
  return {id:'ik_'+crypto.randomUUID(),name,type,root,effector,target:[0,0],targetRotation:0,enabled:true,weight:1,restorePose:true,constrainRotation:false,rotationLimits:[],flip:false,iterations:32,tolerance:.001,velocity:1,gizmo:true,color:'#70c5ed'};
}
export function validRigIKRotationLimits(chain,limits){
  if(limits===undefined)return true;if(!Array.isArray(limits)||limits.length>chain.length)return false;const ids=new Set();
  for(const v of limits){if(!v||!chain.includes(v.bone)||ids.has(v.bone)||!number(v.min,-180,180)||!number(v.max,-180,180)||v.min>v.max)return false;ids.add(v.bone);}return true;
}
export function validRigIKSolvers(data){
  if(data.solvers===undefined)return true;if(!Array.isArray(data.solvers)||data.solvers.length>ik2dLimits.solvers)return false;
  const ids=new Set(),names=new Set();
  for(const s of data.solvers){
    if(!s||typeof s.id!=='string'||!/^ik_[\w-]{1,76}$/.test(s.id)||ids.has(s.id)||typeof s.name!=='string'||!s.name.trim()||s.name.length>120||/[\x00-\x1f]/.test(s.name)||names.has(s.name)||!Object.hasOwn(ik2dTypes,s.type)||!Array.isArray(s.target)||s.target.length!==2||!s.target.every(v=>number(v,-10000,10000))||!number(s.targetRotation,-360000,360000)||!number(s.weight,0,1)||!Number.isInteger(s.iterations)||!number(s.iterations,1,ik2dLimits.iterations)||!number(s.tolerance,.000001,100)||!number(s.velocity,0,1)||!['enabled','restorePose','constrainRotation','flip','gizmo'].every(k=>typeof s[k]==='boolean')||!/^#[\da-fA-F]{6}$/.test(s.color))return false;
    ids.add(s.id);names.add(s.name);
    try{const chain=rigIKChain(data,s.root,s.effector);if(chain.length<2||s.type==='limb'&&chain.length!==3||!validRigIKRotationLimits(chain,s.rotationLimits))return false;for(const id of chain.slice(1)){const b=data.bones.find(b=>b.id===id);if(Math.hypot(...b.position)<1e-8)return false;}}catch{return false;}
  }
  return true;
}
