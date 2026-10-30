const area=(a,b,c,plane='XZ')=>{const y=plane==='XY'?1:2;return(b[y]-a[y])*(c[0]-a[0])-(b[0]-a[0])*(c[y]-a[y]);};
const same=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]))<1e-8;
export function orientPortal(from,to,points,plane='XZ'){return area(from,to,points[0],plane)<=0?{left:points[0],right:points[1]}:{left:points[1],right:points[0]};}
export function shrinkPortal({left,right},radius){const width=Math.hypot(...left.map((v,i)=>v-right[i]));if(width<radius*2||width<1e-9)return null;const t=radius/width;return {left:left.map((v,i)=>v+(right[i]-v)*t),right:right.map((v,i)=>v+(left[i]-v)*t)};}
export function pullNavigationPath(start,end,portals,plane='XZ'){
 const gates=[{left:start,right:start},...portals,{left:end,right:end}],out=[[...start]];let apex=start,left=start,right=start,apexAt=0,leftAt=0,rightAt=0;
 for(let i=1;i<gates.length;i++){const next=gates[i];if(area(apex,right,next.right,plane)<=0){if(same(apex,right)||area(apex,left,next.right,plane)>0){right=next.right;rightAt=i;}else{if(!same(out.at(-1),left))out.push([...left]);apex=left;apexAt=leftAt;left=right=apex;leftAt=rightAt=apexAt;i=apexAt;continue;}}
  if(area(apex,left,next.left,plane)>=0){if(same(apex,left)||area(apex,right,next.left,plane)<0){left=next.left;leftAt=i;}else{if(!same(out.at(-1),right))out.push([...right]);apex=right;apexAt=rightAt;left=right=apex;leftAt=rightAt=apexAt;i=apexAt;}}
 }if(!same(out.at(-1),end))out.push([...end]);return out;
}
