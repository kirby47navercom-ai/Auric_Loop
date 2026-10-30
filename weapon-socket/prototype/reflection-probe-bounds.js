import {Box3,Sphere} from 'three';
import {reflectionProbeDeformedBounds} from './reflection-probe-deformed-bounds.js';

const geometryBounds=new WeakMap(),instanceBounds=new WeakMap();
function localGeometryBounds(geometry){
 const position=geometry?.attributes.position;if(!position)return null;
 const data=position.isInterleavedBufferAttribute?position.data:position;
 let cached=geometryBounds.get(geometry);
 if(!cached||cached.position!==position||cached.data!==data||cached.array!==data.array||cached.version!==data.version||cached.count!==position.count){
  geometry.computeBoundingBox();cached={position,data,array:data.array,version:data.version,count:position.count,box:geometry.boundingBox?.clone()};geometryBounds.set(geometry,cached);
 }
 return cached.box&&!cached.box.isEmpty()?cached:null;
}
// No GPU readback: unchanged geometry and instance buffers reuse local bounds.
// Custom shader instances and per-instance morph textures need their own bounds.
export function reflectionProbeMeshBounds(mesh,target=new Box3()){
 if(mesh.morphTexture||mesh.geometry?.isInstancedBufferGeometry&&!mesh.isInstancedMesh)return null;
 if(mesh.isSkinnedMesh||mesh.geometry?.morphAttributes.position?.length){const box=reflectionProbeDeformedBounds(mesh);return box?target.copy(box).applyMatrix4(mesh.matrixWorld):null;}
 const geometry=localGeometryBounds(mesh.geometry);if(!geometry)return null;let box=geometry.box;
 if(mesh.isInstancedMesh){
  const attribute=mesh.instanceMatrix,count=mesh.count;if(!attribute||attribute.isInterleavedBufferAttribute||attribute.itemSize!==16||!Number.isSafeInteger(count)||count<0||count>attribute.count)return null;if(count===0){instanceBounds.delete(mesh);(mesh.boundingBox??=new Box3()).makeEmpty();(mesh.boundingSphere??=new Sphere()).makeEmpty();return target.makeEmpty();}
  let cached=instanceBounds.get(mesh);
  if(!cached||cached.geometry!==geometry||cached.attribute!==attribute||cached.array!==attribute.array||cached.version!==attribute.version||cached.count!==count){
   box=new Box3();const {min,max}=geometry.box,cx=(min.x+max.x)*.5,cy=(min.y+max.y)*.5,cz=(min.z+max.z)*.5,ex=(max.x-min.x)*.5,ey=(max.y-min.y)*.5,ez=(max.z-min.z)*.5,a=attribute.array;
   for(let i=0;i<count;i++){
    const o=i*16;if(a[o+3]!==0||a[o+7]!==0||a[o+11]!==0||a[o+15]!==1)return null;
    const x=a[o]*cx+a[o+4]*cy+a[o+8]*cz+a[o+12],y=a[o+1]*cx+a[o+5]*cy+a[o+9]*cz+a[o+13],z=a[o+2]*cx+a[o+6]*cy+a[o+10]*cz+a[o+14],rx=Math.abs(a[o])*ex+Math.abs(a[o+4])*ey+Math.abs(a[o+8])*ez,ry=Math.abs(a[o+1])*ex+Math.abs(a[o+5])*ey+Math.abs(a[o+9])*ez,rz=Math.abs(a[o+2])*ex+Math.abs(a[o+6])*ey+Math.abs(a[o+10])*ez;
    box.min.x=Math.min(box.min.x,x-rx);box.max.x=Math.max(box.max.x,x+rx);box.min.y=Math.min(box.min.y,y-ry);box.max.y=Math.max(box.max.y,y+ry);box.min.z=Math.min(box.min.z,z-rz);box.max.z=Math.max(box.max.z,z+rz);
   }
   cached={geometry,attribute,array:attribute.array,version:attribute.version,count,box};instanceBounds.set(mesh,cached);(mesh.boundingBox??=new Box3()).copy(box);box.getBoundingSphere(mesh.boundingSphere??=new Sphere());mesh.boundingSphere.radius*=1+8*Number.EPSILON;
  }
  box=cached.box;
 }
 target.copy(box).applyMatrix4(mesh.matrixWorld);
 return Number.isFinite(target.min.x)&&Number.isFinite(target.min.y)&&Number.isFinite(target.min.z)&&Number.isFinite(target.max.x)&&Number.isFinite(target.max.y)&&Number.isFinite(target.max.z)?target:null;
}

// Full separating-axis test: 3 AABB faces, 3 affine-box faces, 9 edge crosses.
// This is only candidate selection. GPU face tests still gate each fragment.
export function reflectionProbeIntersectsBox(probe,box){
 if(box.isEmpty()||box.max.x<probe.minimum[0]||box.min.x>probe.maximum[0]||box.max.y<probe.minimum[1]||box.min.y>probe.maximum[1]||box.max.z<probe.minimum[2]||box.min.z>probe.maximum[2])return false;
 const v=probe.localBox;if(!v?.worldCenter||!v.halfAxes)return true;
 const mx=(box.min.x+box.max.x)*.5,my=(box.min.y+box.max.y)*.5,mz=(box.min.z+box.max.z)*.5,ex=(box.max.x-box.min.x)*.5,ey=(box.max.y-box.min.y)*.5,ez=(box.max.z-box.min.z)*.5,dx=mx-v.worldCenter[0],dy=my-v.worldCenter[1],dz=mz-v.worldCenter[2],edges=v.halfAxes;
 // Relative tolerance is homogeneous in the axis. No normalization, temporary
 // axes, per-vertex work or absolute world-unit epsilon is required.
 const overlap=(x,y,z)=>{
  const radius=ex*Math.abs(x)+ey*Math.abs(y)+ez*Math.abs(z)+Math.abs(edges[0][0]*x+edges[0][1]*y+edges[0][2]*z)+Math.abs(edges[1][0]*x+edges[1][1]*y+edges[1][2]*z)+Math.abs(edges[2][0]*x+edges[2][1]*y+edges[2][2]*z),distance=Math.abs(dx*x+dy*y+dz*z),tolerance=16*Number.EPSILON*(radius+distance+Math.abs(x)*(Math.abs(mx)+Math.abs(v.worldCenter[0]))+Math.abs(y)*(Math.abs(my)+Math.abs(v.worldCenter[1]))+Math.abs(z)*(Math.abs(mz)+Math.abs(v.worldCenter[2])));
  return distance<=radius+tolerance;
 };
 if(!overlap(1,0,0)||!overlap(0,1,0)||!overlap(0,0,1))return false;
 for(const row of [v.localX,v.localY,v.localZ])if(!overlap(row[0],row[1],row[2]))return false;
 for(const e of edges)if(!overlap(0,e[2],-e[1])||!overlap(-e[2],0,e[0])||!overlap(e[1],-e[0],0))return false;
 return true;
}
