import {resolveAttributeCurves} from './ability-calculations.js';
import {sampleTimeline} from './blueprint-model.js';
import {validEffectLevel} from './effect-scaling-schema.js';
import {effectMagnitudeInput} from './effect-magnitude-inputs.js';
// The definition and curve samples are captured at application, not fetched per tick.
export async function resolveEffectDefinition(data,read,{capture=true,curves}={}){const definition=capture?structuredClone(data):data,resolved=await resolveAttributeCurves(definition.modifiers.map(row=>({calculation:row.scaling})),read,{capture,curves});return{data:definition,curves:resolved};}
export function effectAtLevel(definition,level=1,context){
 if(!validEffectLevel(level))throw Error('효과 레벨은 0 이상 유한한 수로 지정하세요.');
 const data=definition.data;if(!data.modifiers.some(row=>row.scaling||row.magnitudeSource))return data;
 const modifiers=data.modifiers.map((row,index)=>{if(!row.scaling&&!row.magnitudeSource)return row;let factor=1;if(row.scaling){const{curve,track}=row.scaling,timeline=definition.curves[curve]?.timeline,source=timeline?.tracks.find(row=>row.id===track&&row.type==='float');if(!source)throw Error('효과 커브의 실수 트랙이 없어요: '+curve+' #'+track);factor=sampleTimeline(source,level);}const magnitude=row.magnitude*factor*effectMagnitudeInput(row,index,context);if(!Number.isFinite(magnitude)||Math.abs(magnitude)>1e9)throw Error('효과 레벨 계산 범위를 넘었어요.');return{...row,magnitude};});
 return{...data,modifiers};
}
