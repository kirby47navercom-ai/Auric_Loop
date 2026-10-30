const edgeKey=(a,b)=>a<b?a+':'+b:b+':'+a;
export function meshUVIslands(data){
  const edges=new Map(),adj=Array.from({length:data.indices.length/3},()=>[]);
  for(let f=0;f<adj.length;f++)for(let k=0;k<3;k++){const key=edgeKey(data.indices[f*3+k],data.indices[f*3+(k+1)%3]);if(!edges.has(key))edges.set(key,[]);edges.get(key).push(f);}
  for(const faces of edges.values())if(faces.length===2){adj[faces[0]].push(faces[1]);adj[faces[1]].push(faces[0]);}
  const seen=new Set(),islands=[];for(let f=0;f<adj.length;f++){if(seen.has(f))continue;const queue=[f];seen.add(f);for(let i=0;i<queue.length;i++)for(const next of adj[queue[i]])if(!seen.has(next)){seen.add(next);queue.push(next);}islands.push(queue);}return islands;
}
function stitch(data,faces){
 const selected=new Set(faces),groups=meshUVIslands(data).filter(g=>g.some(f=>selected.has(f))),groupOf=new Map(),sets=groups.map((g,i)=>{for(const f of g)groupOf.set(f,i);return new Set(g);}),parent=groups.map((_,i)=>i),root=i=>{while(parent[i]!==i)i=parent[i];return i;},edges=new Map(),position=id=>data.vertices[id].map(v=>Math.round(v*1e7)).join(':');
 for(const face of groupOf.keys())for(let k=0;k<3;k++){const a=data.indices[face*3+k],b=data.indices[face*3+(k+1)%3],pa=position(a),pb=position(b),key=pa<pb?pa+'|'+pb:pb+'|'+pa;if(!edges.has(key))edges.set(key,[]);edges.get(key).push({face,a:pa<pb?a:b,b:pa<pb?b:a});}
 let joined=0;
 for(const values of edges.values()){
  if(values.length!==2)continue;let [a,b]=values,ar=root(groupOf.get(a.face)),br=root(groupOf.get(b.face));if(ar===br)continue;
  if(ar>br){[a,b]=[b,a];[ar,br]=[br,ar];}
  const ta=data.uvs[a.a],tb=data.uvs[a.b],sa=data.uvs[b.a],sb=data.uvs[b.b],sx=sb[0]-sa[0],sy=sb[1]-sa[1],tx=tb[0]-ta[0],ty=tb[1]-ta[1],den=sx*sx+sy*sy;
  if(den<1e-16||tx*tx+ty*ty<1e-16)throw Error('길이가 없는 UV 경계는 연결할 수 없어요.');
  const re=(tx*sx+ty*sy)/den,im=(ty*sx-tx*sy)/den,source=[...sa],target=[...ta];
  for(const id of chart(data,[...sets[br]]).ids){const x=data.uvs[id][0]-source[0],y=data.uvs[id][1]-source[1];data.uvs[id]=[target[0]+re*x-im*y,target[1]+im*x+re*y];}
  data.uvs[b.a]=[...data.uvs[a.a]];data.uvs[b.b]=[...data.uvs[a.b]];parent[br]=ar;for(const face of sets[br])sets[ar].add(face);joined++;
 }
 if(!joined)throw Error('선택한 섬 사이에 연결 가능한 경계가 없어요.');
}
export function meshUVSelection(data,faces,{wholeIsland=true}={}){const selected=new Set(faces);return wholeIsland?meshUVIslands(data).filter(island=>island.some(f=>selected.has(f))).flat():[...selected];}
function detach(data,faces){const selected=new Set(faces),outside=new Set(),remap=new Map();for(let f=0;f<data.indices.length/3;f++)if(!selected.has(f))for(let k=0;k<3;k++)outside.add(data.indices[f*3+k]);for(const f of selected)for(let k=0;k<3;k++){const i=f*3+k,id=data.indices[i];if(!outside.has(id))continue;if(!remap.has(id)){remap.set(id,data.vertices.length);for(const key of ['vertices','uvs','uvs1','normals','colors'])if(data[key])data[key].push([...data[key][id]]);}data.indices[i]=remap.get(id);}}
function chart(data,faces){const ids=[...new Set(faces.flatMap(f=>data.indices.slice(f*3,f*3+3)))],min=[Infinity,Infinity],max=[-Infinity,-Infinity];for(const id of ids)for(let k=0;k<2;k++){min[k]=Math.min(min[k],data.uvs[id][k]);max[k]=Math.max(max[k],data.uvs[id][k]);}return {ids,min,size:max.map((v,k)=>Math.max(1e-8,v-min[k]))};}
function pack(data,faces,padding){
  if(!Number.isFinite(padding)||padding<0||padding>=.5)throw Error('UV 여백은 0 이상 0.5 미만이에요.');const selected=new Set(faces),charts=meshUVIslands(data).filter(g=>g.some(f=>selected.has(f))).map(g=>chart(data,g));charts.sort((a,b)=>b.size[1]-a.size[1]||b.size[0]-a.size[0]);
  const fit=(scale,save=false)=>{let x=padding,y=padding,row=0;for(const c of charts){const w=c.size[0]*scale,h=c.size[1]*scale;if(w+2*padding>1||h+2*padding>1)return false;if(x+w+padding>1){x=padding;y+=row+padding;row=0;}if(y+h+padding>1)return false;if(save)c.at=[x,y];x+=w+padding;row=Math.max(row,h);}return true;};
  if(!charts.length)return;if(!fit(0))throw Error('UV 섬 수에 비해 여백이 커요.');let low=0,high=1/charts.reduce((m,c)=>Math.max(m,...c.size),1e-8);for(let i=0;i<28;i++){const mid=(low+high)/2;if(fit(mid))low=mid;else high=mid;}fit(low,true);for(const c of charts)for(const id of c.ids)data.uvs[id]=data.uvs[id].map((v,k)=>c.at[k]+(v-c.min[k])*low);
}
export function editMeshUV(data,{operation,faces=[],wholeIsland=true,offset=[0,0],scale=[1,1],rotation=0,padding=.02,channel=0}={}){
  if(![0,1].includes(channel))throw Error('UV 채널은 0 또는 1이에요.');
  if(operation==='uvCopy'){const next=structuredClone(data);next.uvs1=structuredClone(data.uvs);return next;}
  if(operation==='uvRemove'){if(channel!==1)throw Error('기본 UV 채널은 삭제할 수 없어요.');const next=structuredClone(data);delete next.uvs1;return next;}
  if(channel===1){if(!data.uvs1)throw Error('UV 1 채널을 먼저 만드세요.');const next=editMeshUV({...data,uvs:data.uvs1,uvs1:data.uvs},{operation,faces,wholeIsland,offset,scale,rotation,padding,channel:0});return next&&{...next,uvs:next.uvs1,uvs1:next.uvs};}
  if(!['uvCut','uvTransform','uvUnwrap','uvPackIslands','uvStitch'].includes(operation))return null;
  if(!Array.isArray(faces)||faces.some(f=>!Number.isInteger(f)||f<0||f>=data.indices.length/3)||typeof wholeIsland!=='boolean')throw Error('UV 면 선택을 확인하세요.');
  const selected=operation==='uvCut'?[...new Set(faces)]:faces.length?meshUVSelection(data,faces,{wholeIsland}):Array.from({length:data.indices.length/3},(_,i)=>i);if(!selected.length)throw Error('UV 면을 선택하세요.');const next=structuredClone(data);detach(next,selected);
  if(operation==='uvTransform'){if(!Array.isArray(offset)||offset.length!==2||!offset.every(Number.isFinite)||!Array.isArray(scale)||scale.length!==2||!scale.every(v=>Number.isFinite(v)&&Math.abs(v)>1e-8)||!Number.isFinite(rotation))throw Error('UV 이동·크기·회전을 확인하세요.');const c=chart(next,selected),pivot=c.min.map((v,i)=>v+c.size[i]/2),angle=rotation*Math.PI/180,cos=Math.cos(angle),sin=Math.sin(angle);for(const id of c.ids){const x=(next.uvs[id][0]-pivot[0])*scale[0],y=(next.uvs[id][1]-pivot[1])*scale[1];next.uvs[id]=[pivot[0]+x*cos-y*sin+offset[0],pivot[1]+x*sin+y*cos+offset[1]];}}
  if(operation==='uvUnwrap'){const selectedSet=new Set(selected),groups=meshUVIslands(next).filter(g=>g.some(f=>selectedSet.has(f)));for(const group of groups){const n=[0,0,0];for(const f of group){const [a,b,c]=next.indices.slice(f*3,f*3+3).map(i=>next.vertices[i]),u=b.map((v,i)=>v-a[i]),v=c.map((v,i)=>v-a[i]);n[0]+=u[1]*v[2]-u[2]*v[1];n[1]+=u[2]*v[0]-u[0]*v[2];n[2]+=u[0]*v[1]-u[1]*v[0];}const axis=n.reduce((a,v,i)=>Math.abs(v)>Math.abs(n[a])?i:a,0),axes=[0,1,2].filter(i=>i!==axis);for(const id of chart(next,group).ids)next.uvs[id]=axes.map(i=>next.vertices[id][i]);}pack(next,selected,padding);}
  if(operation==='uvStitch')stitch(next,selected);
  if(operation==='uvPackIslands')pack(next,selected,padding);return next;
}
