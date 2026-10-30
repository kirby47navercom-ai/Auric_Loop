import {tileAt,setRuntimeTile} from './tile-cell-index.js';
import {tilemapPage} from './tilemap-diagnostics.js';
import {immutableNativeSnapshot} from './native-transport.js';
import {TileCollisionChunks} from './tilemap-chunks.js';
import {resolveAutoTiles,affectedAutoTileCells} from './auto-tiles.js';
import * as THREE from 'three';
import {valid2DAsset,applyTileTool,tileCellPoint,tileLocalToCell} from './two-d-assets.js';
import {enabledComponent} from './scene-components.js';
import {sceneWorldMatrix} from './scene-runtime.js';
export const tilemapKeys=new Set(['tileGet','tileHas','tileSet','tileSetMany','tileBoxFill','tileFloodFill','tileClear','tileWorldToCell','tileCellToWorld','tileRefresh','tileProcessChanges','tileHasChanges','tileLayerVisible']);
const cellOK=(map,v)=>Array.isArray(v)&&v.length===2&&v.every(Number.isInteger)&&v[0]>=0&&v[1]>=0&&v[0]<map.width&&v[1]<map.height;
export const tilemapColliders=map=>new TileCollisionChunks().update(map).colliders;
export class RuntimeTilemaps {
  constructor(hooks={}){this.hooks=hooks;this.dirty=new Set();this.loading=new Map();this.processing=new Map();this.revisions=new Map();this.changes=new Map();this.collisionChunks=new Map();this.collisionDirty=new Set();this.disposed=false;}
  async load(object){
    if(this.disposed)return null;const path=enabledComponent(object,'TilemapRenderer')?.tilemap||object.tilemapAsset;if(!path)throw Error('TilemapRenderer에 타일맵을 지정하세요.');
    if(object.runtimeTilemapPath===path&&object.runtimeTilemap)return object.runtimeTilemap;
    let pending=this.loading.get(object.id);if(pending?.object===object&&pending.path===path)return pending.promise;
    const ticket={object,path},current=()=>!this.disposed&&this.loading.get(object.id)===ticket&&(enabledComponent(object,'TilemapRenderer')?.tilemap||object.tilemapAsset)===path;this.loading.set(object.id,ticket);
    ticket.promise=Promise.resolve().then(()=>this.hooks.read(path)).then(map=>{if(!current())return null;if(!valid2DAsset('tilemap',map))throw Error('타일맵 검증 실패: '+path);this.processing.delete(object.id);this.dirty.delete(object.id);this.revisions.delete(object.id);this.changes.delete(object.id);this.collisionDirty.delete(object.id);object.tilemapDirty=false;object.runtimeTilemap=immutableNativeSnapshot(resolveAutoTiles(structuredClone(map)),{clone:false});object.runtimeTilemapPath=path;this.colliders(object);return object.runtimeTilemap;}).catch(error=>{if(current())throw error;return null;}).finally(()=>{if(this.loading.get(object.id)===ticket)this.loading.delete(object.id);});return ticket.promise;
  }
  async start(objects){for(const object of objects)if(enabledComponent(object,'TilemapRenderer')?.tilemap||object.tilemapAsset)await this.load(object);}
  colliders(object,changes){let cache=this.collisionChunks.get(object.id);if(!cache)this.collisionChunks.set(object.id,cache=new TileCollisionChunks());const result=cache.update(object.runtimeTilemap,changes);object.tileColliders=[...(object.tileColliders||[]).filter(c=>c.id.startsWith('worldCollider_')),...result.colliders];object.gameplayDebug={...object.gameplayDebug,tilemap:{...object.gameplayDebug?.tilemap,collisionChunks:result.chunks,rebuiltCollisionChunks:result.rebuilt}};}
  async process(object){if(this.disposed||!this.dirty.has(object.id))return;const previous=this.processing.get(object.id);if(previous?.object===object)return previous.promise;const map=object.runtimeTilemap,revision=this.revisions.get(object.id),changes=this.changes.get(object.id),snapshot=changes&&new Map(changes),ticket={object};this.processing.set(object.id,ticket);
    ticket.promise=Promise.resolve().then(()=>{if(!this.disposed&&this.processing.get(object.id)===ticket)return this.hooks.render?.(object,map,snapshot);}).then(()=>{if(this.disposed||this.processing.get(object.id)!==ticket||object.runtimeTilemap!==map||this.revisions.get(object.id)!==revision)return;if(this.collisionDirty.has(object.id))this.colliders(object,snapshot);else if(object.gameplayDebug?.tilemap)object.gameplayDebug.tilemap.rebuiltCollisionChunks=0;this.collisionDirty.delete(object.id);this.dirty.delete(object.id);this.changes.delete(object.id);this.revisions.delete(object.id);object.tilemapDirty=false;}).catch(error=>{if(!this.disposed&&this.processing.get(object.id)===ticket)throw error;}).finally(()=>{if(this.processing.get(object.id)===ticket)this.processing.delete(object.id);});return ticket.promise;
  }
  async flush(vm){for(const id of [...this.dirty]){const object=vm.object(id);if(object)await this.process(object);else this.release(id);}}
  inspect(object,options={}){const path=object&&(enabledComponent(object,'TilemapRenderer')?.tilemap||object.tilemapAsset);return tilemapPage(object,options,{ready:!this.disposed&&object?.poolActive!==false&&!!path&&object?.runtimeTilemapPath===path&&!!object?.runtimeTilemap,pendingLoad:this.loading.get(object?.id)?.object===object&&!!object,pendingRender:this.processing.get(object?.id)?.object===object&&!!object,pendingChanges:this.dirty.has(object?.id),collisionChunks:this.collisionChunks.get(object?.id)?.chunks.size||0});}
  release(id){this.dirty.delete(id);this.loading.delete(id);this.processing.delete(id);this.revisions.delete(id);this.changes.delete(id);this.collisionChunks.delete(id);this.collisionDirty.delete(id);}
  dispose(){this.disposed=true;this.dirty.clear();this.loading.clear();this.processing.clear();this.revisions.clear();this.changes.clear();this.collisionChunks.clear();this.collisionDirty.clear();}
  async operation(key,args,b,vm){
    if(!tilemapKeys.has(key))return;const object=vm.object(args.target==='self'?b.self:args.target);if(!object)throw Error('타일맵 오브젝트가 없어요.');const map=await this.load(object);if(!map||this.disposed||vm.active===false||vm.object(object.id)!==object||object.poolActive===false)return {};
    if(key==='tileHasChanges')return {return:this.dirty.has(object.id)};if(key==='tileProcessChanges'){await this.process(object);return {};}
    if(key==='tileWorldToCell'){if(!Array.isArray(args.position)||args.position.length!==3||!args.position.every(Number.isFinite))throw Error('월드 위치를 확인하세요.');const p=new THREE.Vector3(...args.position).applyMatrix4(sceneWorldMatrix(object,vm.objects).invert());return {return:tileLocalToCell(map,p.toArray())};}
    if(key==='tileCellToWorld'){if(!Array.isArray(args.cell)||args.cell.length!==2||!args.cell.every(Number.isInteger))throw Error('셀 좌표를 확인하세요.');const p=new THREE.Vector3(...tileCellPoint(map,args.cell[0]+.5,args.cell[1]+.5)).applyMatrix4(sceneWorldMatrix(object,vm.objects));return {return:p.toArray()};}
    const layer=map.layers.find(l=>l.id===args.layer);if(!layer)throw Error('타일 레이어가 없어요: '+args.layer);
    if(['tileGet','tileHas'].includes(key)){if(!cellOK(map,args.cell))return {return:key==='tileGet'?-1:false};const tile=tileAt(layer,args.cell[0],args.cell[1]);return {return:key==='tileGet'?tile?.index??-1:!!tile};}
    let next=map,changed=false,cells=null;
    if(key==='tileSetMany'){
      if(!Array.isArray(args.cells)||!Array.isArray(args.indices)||args.cells.length!==args.indices.length||args.cells.length>65536||args.cells.some((cell,i)=>!cellOK(map,cell)||!Number.isInteger(args.indices[i])||args.indices[i]<-1||args.indices[i]>1048575))throw Error('타일 묶음 좌표·인덱스·크기를 확인하세요.');
      const updates=new Map(args.cells.map((cell,i)=>[cell[1]*map.width+cell[0],{x:cell[0],y:cell[1],index:args.indices[i]}])),tiles=[];
      for(const tile of layer.tiles){const id=tile.y*map.width+tile.x,value=updates.get(id);updates.delete(id);if(!value)tiles.push(tile);else{changed||=value.index!==(tile.sourceIndex??tile.index);if(value.index>=0)tiles.push(value);}}
      for(const value of updates.values())if(value.index>=0){tiles.push(value);changed=true;}
      if(changed){cells=args.cells;next={...map,layers:map.layers.map(item=>item===layer?{...item,tiles}:item)};}
    }
    else if(key==='tileClear'){if(layer.tiles.length){next={...map,layers:map.layers.map(l=>l===layer?{...l,tiles:[]}:l)};changed=true;}}
    else if(key==='tileLayerVisible'){if(typeof args.visible!=='boolean')throw Error('표시 값을 확인하세요.');if(layer.visible!==args.visible){next={...map,layers:map.layers.map(l=>l===layer?{...l,visible:args.visible}:l)};changed=true;}}
    else if(key==='tileRefresh'){if(!cellOK(map,args.cell))throw Error('셀 좌표를 확인하세요.');changed=true;cells=[args.cell];}
    else{
      if(!cellOK(map,args.cell)||key==='tileBoxFill'&&!cellOK(map,args.end)||!Number.isInteger(args.index)||args.index< -1||args.index>1048575)throw Error('셀 좌표·타일 인덱스를 확인하세요.');
      const tool=key==='tileSet'?'brush':key==='tileBoxFill'?'rectangle':'fill',cell={x:args.cell[0],y:args.cell[1]},end=key==='tileBoxFill'?{x:args.end[0],y:args.end[1]}:cell;
      const result=key==='tileSet'?setRuntimeTile(map,layer,args.cell,args.index):applyTileTool(map,args.layer,args.index<0&&tool==='brush'?'erase':tool,cell,end,args.index);next=result.data;changed=result.changed;cells=result.cells;
    }
    if(changed){next=resolveAutoTiles(next,{layerId:layer.id,cells:cells||undefined});object.runtimeTilemap=immutableNativeSnapshot(next,{clone:false});object.tilemapDirty=true;this.dirty.add(object.id);this.revisions.set(object.id,{});if(key!=='tileLayerVisible')this.collisionDirty.add(object.id);let changes=this.changes.get(object.id);if(!changes)this.changes.set(object.id,changes=new Map());const previous=changes.get(layer.id);if(cells&&previous!==null){const affected=next.autoTileRules?.length?affectedAutoTileCells(next.autoTileRules,cells):cells;changes.set(layer.id,[...new Map([...(previous||[]),...affected].map(c=>[c.join(':'),c])).values()]);}else changes.set(layer.id,null);}return {};
  }
}
