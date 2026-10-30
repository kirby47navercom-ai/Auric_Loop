import {Vector3,Quaternion,Euler} from 'three';
const rad=Math.PI/180,xAxis=new Vector3(1,0,0);
const rotation=v=>new Quaternion().setFromEuler(new Euler(...v.map(x=>x*rad)));
export function validJointFrames(p,dimension){if(!p.useFrames)return true;if(dimension===2)return p.frameRotation[0]===0&&p.frameRotation[1]===0&&p.connectedFrameRotation[0]===0&&p.connectedFrameRotation[1]===0&&(p.jointType!=='slider'||p.autoConnectedFrame||Math.hypot(...p.connectedAxis.slice(0,2))>1e-6);return Math.hypot(...p.axis)>1e-6&&(p.autoConnectedFrame||Math.hypot(...p.connectedAxis)>1e-6);}
export function jointFrames(p,a,b,dimension){
 if(dimension===2){a={...a,rotation:rotation([0,0,new Euler().setFromQuaternion(a.rotation).z/rad])};b={...b,rotation:rotation([0,0,new Euler().setFromQuaternion(b.rotation).z/rad])};}
 const anchorA=new Vector3(...p.anchor).multiply(a.scale),world=anchorA.clone().applyQuaternion(a.rotation).add(a.position),anchorB=p.autoConnectedAnchor?world.sub(b.position).applyQuaternion(b.rotation.clone().invert()):new Vector3(...p.connectedAnchor).multiply(b.scale),relative=b.rotation.clone().invert().multiply(a.rotation);
 const planarAngle=(v,axis)=>(v?.[2]||0)+(p.jointType==='slider'?Math.atan2(axis[1],axis[0])/rad:0);
 const first=dimension===2?rotation([0,0,planarAngle(p.frameRotation,p.axis)]):rotation(p.frameRotation||[0,0,0]).multiply(new Quaternion().setFromUnitVectors(xAxis,new Vector3(...p.axis).normalize()));
 const second=p.autoConnectedFrame?relative.clone().multiply(first):dimension===2?rotation([0,0,planarAngle(p.connectedFrameRotation,p.connectedAxis)]):rotation(p.connectedFrameRotation||[0,0,0]).multiply(new Quaternion().setFromUnitVectors(xAxis,new Vector3(...p.connectedAxis).normalize()));
 if(p.jointType==='hinge'&&p.referenceAngle)second.multiply(new Quaternion().setFromAxisAngle(dimension===2?new Vector3(0,0,1):xAxis,p.referenceAngle*rad));
 return {anchorA,anchorB,first,second,relative};
}
export function applyJointFrames(R,joint,frames,dimension){
 const vec=v=>({x:v.x,y:v.y,z:v.z});for(const [side,anchor,q]of [[1,frames.anchorA,frames.first],[2,frames.anchorB,frames.second]]){
  const value=dimension===2?new Euler().setFromQuaternion(q).z:{x:q.x,y:q.y,z:q.z,w:q.w},method=joint['setLocalFrame'+side];if(method){method.call(joint,vec(anchor),value);continue;}
  // Rapier0.21 exposes 2D frame setters in its public raw bindings only.
  const rawAnchor=R.VectorOps.intoRaw(vec(anchor)),rawRotation=R.RotationOps.intoRaw(value);try{joint.rawSet['jointSetLocalFrame'+side](joint.handle,rawAnchor,rawRotation);}finally{rawAnchor.free();rawRotation.free();}
 }
}
