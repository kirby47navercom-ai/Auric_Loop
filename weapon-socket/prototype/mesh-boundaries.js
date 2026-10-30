export const meshEdgeKey=(a,b)=>a<b?a+':'+b:b+':'+a;
export function directedMeshEdges(data,faces){
 const edges=new Map(),selected=faces?new Set(faces):null;
 for(let f=0;f<data.indices.length/3;f++){if(selected&&!selected.has(f))continue;for(let k=0;k<3;k++){const a=data.indices[f*3+k],b=data.indices[f*3+(k+1)%3],key=meshEdgeKey(a,b),entry=edges.get(key);if(!entry)edges.set(key,{a,b,count:1});else{entry.count++;if(entry.count>2||entry.a===a)entry.invalid=true;}}}
 return edges;
}
export function boundaryPaths(edges){
 const out=new Map(),incoming=new Map();for(const {a,b}of edges){if(a===b||out.has(a)||incoming.has(b))throw Error('갈라진 경계는 연결할 수 없어요.');out.set(a,b);incoming.set(b,a);}
 const seen=new Set(),paths=[];
 const walk=start=>{const ids=[];let at=start;while(!seen.has(at)){seen.add(at);ids.push(at);if(!out.has(at))return {ids,closed:false};at=out.get(at);}if(at!==start)throw Error('경계가 서로 합쳐져 있어요.');return {ids,closed:true};};
 for(const start of out.keys())if(!incoming.has(start))paths.push(walk(start));
 for(const start of out.keys())if(!seen.has(start))paths.push(walk(start));return paths;
}
export function bridgeBoundaries(data,edges,{bridgeOffset=0}={}){
 if(!Array.isArray(edges)||!edges.length||!Number.isSafeInteger(bridgeOffset))throw Error('연결할 두 경계와 시작 오프셋을 확인하세요.');
 const all=directedMeshEdges(data),chosen=new Map();for(const edge of edges){if(!Array.isArray(edge)||edge.length!==2)throw Error('연결할 경계를 확인하세요.');const key=meshEdgeKey(...edge),entry=all.get(key);if(!entry||entry.count!==1)throw Error('열린 면의 경계만 연결할 수 있어요.');chosen.set(key,entry);}
 const paths=boundaryPaths(chosen.values());if(paths.length!==2||paths[0].closed!==paths[1].closed)throw Error('두 열린 경로 또는 두 닫힌 루프를 선택하세요.');
 const closed=paths[0].closed,a=paths[0].ids;let b=paths[1].ids.toReversed();if(a.length<(closed?3:2)||b.length<(closed?3:2))throw Error('경계 정점이 부족해요.');
 const length=(x,y)=>Math.hypot(...data.vertices[x].map((v,k)=>v-data.vertices[y][k]));
 if(closed){let start=0,best=Infinity;for(let i=0;i<b.length;i++){const distance=length(a[0],b[i]);if(distance<best){best=distance;start=i;}}start=((start+bridgeOffset)%b.length+b.length)%b.length;b=b.slice(start).concat(b.slice(0,start));}
 else if(bridgeOffset!==0)throw Error('시작 오프셋은 닫힌 루프에서 사용해요.');
 const fractions=ids=>{const values=[0],n=ids.length-(closed?0:1);for(let i=0;i<n;i++){const segment=length(ids[i],ids[(i+1)%ids.length]);if(segment<1e-10)throw Error('길이가 없는 경계를 먼저 정리하세요.');values.push(values.at(-1)+segment);}const total=values.at(-1);return values.map(v=>v/total);};
 const fa=fractions(a),fb=fractions(b),na=fa.length-1,nb=fb.length-1,triangles=[];let i=0,j=0;
 const triangle=(x,y,z)=>{const p=data.vertices[x],u=data.vertices[y].map((v,k)=>v-p[k]),v=data.vertices[z].map((v,k)=>v-p[k]);if(Math.hypot(u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0])<1e-12)throw Error('연결 면이 퇴화해요. 경계나 시작 오프셋을 조절하세요.');triangles.push(x,y,z);};
 while(i<na||j<nb){const x=a[i%a.length],z=b[j%b.length],advanceA=i<na&&(j===nb||fa[i+1]<=fb[j+1]+1e-12),advanceB=j<nb&&(i===na||fb[j+1]<=fa[i+1]+1e-12);if(advanceA&&advanceB){const y=a[(i+1)%a.length],w=b[(j+1)%b.length];triangle(y,x,z);triangle(y,z,w);i++;j++;}else if(advanceA){triangle(a[(i+1)%a.length],x,z);i++;}else{triangle(x,z,b[(j+1)%b.length]);j++;}}
 const result=structuredClone(data);for(const id of triangles)result.indices.push(id);delete result.normals;return result;
}
