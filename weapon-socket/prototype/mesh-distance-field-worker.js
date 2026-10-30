import {prepareDistanceFieldMesh,bakeMeshDistanceField} from './mesh-distance-field-core.js';
self.onmessage=async({data:{id,vertices,options}})=>{
 try{const triangles=[];for(let i=0;i<vertices.length;i+=9)triangles.push({points:[vertices.subarray(i,i+3),vertices.subarray(i+3,i+6),vertices.subarray(i+6,i+9)]});const mesh=prepareDistanceFieldMesh(triangles),field=await bakeMeshDistanceField(mesh,{...options,onProgress:progress=>self.postMessage({id,progress})});self.postMessage({id,field},[field.data.buffer]);}catch(error){self.postMessage({id,error:error.message,code:error.code,requiredBytes:error.requiredBytes,minimumBytes:error.minimumBytes});}
};
self.postMessage({ready:true});
