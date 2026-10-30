import {Quaternion,Euler,MathUtils} from 'three';
// Explicit quaternion infinity modes only. One scratch owner per SequenceSampler;
// prepared key quaternions stay shared and no per-cycle table is constructed.
function power(q,exponent){
 if(q.w<0)q.set(-q.x,-q.y,-q.z,-q.w);
 const sine=Math.hypot(q.x,q.y,q.z);if(sine===0||exponent===0)return q.identity();
 const half=Math.atan2(sine,q.w),period=2*Math.PI/half,angle=Number.isFinite(period)?(exponent%period)*half:exponent*half,rotatedSine=Math.sin(angle);
 return q.set(q.x/sine*rotatedSine,q.y/sine*rotatedSine,q.z/sine*rotatedSine,Math.cos(angle)).normalize();
}
export class SequenceQuaternionRange{
 constructor(){this.result=new Quaternion();this.other=new Quaternion();this.delta=new Quaternion();this.euler=new Euler();}
 pose(keys,values,time){
  let lo=0,hi=keys.length;while(lo<hi){const mid=(lo+hi)>>>1;if(keys[mid].time<=time)lo=mid+1;else hi=mid;}
  const first=Math.max(0,lo-1),last=Math.min(lo,keys.length-1),a=keys[first],b=keys[last];this.result.fromArray(values,first*4);
  if(a!==b&&time>a.time&&!['constant','step'].includes(a.interpolation))this.result.slerp(this.other.fromArray(values,last*4),(time-a.time)/(b.time-a.time));
 }
 sample(keys,values,time,track){
  if(keys.length<2||!Number.isFinite(time))return undefined;const first=keys[0],last=keys.at(-1),before=time<first.time,mode=track[before?'preInfinity':'postInfinity'];
  if(time>=first.time&&time<=last.time||mode!=='linear'&&mode!=='cycleOffset')return undefined;
  if(mode==='linear'){
   const left=before?0:keys.length-2,right=left+1,anchor=before?left:right,duration=keys[right].time-keys[left].time,exponent=(time-keys[anchor].time)/duration;
   if(!(duration>0)||!Number.isFinite(exponent)||['constant','step'].includes(keys[left].interpolation)||!before&&['constant','step'].includes(last.interpolation))return structuredClone(keys[anchor].value);
   this.other.fromArray(values,left*4).invert();this.delta.fromArray(values,right*4).premultiply(this.other).normalize();power(this.delta,exponent);this.result.fromArray(values,anchor*4).multiply(this.delta);
  }else{
   const duration=last.time-first.time,cycles=Math.floor((time-first.time)/duration);if(!(duration>0)||!Number.isFinite(cycles))return undefined;
   const mapped=first.time+(time-first.time-cycles*duration);this.pose(keys,values,mapped);
   // World-space cycle delta, applied on the left. This remains continuous at
   // seams for arbitrary noncommuting intermediate rotations.
   this.other.fromArray(values,0).invert();this.delta.fromArray(values,(keys.length-1)*4).multiply(this.other).normalize();power(this.delta,cycles);this.result.premultiply(this.delta);
  }
  this.euler.setFromQuaternion(this.result.normalize(),'XYZ');return [this.euler.x,this.euler.y,this.euler.z].map(MathUtils.radToDeg);
 }
}
