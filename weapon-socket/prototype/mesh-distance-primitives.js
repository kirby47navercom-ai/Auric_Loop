// Exact topology recognition, not a bounding-box approximation of arbitrary meshes.
function rectanglePair(triangles,min,max,axes){
 if(triangles.length!==2||axes.length!==2)return false;const keys=triangles.map(t=>t.points.map(p=>{let bits=0;for(let i=0;i<2;i++){const a=axes[i];if(p[a]===max[a])bits|=1<<i;else if(p[a]!==min[a])return -1;}return bits;}));if(keys.some(k=>new Set(k).size!==3||k.includes(-1)))return false;const union=new Set(keys.flat()),shared=keys[0].filter(k=>keys[1].includes(k));return union.size===4&&shared.length===2&&(shared[0]^shared[1])===3;
}
export function identifyDistancePrimitive(triangles,min,max,closed){
 const axes=[0,1,2].filter(i=>max[i]>min[i]);if(axes.length===2&&triangles.length===2&&!closed){const normal=[0,1,2].find(i=>!axes.includes(i));if(triangles.every(t=>t.points.every(p=>p[normal]===min[normal]))&&rectanglePair(triangles,min,max,axes))return 'rectangle';}
 if(!closed||axes.length!==3||triangles.length!==12)return null;const faces=Array.from({length:6},()=>[]);for(const triangle of triangles){const face=faces.findIndex((_,i)=>triangle.points.every(p=>p[Math.floor(i/2)]===(i%2?max:min)[Math.floor(i/2)]));if(face<0)return null;faces[face].push(triangle);}return faces.every((list,i)=>rectanglePair(list,min,max,[0,1,2].filter(a=>a!==Math.floor(i/2))))?'box':null;
}
export function primitiveSignedDistance(min,max,point){const q=point.map((v,i)=>Math.abs(v-(min[i]+max[i])*.5)-(max[i]-min[i])*.5);return Math.hypot(...q.map(v=>Math.max(v,0)))+Math.min(Math.max(...q),0);}
