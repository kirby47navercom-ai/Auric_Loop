import {buildGeometryBVH} from './geometry-bvh-core.js';

export const probeSpatialRecordTexels=3;
const fields=[4,5,6,8,9,10,12,13,14,15,16,17,18,19,20,21,22,23];
const maximum=3.4028234663852886e38,gamma=64*2**-24/(1-64*2**-24),word=new Float32Array(1),bits=new Uint32Array(word.buffer);
function outward(value,lower){
 if(!Number.isFinite(value)||Math.abs(value)>=maximum)return lower?-maximum:maximum;
 word[0]=value;if(word[0]===0)return lower?-(2**-149):2**-149;
 bits[0]+=lower===(word[0]>0)?-1:1;return Number.isFinite(word[0])?word[0]:lower?-maximum:maximum;
}

// Invert the exact rounded shader rows. Bound dot-product roundoff through
// ||A^-1|| * gamma * (||A||*||x||+||t||); ill-conditioned boxes never prune.
export function probeSpatialBounds(lo,hi,x,y,z){
 const a=x[0],b=x[1],c=x[2],d=y[0],e=y[1],f=y[2],g=z[0],h=z[1],i=z[2],det=a*(e*i-f*h)-b*(d*i-f*g)+c*(d*h-e*g);
 const fallback=()=>({min:[-maximum,-maximum,-maximum],max:[maximum,maximum,maximum]});
 if(!Number.isFinite(det)||det===0)return fallback();
 const inverse=[[e*i-f*h,c*h-b*i,b*f-c*e],[f*g-d*i,a*i-c*g,c*d-a*f],[d*h-e*g,b*g-a*h,a*e-b*d]].map(row=>row.map(v=>v/det));
 const norm=rows=>Math.max(...rows.map(row=>row.reduce((sum,v)=>sum+Math.abs(v),0))),normA=norm([x.slice(0,3),y.slice(0,3),z.slice(0,3)]),normInverse=norm(inverse),translation=[x[3],y[3],z[3]],normT=Math.max(...translation.map(Math.abs)),condition=normA*normInverse*gamma;
 if(!Number.isFinite(condition)||condition>=.25)return fallback();
 const magnitude=normInverse*(Math.max(...lo.map(Math.abs),...hi.map(Math.abs))+normT)*(1+gamma)/(1-condition),padding=2*normInverse*gamma*(normA*magnitude+normT+1);
 if(!Number.isFinite(padding)||!Number.isFinite(magnitude))return fallback();
 const minimum=[Infinity,Infinity,Infinity],upper=[-Infinity,-Infinity,-Infinity];
 for(let corner=0;corner<8;corner++){const q=lo.map((v,k)=>(corner&(1<<k)?hi[k]:v)-translation[k]);for(let k=0;k<3;k++){const v=inverse[k].reduce((sum,n,j)=>sum+n*q[j],0);minimum[k]=Math.min(minimum[k],v);upper[k]=Math.max(upper[k],v);}}
 return{min:minimum.map(v=>outward(v-padding,true)),max:upper.map(v=>outward(v+padding,false))};
}

