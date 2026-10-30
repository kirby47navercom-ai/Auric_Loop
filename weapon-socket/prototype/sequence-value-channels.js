import {mapNativeRecordObjects} from './native-records.js';
import {captureSequenceReferences,resolveSequenceReferences,sampleSequenceReferences} from './sequence-reference-state.js';
import {sequenceValueDiscrete,readSequenceValue,prepareSequenceValues,applySequenceValues} from './sequence-values.js';
export function sequenceValueChannel(prepared,bindings,vm,owner){
 const {target,track,value}=prepared,reference=['object','hit','record'].includes(track.valueType),map=(value,visit)=>mapNativeRecordObjects(target.binding.root.native,{...target.definition,array:track.array},value,visit),capture=value=>reference?captureSequenceReferences(value,map,vm,{self:target.object.id}):value;
 const key=track.type==='variable'?'variable:'+track.variable:'native:'+track.className+'.'+track.property;
 return {target:target.binding||target.object,key,value:reference&&owner?sampleSequenceReferences(owner,target.object,key,value,map,vm,{self:target.object.id,refresh:owner.seek,sample:prepared.sample}):capture(value),completionMode:track.completionMode,options:()=>({
  mix:sequenceValueDiscrete(track)?undefined:'linear',
  read:()=>capture(readSequenceValue(target.object,track,bindings())),
  apply:(sample,restoring)=>{const value=reference?resolveSequenceReferences(sample,vm):!restoring&&sample&&typeof sample==='object'?structuredClone(sample):sample;applySequenceValues(restoring?prepareSequenceValues([{object:target.object,track,value}],bindings(),vm):[{target,track,value}]);},
  valid:()=>vm.object(target.object.id)===target.object&&(!target.binding||bindings().includes(target.binding))
 })};
}
