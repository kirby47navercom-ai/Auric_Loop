import {planMeshDistanceFieldLayout} from './mesh-distance-field-layout.js';
// Keep the ready field until replacement completes. Both payloads must fit.
// A meaningful quality step and 10% capacity hysteresis avoid rebaking on noise.
export function planDistanceFieldUpgrade(entry,resolution,available){
 const field=entry.field,current=field?.resolution??0;
 if(!field||field.kind||entry.upgrade||current>=resolution||available<=field.bytes||available<=(entry.upgradeCheckedCapacity??0)*1.1)return null;
 entry.upgradeCheckedCapacity=available;
 const minimumResolution=Math.min(resolution,current+Math.max(2,Math.ceil(current*.125)));
 try{return planMeshDistanceFieldLayout(field.meshBounds,{resolution,minimumResolution,byteBudget:Math.floor(available)});}
 catch(error){if(error.code==='HB_DISTANCE_FIELD_BUDGET')return null;throw error;}
}
export function distanceFieldVertices(position,index,start,count){
 const vertices=new Float64Array(count*3);for(let i=0;i<count;i++){const at=index?index.getX(start+i):start+i;vertices[i*3]=position.getX(at);vertices[i*3+1]=position.getY(at);vertices[i*3+2]=position.getZ(at);}return vertices;
}
