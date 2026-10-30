export function nativeEntryPaths(entry={}){
 const {headerPath,sourcePath}=entry;
 if(headerPath===undefined&&sourcePath===undefined)return {};
 const valid=(value,extension)=>typeof value==='string'&&/^Source\//.test(value)&&value.length<=2000&&extension.test(value)&&!/[\\:\x00-\x1f]/.test(value)&&!value.split('/').some(p=>!p||p==='.'||p==='..');
 if(!valid(headerPath,/\.(?:h|hpp|hh)$/i)||!valid(sourcePath,/\.(?:cpp|cc|cxx)$/i))throw Error('C++ 진입 헤더·구현 파일 경로를 확인하세요.');
 return {headerPath,sourcePath};
}
export function nativeModuleKey(header,source,entry={}){
 const paths=nativeEntryPaths(entry);return JSON.stringify(paths.headerPath?[header,source,paths.headerPath.toLowerCase(),paths.sourcePath.toLowerCase()]:[header,source]);
}
