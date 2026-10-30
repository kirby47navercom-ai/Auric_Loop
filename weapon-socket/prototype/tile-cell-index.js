// Immutable layer arrays are weak cache keys; no world scan or retained history.
const indexes=new WeakMap();
export function tileCellIndex(tiles){let index=indexes.get(tiles);if(!index){index=new Map();for(let i=0;i<tiles.length;i++){const t=tiles[i];index.set(t.x+':'+t.y,{tile:t,index:i});}indexes.set(tiles,index);}return index;}
export function tileAt(layer,x,y){return tileCellIndex(layer.tiles).get(x+':'+y)?.tile;}
export function setRuntimeTile(map,layer,cell,index){const row=tileCellIndex(layer.tiles).get(cell[0]+':'+cell[1]);if(index===(row?.tile.sourceIndex??row?.tile.index??-1))return {data:map,changed:false};const tiles=[...layer.tiles],value={x:cell[0],y:cell[1],index};if(row){if(index<0)tiles.splice(row.index,1);else tiles[row.index]=value;}else if(index>=0)tiles.push(value);const next={...layer,tiles};return {data:{...map,layers:map.layers.map(l=>l===layer?next:l)},changed:true,cells:[cell]};}
