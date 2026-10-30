import {isNativeTypeAssetPath} from './native-type-paths.js';

export function nativeTypeImports(data){
 const paths=data?.imports??[];
 if(!Array.isArray(paths)||paths.length>32||new Set(paths).size!==paths.length||paths.some(p=>typeof p!=='string'||p.length>1000||!p.startsWith('Assets/')||!isNativeTypeAssetPath(p)||/[\\:\x00-\x1f]/.test(p)||p.split('/').some(v=>!v||v==='.'||v==='..')))throw Error('자료형 가져오기 경로를 확인하세요.');
 return paths;
}
// Transaction-local only: no background discovery or project-global registry.
export function nativeTypeClosure(data,libraries=new Map()){
 const ordered=[],active=new Set(),seen=new Map(),names=new Map();let bytes=0;
 const visit=(value,depth=0)=>{
  if(depth>=16||active.has(value?.id))throw Error('자료형 가져오기의 순환·16단계 깊이를 확인하세요.');
  if(seen.has(value?.id)){if(seen.get(value.id)!==value)throw Error('자료형 ID가 중복돼요.');return;}
  if(ordered.length>=32||seen.size>=32)throw Error('자료형 의존성은32개까지예요.');
  if(names.has(value?.namespace))throw Error('자료형 namespace가 중복돼요.');
  seen.set(value?.id,value);names.set(value?.namespace,value);active.add(value?.id);
  bytes+=new TextEncoder().encode(JSON.stringify(value)).byteLength;if(bytes>8388608)throw Error('자료형 의존성 원본은 합계8MB까지예요.');
  for(const path of nativeTypeImports(value)){const dependency=libraries.get(path);if(!dependency)throw Error('가져온 자료형을 다시 읽어야 해요: '+path);visit(dependency,depth+1);}
  active.delete(value.id);ordered.push(value);
 };
 visit(data);return ordered;
}
export const nativeTypeDependencyContract=Object.freeze({
 owner:'prototype/native-type-graph.js',field:'imports',reference:'record/enum fields retain durable typeId; imported declarations are selected from the explicit transitive closure.',
 limits:{direct:32,closure:32,depth:16,bytes:8388608},
 validation:'Document patches check local shape; import preparation and atomic save resolve and validate the complete graph, typed defaults, duplicate identities, cycles and generated headers.',
 save:'Dependent authored defaults and C++ headers join the same journal, dryRun plan/CAS, Undo and consumer migration.',
 remaining:['Project-global automatic discovery','Destructive schema changes','Live ABI reload']
});
