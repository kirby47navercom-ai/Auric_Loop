export function buildGeometryBVH(triangles,leafSize=4){
 const ordered=[],nodes=[];
 const build=list=>{const node={min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity],start:0,count:0,skip:0};nodes.push(node);for(const t of list)for(const p of t.points)for(let j=0;j<3;j++){node.min[j]=Math.min(node.min[j],p[j]);node.max[j]=Math.max(node.max[j],p[j]);}
  if(list.length<=leafSize){node.start=ordered.length;node.count=list.length;ordered.push(...list);}else{const extent=node.max.map((n,i)=>n-node.min[i]),axis=extent.indexOf(Math.max(...extent));list.sort((a,b)=>a.center[axis]-b.center[axis]);const mid=Math.floor(list.length/2);build(list.slice(0,mid));build(list.slice(mid));}node.skip=nodes.length;};
 if(triangles.length)build([...triangles]);return {nodes,triangles:ordered};
}
