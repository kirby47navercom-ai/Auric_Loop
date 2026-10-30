import * as THREE from 'three';
import {tileAtlasRect,tileRenderRect,tileCellPoint,valid2DAsset} from './two-d-assets.js';
import {componentDefaults} from './scene-components.js';
export const tileChunkSize=32;
const keyFor=(map,x,y,individual)=>individual==='layer'?'layer':individual?'i:'+x+':'+y:map.layout==='isometric'?'d:'+Math.floor((x+y)/tileChunkSize):Math.floor(x/tileChunkSize)+':'+Math.floor(y/tileChunkSize);
export function affectedTileCells(cells){return [...new Map(cells.flatMap(([x,y])=>{const rows=[];for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)rows.push([x+dx,y+dy]);return rows;}).map(c=>[c.join(':'),c])).values()];}
export class TileChunkIndex{
 constructor(){this.layers=new Map();this.signature='';}
 update(map,changes,individual=false){
  const signature=JSON.stringify([map.width,map.height,map.layout,map.cellSize,map.tileSize,map.margin,map.spacing,individual]),full=this.signature!==signature;this.signature=signature;const added=[],removed=[],updated=[];
  for(const [id,layer] of this.layers)if(!map.layers.some(l=>l.id===id)){for(const chunk of layer.chunks.values())removed.push(chunk);this.layers.delete(id);}
  for(const [order,layer] of map.layers.entries()){
   let previous=this.layers.get(layer.id);if(previous&&!full&&(previous.source===layer||changes&&!changes.has(layer.id)&&previous.visible===layer.visible&&previous.order===order)){previous.source=layer;continue;}
   if(previous&&!full&&previous.source.tiles===layer.tiles&&previous.order===order){for(const [key,chunk] of previous.chunks){if(chunk.visible!==layer.visible){const next={...chunk,visible:layer.visible};previous.chunks.set(key,next);updated.push(next);}}previous.source=layer;previous.visible=layer.visible;continue;}
   const requested=full||!previous||!changes||!changes.has(layer.id)?null:changes.get(layer.id),keys=requested?new Set(requested.map(([x,y])=>keyFor(map,x,y,individual))):null,groups=new Map();
   for(const tile of layer.tiles){const key=keyFor(map,tile.x,tile.y,individual);if(keys&&!keys.has(key))continue;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(tile);}
   const chunks=previous&&!full?new Map(previous.chunks):new Map();if(previous&&full)removed.push(...previous.chunks.values());
   for(const [key,old] of chunks)if((!keys||keys.has(key))&&!groups.has(key)){removed.push(old);chunks.delete(key);}
   for(const [key,tiles] of groups){if(map.layout==='isometric')tiles.sort((a,b)=>a.x+a.y-b.x-b.y||a.y-b.y||a.x-b.x);const old=chunks.get(key),tile=tiles[0],chunk={key:layer.id+'|'+key,layer:layer.id,order,visible:layer.visible,tiles,sortOrder:map.layout==='isometric'?(tile.x+tile.y)*map.width+tile.y:tile.y*map.width+tile.x,sortPoint:individual?tileCellPoint(map,tile.x+.5,tile.y+.5):undefined};chunks.set(key,chunk);(old?updated:added).push(chunk);}
   if(previous&&(previous.visible!==layer.visible||previous.order!==order))for(const [key,chunk] of chunks)if(!groups.has(key)){const next={...chunk,visible:layer.visible,order};chunks.set(key,next);updated.push(next);}
   this.layers.set(layer.id,{source:layer,visible:layer.visible,order,chunks});
  }return {added,updated,removed,all:[...this.layers.values()].flatMap(l=>[...l.chunks.values()])};
 }
}
export function tileChunkGeometry(map,chunk,image){
 const positions=[],uvs=[],indices=[];for(const tile of chunk.tiles){const region=tileAtlasRect(map,tile.index,image);if(!region)continue;const [x,y,w,h]=tileRenderRect(map,tile),z=chunk.order*.001,v=positions.length/3,[u0,v0]=region.uv.offset,[uw,vh]=region.uv.repeat;positions.push(x,y,z,x+w,y,z,x+w,y+h,z,x,y+h,z);const corners=[[0,0],[1,0],[1,1],[0,1]];for(let k=0;k<4;k++){const uv=corners[(k+(tile.rotation||0))%4];uvs.push(u0+(tile.flipX?1-uv[0]:uv[0])*uw,v0+(tile.flipY?1-uv[1]:uv[1])*vh);}indices.push(v,v+1,v+2,v,v+2,v+3);}
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));g.setIndex(indices);g.computeVertexNormals();g.computeBoundingSphere();g.computeBoundingBox();return g;
}
// Collision chunks merge across collision layers, but never across a chunk boundary.
export class TileCollisionChunks{
 constructor(){this.chunks=new Map();this.signature='';}
 update(map,changes){
  if(!valid2DAsset('tilemap',map))throw Error('타일 충돌 청크 데이터 오류');const signature=JSON.stringify([map.width,map.height,map.layout,map.cellSize,map.layers.map(l=>[l.id,l.collision])]),full=this.signature!==signature||!changes;this.signature=signature;let dirty=null;
  if(!full){dirty=new Set();for(const cells of changes.values()){if(cells===null){dirty=null;break;}for(const [x,y] of cells)dirty.add(Math.floor(x/tileChunkSize)+':'+Math.floor(y/tileChunkSize));}}
  const groups=new Map();for(const layer of map.layers)if(layer.collision)for(const tile of layer.tiles)if(tile.autoCollision!==false){const key=Math.floor(tile.x/tileChunkSize)+':'+Math.floor(tile.y/tileChunkSize);if(dirty&&!dirty.has(key))continue;if(!groups.has(key))groups.set(key,new Set());groups.get(key).add((tile.y%tileChunkSize)*tileChunkSize+tile.x%tileChunkSize);}
  for(const key of this.chunks.keys())if((!dirty||dirty.has(key))&&!groups.has(key))this.chunks.delete(key);let rebuilt=0;
  for(const [key,filled] of groups){const [cx,cy]=key.split(':').map(Number),rects=[],active=new Map();for(let y=0;y<tileChunkSize;y++){const next=new Map();for(let x=0;x<tileChunkSize;){if(!filled.has(y*tileChunkSize+x)){x++;continue;}const start=x;while(x<tileChunkSize&&filled.has(y*tileChunkSize+x))x++;const k=start+':'+(x-start),old=active.get(k);next.set(k,old?{...old,height:old.height+1}:{x:start,y,width:x-start,height:1});}for(const [k,r] of active)if(!next.has(k))rects.push(r);active.clear();for(const [k,r] of next)active.set(k,r);}rects.push(...active.values());
   this.chunks.set(key,rects.map((r,i)=>{r={...r,x:r.x+cx*tileChunkSize,y:r.y+cy*tileChunkSize};const center=tileCellPoint(map,r.x+r.width/2,r.y+r.height/2),p=componentDefaults(map.layout==='isometric'?'PolygonCollider2D':'BoxCollider2D'),id='tile_'+cx+'_'+cy+'_'+i;if(map.layout==='isometric'){p.center=center;p.paths=[[[r.x,r.y],[r.x+r.width,r.y],[r.x+r.width,r.y+r.height],[r.x,r.y+r.height]].map(([x,y])=>{const v=tileCellPoint(map,x,y);return [v[0]-center[0],v[1]-center[1]];})];}else{p.center=center;p.extent=[r.width*map.cellSize[0]/2,r.height*map.cellSize[1]/2,.05];}return {id,name:'Tile',type:map.layout==='isometric'?'PolygonCollider2D':'BoxCollider2D',properties:p};}));rebuilt++;
  }return {colliders:[...this.chunks.values()].flat(),rebuilt,chunks:this.chunks.size};
 }
}
