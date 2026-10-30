import {ShapeUtils,Vector2} from 'three';
import {directedMeshEdges,boundaryPaths} from './mesh-boundaries.js';
const sub=(a,b)=>a.map((v,k)=>v-b[k]),dot=(a,b)=>a.reduce((v,n,k)=>v+n*b[k],0),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],unit=a=>{const length=Math.hypot(...a);if(length<1e-12)throw Error('넓이가 없는 면을 먼저 정리하세요.');return a.map(v=>v/length);};
const area=points=>points.reduce((v,a,i)=>{const b=points[(i+1)%points.length];return v+a[0]*b[1]-b[0]*a[1];},0)/2;
const orient=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
const inside=(p,loop)=>{let yes=false;for(let i=0,j=loop.length-1;i<loop.length;j=i++){const a=loop[i],b=loop[j];if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])yes=!yes;}return yes;};
// Reject foldovers before committing geometry. This bounded editing operation
// has a comparison budget, independent of scene/actor counts or runtime limits.
function contoursDoNotCross(loops){let checks=0;const segments=loops.flatMap((loop,l)=>loop.map((a,i)=>({a,b:loop[(i+1)%loop.length],l,i,n:loop.length})));segments.sort((a,b)=>Math.min(a.a[0],a.b[0])-Math.min(b.a[0],b.b[0]));
 for(let i=0;i<segments.length;i++){const a=segments[i],right=Math.max(a.a[0],a.b[0]);for(let j=i+1;j<segments.length;j++){const b=segments[j];if(Math.min(b.a[0],b.b[0])>right)break;if(a.l===b.l&&(a.i===b.i||(a.i+1)%a.n===b.i||(b.i+1)%a.n===a.i))continue;if(++checks>2000000)throw Error('경계 교차 검사 예산을 넘었어요. 영역을 나눠 편집하세요.');if(Math.max(a.a[1],a.b[1])<Math.min(b.a[1],b.b[1])||Math.max(b.a[1],b.b[1])<Math.min(a.a[1],a.b[1]))continue;const x=orient(a.a,a.b,b.a),y=orient(a.a,a.b,b.b),z=orient(b.a,b.b,a.a),w=orient(b.a,b.b,a.b);if(x*y<=0&&z*w<=0)throw Error('인셋 경계가 교차하거나 겹쳐요. 거리를 줄이세요.');}}
}
export function editMeshRegion(data,{operation,faces=[],distance=.1}={}){
 if(!['insetRegion','retriangulateRegion'].includes(operation))return null;
 const selected=new Set(faces);if(!selected.size||operation==='insetRegion'&&(!Number.isFinite(distance)||distance<=0))throw Error('편집할 면 영역과 양의 인셋 거리를 지정하세요.');
 const first=data.indices.slice(faces[0]*3,faces[0]*3+3).map(i=>data.vertices[i]),origin=first[0],u=unit(sub(first[1],origin)),normal=unit(cross(sub(first[1],origin),sub(first[2],origin))),v=cross(normal,u),project=p=>{const q=sub(p,origin);return[dot(q,u),dot(q,v)];};
 const projected=data.vertices.map(project),triangles=[...selected].map(f=>data.indices.slice(f*3,f*3+3));let scale=1;for(const ids of triangles)for(const id of ids)scale=Math.max(scale,Math.hypot(...sub(data.vertices[id],origin)));const epsilon=scale*1e-8;
 let sourceArea=0;for(const ids of triangles){const points=ids.map(i=>data.vertices[i]);if(points.some(p=>Math.abs(dot(sub(p,origin),normal))>epsilon))throw Error('같은 평면의 면 영역을 선택하세요.');const size=orient(...ids.map(i=>projected[i]))/2;if(size<=epsilon*epsilon)throw Error('뒤집힌 면이나 퇴화한 면이 포함돼 있어요.');sourceArea+=size;}
 const edges=directedMeshEdges(data,selected);if([...edges.values()].some(e=>e.invalid))throw Error('중복·비다양체·뒤집힌 인접 면을 먼저 정리하세요.');
 const paths=boundaryPaths([...edges.values()].filter(e=>e.count===1));if(!paths.length||paths.some(p=>!p.closed||p.ids.length<3))throw Error('닫힌 평면 영역의 경계가 필요해요.');
 const contours=paths.map(p=>p.ids.map(i=>projected[i]));contoursDoNotCross(contours);if(Math.abs(contours.reduce((sum,p)=>sum+area(p),0)-sourceArea)>Math.max(1,sourceArea)*1e-6)throw Error('겹치거나 일관되지 않은 면 영역이에요.');
 const inset=operation==='insetRegion',inner=inset?contours.map(points=>points.map((point,i)=>{const prev=points[(i+points.length-1)%points.length],next=points[(i+1)%points.length],a=sub(point,prev),b=sub(next,point),la=Math.hypot(...a),lb=Math.hypot(...b);if(la<epsilon||lb<epsilon)throw Error('길이가 없는 경계가 있어요.');const na=[-a[1]/la,a[0]/la],nb=[-b[1]/lb,b[0]/lb],denominator=1+dot(na,nb);if(denominator<1e-8)throw Error('접힌 경계를 먼저 정리하세요.');return point.map((x,k)=>x+distance*(na[k]+nb[k])/denominator);})):contours;
 if(inset){for(let l=0;l<inner.length;l++){const points=inner[l],old=contours[l];if(area(points)*area(old)<=0||Math.abs(area(points))<epsilon*epsilon)throw Error('인셋 영역이 사라져요. 거리를 줄이세요.');for(let i=0;i<points.length;i++){const j=(i+1)%points.length;if(dot(sub(points[j],points[i]),sub(old[j],old[i]))<=epsilon*epsilon)throw Error('인셋 경계가 뒤집혀요. 거리를 줄이세요.');if(contours.reduce((count,loop)=>count+Number(inside(points[i],loop)),0)%2!==1)throw Error('인셋이 원래 영역 밖으로 나가요. 거리를 줄이세요.');}}contoursDoNotCross(inner);}
 const result=structuredClone(data),ids=paths.map(p=>[...p.ids]);let comparisons=0;
 if(inset)for(let l=0;l<inner.length;l++)for(let i=0;i<inner[l].length;i++){
  const point=inner[l][i];let match;for(const tri of triangles){if(++comparisons>10000000)throw Error('속성 보간 예산을 넘었어요. 영역을 나눠 편집하세요.');const [a,b,c]=tri.map(j=>projected[j]),den=orient(a,b,c),weights=[orient(point,b,c)/den,orient(a,point,c)/den,orient(a,b,point)/den];if(weights.every(n=>n>=-1e-7)){match={tri,weights};break;}}
  if(!match)throw Error('인셋 정점의 원본 속성을 찾을 수 없어요.');const {tri,weights}=match,index=result.vertices.length;ids[l][i]=index;result.vertices.push(origin.map((x,k)=>x+u[k]*point[0]+v[k]*point[1]));result.uvs.push([0,1].map(k=>tri.reduce((sum,id,j)=>sum+data.uvs[id][k]*weights[j],0)));if(result.uvs1)result.uvs1.push([0,1].map(k=>tri.reduce((sum,id,j)=>sum+data.uvs1[id][k]*weights[j],0)));if(result.colors)result.colors.push([0,1,2].map(k=>Math.max(0,Math.min(1,tri.reduce((sum,id,j)=>sum+data.colors[id][k]*weights[j],0)))));
 }
 result.indices=data.indices.filter((_,i)=>!selected.has(Math.floor(i/3)));
 const outer=inner.map((points,index)=>({points,index,size:area(points)})).filter(p=>p.size>0),holes=inner.map((points,index)=>({points,index,size:area(points)})).filter(p=>p.size<0),owners=new Map();
 for(const hole of holes){const parent=outer.filter(o=>inside(hole.points[0],o.points)).sort((a,b)=>a.size-b.size)[0];if(!parent)throw Error('구멍 경계의 바깥 영역을 찾을 수 없어요.');owners.set(hole.index,parent.index);}
 for(const boundary of outer){const children=holes.filter(h=>owners.get(h.index)===boundary.index),loops=[boundary,...children],order=loops.flatMap(p=>ids[p.index]),cap=ShapeUtils.triangulateShape(boundary.points.map(p=>new Vector2(...p)),children.map(h=>h.points.map(p=>new Vector2(...p))));let capArea=0;for(const triangle of cap){const t=triangle.map(i=>order[i]),p=t.map(i=>project(result.vertices[i]));if(orient(...p)<0)[t[1],t[2]]=[t[2],t[1]];capArea+=Math.abs(orient(...p))/2;result.indices.push(...t);}const expected=boundary.size+children.reduce((sum,h)=>sum+h.size,0);if(Math.abs(capArea-expected)>Math.max(1,expected)*1e-6)throw Error('영역 삼각화 결과를 확인하세요.');}
 if(inset)for(let l=0;l<paths.length;l++){const outside=paths[l].ids,inside=ids[l];for(let i=0;i<outside.length;i++){const j=(i+1)%outside.length;result.indices.push(outside[i],outside[j],inside[j],outside[i],inside[j],inside[i]);}}
 const before=directedMeshEdges(data),after=directedMeshEdges(result);
 for(const [key,edge]of edges)if(edge.count===1&&after.get(key)?.count!==before.get(key)?.count)throw Error('영역 경계가 유지되지 않았어요. 경계 정점을 정리하세요.');
 for(const [key,edge]of after)if(!before.has(key)&&edge.count!==2||edge.invalid&&!before.get(key)?.invalid)throw Error('영역 삼각화에 열린 간선이나 뒤집힌 연결이 생겨요. 경계 정점을 정리하세요.');
 delete result.normals;return result;
}
