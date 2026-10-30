// Prefix sums are rebuilt on data/expansion edits, never while scrolling.
export function listLayout(items,{rowHeight=40,variable=false,tree=false,expanded=new Set()}={}){
 if(!Array.isArray(items)||!Number.isFinite(rowHeight)||rowHeight<8||rowHeight>4096)throw Error('목록 크기·자료를 확인하세요.');
 const rows=[],ids=new Set(),parents=new Set();let total=0;
 function visit(values,parent='',depth=1,shown=true){
  if(!Array.isArray(values)||depth>32)throw Error('트리 자식·깊이를 확인하세요.');
  for(let index=0;index<values.length;index++){
   const item=values[index],key=tree?item?.id:index;
   if(++total>100000||tree&&(typeof key!=='string'||!key||key.length>160||ids.has(key)))throw Error('트리 ID·항목 수를 확인하세요.');ids.add(key);
   const height=variable&&item?.height!==undefined?item.height:rowHeight;
   if(!Number.isFinite(height)||height<8||height>4096)throw Error('행 높이는 8–4096 사이예요.');
   const children=tree?item.children||[]:[];if(!Array.isArray(children))throw Error('트리 자식을 확인하세요.');
   if(shown)rows.push({item,key,height,depth,parent,position:index+1,siblings:values.length,branch:children.length>0});
   if(tree&&children.length){parents.add(key);visit(children,key,depth+1,shown&&expanded.has(key));}
  }
 }
 visit(items);const offsets=new Float64Array(rows.length+1);for(let i=0;i<rows.length;i++)offsets[i+1]=offsets[i]+rows[i].height;
 const at=y=>{if(!rows.length)return 0;let lo=0,hi=rows.length;while(lo<hi){const m=(lo+hi)>>>1;if(offsets[m+1]<=y)lo=m+1;else hi=m;}return Math.min(rows.length-1,lo);};
 return {rows,offsets,keys:ids,total:offsets[rows.length],parents,at,range(y,height){if(!rows.length)return {start:0,end:0};const start=Math.max(0,at(y)-2),end=Math.min(rows.length,at(y+height)+3);return {start,end};}};
}
