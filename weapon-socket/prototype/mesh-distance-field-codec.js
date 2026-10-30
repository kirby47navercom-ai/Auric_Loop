import {planMeshDistanceFieldLayout} from './mesh-distance-field-layout.js';

export const distanceFieldCookVersion='hb-sdf-1';
export const distanceFieldCookDirectory='__HBGenerated/DistanceFields';
export const distanceFieldCookManifest=distanceFieldCookDirectory+'/index.json';
export const distanceFieldCookMaxBytes=64**3*4+8192;
const vector=v=>Array.isArray(v)&&v.length===3&&v.every(n=>Number.isFinite(n)&&Number.isFinite(Math.fround(n)));
const littleEndian=new Uint8Array(new Uint16Array([1]).buffer)[0]===1;
export async function distanceFieldGeometryHash(vertices){
 if(!(vertices instanceof Float64Array)||!vertices.length||vertices.length%9||!vertices.every(n=>Number.isFinite(Math.fround(n))))throw Error('거리장 쿠킹 원본을 확인하세요.');
 // The input contains expanded triangles, including draw range and index order.
 let bytes;if(littleEndian&&!vertices.some(v=>Object.is(v,-0)))bytes=new Uint8Array(vertices.buffer,vertices.byteOffset,vertices.byteLength);else{bytes=new Uint8Array(vertices.length*8);const view=new DataView(bytes.buffer);for(let i=0;i<vertices.length;i++)view.setFloat64(i*8,Object.is(vertices[i],-0)?0:vertices[i],true);}
 return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');
}
function checkedField(field){
 const analytic=['box','rectangle'].includes(field?.kind),dims=field?.dimensions,cells=analytic?0:dims?.reduce((n,v)=>n*v,1);
 if(field?.version!==1||field.kind!==undefined&&!analytic||!['center','min','max','step'].every(k=>vector(field[k]))||!Array.isArray(dims)||dims.length!==3||dims.some(n=>!Number.isInteger(n)||(analytic?n!==0:n<5||n>64))||!(field.data instanceof Float32Array)||field.data.length!==cells||field.bytes!==cells*4||!field.data.every(Number.isFinite)||typeof field.signed!=='boolean'||!Number.isFinite(field.voxelDiagonal)||!Number.isFinite(field.interpolationErrorBound)||field.interpolationErrorBound<0)throw Error('쿠킹된 거리장 자료가 올바르지 않아요.');
 if(analytic){if(field.resolution!==0||field.signed!==(field.kind==='box')||field.max.some((v,i)=>v<field.min[i])||field.max.filter((v,i)=>v>field.min[i]).length!==(field.kind==='box'?3:2)||field.step.some(v=>v!==0)||field.voxelDiagonal!==0||field.interpolationErrorBound!==0)throw Error('쿠킹된 기본 거리장 경계를 확인하세요.');}
 else{
  const b=field.meshBounds;if(!b||!['min','max','extent'].every(k=>vector(b[k]))||b.extent.some((v,i)=>v<0||Math.abs(v-(b.max[i]-b.min[i]))>Math.max(1,Math.abs(v))*Number.EPSILON*8)||!Number.isInteger(field.resolution)||field.resolution<8||field.resolution>64)throw Error('쿠킹된 거리장 격자를 확인하세요.');
  const grid=planMeshDistanceFieldLayout(b,{resolution:field.resolution,byteBudget:field.bytes});for(const k of ['min','max','dimensions','step'])if(!grid[k].every((v,i)=>v===field[k][i]))throw Error('쿠킹된 거리장 격자와 원본이 달라요.');if(grid.voxelDiagonal!==field.voxelDiagonal||field.interpolationErrorBound!==grid.voxelDiagonal*.5)throw Error('쿠킹된 거리장 오차 경계를 확인하세요.');
 }
 return field;
}
export function encodeDistanceField(field,geometry){
 checkedField(field);if(!/^[a-f0-9]{64}$/.test(geometry))throw Error('거리장 원본 지문 오류');
 const {data,buildMS,requestedResolution,...metadata}=field,text=new TextEncoder().encode(JSON.stringify({format:distanceFieldCookVersion,geometry,field:metadata}));if(text.length>8176)throw Error('거리장 쿠킹 메타데이터가 너무 커요.');
 const offset=(16+text.length+3)&~3,bytes=new Uint8Array(offset+data.byteLength),view=new DataView(bytes.buffer);view.setUint32(0,0x46444248,true);view.setUint32(4,1,true);view.setUint32(8,text.length,true);view.setUint32(12,data.length,true);bytes.set(text,16);for(let i=0;i<data.length;i++)view.setFloat32(offset+i*4,data[i],true);return bytes;
}
export function decodeDistanceField(input,geometry){
 const bytes=input instanceof Uint8Array?input:new Uint8Array(input);if(bytes.byteLength<16||bytes.byteLength>distanceFieldCookMaxBytes)throw Error('거리장 쿠킹 파일 크기 오류');const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),length=view.getUint32(8,true),count=view.getUint32(12,true),offset=(16+length+3)&~3;if(view.getUint32(0,true)!==0x46444248||view.getUint32(4,true)!==1||length>8176||offset+count*4!==bytes.length)throw Error('거리장 쿠킹 파일 헤더 오류');
 const metadata=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes.subarray(16,16+length)));if(metadata.format!==distanceFieldCookVersion||metadata.geometry!==geometry)throw Error('거리장 쿠킹 원본 지문이 달라요.');const data=new Float32Array(count);for(let i=0;i<count;i++)data[i]=view.getFloat32(offset+i*4,true);return checkedField({...metadata.field,data,buildMS:0});
}
export function distanceFieldExpectedResolution(vertices,options){
 const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];for(let i=0;i<vertices.length;i++){const axis=i%3;min[axis]=Math.min(min[axis],vertices[i]);max[axis]=Math.max(max[axis],vertices[i]);}const center=min.map((v,i)=>(v+max[i])*.5),bounds={min:min.map((v,i)=>v-center[i]),max:max.map((v,i)=>v-center[i]),extent:min.map((v,i)=>max[i]-v)};
 return planMeshDistanceFieldLayout(bounds,options).resolution;
}
