// The recorder borrows this scratch until it copies an admitted key. Public
// captureSkeletalPose keeps its independent snapshot contract for other callers.
import {validateSkeletalBoneName,traverseSkeletalBones} from './sequence-state.js';
const finiteVector=v=>{for(let i=0;i<v.length;i++)if(!Number.isFinite(v[i])||Math.abs(v[i])>1e6)return false;return true;};
export class SkeletalPoseCapture{
 constructor(boneNames=[]){if(!Array.isArray(boneNames)||boneNames.length>2048||new Set(boneNames).size!==boneNames.length||boneNames.some(n=>typeof n!=='string'||!n||n.length>160))throw Error('녹화 뼈 필터를 확인하세요.');this.filter=new Set(boneNames);this.rows=[];this.pool=[];this.names=new Set();this.work={captures:0,rowsCreated:0,vectorsCreated:0,bonesWritten:0,peakBones:0};}
 capture(group){this.names.clear();let count=0;traverseSkeletalBones(group,bone=>{
  if(!bone.isBone)return;validateSkeletalBoneName(bone.name);if(this.names.has(bone.name))throw Error('골격 녹화에는 고유한 뼈 이름이 필요해요.');this.names.add(bone.name);if(this.filter.size&&!this.filter.has(bone.name))return;if(count>=2048)throw Error('녹화 포즈는 2048개 이하의 뼈를 담을 수 있어요.');
  let row=this.pool[count];if(!row){row={bone:'',position:[0,0,0],quaternion:[0,0,0,1],scale:[1,1,1]};this.pool[count]=row;this.work.rowsCreated++;this.work.vectorsCreated+=3;}this.rows[count]=row;row.bone=bone.name;bone.position.toArray(row.position);bone.quaternion.toArray(row.quaternion);bone.scale.toArray(row.scale);
  if(!finiteVector(row.position)||!finiteVector(row.quaternion)||!finiteVector(row.scale)||row.scale.some(n=>n<=0)||Math.abs(Math.hypot(...row.quaternion)-1)>=.001)throw Error('녹화 골격 포즈 값을 확인하세요.');count++;
 });this.rows.length=count;this.work.captures++;this.work.bonesWritten+=count;this.work.peakBones=Math.max(this.work.peakBones,count);return this.rows;}
 inspect(){return{...this.work,capacity:this.pool.length,activeBones:this.rows.length,filteredBones:this.filter.size,scope:'Owned capture scratch only; admitted keys still receive independent copies. No whole-frame/heap/FPS measurement.'};}
}
