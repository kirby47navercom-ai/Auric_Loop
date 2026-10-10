const references=new WeakMap();
export function animationBindTransform(object){let value=references.get(object);if(!value){value={position:object.position.clone(),quaternion:object.quaternion.clone(),scale:object.scale.clone()};references.set(object,value);}return value;}
export function rememberAnimationBindPose(group){group?.traverse(animationBindTransform);return group;}
export function copyAnimationBindPose(source,target){const a=[],b=[];source.traverse(o=>a.push(o));target.traverse(o=>b.push(o));if(a.length!==b.length)throw Error('복제 골격 구조가 달라요.');for(let i=0;i<a.length;i++){const r=animationBindTransform(a[i]);references.set(b[i],{position:r.position.clone(),quaternion:r.quaternion.clone(),scale:r.scale.clone()});}}
