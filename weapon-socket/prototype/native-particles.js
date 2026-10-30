import {Mesh,PlaneGeometry,MeshBasicMaterial,Matrix4,Vector3} from 'three';
import {ParticleSimulation} from './scene-systems.js';

const sorts=['none','distance','distanceReverse','depth','depthReverse','oldest','youngest'];
// Shared emission timing and seeded births; living positions and counts stay in DirectX buffers.
export class NativeParticleSimulation extends ParticleSimulation {
  constructor(renderer,group,p,map=null){
    super(p);this.renderer=renderer;this.group=group;this.map=map;this.capacity=p.maxParticles;this.disposed=false;this.submissions=0;this.readbacks=0;this.birthUploads=0;this.birthUploadBytes=0;
    if(!Number.isSafeInteger(this.capacity)||this.capacity<1||this.capacity>Math.floor(0xffffffff/32))throw Error('DirectX 파티클 용량이 버퍼 한계를 넘어섰어요.');
    if(!sorts.includes(p.sortMode||'none'))throw Error('DirectX 파티클 정렬 설정 오류');
    this.id=group.uuid+':particles';this.mesh=new Mesh(new PlaneGeometry(1,1),new MeshBasicMaterial({transparent:true,depthWrite:false}));this.mesh.frustumCulled=false;this.mesh.userData.objectId=group.userData.objectId;this.mesh.renderOrder=p.sortingOrder||0;
    Object.assign(this.mesh.userData,{hbNativeParticle:this,particleRenderer:true,draw2dId:'particles',draw2d:{sortingLayer:p.sortingLayer||'default',sortingOrder:p.sortingOrder||0,maskInteraction:p.maskInteraction||'none'}});
    renderer.hbQueueParticles({op:'create',id:this.id,capacity:this.capacity});renderer.hbNativeParticles.add(this);group.add(this.mesh);this.playing=p.playOnStart;
  }
  valid(){if(this.disposed)throw Error('DirectX 파티클이 해제됐어요.');}
  reset(){super.reset();this.remainingLifetime=0;this.emptySkips=0;this.lastCount=null;if(this.renderer)this.clear();}
  clear(){this.valid();this.remainingLifetime=0;this.lastCount=null;this.renderer.hbQueueParticles({op:'clear',id:this.id});}
  births(count,matrix){
    if(!Number.isSafeInteger(count)||count<0||count>100000)throw Error('파티클 방출 수 오류');const total=Math.min(count,this.capacity),values=[];
    for(let i=0;i<total;i++){const p=this.birth(matrix);values.push(...p.position,0,...p.velocity,p.lifetime);}
    if(total){++this.birthUploads;this.birthUploadBytes+=total*32;}return values;
  }
  submit(delta,values){this.valid();if(values.length)this.remainingLifetime=Math.max(this.remainingLifetime,this.p.lifetime,this.p.lifetimeMax);this.renderer.hbQueueParticles({op:'step',id:this.id,delta,force:[...this.p.force],gravity:this.p.gravity,drag:this.p.drag,births:values});++this.submissions;this.lastCount=null;}
  emit(count,matrix){this.valid();this.submit(0,this.births(count,matrix));}
  advance(delta,matrix){this.valid();const count=this.emission(delta,matrix);if(this.paused)return;const previous=this.remainingLifetime;this.remainingLifetime=Math.max(0,previous-delta);if(!count){if(!previous){++this.emptySkips;return;}if(!this.remainingLifetime){this.clear();return;}}this.submit(delta,this.births(count,matrix));}
  sort(){} // The native draw sorts the current GPU state for its own camera.
  style(camera){
    this.valid();this.group.updateWorldMatrix(true,false);camera.updateWorldMatrix(true,false);const p=this.p,mode=sorts.indexOf(p.sortMode||'none'),sort=camera.isOrthographicCamera&&(mode===1||mode===2)?mode+2:mode;
    return {world:(p.simulationSpace==='world'?new Matrix4():this.group.matrixWorld).toArray(),view:camera.matrixWorldInverse.toArray(),eye:camera.getWorldPosition(new Vector3()).toArray(),right:new Vector3().setFromMatrixColumn(camera.matrixWorld,0).normalize().toArray(),up:new Vector3().setFromMatrixColumn(camera.matrixWorld,1).normalize().toArray(),color:[...p.color],endColor:[...p.endColor],size:p.size,endScale:p.endSize,minSize:p.minParticleSize,maxSize:p.maxParticleSize,projectionY:camera.projectionMatrix.elements[5],perspective:!!camera.isPerspectiveCamera,sheet:[p.sheetColumns||1,p.sheetRows||1,p.sheetCycles??1,p.sheetStart||0],textureFlipY:true,toneMapped:true,depthTest:true,depthWrite:false,blend:p.blend==='additive'?1:0,sort};
  }
  async countAsync(){this.valid();const count=await this.renderer.hbParticleCount(this.id);this.valid();++this.readbacks;return this.lastCount=count;}
  debugState(){return {count:this.lastCount??null,playing:this.playing,paused:this.paused,backend:'D3D11 compute',capacity:this.capacity,cpuSimulationParticles:0,automaticPositionReadbacks:0,submissions:this.submissions,explicitCountReadbacks:this.readbacks,birthUploads:this.birthUploads,birthUploadBytes:this.birthUploadBytes,remainingLifetime:this.remainingLifetime,emptySkips:this.emptySkips,sortMode:this.p.sortMode};}
  dispose(){if(this.disposed)return;this.disposed=true;this.renderer.hbQueueParticles({op:'release',id:this.id});this.renderer.hbNativeParticles.delete(this);this.mesh.geometry.dispose();this.mesh.material.dispose();this.mesh.removeFromParent();}
}
