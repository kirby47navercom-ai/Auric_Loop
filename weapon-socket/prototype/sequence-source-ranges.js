export function wrappedSequenceTime(time,length){const value=time%length;return value===0?0:value<0?value+length:value;}
// Append directional source visits; each loop seam keeps the existing two
// authored endpoints (length, then0 forward;0, then length backward).
export function appendSectionSourceRanges(result,section,child,x,y,{initial,exclusive=false,beginExclusive=false,approach=0}={}){
 const flags={...(beginExclusive?{beginExclusive:true}:{})},length=child.length;
 if(!section.loop){const clamp=v=>Math.max(0,Math.min(length,v));result.push({begin:clamp(x),end:clamp(y),initial,...flags,...(exclusive&&y>=0&&y<=length?{endExclusive:true}:{})});return;}
 const direction=Math.sign(y-x);if(!direction){const point=wrappedSequenceTime(x,length);result.push({begin:point,end:point,initial,...flags,...exclusive?{endExclusive:true}:{}});return;}
 if(x%length===0){if(direction<0&&initial&&!beginExclusive)result.push({begin:0,end:0,initial:true});initial=beginExclusive?false:initial||approach===direction;}
 let budget=256,first=true;
 do{if(--budget<0)throw Error('하위 시퀀스 반복 한도 초과');const cycle=direction>0?Math.floor(x/length):Math.ceil(x/length)-1,stop=direction>0?Math.min(y,(cycle+1)*length):Math.max(y,cycle*length);if(!Number.isFinite(cycle)||!Number.isFinite(stop)||stop===x&&stop!==y)throw Error('하위 시퀀스 반복 경계의 수치 범위를 넘었어요.');result.push({begin:x-cycle*length,end:stop-cycle*length,initial,...first?flags:{},...(exclusive&&stop===y?{endExclusive:true}:{})});if(stop===y)break;x=stop;initial=true;first=false;}while(direction>0?x<=y:x>=y);
}
