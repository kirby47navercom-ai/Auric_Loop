import {updatedBVH} from './geometry-bvh.js';

// Old world bounds must follow committed vertices, independently of the current shared BLAS.
export function packPreviousGeometry(triangles,motion,cache){
 const old=[];for(let id=0;id<triangles.length;id++){
  const triangle=triangles[id],points=motion.get(triangle.sourceID);if(!points)continue;
  if(points.length!==3||points.some(p=>p.length!==3||!Array.from(p).every(Number.isFinite)))throw Error('이전 교차 정점 값을 확인하세요.');
  old.push({id,sourceID:triangle.sourceID,points,center:points[0].map((v,k)=>(v+points[1][k]+points[2][k])/3)});
 }
 if(!old.length)return {data:new Float32Array(0),count:0,triangles:0,cache:null,refit:false};
 const {tree,cache:next,refit}=updatedBVH(old,cache),data=new Float32Array(tree.nodes.length*12);
 for(let i=0;i<tree.nodes.length;i++){
  const node=tree.nodes[i],at=i*12;
  for(let k=0;k<3;k++){const pad=Math.max(1,Math.abs(node.min[k]),Math.abs(node.max[k]))*1e-6;data[at+k]=node.min[k]-pad;data[at+4+k]=node.max[k]+pad;}
  data[at+3]=node.skip;data[at+7]=node.count;for(let j=0;j<node.count;j++)data[at+8+j]=tree.triangles[node.start+j].id;
 }
 if(!data.every(Number.isFinite))throw Error('이전 교차 경계가 float 범위를 넘었어요.');
 return {data,count:tree.nodes.length,triangles:old.length,cache:next,refit};
}

export const previousGeometryContract=Object.freeze({version:1,availability:'temporal curved transport with transmissive surfaces and committed geometry',storage:'existing atlas suffix; three vec4 per BVH node, leaf stores up to four current triangle IDs; committed vertices are reused',header:'motion record 1.w = logical BVH pointer, record 2.w = node count (first triangle only); zero means unavailable',bounds:'previous world-space vertices, independent of current TLAS/BLAS, outward float32 padding',traversal:'skip-linked BVH; at most 4096 node visits per query; incomplete traversal rejects history, never truncates scene objects',reset:'existing topology/material/failed-frame/rewind history resets; newborn triangles have no committed hit',remaining:'global changed-path inverse correspondence and participating-medium scattering transport'});
