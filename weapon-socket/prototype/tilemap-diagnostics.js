import {tileAt} from './tile-cell-index.js';
export const tilemapInspectionContract={command:'runtime.tilemap.inspect',target:'active actor ID',layer:'optional layer ID; default first',pagination:{offset:'integer >=0',limit:'1..256; default64'},cell:'optional [integer x,y]; exact lookup, offset must0',readOnly:true,loadsAssets:false,scope:'Current runtime cells and bounded metadata; no full-scene copy, GPU readback or edit.'};
export function tilemapPage(object,options,state){
 if(!options||typeof options!=='object'||Array.isArray(options))throw Error('타일맵 조회 대상을 확인하세요.');
 const {target,layer,cell,offset=0,limit=64}=options;
 if(Object.keys(options).some(k=>!['target','layer','cell','offset','limit'].includes(k))||typeof target!=='string'||!target||target.length>200||layer!==undefined&&(typeof layer!=='string'||!layer)||!Number.isSafeInteger(offset)||offset<0||!Number.isInteger(limit)||limit<1||limit>256||cell!==undefined&&(!Array.isArray(cell)||cell.length!==2||!cell.every(Number.isSafeInteger)||offset!==0))throw Error('타일맵 조회 대상·레이어·페이지를 확인하세요.');
 const base={target,ready:!!state.ready,pendingLoad:!!state.pendingLoad,pendingRender:!!state.pendingRender,pendingChanges:!!state.pendingChanges};if(!base.ready||!object?.runtimeTilemap)return{...base,total:0,items:[],nextOffset:null};
 const map=object.runtimeTilemap,selected=layer===undefined?map.layers[0]:map.layers.find(l=>l.id===layer);if(!selected)throw Error('타일 레이어가 없어요: '+layer);if(cell&&(cell[0]<0||cell[1]<0||cell[0]>=map.width||cell[1]>=map.height))throw Error('셀 조회 좌표를 확인하세요.');
 const found=cell?tileAt(selected,...cell):null,rows=cell?(found?[found]:[]):selected.tiles,total=rows.length;
 return{...base,asset:object.runtimeTilemapPath,width:map.width,height:map.height,layout:map.layout||'rectangular',cellSize:[...map.cellSize],layers:map.layers.map(l=>({id:l.id,name:l.name,visible:l.visible,collision:l.collision,tileCount:l.tiles.length})),collisionChunks:state.collisionChunks,layer:selected.id,offset,total,items:structuredClone(rows.slice(offset,offset+limit)),nextOffset:offset+limit<total?offset+limit:null,...(cell?{cell:[...cell]}:{})};
}
