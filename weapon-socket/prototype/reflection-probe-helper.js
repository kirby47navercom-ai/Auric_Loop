import * as THREE from 'three';

export function reflectionProbeHelper(group,p,own){
 let helper;
 if(p.volumeShape==='sphere'){
  const points=new Float32Array(3*64*2*3);let at=0;
  for(let axis=0;axis<3;axis++)for(let i=0;i<64;i++)for(const step of [i,i+1]){const a=step*Math.PI/32,v=[0,0,0];v[(axis+1)%3]=Math.cos(a);v[(axis+2)%3]=Math.sin(a);points.set(v,at);at+=3;}
  helper=new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position',new THREE.BufferAttribute(points,3)),new THREE.LineBasicMaterial({color:0x8aaccf}));
  const center=new THREE.Vector3();helper.matrixAutoUpdate=false;helper.matrixWorldAutoUpdate=false;helper.frustumCulled=false;
  helper.onBeforeRender=()=>{center.fromArray(p.offset).applyMatrix4(group.matrixWorld);helper.matrixWorld.makeScale(p.volumeRadius,p.volumeRadius,p.volumeRadius).setPosition(center);};
 }else{
  const offset=new THREE.Vector3(...p.offset),extent=new THREE.Vector3(...p.size).multiplyScalar(.5);
  helper=new THREE.Box3Helper(new THREE.Box3(extent.clone().negate().add(offset),extent.clone().add(offset)),0x8aaccf);
 }
 helper.userData.editorHelper=true;own(group,helper.geometry);own(group,helper.material);group.add(helper);return helper;
}
