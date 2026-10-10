import * as THREE from 'three';
import {rigIKChain,ik2dLimits,validRigIKRotationLimits} from './ik2d-assets.js';
const tau=Math.PI*2,wrap=a=>((a+Math.PI)%tau+tau)%tau-Math.PI;
const distance=(p,i,j)=>Math.hypot(p[i*2]-p[j*2],p[i*2+1]-p[j*2+1]);
const residual=(p,x,y)=>Math.hypot(p[p.length-2]-x,p[p.length-1]-y);
function limitAngle(s,i,local){
  const v=s.constraints[i];if(!v)return local;const reference=s.bind[i].rotation*Math.PI/180,angle=wrap(local-reference),min=v.min*Math.PI/180,max=v.max*Math.PI/180;
  if(angle>=min&&angle<=max)return local;const edge=Math.abs(wrap(angle-min))<=Math.abs(wrap(angle-max))?min:max;return local+wrap(reference+edge-local);
}
function jointWorld(s,i){return s.worldAngles[i]+wrap(Math.atan2(s.points[i*2+3]-s.points[i*2+1],s.points[i*2+2]-s.points[i*2])-s.segmentAngles[i]);}
function rotateJoint(s,i,angle){
  const p=s.points,n=s.bones.length;if(s.constraints[i]){const local=jointWorld(s,i)-(i?jointWorld(s,i-1):s.worldAngles[0]-s.localAngles[0]);angle=wrap(limitAngle(s,i,local+angle)-local);}
  const px=p[i*2],py=p[i*2+1],c=Math.cos(angle),sin=Math.sin(angle);for(let j=i+1;j<n;j++){const dx=p[j*2]-px,dy=p[j*2+1]-py;p[j*2]=px+c*dx-sin*dy;p[j*2+1]=py+sin*dx+c*dy;}
}
function constrainPoints(s){for(let i=0;i<s.bones.length-1;i++)if(s.constraints[i])rotateJoint(s,i,0);}
function pointAt(p,i,from,length,dx,dy){let d=Math.hypot(dx,dy);if(d<1e-12){dx=1;dy=0;d=1;}const k=length/d;p[i*2]=p[from*2]+dx*k;p[i*2+1]=p[from*2+1]+dy*k;}
function limb(s,x,y){
  const p=s.points,a=s.lengths[0],b=s.lengths[1],dx=x-p[0],dy=y-p[1],raw=Math.hypot(dx,dy),r=Math.min(a+b,Math.max(Math.abs(a-b),raw)),direction=raw>1e-12?Math.atan2(dy,dx):Math.atan2(p[3]-p[1],p[2]-p[0]),angle=r<1e-12?Math.PI/2:Math.acos(Math.max(-1,Math.min(1,(a*a+r*r-b*b)/(2*a*r)))),first=direction+(s.settings.flip?angle:-angle);
  p[2]=p[0]+a*Math.cos(first);p[3]=p[1]+a*Math.sin(first);p[4]=p[0]+r*Math.cos(direction);p[5]=p[1]+r*Math.sin(direction);s.iterations=1;
}
function perturb(s,x,y){
  const p=s.points;let dx=x-p[0],dy=y-p[1];if(Math.hypot(dx,dy)<1e-12){dx=p[2]-p[0];dy=p[3]-p[1];}const norm=Math.hypot(dx,dy);if(norm<1e-12||s.bones.length<3)return;
  let collinear=true;for(let i=1;i<s.bones.length-1;i++)if(Math.abs((p[i*2]-p[0])*dy-(p[i*2+1]-p[1])*dx)>1e-8){collinear=false;break;}
  if(collinear){const sign=s.settings.flip?-1:1;for(let i=0;i<s.bones.length-1;i++){const beforeX=p[p.length-2],beforeY=p[p.length-1];rotateJoint(s,i,.001*sign);if(p[p.length-2]!==beforeX||p[p.length-1]!==beforeY)break;}}
}
function fabrik(s,x,y,budget){
  const p=s.points,n=s.bones.length,rootX=p[0],rootY=p[1],total=s.lengths.reduce((a,b)=>a+b,0),dx=x-rootX,dy=y-rootY;
  if(Math.hypot(dx,dy)>=total){for(let i=1;i<n;i++)pointAt(p,i,i-1,s.lengths[i-1],dx,dy);constrainPoints(s);s.iterations=1;return;}
  perturb(s,x,y);
  for(let iteration=0;iteration<s.settings.iterations;iteration++){
    const work=(n-1)*2+(s.hasConstraints?n*(n-1)/2:0);if(budget.left<work){s.limited=true;break;}budget.left-=work;s.iterations=iteration+1;p[(n-1)*2]=x;p[(n-1)*2+1]=y;
    for(let i=n-2;i>=0;i--)pointAt(p,i,i+1,s.lengths[i],p[i*2]-p[(i+1)*2],p[i*2+1]-p[(i+1)*2+1]);
    p[0]=rootX;p[1]=rootY;for(let i=1;i<n;i++)pointAt(p,i,i-1,s.lengths[i-1],p[i*2]-p[(i-1)*2],p[i*2+1]-p[(i-1)*2+1]);constrainPoints(s);
    if(residual(p,x,y)<=s.settings.tolerance)break;
  }
}
function ccd(s,x,y,budget,start=0){
  const p=s.points,n=s.bones.length;perturb(s,x,y);
  for(let iteration=start;iteration<s.settings.iterations;iteration++){
    const work=n*(n-1)/2;if(budget.left<work){s.limited=true;break;}budget.left-=work;s.iterations=iteration+1;
    for(let i=n-2;i>=0;i--){const px=p[i*2],py=p[i*2+1],a=Math.atan2(p[(n-1)*2+1]-py,p[(n-1)*2]-px),b=Math.atan2(y-py,x-px);rotateJoint(s,i,wrap(b-a)*(s.settings.type==='ccd'?s.settings.velocity:1));
    }if(residual(p,x,y)<=s.settings.tolerance)break;
  }
}
// Reused scratch arrays and a per-manager work limit bound solver cost. The
// manager runs after pose animation; the skin deforms once after the solvers.
export class SpriteRigIK{
  constructor(pose){
    this.pose=pose;this.matrix=new THREE.Matrix4();this.inverse=new THREE.Matrix4();this.point=new THREE.Vector3();this.budget={left:ik2dLimits.work};this.masterWeight=1;this.revision=0;
    this.solvers=(pose.data.solvers||[]).map(settings=>{const ids=rigIKChain(pose.data,settings.root,settings.effector),bones=ids.map(id=>pose.bone(id)),n=bones.length,copy=structuredClone(settings);copy.rotationLimits??=[];return {settings:copy,bones,bind:ids.map(id=>pose.data.bones.find(b=>b.id===id)),constraints:ids.map(id=>copy.rotationLimits.find(v=>v.bone===id)),hasConstraints:copy.rotationLimits.length>0,points:new Float64Array(n*2),input:new Float64Array(n*6),previous:new Float64Array(n*6).fill(NaN),worldAngles:new Float64Array(n),localAngles:new Float64Array(n),segmentAngles:new Float64Array(n-1),solvedAngles:new Float64Array(n),lengths:new Float64Array(n-1),targetActor:'',offset:[0,0],version:0,appliedVersion:-1,iterations:0,distance:null,reached:false,limited:false};});
  }
  solver(id){const s=this.solvers.find(s=>s.settings.id===id||s.settings.name===id);if(!s)throw Error('2D IK 솔버가 없어요: '+id);return s;}
  setRotationLimit(id,bone,min,max){const s=this.solver(id),ids=s.bind.map(b=>b.id);if(!validRigIKRotationLimits(ids,[{bone,min,max}]))throw Error('2D IK 관절 제한 오류');const i=ids.indexOf(bone),v=s.constraints[i];if(v){v.min=min;v.max=max;}else{s.constraints[i]={bone,min,max};s.settings.rotationLimits.push(s.constraints[i]);}s.hasConstraints=true;s.version++;this.revision++;}
  clearRotationLimit(id,bone){const s=this.solver(id),i=s.bind.findIndex(b=>b.id===bone);if(i<0)throw Error('2D IK 관절이 체인에 없어요.');s.constraints[i]=undefined;s.settings.rotationLimits=s.settings.rotationLimits.filter(v=>v.bone!==bone);s.hasConstraints=s.settings.rotationLimits.length>0;s.version++;this.revision++;}
  set(id,field,value){const s=this.solver(id);if(field==='target'){if(!Array.isArray(value)||value.length!==2||!value.every(v=>Number.isFinite(v)&&Math.abs(v)<=10000))throw Error('IK 목표 위치 오류');s.settings.target=[...value];s.targetActor='';}else if(field==='targetRotation'){if(!Number.isFinite(value)||Math.abs(value)>360000)throw Error('IK 목표 회전 오류');s.settings.targetRotation=value;s.targetActor='';}else if(field==='weight'){if(!Number.isFinite(value)||value<0||value>1)throw Error('IK 가중치 오류');s.settings.weight=value;}else if(field==='enabled'){if(typeof value!=='boolean')throw Error('IK 활성화 값 오류');s.settings.enabled=value;}else throw Error('IK 속성 오류');s.version++;this.revision++;}
  bindTarget(id,actor,offset=[0,0]){if(typeof actor!=='string'||!Array.isArray(offset)||offset.length!==2||!offset.every(v=>Number.isFinite(v)&&Math.abs(v)<=10000))throw Error('IK 목표 오브젝트 오류');const s=this.solver(id);s.targetActor=actor;s.offset=[...offset];s.version++;this.revision++;}
  collect(s){
    this.pose.group.updateWorldMatrix(true,true);this.inverse.copy(this.pose.group.matrixWorld).invert();
    for(let i=0;i<s.bones.length;i++){this.matrix.multiplyMatrices(this.inverse,s.bones[i].matrixWorld);const e=this.matrix.elements,at=i*6;s.input[at]=e[0];s.input[at+1]=e[1];s.input[at+2]=e[4];s.input[at+3]=e[5];s.input[at+4]=e[12];s.input[at+5]=e[13];s.points[i*2]=e[12];s.points[i*2+1]=e[13];s.worldAngles[i]=Math.atan2(e[1],e[0]);s.localAngles[i]=s.bones[i].rotation.z;
      const sx=Math.hypot(e[0],e[1]),sy=Math.hypot(e[4],e[5]);if(Math.abs(sx-sy)>1e-5*Math.max(sx,sy)||Math.abs(e[0]*e[4]+e[1]*e[5])>1e-5*sx*sy||e[0]*e[5]-e[1]*e[4]<=0)throw Error('2D IK 체인의 뼈는 균일한 양의 XY 크기를 사용해야 해요.');
    }
  }
  update({weight=1,visible=true,alwaysUpdate=false,targetObject}={}){
    if(!Number.isFinite(weight)||weight<0||weight>1)throw Error('IK Manager 가중치 오류');if(this.masterWeight!==weight)this.revision++;this.masterWeight=weight;
    if(this.pose.disposed||!this.solvers.length||weight===0||!visible&&!alwaysUpdate)return false;
    this.budget.left=ik2dLimits.work;let changed=false;
    for(const s of this.solvers){const settings=s.settings,w=weight*settings.weight;if(!settings.enabled||!w||settings.type==='ccd'&&!settings.velocity)continue;
      this.collect(s);if(s.targetActor){const target=targetObject?.(s.targetActor);if(!target)throw Error('IK 목표 오브젝트가 없어요: '+s.targetActor);target.updateWorldMatrix(true,false);this.point.set(...s.offset,0).applyMatrix4(target.matrixWorld).applyMatrix4(this.inverse);this.matrix.multiplyMatrices(this.inverse,target.matrixWorld);const e=this.matrix.elements,rotation=Math.atan2(e[1],e[0])*180/Math.PI;if(settings.target[0]!==this.point.x||settings.target[1]!==this.point.y||settings.targetRotation!==rotation){settings.target[0]=this.point.x;settings.target[1]=this.point.y;settings.targetRotation=rotation;s.version++;}}
      if(s.appliedVersion===s.version&&s.lastWeight===w&&!s.limited&&(s.reached||settings.restorePose)&&s.input.every((v,i)=>v===s.previous[i]))continue;
      if(settings.restorePose){for(let i=0;i<s.bones.length;i++){const b=s.bones[i],rest=s.bind[i];b.position.set(...rest.position,0);b.rotation.z=rest.rotation*Math.PI/180;b.scale.set(...rest.scale,1);}this.collect(s);}
      const n=s.bones.length;for(let i=0;i<n-1;i++){s.lengths[i]=distance(s.points,i,i+1);if(s.lengths[i]<1e-8)throw Error('IK 체인의 관절 위치가 겹쳐 있어요.');s.segmentAngles[i]=Math.atan2(s.points[i*2+3]-s.points[i*2+1],s.points[i*2+2]-s.points[i*2]);}
      s.iterations=0;s.limited=false;const [x,y]=settings.target;
      if(settings.type==='limb'){limb(s,x,y);if(s.hasConstraints){constrainPoints(s);if(residual(s.points,x,y)>settings.tolerance)ccd(s,x,y,this.budget,1);}}else if(settings.type==='fabrik')fabrik(s,x,y,this.budget);else{constrainPoints(s);ccd(s,x,y,this.budget);}
      const parentAngle=s.worldAngles[0]-s.localAngles[0];for(let i=0;i<n;i++){const desired=i<n-1?jointWorld(s,i):settings.constrainRotation?settings.targetRotation*Math.PI/180:s.worldAngles[i]+(s.solvedAngles[i-1]-s.worldAngles[i-1]),local=limitAngle(s,i,desired-(i?s.solvedAngles[i-1]:parentAngle));s.solvedAngles[i]=(i?s.solvedAngles[i-1]:parentAngle)+local;s.bones[i].rotation.z=limitAngle(s,i,s.localAngles[i]+wrap(local-s.localAngles[i])*w);}
      this.collect(s);s.distance=residual(s.points,x,y);s.reached=s.distance<=settings.tolerance;s.previous.set(s.input);s.appliedVersion=s.version;s.lastWeight=w;changed=true;
    }
    if(changed){this.pose.update();this.revision++;}return changed;
  }
  snapshot(){return {revision:this.revision,weight:this.masterWeight,solvers:this.solvers.map(s=>({id:s.settings.id,name:s.settings.name,type:s.settings.type,target:[...s.settings.target],targetRotation:s.settings.targetRotation,targetActor:s.targetActor,weight:s.settings.weight,enabled:s.settings.enabled,rotationLimits:structuredClone(s.settings.rotationLimits),iterations:s.iterations,distance:s.distance,reached:s.reached,limited:s.limited}))};}
  dispose(){this.solvers.length=0;}
}
