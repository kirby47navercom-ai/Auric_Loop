import{Triangle,Vector3}from'three';import{buildGeometryBVH}from'./geometry-bvh.js';
const projectable=node=>{const[a,b,c]=node.points,x=b[0]-a[0],y=b[1]-a[1],z=b[2]-a[2],u=c[0]-a[0],v=c[1]-a[1],w=c[2]-a[2],aa=x*x+y*y+z*z,bb=x*u+y*v+z*w,cc=u*u+v*v+w*w;return Math.abs(aa*cc-bb*bb)>=1e-12;};
// The navigation graph already compiles centers/portals from fixed geometry.
// Rebuild the NavigationMesh after editing geometry; query areas/costs stay live.
export class NavigationProjection{
 constructor(nodes){this.tree=buildGeometryBVH(nodes.filter(projectable),8);this.stats={queries:0,lastNodes:0,lastCandidates:0,lastTriangles:0,totalTriangles:0};}
 project(point,maxDistance=Infinity,query){
  const{nodes,triangles}=this.tree,s=this.stats;s.queries++;let visited=0,candidates=0,tested=0,best,limit=maxDistance*maxDistance;
  const p=new Vector3(...point),a=new Vector3(),b=new Vector3(),c=new Vector3(),closest=new Vector3(),triangle=new Triangle(a,b,c),stack=nodes.length?[0]:[];
  const bound=n=>{let d=0;for(let k=0;k<3;k++){const delta=Math.max(n.min[k]-point[k],0,point[k]-n.max[k]);d+=delta*delta;}return d;},outside=d=>d>limit+1e-12*Math.max(1,limit);
  try{while(stack.length){const index=stack.pop(),node=nodes[index];visited++;if(outside(bound(node)))continue;
    if(node.count){for(let i=node.start;i<node.start+node.count;i++){const candidate=triangles[i];candidates++;if(query&&!query.allowed(candidate))continue;tested++;a.fromArray(candidate.points[0]);b.fromArray(candidate.points[1]);c.fromArray(candidate.points[2]);triangle.closestPointToPoint(p,closest);const distance=Math.hypot(point[0]-closest.x,point[1]-closest.y,point[2]-closest.z);if(distance<=maxDistance&&(!best||distance<best.distance||distance===best.distance&&candidate.id<best.node.id)){best={node:candidate,point:closest.toArray(),distance};limit=distance*distance;}}}
    else{const left=index+1,right=nodes[left].skip,ld=bound(nodes[left]),rd=bound(nodes[right]);if(ld<=rd){if(!outside(rd))stack.push(right);if(!outside(ld))stack.push(left);}else{if(!outside(ld))stack.push(left);if(!outside(rd))stack.push(right);}}
   }}finally{Object.assign(s,{lastNodes:visited,lastCandidates:candidates,lastTriangles:tested,totalTriangles:s.totalTriangles+tested});}return best;
 }
 inspect(){return{...this.stats,indexNodes:this.tree.nodes.length,indexedTriangles:this.tree.triangles.length};}
}
