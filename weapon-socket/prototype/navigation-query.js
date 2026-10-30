import {Box3,Vector3} from 'three';
import {enabledComponent} from './scene-components.js';
import {sceneWorldMatrix} from './scene-runtime.js';

export function navigationAreaCosts(value='{}'){
  const data=typeof value==='string'?JSON.parse(value):value;
  if(!data||Array.isArray(data)||typeof data!=='object'||Object.entries(data).some(([key,cost])=>! /^(0|[1-9]\d?)$/.test(key)||Number(key)>31||!Number.isFinite(cost)||cost<1||cost>1e6))throw Error('내비게이션 영역 비용을 확인하세요.');
  return data;
}
export function navigationVolumes(objects,ignore=[]){
  const skip=new Set(ignore),cache=new Map(),result=[];
  for(const object of objects){if(skip.has(object.id)||object.poolActive===false)continue;const p=enabledComponent(object,'NavigationArea');if(!p)continue;
    const box=new Box3().setFromCenterAndSize(new Vector3(...p.center),new Vector3(...p.extent).multiplyScalar(2)).applyMatrix4(sceneWorldMatrix(object,objects,cache));
    result.push({id:object.id,min:box.min.toArray(),max:box.max.toArray(),area:p.area,cost:p.cost,blocked:p.blocked,priority:p.priority});
  }return result.sort((a,b)=>a.priority-b.priority||a.id.localeCompare(b.id));
}
export function navigationQuery(mesh,{radius=0,height=1.8,areaMask=4294967295,areaCosts='{}',obstacles=[],volumes=[]}={}){
  if(!Number.isInteger(areaMask)||areaMask<0||areaMask>4294967295)throw Error('내비게이션 영역 마스크 범위 오류');const costs=navigationAreaCosts(areaCosts),values=new Map(),planeAxes=(mesh.plane||mesh.data.plane)==='XY'?[0,1]:[0,2],up=planeAxes[1]===1?2:1;
  const inside=(p,b)=>p.every((v,i)=>v>=b.min[i]&&v<=b.max[i]);
  // Conservatively remove intersected triangles; this does not retessellate their boundary.
  const intersects=(node,b)=>{if(Math.min(...node.points.map(p=>p[up]))>b.max[up]||Math.max(...node.points.map(p=>p[up]))+height<b.min[up])return false;
    const p=node.points.map(v=>planeAxes.map(i=>v[i])),lo=planeAxes.map(i=>b.min[i]-radius),hi=planeAxes.map(i=>b.max[i]+radius),axes=[[1,0],[0,1],...p.map((v,i)=>{const n=p[(i+1)%3];return [v[1]-n[1],n[0]-v[0]];})];
    return axes.every(([x,y])=>{const dots=p.map(v=>v[0]*x+v[1]*y),corners=[lo[0]*x+lo[1]*y,lo[0]*x+hi[1]*y,hi[0]*x+lo[1]*y,hi[0]*x+hi[1]*y];return Math.max(...dots)>=Math.min(...corners)&&Math.min(...dots)<=Math.max(...corners);});};
  const value=node=>{if(values.has(node.id))return values.get(node.id);let area=mesh.data.areas?.[node.id]||0,cost=mesh.data.costs[node.id],blocked=false;
    for(const volume of volumes)if(inside(node.center,volume)){area=volume.area;cost*=volume.cost;blocked=volume.blocked;}
    blocked||=!(areaMask>>>area&1)||obstacles.some(b=>intersects(node,b));const result={blocked,cost:cost*(costs[area]??1),area};values.set(node.id,result);return result;};
  return {allowed:node=>!value(node).blocked,cost:node=>value(node).cost,inspect:node=>({...value(node)})};
}
