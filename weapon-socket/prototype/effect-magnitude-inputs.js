const finite=v=>Number.isFinite(v)&&Math.abs(v)<=1e9;
export const effectInputName=v=>typeof v==='string'&&/^[\w가-힣 .-]{1,80}$/.test(v);
export function validEffectMagnitudeSource(v){
 if(v===undefined)return true;
 if(!v||typeof v!=='object'||Array.isArray(v))return false;
 if(v.type==='attribute')return Object.keys(v).every(k=>['type','owner','attribute','basis'].includes(k))&&['source','target'].includes(v.owner)&&effectInputName(v.attribute)&&['base','current'].includes(v.basis);
 return v.type==='parameter'&&Object.keys(v).every(k=>['type','name','default'].includes(k))&&effectInputName(v.name)&&(v.default===undefined||finite(v.default));
}
export function effectParameters(value={}){
 if(typeof value==='string'){if(value.length>65536)throw Error('효과 인자 자료가 너무 커요.');try{value=JSON.parse(value);}catch{throw Error('효과 인자는 숫자 객체 JSON으로 지정하세요.');}}
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length>128||Object.entries(value).some(([k,v])=>!effectInputName(k)||!finite(v)))throw Error('효과 인자 이름·숫자 범위를 확인하세요.');
 return Object.fromEntries(Object.entries(value));
}
// Snapshot only referenced numeric attributes. Never retain source actors or an
// entire AbilitySystem, and never read attributes/curves during idle ticks.
export function captureEffectInputs(data,{parameters={},readAttribute}={}){
 return {parameters:effectParameters(parameters),attributes:data.modifiers.map(row=>{const input=row.magnitudeSource;if(input?.type!=='attribute')return undefined;const value=readAttribute?.(input);if(!finite(value))throw Error('효과 캡처 속성을 확인하세요: '+input.owner+'.'+input.attribute);return value;})};
}
export function effectMagnitudeInput(row,index,context){
 const input=row.magnitudeSource;if(!input)return 1;
 const value=input.type==='parameter'?(Object.hasOwn(context?.parameters||{},input.name)?context.parameters[input.name]:input.default):context?.attributes[index];
 if(!finite(value))throw Error('효과 계산 입력이 없어요: '+(input.name||input.attribute));
 return value;
}
