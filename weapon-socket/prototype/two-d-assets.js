import {validSpriteSlices} from './sprite-import.js';
export const twoDSuffix={sprite:'.hbsprite.json',tilemap:'.hbtilemap.json',spriteanimation:'.hbspriteanimation.json'};
export const twoDTypes={sprite:{label:'스프라이트',prefix:'S_',group:'2D'},tilemap:{label:'타일맵',prefix:'TM_',group:'2D'},spriteanimation:{label:'스프라이트 애니메이션',prefix:'SA_',group:'2D'}};
const finite=(value,min,max)=>typeof value==='number'&&Number.isFinite(value)&&value>=min&&value<=max;
const integer=(value,min,max)=>Number.isInteger(value)&&finite(value,min,max);
const vector=(value,size,min,max)=>Array.isArray(value)&&value.length===size&&value.every(n=>finite(n,min,max));
const reference=value=>typeof value==='string'&&value.length<=2000&&!/^(?:[A-Za-z]:|[\\/])/.test(value)&&!value.replaceAll('\\','/').split('/').includes('..')&&!/[\x00-\x1f]/.test(value);
const name=value=>typeof value==='string'&&value.trim().length>0&&value.length<=120;
export function create2DAsset(kind,title){
  if(!name(title))throw Error('에셋 이름을 확인하세요.');
  if(kind==='sprite')return {version:1,name:title,texture:'',normalTexture:'',pixelsPerUnit:100,rect:[0,0,0,0],pivot:[.5,.5],filter:'nearest',border:[0,0,0,0]};
  if(kind==='tilemap')return {version:1,name:title,tileset:'',normalTexture:'',tileSize:[32,32],cellSize:[1,1],width:32,height:32,layers:[{id:'ground',name:'Ground',visible:true,collision:false,tiles:[]}]};
  if(kind==='spriteanimation')return {version:1,name:title,frames:[],loop:true,playRate:1};
  throw Error('2D 에셋 종류를 확인하세요.');
}
export function valid2DAsset(kind,data){
  if(!data||data.version!==1||!name(data.name)||data.normalTexture!==undefined&&!reference(data.normalTexture))return false;
  if(kind==='sprite')return (data.slices===undefined||validSpriteSlices(data.slices))&&(data.sheet===undefined||reference(data.sheet)&&typeof data.sliceId==='string'&&/^[\w-]{1,80}$/.test(data.sliceId))&&reference(data.texture)&&finite(data.pixelsPerUnit,.01,100000)&&vector(data.rect,4,0,32768)&&data.rect.every(Number.isInteger)&&vector(data.pivot,2,0,1)&&['nearest','linear'].includes(data.filter)&&(data.border===undefined||vector(data.border,4,0,32768)&&data.border.every(Number.isInteger));
  if(kind==='spriteanimation')return typeof data.loop==='boolean'&&finite(data.playRate,.01,100)&&Array.isArray(data.frames)&&data.frames.length<=1000&&data.frames.every(frame=>frame&&reference(frame.sprite)&&frame.sprite.length>0&&finite(frame.duration,.001,3600));
  if(kind!=='tilemap'||data.layout!==undefined&&!['rectangular','isometric'].includes(data.layout)||!reference(data.tileset)||!vector(data.tileSize,2,1,4096)||!data.tileSize.every(Number.isInteger)||!vector(data.cellSize,2,.001,10000)||!integer(data.width,1,256)||!integer(data.height,1,256)||!Array.isArray(data.layers)||!data.layers.length||data.layers.length>32)return false;
  const ids=new Set();
  return data.layers.every(layer=>{
    if(!layer||!name(layer.id)||ids.has(layer.id)||!name(layer.name)||typeof layer.visible!=='boolean'||typeof layer.collision!=='boolean'||!Array.isArray(layer.tiles)||layer.tiles.length>data.width*data.height)return false;
    ids.add(layer.id);const cells=new Set();
    return layer.tiles.every(tile=>{if(!tile||!integer(tile.x,0,data.width-1)||!integer(tile.y,0,data.height-1)||!integer(tile.index,0,1048575))return false;const key=tile.x+','+tile.y;if(cells.has(key))return false;cells.add(key);return true;});
  });
}
/** Image rectangles use top-left pixel coordinates; UVs use bottom-left origin. */
export function spriteImage(sprite,image){
  if(!valid2DAsset('sprite',sprite)||!integer(image?.width,1,32768)||!integer(image?.height,1,32768))return null;
  const [x,y,w,h]=sprite.rect,width=w||image.width-x,height=h||image.height-y;
  if(width<=0||height<=0||x+width>image.width||y+height>image.height)return null;
  const size=[width/sprite.pixelsPerUnit,height/sprite.pixelsPerUnit];
  return {rect:[x,y,width,height],uv:{offset:[x/image.width,1-(y+height)/image.height],repeat:[width/image.width,height/image.height]},size,pivot:[...sprite.pivot],offset:[(.5-sprite.pivot[0])*size[0],(.5-sprite.pivot[1])*size[1]]};
}
export function sliceSpriteGrid(sprite,image,{width=32,height=32,margin=0,spacing=0}={}){
  const source=spriteImage(sprite,image);if(!source||!integer(width,1,4096)||!integer(height,1,4096)||!integer(margin,0,4096)||!integer(spacing,0,4096))return [];
  const [x,y,w,h]=source.rect,columns=Math.max(0,Math.floor((w-2*margin+spacing)/(width+spacing))),rows=Math.max(0,Math.floor((h-2*margin+spacing)/(height+spacing)));
  if(columns*rows>1000)throw Error('한 번에 1000개까지 자를 수 있어요.');
  return Array.from({length:columns*rows},(_,index)=>({...structuredClone(sprite),name:sprite.name.slice(0,115)+'_'+String(index+1).padStart(3,'0'),rect:[x+margin+(index%columns)*(width+spacing),y+margin+Math.floor(index/columns)*(height+spacing),width,height]}));
}
/** Borders use left/bottom/right/top pixels. UVs are local to the cropped sprite rectangle. */
export function spriteSlices(sprite,image,{size,mode='sliced',origin='bottomLeft'}={}){
  const layout=spriteImage(sprite,image);if(!layout||!vector(size,2,.001,10000)||!['sliced','tiled'].includes(mode))throw Error('스프라이트 크기·모드를 확인하세요.');
  const [left,bottom,right,top]=sprite.border||[0,0,0,0],w=layout.rect[2],h=layout.rect[3],ppu=sprite.pixelsPerUnit;
  if(left+right>w||bottom+top>h)throw Error('스프라이트 테두리가 원본 영역보다 커요.');
  const segments=(length,start,end,pixels,first,last)=>{const scale=Math.min(1,length/Math.max(.00001,(start+end)/ppu)),a=start/ppu*scale,b=end/ppu*scale,inner=Math.max(0,length-a-b),tile=(pixels-start-end)/ppu,list=[];
    if(a>0)list.push({from:0,to:a,u0:0,u1:first});
    if(inner>0){if(mode==='tiled'&&tile>0){const count=Math.ceil(inner/tile);if(count>10000)throw Error('스프라이트 반복 수 제한 초과');for(let i=0;i<count;i++){const at=i*tile,span=Math.min(tile,inner-at);list.push({from:a+at,to:a+at+span,u0:first,u1:first+(last-first)*span/tile});}}else list.push({from:a,to:a+inner,u0:first,u1:last});}
    if(b>0)list.push({from:length-b,to:length,u0:last,u1:1});return list;
  };
  const xs=segments(size[0],left,right,w,left/w,1-right/w),ys=segments(size[1],bottom,top,h,bottom/h,1-top/h);if(xs.length*ys.length>10000)throw Error('스프라이트 반복 면 제한 초과');
  if(mode==='tiled'&&origin==='topLeft'&&bottom===0&&top===0)for(const y of ys){const from=size[1]-y.to,to=size[1]-y.from,u0=1-y.u1,u1=1-y.u0;Object.assign(y,{from,to,u0,u1});}
  const positions=[],uvs=[],normals=[];for(const x of xs)for(const y of ys){const verts=[[x.from,y.from,x.u0,y.u0],[x.to,y.from,x.u1,y.u0],[x.to,y.to,x.u1,y.u1],[x.from,y.from,x.u0,y.u0],[x.to,y.to,x.u1,y.u1],[x.from,y.to,x.u0,y.u1]];for(const [vx,vy,u,v] of verts){positions.push(vx-size[0]/2,vy-size[1]/2,0);uvs.push(u,v);normals.push(0,0,1);}}
  return {positions,uvs,normals,size,offset:[(.5-sprite.pivot[0])*size[0],(.5-sprite.pivot[1])*size[1]]};
}
export function spriteAnimationDuration(animation){return animation.frames.reduce((sum,frame)=>sum+frame.duration,0);}
export function spriteAnimationFrame(animation,time,{loop=animation?.loop,rate=animation?.playRate}={}){
  if(!valid2DAsset('spriteanimation',animation)||!animation.frames.length||!finite(time,0,Number.MAX_SAFE_INTEGER)||!finite(rate,.001,1000)||typeof loop!=='boolean')return null;
  const duration=spriteAnimationDuration(animation),scaled=time*rate,epsilon=Math.min(1e-7,Number.EPSILON*Math.max(1,duration,scaled)*8),finished=!loop&&scaled>=duration-epsilon,remainder=scaled%duration,position=loop?(duration-remainder<=epsilon||remainder<=epsilon?0:remainder):finished?duration:scaled;
  let start=0,index=animation.frames.length-1;
  for(let i=0;i<animation.frames.length;i++){if(position<start+animation.frames[i].duration-epsilon){index=i;break;}start+=animation.frames[i].duration;}
  if(finished)start=duration-animation.frames.at(-1).duration;
  return {index,sprite:animation.frames[index].sprite,elapsed:Math.min(animation.frames[index].duration,Math.max(0,position-start)),duration,finished};
}
export function tileAtlasRect(map,index,image){
  if(!vector(map?.tileSize,2,1,4096)||!map.tileSize.every(Number.isInteger)||!integer(image?.width,1,32768)||!integer(image?.height,1,32768)||!integer(index,0,1048575))return null;
  const [width,height]=map.tileSize,columns=Math.floor(image.width/width),rows=Math.floor(image.height/height);if(index>=columns*rows)return null;
  const x=index%columns*width,y=Math.floor(index/columns)*height;
  return {rect:[x,y,width,height],uv:{offset:[x/image.width,1-(y+height)/image.height],repeat:[width/image.width,height/image.height]},columns,rows};
}
export function tileLine(from,to){
  if(!from||!to||![from.x,from.y,to.x,to.y].every(Number.isInteger)||Math.max(Math.abs(to.x-from.x),Math.abs(to.y-from.y))>65536)return [];
  const cells=[];let x=from.x,y=from.y;const dx=Math.abs(to.x-x),sx=x<to.x?1:-1,dy=-Math.abs(to.y-y),sy=y<to.y?1:-1;let error=dx+dy;
  for(;;){cells.push({x,y});if(x===to.x&&y===to.y)break;const twice=2*error;if(twice>=dy){error+=dy;x+=sx;}if(twice<=dx){error+=dx;y+=sy;}}
  return cells;
}
/** A tool returns an immutable map; callers group successive brush points into one undo stroke. */
export function applyTileTool(map,layerId,tool,from,to=from,index=0){
  if(!valid2DAsset('tilemap',map)||!['brush','erase','rectangle','fill'].includes(tool)||!from||!to||![from.x,from.y,to.x,to.y].every(Number.isInteger)||!integer(index,-1,1048575))return {data:map,changed:false};
  const layerIndex=map.layers.findIndex(layer=>layer.id===layerId);if(layerIndex<0)return {data:map,changed:false};
  const inside=({x,y})=>x>=0&&y>=0&&x<map.width&&y<map.height,key=({x,y})=>x+','+y,tiles=new Map(map.layers[layerIndex].tiles.map(tile=>[key(tile),tile]));let cells=[];
  if(tool==='rectangle')for(let y=Math.max(0,Math.min(from.y,to.y));y<=Math.min(map.height-1,Math.max(from.y,to.y));y++)for(let x=Math.max(0,Math.min(from.x,to.x));x<=Math.min(map.width-1,Math.max(from.x,to.x));x++)cells.push({x,y});
  else if(tool==='fill'){
    if(!inside(from))return {data:map,changed:false};const source=tiles.get(key(from))?.index;if(source===index)return {data:map,changed:false};
    const visited=new Uint8Array(map.width*map.height),queue=[from];visited[from.y*map.width+from.x]=1;
    for(let cursor=0;cursor<queue.length;cursor++){const cell=queue[cursor];if(tiles.get(key(cell))?.index!==source)continue;cells.push(cell);for(const adjacent of [{x:cell.x-1,y:cell.y},{x:cell.x+1,y:cell.y},{x:cell.x,y:cell.y-1},{x:cell.x,y:cell.y+1}])if(inside(adjacent)&&!visited[adjacent.y*map.width+adjacent.x]){visited[adjacent.y*map.width+adjacent.x]=1;queue.push(adjacent);}}
  }else cells=tileLine(from,to).filter(inside);
  let changed=false;
  for(const cell of cells){const previous=tiles.get(key(cell));if(tool==='erase'||index===-1){if(previous){tiles.delete(key(cell));changed=true;}}else if(previous?.index!==index){tiles.set(key(cell),{...cell,index});changed=true;}}
  if(!changed)return {data:map,changed:false};
  const layers=[...map.layers];layers[layerIndex]={...layers[layerIndex],tiles:[...tiles.values()].sort((a,b)=>a.y-b.y||a.x-b.x)};return {data:{...map,layers},changed:true};
}
/** Collision rectangles merge contiguous cells, across layers marked for collision. */
export function tileCollisionBoxes(map,depth=.1){
  if(!valid2DAsset('tilemap',map)||!finite(depth,.001,1000))return [];
  const filled=new Set(map.layers.filter(layer=>layer.collision).flatMap(layer=>layer.tiles.map(tile=>tile.y*map.width+tile.x))),rectangles=[],active=new Map();
  for(let y=0;y<map.height;y++){
    const next=new Map();
    for(let x=0;x<map.width;){if(!filled.has(y*map.width+x)){x++;continue;}const start=x;while(x<map.width&&filled.has(y*map.width+x))x++;const key=start+':'+(x-start),existing=active.get(key),rect=existing?{...existing,height:existing.height+1}:{x:start,y,width:x-start,height:1};next.set(key,rect);}
    for(const [key,rect] of active)if(!next.has(key))rectangles.push(rect);active.clear();for(const [key,rect] of next)active.set(key,rect);
  }
  rectangles.push(...active.values());
  return rectangles.map(rect=>({...rect,center:[(rect.x+rect.width/2)*map.cellSize[0],-(rect.y+rect.height/2)*map.cellSize[1],0],size:[rect.width*map.cellSize[0],rect.height*map.cellSize[1],depth]}));
}

// One grid basis for authoring, rendering, VM coordinates and collision shapes.
export function tileCellPoint(map,x,y){const [w,h]=map.cellSize;return map.layout==='isometric'?[(x-y)*w/2,-(x+y)*h/2,0]:[x*w,-y*h,0];}
export function tileLocalToCell(map,point){const [w,h]=map.cellSize;return map.layout==='isometric'?[Math.floor(point[0]/w-point[1]/h),Math.floor(-point[0]/w-point[1]/h)]:[Math.floor(point[0]/w),Math.floor(-point[1]/h)];}
export function tileCellPolygon(map,x,y,width=1,height=1){return [[x,y],[x+width,y],[x+width,y+height],[x,y+height]].map(([a,b])=>tileCellPoint(map,a,b));}
export function tileRenderRect(map,tile){
  const [w,h]=map.cellSize;
  if(map.layout!=='isometric')return [tile.x*w,-(tile.y+1)*h,w,h];
  const [x,y]=tileCellPoint(map,tile.x+.5,tile.y+.5),artHeight=w*map.tileSize[1]/map.tileSize[0];
  return [x-w/2,y-h/2,w,artHeight];
}
