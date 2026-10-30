// Browser engines cap layout coordinates. Keep a bounded physical scrollbar
// and map it to the full logical range, retaining sub-pixel row positions.
export const virtualScrollExtent=4_000_000;
export function scrollMetrics(total,viewport){
 const height=Math.min(Math.max(0,total),virtualScrollExtent),logical=Math.max(0,total-viewport),physical=Math.max(0,height-viewport);
 return {height,logical,physical,toLogical(value){return physical?Math.max(0,Math.min(physical,value))*logical/physical:0;},toPhysical(value){return logical?Math.max(0,Math.min(logical,value))*physical/logical:0;}};
}
