// Resolve project-local headers only. SDK/system includes belong to the C++
// compiler, while reflected declarations retain their original source paths.
const normalize = value => {
  const result=[];
  for(const part of value.split('/')) {
    if(!part||part==='.')continue;
    if(part==='..'){if(!result.length)throw Error('C++ include 경로 범위 오류');result.pop();}
    else result.push(part);
  }
  return result.join('/');
};
const includes = text => [...text.replace(/\/\*[\s\S]*?\*\//g,'').matchAll(/^\s*#\s*include\s*"([^"\r\n]+)"/gm)].map(match=>match[1]);
const candidates = (from,name) => {
  if(/[\\:\x00-\x1f]/.test(name)||name.startsWith('/'))throw Error('C++ include 경로 오류');
  return [...new Set([from.slice(0,from.lastIndexOf('/')+1)+name,name,'Source/'+name].flatMap(path=>{try{return [normalize(path)];}catch{return [];}}))].filter(path=>path.startsWith('Source/'));
};
export function nativeHeaderClosure(header,{sourcePath='',files=[]}={}) {
  const source=sourcePath||files.find(file=>file.content===header&&/\.(?:h|hpp|hh|inl)$/i.test(file.path))?.path||'';
  const known=new Map(files.map(file=>[file.path,file])),result=[],seen=new Set();
  const visit=(content,path)=>{
    if(seen.has(path))return;seen.add(path);
    for(const name of includes(content)) {
      const dependency=candidates(path,name).map(path=>known.get(path)).find(Boolean);
      if(dependency)visit(dependency.content,dependency.path);
    }
    result.push({path,content});
  };
  visit(header,source);return result;
}
export async function readNativeHeaderFiles(header,{sourcePath='',readText,onCandidate}={}) {
  if(!sourcePath||!readText)return [];
  const files=[],seen=new Set([sourcePath]);let size=header.length;
  const visit=async(content,path)=>{
    for(const name of includes(content)) {
      let dependency;
      for(const candidate of candidates(path,name)) {
        onCandidate?.(candidate);
        if(seen.has(candidate)){dependency=null;break;}
        try{const text=await readText(candidate);if(typeof text==='string'){dependency={path:candidate,content:text};break;}}catch(error){if(error?.nativeDependencyFatal)throw error;/* Another relative candidate, or a compiler-owned include. */}
      }
      if(!dependency)continue;
      seen.add(dependency.path);size+=dependency.content.length;
      if(files.length>=511||dependency.content.length>500000||size>8388608)throw Error('C++ 헤더 의존성 크기 제한');
      files.push(dependency);await visit(dependency.content,dependency.path);
    }
  };
  await visit(header,sourcePath);return files;
}
