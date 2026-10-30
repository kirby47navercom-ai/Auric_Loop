// Count from the original epoch rather than repeatedly adding the period.
// A small, scale-aware ULP margin includes an exact expiration boundary;
// it is capped below one period and never catches up an unbounded event loop.
export function periodicEffectCount(effect,until){
 const period=effect.data.period,anchor=effect.periodAnchor,margin=Math.min(period*.25,4*Number.EPSILON*Math.max(1,Math.abs(until),Math.abs(anchor))),total=Math.max(0,Math.floor((until-anchor+margin)/period));
 if(!Number.isSafeInteger(total)||!Number.isSafeInteger(effect.periodTicks))throw Error('주기 효과의 시간·주기 해상도를 확인하세요.');
 return Math.max(0,total-effect.periodTicks);
}
