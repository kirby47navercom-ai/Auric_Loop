// Map dimensions describe sparse coordinates, never a dense allocation.
// Bound a single synchronous edit by transient work; this is not a map/object limit.
export const tileEditCellBudget=262144;
export const tilemapEditingContract={storage:'sparse occupied cells; positive safe integer dimensions and safe width*height',editCellBudget:tileEditCellBudget,overflow:'reject the whole edit before publishing; existing map/undo state stays unchanged',navigation:'viewport pan, zoom, fit and exact cell coordinates',collision:'generated tile centers use the existing physics-query coordinate envelope (1e6); authored component bounds stay unchanged'};
export const validTileDimensions=(width,height)=>Number.isSafeInteger(width)&&width>0&&Number.isSafeInteger(height)&&height>0&&Number.isSafeInteger(width*height);
export function tileEditBudget(count){if(!Number.isSafeInteger(count)||count>tileEditCellBudget)throw Error('한 번의 타일 편집 범위가 너무 커요. 영역을 나눠서 편집하세요.');}

export function sparseTileRectangles(layers){
 const rows=new Map();for(const layer of layers)if(layer.collision)for(const tile of layer.tiles)if(tile.autoCollision!==false){let row=rows.get(tile.y);if(!row)rows.set(tile.y,row=new Set());row.add(tile.x);}
 const rectangles=[],active=new Map();let lastY=-2;
 for(const [y,filled]of [...rows].sort((a,b)=>a[0]-b[0])){
  if(y!==lastY+1){rectangles.push(...active.values());active.clear();}lastY=y;const xs=[...filled].sort((a,b)=>a-b),next=new Map();
  for(let i=0;i<xs.length;){const start=xs[i];let end=start+1;i++;while(i<xs.length&&xs[i]===end){end++;i++;}const key=start+':'+(end-start),old=active.get(key);next.set(key,old?{...old,height:old.height+1}:{x:start,y,width:end-start,height:1});}
  for(const [key,r]of active)if(!next.has(key))rectangles.push(r);active.clear();for(const [key,r]of next)active.set(key,r);
 }return rectangles.concat([...active.values()]);
}

// Clip before enumerating brush cells; a far outside drag cannot allocate a
// line proportional to the distance from the map.
export function clipTileLine(from,to,width,height){
 const dx=to.x-from.x,dy=to.y-from.y;let low=0,high=1;
 for(const [p,q]of [[-dx,from.x],[dx,width-1-from.x],[-dy,from.y],[dy,height-1-from.y]]){if(p===0){if(q<0)return null;continue;}const t=q/p;if(p<0)low=Math.max(low,t);else high=Math.min(high,t);if(low>high)return null;}
 return [{x:Math.max(0,Math.min(width-1,Math.round(from.x+low*dx))),y:Math.max(0,Math.min(height-1,Math.round(from.y+low*dy)))},{x:Math.max(0,Math.min(width-1,Math.round(from.x+high*dx))),y:Math.max(0,Math.min(height-1,Math.round(from.y+high*dy)))}];
}

const buckets=new WeakMap();
export function tileCellsInRect(layer,bounds){
 let index=buckets.get(layer.tiles);if(!index){index=new Map();for(const t of layer.tiles){const key=Math.floor(t.x/32)+':'+Math.floor(t.y/32);let group=index.get(key);if(!group)index.set(key,group=[]);group.push(t);}buckets.set(layer.tiles,index);}
 const [left,top,right,bottom]=bounds,result=[];if(left>right||top>bottom)return result;const columns=Math.floor(right/32)-Math.floor(left/32)+1,rows=Math.floor(bottom/32)-Math.floor(top/32)+1;if(columns*rows>index.size*2+16){for(const group of index.values())for(const t of group)if(t.x>=left&&t.x<=right&&t.y>=top&&t.y<=bottom)result.push(t);return result;}
 for(let y=Math.floor(top/32);y<=Math.floor(bottom/32);y++)for(let x=Math.floor(left/32);x<=Math.floor(right/32);x++)for(const t of index.get(x+':'+y)||[])if(t.x>=left&&t.x<=right&&t.y>=top&&t.y<=bottom)result.push(t);
 return result;
}
