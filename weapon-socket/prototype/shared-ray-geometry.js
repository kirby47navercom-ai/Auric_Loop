// The logical six-vector record preserves material/UV/medium addresses; storage uses five vectors.
export function sharedRayPrefix(prefix,triangleOffset,count,shared,vertexOffset){
 if(!shared)return prefix;
 const start=triangleOffset*4,end=start+count*24,data=prefix.subarray(0,prefix.length-count*4);
 for(let i=0;i<count;i++){const a=start+i*24,b=start+i*20;data[b]=vertexOffset+shared.references[i*2];data[b+1]=shared.references[i*2+1];data[b+2]=prefix[a+3];data[b+3]=prefix[a+7];data.set(prefix.subarray(a+12,a+15),b+4);data[b+7]=prefix[a+11];data.set(prefix.subarray(a+16,a+19),b+8);data[b+11]=prefix[a+15];data.set(prefix.subarray(a+20,a+23),b+12);data[b+15]=prefix[a+19];data[b+16]=prefix[a+23];data.fill(0,b+17,b+20);}
 prefix.copyWithin(end-count*4,end);return data;
}
export function decodeSharedRayRecord(packet,id,slot){
 const {data,triangleOffset}=packet,count=packet.geometryRecords?.[0]||0,read=at=>[...data.subarray(at*4,at*4+4)];
 if(!count)return read(triangleOffset+id*6+slot);
 const at=triangleOffset+id*5,r0=read(at),r1=read(at+1),r2=read(at+2),r3=read(at+3),r4=read(at+4);
 if(slot<3){const v=read(r0[0]+slot-count),m=[read(r0[1]),read(r0[1]+1),read(r0[1]+2)],xyz=m.map(row=>row[0]*v[0]+row[1]*v[1]+row[2]*v[2]+(slot===0?row[3]:0));return [...xyz,slot===0?r0[2]:slot===1?r0[3]:r1[3]];}
 return slot===3?[...r1.slice(0,3),r2[3]]:slot===4?[...r2.slice(0,3),r3[3]]:[...r3.slice(0,3),r4[0]];
}
export function sharedRayInfo(packet){return packet?{analyticLights:packet.lightCount,lightBudget:packet.lightBudget??packet.lightCount,logicalTriangles:packet.triangles,sharedVertices:!!packet.geometryRecords?.[0],uniqueVertexTriangles:packet.work.uniqueVertexTriangles??packet.triangles,atlasBytes:packet.data.byteLength,previousGeometry:packet.previousGeometry?{...packet.previousGeometry}:null,materialTimeShift:packet.materialTimeShift||0,previousMaterialTime:packet.previousMaterialTime||0,poseMatrixInstances:packet.frameMatrices?.size||0,poseMatrixBytes:(packet.frameMatrices?.size||0)*96,normalSnapshotTriangles:packet.frameNormals?.size||0,normalSnapshotBytes:(packet.frameNormals?.size||0)*48,deformedNormalTriangles:packet.frameNormals?.size||0,deformedNormalBytes:(packet.frameNormals?.size||0)*48,changedAtlasRows:packet.changedRows?.length??null}:null;}
