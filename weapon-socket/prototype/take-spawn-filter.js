import {sceneWorldMatrix} from './scene-runtime.js';

const list=value=>Array.isArray(value)&&value.length<=128&&new Set(value).size===value.length&&value.every(v=>typeof v==='string'&&v.length>0&&v.length<=200);
export function takeSpawnFilter(value={}){
 if(!value||Array.isArray(value)||typeof value!=='object'||Object.keys(value).some(k=>!['radius','center','plane','kinds','components','classes'].includes(k)))throw Error('생성 녹화 필터를 확인하세요.');
 const f={radius:0,center:'camera',plane:'xyz',kinds:[],components:[],classes:[],...value};
 if(!Number.isFinite(f.radius)||f.radius<0||f.radius>1e9||!['camera','targets'].includes(f.center)||!['xyz','xy','xz'].includes(f.plane)||![f.kinds,f.components,f.classes].every(list))throw Error('생성 녹화 거리·종류 필터를 확인하세요.');
 return structuredClone(f);
}

// Admission is decided at the first active sample, then remains stable while
// the actor moves, changes components or is returned to/acquired from a pool.
export function spawnAdmission(filter,objects,targets,camera){
 let centers,cache;
 const position=o=>{if(!o.parent&&!o.parentId)return o.position;cache??=new Map();return sceneWorldMatrix(o,objects,cache).elements.slice(12,15);};
 return object=>{
  if(filter.kinds.length&&!filter.kinds.includes(object.kind))return false;
  if(filter.classes.length&&!filter.classes.includes(object.nativeClass))return false;
  if(filter.components.length&&!filter.components.every(type=>object.components?.some(c=>c.type===type)))return false;
  if(!filter.radius)return true;
  if(!centers){centers=filter.center==='camera'?[camera?.()]:targets.map(id=>objects.find(o=>o.id===id)).filter(o=>o&&o.poolActive!==false&&!o.destroying).map(position);centers=centers.filter(p=>Array.isArray(p)&&p.length===3&&p.every(Number.isFinite));}
  if(!centers.length)return false;
  const p=position(object),axes=filter.plane==='xy'?[0,1]:filter.plane==='xz'?[0,2]:[0,1,2],radius2=filter.radius*filter.radius;
  return centers.some(c=>axes.reduce((sum,i)=>sum+(p[i]-c[i])**2,0)<=radius2);
 };
}
