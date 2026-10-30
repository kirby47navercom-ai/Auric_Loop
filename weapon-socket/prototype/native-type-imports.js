import {compileNativeTypeAsset,validNativeTypeAsset} from './native-type-assets.js';
import {nativeTypeImports,nativeTypeClosure} from './native-type-graph.js';
import {nativeTypeAssetKind} from './native-type-paths.js';
import {nativeTypeReference,validNative,snapshotNativeMetadata} from './native-model.js';

export async function readNativeTypeDependencies(data,readAsset,{libraries=new Map()}={}){
 const visit=async(value,depth=0)=>{
  if(depth>=16)throw Error('자료형 가져오기 깊이를 확인하세요.');
  for(const path of nativeTypeImports(value)){
   if(libraries.has(path))continue;
   if(libraries.size>=32)throw Error('자료형 의존성은32개까지예요.');
   const dependency=await readAsset(path);if(!validNativeTypeAsset(dependency,nativeTypeAssetKind(path)))throw Error('가져온 자료형 선언을 확인하세요: '+path);
   libraries.set(path,dependency);await visit(dependency,depth+1);
  }
 };
 await visit(data);nativeTypeClosure(data,libraries);return libraries;
}
// A resolver belongs to one prepare/read transaction, never a global cache.
export function nativeTypeImportMetadata(reference,sources){
 if(!nativeTypeReference(reference))throw Error('블루프린트 타입 라이브러리 참조를 확인하세요.');
 const metadata={version:1,classes:[],enums:[],structs:[],typeLibrariesOnly:true,typeLibraries:[...reference.typeLibraries]},ids=new Set(),namespaces=new Set(),seen=new Set();let bytes=0;
 const visit=path=>{
  if(seen.has(path))return;seen.add(path);if(seen.size>32)throw Error('자료형 의존성은32개까지예요.');
  const source=sources.get(path);if(!source)throw Error('타입 라이브러리를 다시 읽어야 해요: '+path);
  if(ids.has(source.id)||namespaces.has(source.namespace))throw Error('타입 라이브러리 ID·namespace가 중복돼요.');ids.add(source.id);namespaces.add(source.namespace);
  bytes+=source.bytes;if(bytes>8388608)throw Error('타입 라이브러리 원본은 합계8MB까지예요.');
  for(const dependency of source.imports||[])visit(dependency);
  metadata.enums.push(...source.metadata.enums||[]);metadata.structs.push(...source.metadata.structs||[]);
 };
 reference.typeLibraries.forEach(visit);
 metadata.typeDependencies=[...seen];
 if(!validNative(metadata))throw Error('합쳐진 타입 선언·기본값의 범위를 확인하세요.');return snapshotNativeMetadata(metadata);
}
export function createNativeTypeImportResolver(readText){
 const files=new Map(),sets=new Map(),sources=new Map();
 const read=async path=>{
  if(!files.has(path))files.set(path,Promise.resolve().then(async()=>{const text=await readText(path);if(typeof text!=='string'||text.length>2097152)throw Error('타입 라이브러리 원본 크기를 확인하세요.');const data=JSON.parse(text);if(!validNativeTypeAsset(data,nativeTypeAssetKind(path)))throw Error('자료형 에셋 종류·선언을 확인하세요: '+path);return {data,bytes:new TextEncoder().encode(text).byteLength};}));
  return files.get(path);
 };
 const resolve=async reference=>{
  if(!nativeTypeReference(reference))throw Error('블루프린트 타입 라이브러리 참조를 확인하세요.');
  if(typeof readText!=='function')throw Error('타입 라이브러리 원본 읽기 경로가 필요해요.');
  const key=JSON.stringify(reference.typeLibraries);if(sets.has(key))return sets.get(key);
  const pending=(async()=>{
   const libraries=new Map();for(const path of reference.typeLibraries){const {data}=await read(path);libraries.set(path,data);await readNativeTypeDependencies(data,async p=>(await read(p)).data,{libraries});}
   for(const [path,data]of libraries){const built=compileNativeTypeAsset(data,{libraries}),{bytes}=await read(path);sources.set(path,{id:data.id,namespace:data.namespace,bytes,imports:nativeTypeImports(data),metadata:{version:1,classes:[],enums:(built.metadata.enums||[]).filter(d=>d.sourcePath===built.path),structs:(built.metadata.structs||[]).filter(d=>d.sourcePath===built.path)}});}
   return nativeTypeImportMetadata(reference,sources);
  })();sets.set(key,pending);return pending;
 };
 resolve.sources=sources;return resolve;
}
