import {takeSpawnFilter} from './take-spawn-filter.js';
export const takePresetChoices=[['default','기본'],['transform','트랜스폼'],['character','캐릭터'],['gameplay','게임플레이'],['cinematic','시네마틱'],['custom','사용자 설정']];
export const takePropertyChoices=[['position','위치'],['rotation','회전'],['scale','크기'],['visible','표시']];
export const takeFlagChoices=[['includeComponents','컴포넌트 속성'],['includeStructure','컴포넌트 구성'],['includeHierarchy','부모 연결'],['includeSkeleton','골격'],['includeVariables','변수·C++'],['includeSpawned','새 오브젝트 생성·삭제'],['includeLifetime','기존 대상 수명·표시 복제'],['includeAudio','소리']];
const flags=takeFlagChoices.map(([key])=>key),properties=takePropertyChoices.map(([key])=>key);
const presets={default:{},transform:{includeComponents:false},character:{includeComponents:false,includeHierarchy:true,includeSkeleton:true},gameplay:{includeHierarchy:true,includeVariables:true,includeSpawned:true},cinematic:{...Object.fromEntries(flags.map(key=>[key,true])),includeLifetime:false},custom:{}};
export function resolveTakeSettings(value={}, {plane='xyz'}={}){
 if(!value||Array.isArray(value)||typeof value!=='object')throw Error('녹화 설정을 확인하세요.');if(value.version!==undefined&&value.version!==1)throw Error('녹화 설정 버전을 확인하세요.');if(value.spawnFilter!==undefined&&(!value.spawnFilter||Array.isArray(value.spawnFilter)||typeof value.spawnFilter!=='object'))throw Error('생성 녹화 필터를 확인하세요.');const preset=value.preset??'default';if(!Object.hasOwn(presets,preset))throw Error('녹화 프리셋을 확인하세요.');
 const result={version:1,preset,properties:[...properties],includeComponents:true,...Object.fromEntries(flags.slice(1).map(k=>[k,false])),boneNames:[],...presets[preset]};
 for(const key of [...flags,'properties','boneNames'])if(value[key]!==undefined)result[key]=value[key];
 if(!flags.every(k=>typeof result[k]==='boolean')||!Array.isArray(result.properties)||new Set(result.properties).size!==result.properties.length||!result.properties.every(p=>properties.includes(p))||!Array.isArray(result.boneNames)||result.boneNames.length>2048||new Set(result.boneNames).size!==result.boneNames.length||result.boneNames.some(v=>typeof v!=='string'||!v||v.length>160))throw Error('녹화 채널과 뼈 필터를 확인하세요.');
 result.properties=[...result.properties];result.boneNames=[...result.boneNames];result.spawnFilter=takeSpawnFilter({plane,...value.spawnFilter});return result;
}
export function validTakeSettings(value){try{return value?.version===1&&Object.keys(value).every(k=>['version','preset','properties','boneNames','spawnFilter',...flags].includes(k))&&!!resolveTakeSettings(value);}catch{return false;}}
