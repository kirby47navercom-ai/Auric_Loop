import {physicsQueryKeys} from './physics-world.js';
import {serviceApi} from './core-api.js';
import {validValue} from './blueprint-model.js';
import {objectComponents} from './scene-components.js';
export const deformablePhysicsQueryKey='physicsDeformableQuery';
export function deformableQueryTargets(objects,dimension=3,args={}){const type=dimension===2?'Rope2D':'Cloth',mask=(args.mask??-1)>>>0;return objects.filter(o=>o.id!==args.ignore&&o.poolActive!==false&&o.collisionEnabled!==false&&objectComponents(o).some(c=>c.type===type&&c.properties?.enabled!==false&&(mask&(1<<(c.properties?.layer??0)))!==0)).map(o=>o.id);}
export function validateDeformableQuery(args,objects,{currentWorld=false}={}){
 if(!args||!physicsQueryKeys.has(args.kind)||!args.query||!Array.isArray(args.targets)||!args.targets.length||new Set(args.targets).size!==args.targets.length)throw Error('변형체 질의 입력 오류');
 const ids=new Set(objects.map(o=>o.id)),spec=serviceApi.find(s=>s.key===args.kind);
 if(args.targets.some(id=>typeof id!=='string'||!id||id.length>160||!currentWorld&&!ids.has(id))||spec.inputs.some(p=>!validValue(p.type,args.query[p.id]))||!currentWorld&&args.query.ignore!==null&&!ids.has(args.query.ignore))throw Error('변형체 질의 범위 또는 자료형 오류');
 // The host already authorizes against the C++ snapshot. A newly queued spawn
 // may be an ignore ID or a target whose physical surface does not exist yet.
 return new Set(currentWorld?args.targets.filter(id=>ids.has(id)):args.targets);
}
export const emptyDeformableResult=kind=>({value:kind==='physicsRaycastAll'||kind.startsWith('physicsOverlap')?[]:{hit:false,position:[0,0,0],normal:[0,0,0],actor:null},fraction:0});
export function validateDeformableResult(kind,result,targets){
 if(!result||!Number.isFinite(result.fraction)||result.fraction<0||!['physicsClosestPoint','physicsRaycastAll','physicsOverlapSphere','physicsOverlapBox'].includes(kind)&&result.fraction>1.000001)throw Error('변형체 질의 거리 응답 오류');
 const hit=h=>h&&typeof h.hit==='boolean'&&['position','normal'].every(k=>Array.isArray(h[k])&&h[k].length===3&&h[k].every(Number.isFinite))&&(h.hit?targets.has(h.actor):h.actor===null);
 const value=result.value,valid=kind.startsWith('physicsOverlap')?Array.isArray(value)&&new Set(value).size===value.length&&value.every(id=>targets.has(id)):kind==='physicsRaycastAll'?Array.isArray(value)&&value.every(h=>h.hit&&hit(h)):hit(value);
 if(!valid)throw Error('변형체 충돌 응답의 대상·형식 오류');return result;
}
export function mergeDeformableQuery(kind,args,rigid,soft){
 if(kind.startsWith('physicsOverlap'))return [...new Set([...rigid.value,...soft.value])].sort();
 if(kind==='physicsRaycastAll'){const distance=h=>h.position.reduce((sum,v,i)=>sum+(v-args.start[i])**2,0);return [...rigid.value,...soft.value].sort((a,b)=>distance(a)-distance(b)||a.actor.localeCompare(b.actor));}
 if(!soft.value.hit)return rigid.value;if(!rigid.value.hit)return soft.value;
 return soft.fraction<rigid.fraction||soft.fraction===rigid.fraction&&soft.value.actor.localeCompare(rigid.value.actor)<0?soft.value:rigid.value;
}
