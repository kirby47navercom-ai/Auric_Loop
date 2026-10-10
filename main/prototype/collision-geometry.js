import {Vector2,Vector3,ShapeUtils,Matrix4} from 'three';

export const geometryColliderTypes=new Set(['MeshCollider','PolygonCollider2D','EdgeCollider2D']);
export const geometryContract={mesh:{vertices:4096,triangles:8192,modes:['convex','mesh'],dynamic:'convex only',source:'explicit render mesh bake in owner local coordinates'},polygon:{paths:16,points:512,topology:'disjoint simple closed paths; each path is a filled region, no holes',decomposition:'exact ear-clipped triangles in one compound collider'},edge:{points:512,dynamic:false,topology:'open line strip, zero thickness'},coordinates:'local m; actor scale/rotation and collider center apply at runtime',editing:'draft until Apply; invalid data leaves the document unchanged'};
export const cubeVertices=[[-.5,-.5,-.5],[.5,-.5,-.5],[.5,.5,-.5],[-.5,.5,-.5],[-.5,-.5,.5],[.5,-.5,.5],[.5,.5,.5],[-.5,.5,.5]];
export const cubeIndices=[0,2,1,0,3,2,4,5,6,4,6,7,0,1,5,0,5,4,3,7,6,3,6,2,0,4,7,0,7,3,1,2,6,1,6,5];
const eps=1e-8,point=(v,n)=>Array.isArray(v)&&v.length===n&&v.every(x=>Number.isFinite(x)&&Math.abs(x)<=10000),cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
const close=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]))<eps;
const on=(a,b,p)=>Math.abs(cross(a,b,p))<eps&&p.every((v,i)=>v>=Math.min(a[i],b[i])-eps&&v<=Math.max(a[i],b[i])+eps);
function intersects(a,b,c,d){const x=cross(a,b,c),y=cross(a,b,d),z=cross(c,d,a),w=cross(c,d,b);return x*y<0&&z*w<0||on(a,b,c)||on(a,b,d)||on(c,d,a)||on(c,d,b);}
const area=path=>path.reduce((n,p,i)=>{const q=path[(i+1)%path.length];return n+p[0]*q[1]-q[0]*p[1];},0)/2;
const inside=(p,path)=>{let result=false;for(let i=0,j=path.length-1;i<path.length;j=i++){const a=path[i],b=path[j];if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])result=!result;}return result;};
export function validPolygonPaths(paths){
  if(!Array.isArray(paths)||!paths.length||paths.length>16||paths.reduce((n,p)=>n+(Array.isArray(p)?p.length:513),0)>512)return false;
  for(const path of paths){if(!Array.isArray(path)||path.length<3||!path.every(p=>point(p,2))||Math.abs(area(path))<eps)return false;for(let i=0;i<path.length;i++){const a=path[i],b=path[(i+1)%path.length];if(close(a,b))return false;const c=path[(i+2)%path.length];if(Math.abs(cross(a,b,c))<eps&&(b[0]-a[0])*(c[0]-b[0])+(b[1]-a[1])*(c[1]-b[1])<0)return false;for(let j=i+1;j<path.length;j++){if(j===i+1||i===0&&j===path.length-1)continue;if(intersects(a,b,path[j],path[(j+1)%path.length]))return false;}}}
  for(let i=0;i<paths.length;i++)for(let j=i+1;j<paths.length;j++){const a=paths[i],b=paths[j];if(inside(a[0],b)||inside(b[0],a))return false;for(let x=0;x<a.length;x++)for(let y=0;y<b.length;y++)if(intersects(a[x],a[(x+1)%a.length],b[y],b[(y+1)%b.length]))return false;}return true;
}
export function validEdgePoints(points){return Array.isArray(points)&&points.length>=2&&points.length<=512&&points.every(p=>point(p,2))&&points.slice(1).every((p,i)=>!close(p,points[i]));}
export function validMeshGeometry(vertices,indices,mode='convex'){
  if(!['convex','mesh'].includes(mode))return false;
  if(!Array.isArray(vertices)||vertices.length<(mode==='convex'?4:3)||vertices.length>4096||!vertices.every(p=>point(p,3))||!Array.isArray(indices)||indices.length%3||indices.length>8192*3||!indices.every(i=>Number.isInteger(i)&&i>=0&&i<vertices.length)||mode==='mesh'&&!indices.length)return false;
  for(let i=0;i<indices.length;i+=3){const a=new Vector3(...vertices[indices[i]]),b=new Vector3(...vertices[indices[i+1]]),c=new Vector3(...vertices[indices[i+2]]);if(b.sub(a).cross(c.sub(a)).lengthSq()<eps*eps)return false;}
  if(mode==='convex'){const a=new Vector3(...vertices[0]),b=vertices.map(p=>new Vector3(...p).sub(a)).find(p=>p.lengthSq()>eps*eps);if(!b)return false;const normal=vertices.map(p=>b.clone().cross(new Vector3(...p).sub(a))).find(p=>p.lengthSq()>eps*eps);if(!normal||!vertices.some(p=>Math.abs(normal.dot(new Vector3(...p).sub(a)))>eps))return false;}return true;
}
export function validColliderGeometry(type,p){return type==='PolygonCollider2D'?validPolygonPaths(p.paths):type==='EdgeCollider2D'?validEdgePoints(p.points):type==='MeshCollider'?validMeshGeometry(p.vertices,p.indices,p.mode):true;}
export function polygonTriangles(paths){
  if(!validPolygonPaths(paths))throw Error('다각형 경로는 교차·중복 없이 닫힌 영역이어야 해요.');
  return paths.flatMap(path=>ShapeUtils.triangulateShape(path.map(p=>new Vector2(...p)),[]).map(face=>face.map(i=>path[i]))).filter(tri=>Math.abs(cross(...tri))>eps);
}
export function geometryDescriptor(type,p,scale,R){
  if(!validColliderGeometry(type,p))throw Error('충돌 형상의 점·삼각형·경로를 확인하세요.');
  const scaled=(points,dim)=>new Float32Array(points.flatMap(point=>point.map((v,i)=>v*scale[i]).slice(0,dim)));
  if(type==='MeshCollider'){const points=scaled(p.vertices,3);if(p.mode==='mesh')for(let i=0;i<p.indices.length;i+=3){const a=new Vector3().fromArray(points,p.indices[i]*3),b=new Vector3().fromArray(points,p.indices[i+1]*3),c=new Vector3().fromArray(points,p.indices[i+2]*3);if(b.sub(a).cross(c.sub(a)).lengthSq()===0)throw Error('물리 좌표 정밀도에서 삼각형이 겹쳐요. 형상의 크기·좌표를 조정하세요.');}const desc=p.mode==='mesh'?R.ColliderDesc.trimesh(points,new Uint32Array(p.indices),R.TriMeshFlags.FIX_INTERNAL_EDGES):R.ColliderDesc.convexHull(points);if(!desc)throw Error('볼록 충돌 형상을 만들 수 없어요.');return desc;}
  if(type==='EdgeCollider2D')return R.ColliderDesc.polyline(scaled(p.points,2));
  const shapes=polygonTriangles(p.paths).map(tri=>R.ColliderDesc.convexHull(scaled(tri,2))?.shape);if(!shapes.length||shapes.some(s=>!s))throw Error('다각형 분할 실패');return R.ColliderDesc.compound(shapes,shapes.map(()=>({x:0,y:0})),shapes.map(()=>0));
}
export function colliderGeometryRadius(type,p,scale){
  const points=type==='MeshCollider'?p.vertices:type==='PolygonCollider2D'?p.paths.flat():p.points;return Math.max(...points.map(point=>Math.hypot(...point.map((v,i)=>v*scale[i]))));
}
export function bakeRenderCollision(group){
  if(!group||group.userData.disposed)throw Error('렌더 메시가 준비되지 않았어요.');group.updateWorldMatrix(true,true);const inverse=new Matrix4().copy(group.matrixWorld).invert(),vertices=[],indices=[],weld=new Map();
  group.traverse(mesh=>{if(!mesh.isMesh||mesh.userData.editorHelper||mesh.userData.sprite||mesh.userData.objectId!==group.userData.objectId)return;if(mesh.isSkinnedMesh||mesh.geometry.morphAttributes.position?.length)throw Error('변형 메시의 충돌은 별도 정적 형상으로 만들어 주세요.');
    const attribute=mesh.geometry.getAttribute('position'),source=mesh.geometry.index;if(!attribute)return;const transform=new Matrix4().multiplyMatrices(inverse,mesh.matrixWorld),map=[];
    for(let i=0;i<attribute.count;i++){const point=new Vector3().fromBufferAttribute(attribute,i).applyMatrix4(transform).toArray().map(v=>+v.toFixed(6)),key=point.join(',');if(!weld.has(key)){weld.set(key,vertices.length);vertices.push(point);}map.push(weld.get(key));if(vertices.length>4096)throw Error('충돌 메시 정점 제한은 4,096개예요.');}
    const count=source?.count??attribute.count;for(let i=0;i+2<count;i+=3){const face=[0,1,2].map(j=>map[source?source.getX(i+j):i+j]),a=new Vector3(...vertices[face[0]]),b=new Vector3(...vertices[face[1]]),c=new Vector3(...vertices[face[2]]);if(b.sub(a).cross(c.sub(a)).lengthSq()>=eps*eps)indices.push(...face);if(indices.length>8192*3)throw Error('충돌 메시 삼각형 제한은 8,192개예요.');}
  });if(!validMeshGeometry(vertices,indices,'mesh'))throw Error('유효한 렌더 삼각형이 없어요.');return {vertices,indices};
}
