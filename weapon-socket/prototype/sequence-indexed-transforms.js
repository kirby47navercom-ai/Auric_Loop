import {PropertyBinding,Quaternion,Euler,MathUtils} from 'three';
import {blendSequenceEntries,sequenceEntryEnabled} from './sequence-blending.js';

const sizes={position:3,rotation:3,quaternion:4,scale:3},q=new Quaternion(),e=new Euler();
export const importedTransformField=property=>property==='quaternion'?'rotation':property;
export const canonicalImportedTransformPath=path=>path.replace(/\.(position|rotation|quaternion|scale)\[([0-3])\]$/, (all,property,index)=>Number(index)<sizes[property]?'.'+property+'['+'xyzw'[Number(index)]+']':all);
export function canonicalImportedTransformTrack(track){const name=canonicalImportedTransformPath(track.name);return name===track.name?track:Object.assign(Object.create(Object.getPrototypeOf(track)),track,{name});}
export function canonicalImportedTransformTracks(tracks){let out;for(let i=0;i<tracks.length;i++){const track=canonicalImportedTransformTrack(tracks[i]);if(/\.rotation$/.test(track.name)&&track.getValueSize()/(track.createInterpolant.isInterpolantFactoryMethodGLTFCubicSpline?3:1)===3){out??=tracks.slice(0,i);for(let k=0;k<3;k++)out.push(Object.assign(Object.create(Object.getPrototypeOf(track)),track,{name:track.name+'['+'xyz'[k]+']',getValueSize:()=>1,createInterpolant(buffer){const source=track.createInterpolant(new Float64Array(3));return {resultBuffer:buffer??new Float64Array(1),evaluate(time){this.resultBuffer[0]=source.evaluate(time)[k];return this.resultBuffer;}};}}));}else{if(track!==tracks[i])out??=tracks.slice(0,i);if(out)out.push(track);}}return out??tracks;}
export function importedTransformIndex(property,index){const size=sizes[property];if(!size||index===undefined)return undefined;const k=/^[0-3]$/.test(String(index))?Number(index):'xyzw'.indexOf(String(index));return k>=0&&k<size?k:-1;}
// Resolve aliases once, retaining the importer's original key buffers/interpolants.
export function importedTransformBindings(group,clip,accept){
 const nodes=new Map(),tracks=new Set(),edges=new Map();
 for(const track of clip.tracks){const parsed=PropertyBinding.parseTrackName(track.name),size=sizes[parsed.propertyName];if(!size)continue;const binding=PropertyBinding.create(group,canonicalImportedTransformPath(track.name));binding.bind();const node=binding.targetObject;binding.unbind();if(!accept(node))continue;
  const index=importedTransformIndex(parsed.propertyName,parsed.propertyIndex),n=index===undefined?size:1;if(index===-1||track.getValueSize()/(track.createInterpolant.isInterpolantFactoryMethodGLTFCubicSpline?3:1)!==n)throw Error('모델 변환 성분과 키 자료형을 확인하세요: '+track.name);
  let fields=nodes.get(node);if(!fields){fields=new Map();nodes.set(node,fields);}const field=importedTransformField(parsed.propertyName);let row=fields.get(field);if(!row){row={node,field,property:parsed.propertyName,components:[],mask:new Array(size).fill(false),indexed:false};fields.set(field,row);}if(row.property!==parsed.propertyName)throw Error('같은 회전에 Euler와 Quaternion 키를 중복해서 쓸 수 없어요: '+track.name);
  const indices=index===undefined?Array.from({length:size},(_,i)=>i):[index];if(indices.some(i=>row.mask[i]))throw Error('같은 모델 변환 성분의 중복 키를 확인하세요: '+track.name);for(const i of indices)row.mask[i]=true;row.indexed||=index!==undefined;row.components.push({index,path:track.name,interpolant:track.createInterpolant(new Float64Array(n))});tracks.add(track);
  for(let at=node;at;at=at.parent){if(edges.has(at))break;edges.set(at,[at.parent,at.userData?.objectId,at.name]);if(at===group)break;}
 }
 return {rows:[...nodes.values()].flatMap(fields=>[...fields.values()]),tracks,edges:[...edges]};
}
export function sampleImportedTransform(row,time,duration,basis,quaternion=false){
 let value;if(row.indexed){if(row.field!=='rotation')value=basis.slice();else{q.setFromEuler(e.set(...basis.map(MathUtils.degToRad),'XYZ'));if(row.property==='quaternion')value=q.toArray();else{e.setFromQuaternion(q,row.node.rotation.order);value=[e.x,e.y,e.z];}}}
 for(const part of row.components){const sample=part.interpolant.evaluate(Math.max(0,Math.min(duration,time)));if(Array.from(sample).some(n=>!Number.isFinite(n)))throw Error('가져온 모델 변환 값이 유한하지 않아요: '+part.path);if(part.index===undefined)value=Array.from(sample);else value[part.index]=sample[0];}
 if(row.field!=='rotation')return value;if(row.property==='quaternion'){if(Math.hypot(...value)<1e-12)throw Error('가져온 모델 회전 값을 확인하세요.');q.fromArray(value).normalize();}else q.setFromEuler(e.set(...value,row.node.rotation.order));if(quaternion)return q.toArray();e.setFromQuaternion(q,'XYZ');return [e.x,e.y,e.z].map(MathUtils.radToDeg);
}
const stronger=(a,b)=>(a.owner.priority??0)!==(b.owner.priority??0)?(a.owner.priority??0)>(b.owner.priority??0):a.owner.order>b.owner.order;
export function resolveSequenceComponent(baseline,entries,read,covers,mix='linear'){
 const eligible=[];for(const entry of entries)if(sequenceEntryEnabled(entry)&&covers(entry))eligible.push(entry);if(!eligible.length)return baseline;let top=eligible[0];for(const entry of eligible)if(stronger(entry,top))top=entry;
 const rows=eligible.map(entry=>({...entry,value:read(entry),mix})),chosen=rows[eligible.indexOf(top)];return blendSequenceEntries(chosen,new Map(rows.map(entry=>[entry.owner,entry])));
}
export function resolveIndexedTransformEntries(row,entries){
 const enabled=[...entries.values()].filter(sequenceEntryEnabled);let top=null;for(const entry of enabled)if(!top||stronger(entry,top))top=entry;if(!top)return {top,value:row.baseline};
 const value=(row.underlying??row.baseline).map((base,k)=>resolveSequenceComponent(base,enabled,entry=>entry.value.indexedTransform?entry.value.value[k]:entry.value[k],entry=>!entry.value.indexedTransform||entry.value.mask[k]));return {top,value};
}
export function mixIndexedPoseEntries(row,entries){const layers=[...entries.values()].filter(sequenceEntryEnabled);let top=null;for(const entry of layers)if(!top||stronger(entry,top))top=entry;return {top,value:top?{bone:top.value.bone,components:true,layers:layers.map(entry=>({...entry.value,owner:entry.owner,mix:entry.mix,weight:entry.owner.weight??1}))}:row.baseline};}
// Position/scale arbitrate only authored axes. Rotation stays one orientation:
// indexed Euler/quaternion values assemble from the shared basis before mixing.
export function blendIndexedPoses(rows,basis){
 const entries=rows.map(row=>({owner:row.owner,mix:row.mix,pose:row.pose})),out={position:[],scale:[]};for(const field of ['position','scale'])out[field]=basis[field].map((base,k)=>resolveSequenceComponent(base,entries,entry=>entry.pose[field][k],entry=>!entry.pose.mask||entry.pose.mask[field]?.[k]));
 const angles=resolveSequenceComponent(null,entries,entry=>{e.setFromQuaternion(q.fromArray(entry.pose.quaternion),'XYZ');return [e.x,e.y,e.z].map(MathUtils.radToDeg);},entry=>!entry.pose.mask||entry.pose.mask.quaternion,'rotation');out.quaternion=angles?q.setFromEuler(e.set(...angles.map(MathUtils.degToRad),'XYZ')).normalize().toArray():basis.quaternion.slice();return out;
}
