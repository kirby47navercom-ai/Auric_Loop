import {curveModes,curveInfinityModes,validCurveWeights,validCurveInfinity} from './curve-sampling.js';
import {componentDefinitions} from './scene-components.js';
export function sequenceCurveType(track){
 if(['position','rotation','scale','materialVector'].includes(track.type))return 'vec3';
 if(['light','material','timeScale'].includes(track.type))return 'float';
 if(['variable','nativeProperty'].includes(track.type))return !track.array&&['float','vec2','vec3','color'].includes(track.valueType)?track.valueType:null;
 if(track.type==='component'){const p=componentDefinitions[track.componentType]?.properties[track.property];return p?.type==='number'&&p.step!==1?'float':['vec3','color'].includes(p?.type)?p.type:null;}
 return null;
}
export const sequenceCurveModes=curveModes.filter(m=>m!=='step');
const repeatedModes=Object.freeze(['constant','cycle','oscillate']),heldModes=Object.freeze(['constant']);
export function sequenceRangeModes(track){return sequenceCurveType(track)?curveInfinityModes:['visible','variable','nativeProperty','component'].includes(track.type)?repeatedModes:heldModes;}
export function validSequenceCurveTrack(track){
 const type=sequenceCurveType(track),shape=type==='float'?0:type==='vec2'?2:type==='vec3'?3:type==='color'?4:-1;
 const tangent=v=>shape===0?Number.isFinite(v)&&Math.abs(v)<=100000:Array.isArray(v)&&v.length===shape&&v.every(x=>Number.isFinite(x)&&Math.abs(x)<=100000);
 return (track.infinityDomain===undefined||!!type&&!track.quaternionInterpolation)&&validCurveInfinity(track)&&['preInfinity','postInfinity'].every(p=>track[p]===undefined||sequenceRangeModes(track).includes(track[p]))&&track.keys.every(k=>validCurveWeights(k,k.value)&&(k.interpolation===undefined||curveModes.includes(k.interpolation))&&(!type?['arriveTangent','leaveTangent','arriveWeight','leaveWeight','arriveControl','leaveControl'].every(p=>k[p]===undefined)&&(!k.interpolation||['linear','step','constant'].includes(k.interpolation)):['arriveTangent','leaveTangent'].every(p=>k[p]===undefined||tangent(k[p])))&&(!track.quaternionInterpolation||['arriveWeight','leaveWeight'].every(p=>k[p]===undefined)&&(!k.interpolation||['linear','constant','step'].includes(k.interpolation))));
}
export function configureSequenceCurve(data,{track:key,key:at,interpolation,arriveTangent,leaveTangent,arriveWeight,leaveWeight,arriveControl,leaveControl,preInfinity,postInfinity,resetDomain=false}={}){
 if(typeof resetDomain!=='boolean')throw Error('주기 고정 해제 옵션을 확인하세요.');const track=data.tracks.find(t=>t.id===key),keyEdit=[interpolation,arriveTangent,leaveTangent,arriveWeight,leaveWeight,arriveControl,leaveControl].some(v=>v!==undefined);if(!track||!sequenceCurveType(track)&&(at!==undefined||keyEdit||sequenceRangeModes(track).length===1)||(at!==undefined||keyEdit)&&(!Number.isInteger(at)||at<0||at>=track.keys.length)||at===undefined&&!keyEdit&&preInfinity===undefined&&postInfinity===undefined&&!resetDomain)throw Error('곡선 키 또는 범위를 설정할 값 트랙을 선택하세요.');
 const candidate={...track,keys:structuredClone(track.keys)},keys=candidate.keys,k=keys[at];if(interpolation!==undefined){k.interpolation=interpolation;if(['auto','clampedAuto','linear','constant','step'].includes(interpolation))for(const field of ['arriveTangent','leaveTangent','arriveWeight','leaveWeight'])delete k[field];}
 for(const [field,value]of Object.entries({arriveTangent,leaveTangent,arriveWeight,leaveWeight,arriveControl,leaveControl}))if(value!==undefined){if(field.endsWith('Tangent'))delete k[field.replace('Tangent','Control')];if(value===null)delete k[field];else{k[field]=structuredClone(value);if(!['user','break'].includes(k.interpolation))k.interpolation='break';}}
 for(const[field,value]of Object.entries({preInfinity,postInfinity}))if(value!==undefined){if(value===null)delete candidate[field];else candidate[field]=value;}
 if(resetDomain)delete candidate.infinityDomain;if(!validSequenceCurveTrack(candidate))throw Error('보간 모드·탄젠트·범위의 자료형을 확인하세요.');track.keys=keys;for(const field of ['preInfinity','postInfinity'])if(candidate[field]===undefined)delete track[field];else track[field]=candidate[field];if(resetDomain)delete track.infinityDomain;return k||{preInfinity:track.preInfinity||'constant',postInfinity:track.postInfinity||'constant'};
}
