export const deformableQueryKeys=new Set(['physicsClothParticle','physicsRopeParticle']);
import {skeletonQueryKeys,validateSkeletonQuery,validateSkeletonResult} from './skeleton-query.js';
export const nativeLiveQueryKeys=new Set(['particleCount','particlePlay','particleStop','particlePause','particleEmit',...deformableQueryKeys,deformablePhysicsQueryKey,...skeletonQueryKeys]);
// The game world owns these resources. A query-only collider world cannot
// reconstruct current cloth/rope particles or GPU particle state.
export async function nativeLiveQuery(query,objects,handler){
 if(query?.key===deformablePhysicsQueryKey){const targets=validateDeformableQuery(query.args,objects);if(!handler)throw Error('변형체 충돌에는 실행 질의 채널이 필요해요.');return validateDeformableResult(query.args.kind,await handler(query),targets);}
 if(!nativeLiveQueryKeys.has(query?.key)||!objects.some(o=>o.id===query.args?.target))throw Error('실행 질의 대상 오류');
 if(!handler)throw Error('실행 질의 채널이 필요해요.');
 if(skeletonQueryKeys.has(query.key)){validateSkeletonQuery(query.key,query.args);return validateSkeletonResult(query.key,query.args,await handler(query));}
 const args=query.args;if(query.key==='particleEmit'&&(!Number.isSafeInteger(args.count)||args.count<0||args.count>100000)||query.key==='particlePause'&&typeof args.paused!=='boolean'||query.key==='particleStop'&&typeof args.clear!=='boolean'||deformableQueryKeys.has(query.key)&&(!Number.isSafeInteger(args.index)||args.index<0))throw Error('실행 질의 입력 오류');
 const value=await handler({key:query.key,args});if(query.key==='particleCount'&&(!Number.isSafeInteger(value)||value<0))throw Error('GPU 파티클 개수 응답 오류');
 if(deformableQueryKeys.has(query.key)){const n=query.key==='physicsRopeParticle'?2:3;if(!value||!['position','velocity'].every(key=>Array.isArray(value[key])&&value[key].length===n&&value[key].every(Number.isFinite))||typeof value.pinned!=='boolean')throw Error('변형체 입자 질의 응답 오류');}
 return value;
}
import {deformablePhysicsQueryKey,validateDeformableQuery,validateDeformableResult} from './deformable-query.js';
