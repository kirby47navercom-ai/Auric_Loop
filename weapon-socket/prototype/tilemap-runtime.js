import * as THREE from 'three';
import {valid2DAsset,applyTileTool,tileCollisionBoxes,tileCellPoint,tileLocalToCell,tileCellPolygon} from './two-d-assets.js';
import {enabledComponent,componentDefaults} from './scene-components.js';
import {sceneWorldMatrix} from './scene-runtime.js';
export const tilemapKeys=new Set(['tileGet','tileHas','tileSet','tileSetMany','tileBoxFill','tileFloodFill','tileClear','tileWorldToCell','tileCellToWorld','tileRefresh','tileProcessChanges','tileHasChanges','tileLayerVisible']);
const cellOK=(map,v)=>Array.isArray(v)&&v.length===2&&v.every(Number.isInteger)&&v[0]>=0&&v[1]>=0&&v[0]<map.width&&v[1]<map.height;
export const tilemapColliders=map=>tileCollisionBoxes(map).map((box,i)=>{
  if(map.layout!=='isometric')return {id:'tile_'+i,name:'Tile',type:'BoxCollider2D',properties:{...componentDefaults('BoxCollider2D'),center:box.center,extent:box.size.map(n=>n/2)}};
  const center=tileCellPoint(map,box.x+box.width/2,box.y+box.height/2),paths=[tileCellPolygon(map,box.x,box.y,box.width,box.height).map(p=>[p[0]-center[0],p[1]-center[1]])];
  return {id:'tile_'+i,name:'Tile',type:'PolygonCollider2D',properties:{...componentDefaults('PolygonCollider2D'),center,paths}};
});
export class RuntimeTilemaps {
  constructor(hooks={}){this.hooks=hooks;this.dirty=new Set();this.loading=new Map();}
  async load(object){
    const path=enabledComponent(object,'TilemapRenderer')?.tilemap||object.tilemapAsset;if(!path)throw Error('TilemapRenderer에 타일맵을 지정하세요.');
    if(object.runtimeTilemapPath===path&&object.runtimeTilemap)return object.runtimeTilemap;
    let pending=this.loading.get(object.id);if(!pending){pending=this.hooks.read(path).then(map=>{if(!valid2DAsset('tilemap',map))throw Error('타일맵 검증 실패: '+path);object.runtimeTilemap=structuredClone(map);object.runtimeTilemapPath=path;this.colliders(object);return object.runtimeTilemap;}).finally(()=>this.loading.delete(object.id));this.loading.set(object.id,pending);}return pending;
  }
  async start(objects){for(const object of objects)if(enabledComponent(object,'TilemapRenderer')?.tilemap||object.tilemapAsset)await this.load(object);}
  colliders(object){object.tileColliders=tilemapColliders(object.runtimeTilemap);}
  async process(object){if(!this.dirty.has(object.id))return;await this.hooks.render?.(object,object.runtimeTilemap);this.colliders(object);this.dirty.delete(object.id);object.tilemapDirty=false;}
  async flush(vm){for(const id of [...this.dirty]){const object=vm.object(id);if(object)await this.process(object);else this.dirty.delete(id);}}
  release(id){this.dirty.delete(id);this.loading.delete(id);}
  async operation(key,args,b,vm){
    if(!tilemapKeys.has(key))return;const object=vm.object(args.target==='self'?b.self:args.target);if(!object)throw Error('타일맵 오브젝트가 없어요.');const map=await this.load(object);
    if(key==='tileHasChanges')return {return:this.dirty.has(object.id)};if(key==='tileProcessChanges'){await this.process(object);return {};}
    if(key==='tileWorldToCell'){if(!Array.isArray(args.position)||args.position.length!==3||!args.position.every(Number.isFinite))throw Error('월드 위치를 확인하세요.');const p=new THREE.Vector3(...args.position).applyMatrix4(sceneWorldMatrix(object,vm.objects).invert());return {return:tileLocalToCell(map,p.toArray())};}
    if(key==='tileCellToWorld'){if(!Array.isArray(args.cell)||args.cell.length!==2||!args.cell.every(Number.isInteger))throw Error('셀 좌표를 확인하세요.');const p=new THREE.Vector3(...tileCellPoint(map,args.cell[0]+.5,args.cell[1]+.5)).applyMatrix4(sceneWorldMatrix(object,vm.objects));return {return:p.toArray()};}
    const layer=map.layers.find(l=>l.id===args.layer);if(!layer)throw Error('타일 레이어가 없어요: '+args.layer);
    if(['tileGet','tileHas'].includes(key)){if(!cellOK(map,args.cell))return {return:key==='tileGet'?-1:false};const tile=layer.tiles.find(t=>t.x===args.cell[0]&&t.y===args.cell[1]);return {return:key==='tileGet'?tile?.index??-1:!!tile};}
    let next=map,changed=false;
    if(key==='tileSetMany'){
      if(!Array.isArray(args.cells)||!Array.isArray(args.indices)||args.cells.length!==args.indices.length||args.cells.length>65536||args.cells.some((cell,i)=>!cellOK(map,cell)||!Number.isInteger(args.indices[i])||args.indices[i]<-1||args.indices[i]>1048575))throw Error('타일 묶음 좌표·인덱스·크기를 확인하세요.');
      const updates=new Map(args.cells.map((cell,i)=>[cell[1]*map.width+cell[0],{x:cell[0],y:cell[1],index:args.indices[i]}])),tiles=[];
      for(const tile of layer.tiles){const id=tile.y*map.width+tile.x,value=updates.get(id);updates.delete(id);if(!value)tiles.push(tile);else{changed||=value.index!==tile.index;if(value.index>=0)tiles.push(value);}}
      for(const value of updates.values())if(value.index>=0){tiles.push(value);changed=true;}
      if(changed){next={...map,layers:map.layers.map(item=>item===layer?{...item,tiles}:item)};}
    }
    else if(key==='tileClear'){if(layer.tiles.length){next=structuredClone(map);next.layers.find(l=>l.id===layer.id).tiles=[];changed=true;}}
    else if(key==='tileLayerVisible'){if(typeof args.visible!=='boolean')throw Error('표시 값을 확인하세요.');if(layer.visible!==args.visible){next=structuredClone(map);next.layers.find(l=>l.id===layer.id).visible=args.visible;changed=true;}}
    else if(key==='tileRefresh'){if(!cellOK(map,args.cell))throw Error('셀 좌표를 확인하세요.');changed=true;}
    else{
      if(!cellOK(map,args.cell)||key==='tileBoxFill'&&!cellOK(map,args.end)||!Number.isInteger(args.index)||args.index< -1||args.index>1048575)throw Error('셀 좌표·타일 인덱스를 확인하세요.');
      const tool=key==='tileSet'?'brush':key==='tileBoxFill'?'rectangle':'fill',cell={x:args.cell[0],y:args.cell[1]},end=key==='tileBoxFill'?{x:args.end[0],y:args.end[1]}:cell;
      const result=applyTileTool(map,args.layer,args.index<0&&tool==='brush'?'erase':tool,cell,end,args.index);next=result.data;changed=result.changed;
    }
    if(changed){object.runtimeTilemap=next;object.tilemapDirty=true;this.dirty.add(object.id);}return {};
  }
}
