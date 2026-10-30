export function selectStreamingCells(cells,{budgetMB=Infinity,maxCells=Infinity}={}){
 if(!(budgetMB>0)||!(maxCells>0))throw Error('스트리밍 예산을 확인하세요.');
 const rows=[...cells].sort((a,b)=>b.priority-a.priority||a.distance-b.distance||Number(b.loaded)-Number(a.loaded)||a.instance.localeCompare(b.instance)),selected=new Set();let costMB=0;
 for(const row of rows){if(!Number.isFinite(row.costMB)||row.costMB<=0||!Number.isFinite(row.distance)||!Number.isFinite(row.priority))throw Error('셀 추정 비용·거리를 확인하세요.');if(selected.size>=maxCells||costMB+row.costMB>budgetMB)continue;selected.add(row.instance);costMB+=row.costMB;}
 return {selected,costMB};
}
