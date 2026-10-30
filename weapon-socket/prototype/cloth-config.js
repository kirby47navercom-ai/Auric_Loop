export function clothPins(p){
 const count=p.columns*p.rows,pins=new Set();
 if(p.pinMode==='topEdge')for(let u=0;u<p.columns;u++)pins.add(u*p.rows);
 if(p.pinMode==='topCorners'){pins.add(0);pins.add((p.columns-1)*p.rows);}
 if(p.pinMode==='start'||p.pinMode==='both')pins.add(0);
 if(p.pinMode==='end'||p.pinMode==='both')pins.add(count-1);
 if(p.pinMode==='all')for(let i=0;i<count;i++)pins.add(i);
 if(!Array.isArray(p.pinOverrides)||new Set(p.pinOverrides.map(v=>v?.index)).size!==p.pinOverrides.length)throw Error('고정 입자 중복·배열을 확인하세요.');
 for(const row of p.pinOverrides){if(!row||Object.keys(row).some(k=>!['index','pinned'].includes(k))||!Number.isInteger(row.index)||row.index<0||row.index>=count||typeof row.pinned!=='boolean')throw Error('천 고정 입자 범위를 확인하세요.');if(row.pinned)pins.add(row.index);else pins.delete(row.index);}
 return pins;
}
export function validCloth(p){try{clothPins(p);return Number.isSafeInteger(p.columns*p.rows);}catch{return false;}}
export function clothLocalPoint(p,index,out){return out.set(-p.width/2+Math.floor(index/p.rows)*p.width/(p.columns-1),p.height/2-(index%p.rows)*p.height/(p.rows-1),0);}