export class ProbeSpatialIndex{
 constructor(){this.stamp=new Float32Array();this.data=new Float32Array();this.builds=0;this.count=0;}
 update(records,count,{recordTexels=9}={}){
  if(!Number.isSafeInteger(recordTexels)||recordTexels<6)throw Error('반사 레코드 크기를 확인하세요.');const stride=recordTexels*4;
  if(!Number.isSafeInteger(count)||count<0||records.length<count*stride)throw Error('반사 공간 자료의 길이를 확인하세요.');
  let changed=this.count!==count||this.stamp.length!==count*fields.length;
  if(!changed)for(let i=0;i<count&&!changed;i++)for(let k=0;k<fields.length;k++)if(!Object.is(this.stamp[i*fields.length+k],records[i*stride+fields[k]])){changed=true;break;}
  if(!changed)return false;
  const stamp=new Float32Array(count*fields.length),items=[];
  for(let index=0;index<count;index++){
   for(let k=0;k<fields.length;k++)stamp[index*fields.length+k]=records[index*stride+fields[k]];
   const at=index*stride,part=n=>Array.from(records.subarray(at+n*4,at+n*4+4)),bounds=probeSpatialBounds(part(1).slice(0,3),part(2).slice(0,3),part(3),part(4),part(5));
   items.push({index,points:[bounds.min,bounds.max],center:bounds.min.map((v,k)=>v*.5+bounds.max[k]*.5)});
  }
  const tree=buildGeometryBVH(items,1),ranks=new Uint32Array(tree.nodes.length),data=new Float32Array(tree.nodes.length*12);
  for(let n=tree.nodes.length-1;n>=0;n--){const node=tree.nodes[n],leaf=node.count?tree.triangles[node.start].index+1:0,rank=leaf?leaf-1:Math.min(ranks[n+1],ranks[tree.nodes[n+1].skip]);ranks[n]=rank;data.set([...node.min,node.skip%65536,...node.max,Math.floor(node.skip/65536),leaf%65536,Math.floor(leaf/65536),rank%65536,Math.floor(rank/65536)],n*12);}
  this.stamp=stamp;this.data=data;this.count=count;this.builds++;return true;
 }
 info(){return{nodes:this.data.length/12,builds:this.builds,gpuBytes:this.data.byteLength,retainedCPUBytes:this.data.byteLength+this.stamp.byteLength,selection:'spatial BVH; retain two lowest original ranks; conservative rounded affine bounds; 16-bit index words'};}
}

// Renderer-local broad phase. Exact affine/SAT tests and the public ordering
// remain in reflection-probes.js; this only removes impossible candidates.
export class ProbeCandidateIndex{
 constructor(){this.ranked=[];this.ids=[];this.stamp=new Float64Array();this.tree={nodes:[],triangles:[]};this.builds=0;this.queries=0;this.visits=0;}
 update(probes){
  const ranked=[...probes].sort((a,b)=>b.p.importance-a.p.importance||a.volume-b.volume||a.id.localeCompare(b.id));let changed=this.ids.length!==ranked.length;
  for(let i=0;i<ranked.length&&!changed;i++){const p=ranked[i];if(this.ids[i]!==p.id){changed=true;break;}for(let k=0;k<3;k++)if(!Object.is(this.stamp[i*6+k],p.minimum[k])||!Object.is(this.stamp[i*6+3+k],p.maximum[k])){changed=true;break;}}
  this.ranked=ranked;this.queries=this.visits=0;if(!changed)return false;
  this.ids=ranked.map(p=>p.id);this.stamp=new Float64Array(ranked.length*6);const items=ranked.map((p,index)=>{this.stamp.set([...p.minimum,...p.maximum],index*6);return{index,points:[p.minimum,p.maximum],center:p.minimum.map((v,k)=>v*.5+p.maximum[k]*.5)};});this.tree=buildGeometryBVH(items,1);this.builds++;return true;
 }
 candidates(point,bounds){
  this.queries++;if(!point&&!bounds)return this.ranked;const lower=bounds?[bounds.min.x,bounds.min.y,bounds.min.z]:point,upper=bounds?[bounds.max.x,bounds.max.y,bounds.max.z]:point,result=[];
  for(let cursor=0;cursor<this.tree.nodes.length;){const n=this.tree.nodes[cursor];this.visits++;if(lower.some((v,k)=>v>n.max[k]||upper[k]<n.min[k])){cursor=n.skip;continue;}if(n.count)result.push(this.tree.triangles[n.start].index);cursor++;}return result.sort((a,b)=>a-b).map(i=>this.ranked[i]);
 }
 info(){return{nodes:this.tree.nodes.length,builds:this.builds,queries:this.queries,visitedNodes:this.visits,stampBytes:this.stamp.byteLength,scope:'CPU broad phase only; exact affine checks follow; counters reset at each binding update'};}
}
