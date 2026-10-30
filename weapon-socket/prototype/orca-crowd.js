// Own implementation of the half-plane construction in van den Berg et al.,
// Reciprocal n-body Collision Avoidance, equations 5–10. No RVO2 source/runtime.
const EPS=1e-8,det=(ax,ay,bx,by)=>ax*by-ay*bx,clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const vector=v=>Array.isArray(v)&&v.length===2&&v.every(n=>Number.isFinite(n)&&Math.abs(n)<=1e12);
const overlap=(a,b)=>a.elevation+a.height>=b.elevation-EPS&&b.elevation+b.height>=a.elevation-EPS;
const distance=(a,b)=>(a.position[0]-b.position[0])**2+(a.position[1]-b.position[1])**2;
const capacity=n=>{let size=1;while(size<n)size*=2;return size;};

class Neighbors {
 constructor(){this.size=0;}
 clear(){this.rows=null;this.order=this.left=this.right=this.minX=this.minY=this.maxX=this.maxY=this.low=this.high=this.minId=this.heap=this.heapDistance=null;this.size=0;}
 build(rows){
  const n=rows.length;this.rows=rows;
  if(n>this.size||n<this.size/4){this.size=capacity(n);for(const key of['order','left','right','minId','heap'])this[key]=new Int32Array(this.size);for(const key of['minX','minY','maxX','maxY','low','high','heapDistance'])this[key]=new Float64Array(this.size);}
  for(let i=0;i<n;i++)this.order[i]=i;const compare=(a,b,axis)=>rows[a].position[axis]-rows[b].position[axis]||a-b;
  const select=(start,end,k,axis)=>{while(end-start>1){const pivot=this.order[(start+end)>>>1];let a=start,b=end-1;while(a<=b){while(compare(this.order[a],pivot,axis)<0)a++;while(compare(this.order[b],pivot,axis)>0)b--;if(a<=b){const value=this.order[a];this.order[a++]=this.order[b];this.order[b--]=value;}}if(k<=b)end=b+1;else if(k>=a)start=a;else return;}};
  const build=(start,end,depth)=>{if(start>=end)return -1;const mid=(start+end)>>>1;select(start,end,mid,depth%2);const row=rows[this.order[mid]],l=this.left[mid]=build(start,mid,depth+1),r=this.right[mid]=build(mid+1,end,depth+1);this.minX[mid]=this.maxX[mid]=row.position[0];this.minY[mid]=this.maxY[mid]=row.position[1];this.low[mid]=row.elevation;this.high[mid]=row.elevation+row.height;this.minId[mid]=this.order[mid];for(const child of[l,r])if(child>=0){this.minX[mid]=Math.min(this.minX[mid],this.minX[child]);this.minY[mid]=Math.min(this.minY[mid],this.minY[child]);this.maxX[mid]=Math.max(this.maxX[mid],this.maxX[child]);this.maxY[mid]=Math.max(this.maxY[mid],this.maxY[child]);this.low[mid]=Math.min(this.low[mid],this.low[child]);this.high[mid]=Math.max(this.high[mid],this.high[child]);this.minId[mid]=Math.min(this.minId[mid],this.minId[child]);}return mid;};
  this.root=build(0,n,0);
 }
 lower(node,p){const x=Math.max(this.minX[node]-p[0],0,p[0]-this.maxX[node]),y=Math.max(this.minY[node]-p[1],0,p[1]-this.maxY[node]);return x*x+y*y;}
 each(row,radiusSquared,lastId,visit){
  const walk=node=>{if(node<0||row.elevation+row.height<this.low[node]-EPS||row.elevation>this.high[node]+EPS)return;const lower=this.lower(node,row.position);if(lower>radiusSquared+EPS||lower===radiusSquared&&this.minId[node]>lastId)return;const id=this.order[node],other=this.rows[id];if(other.id!==row.id&&overlap(row,other)){const d=distance(row,other);if(d<radiusSquared||d===radiusSquared&&id<=lastId)visit(id,d);}walk(this.left[node]);walk(this.right[node]);};walk(this.root);
 }
 nearest(row,limit){
  let count=0;const range=row.neighborDistance**2,worse=(distance,id,d,i)=>distance>d||distance===d&&id>i;
  const add=(id,d)=>{if(count<limit){let at=count++;while(at>0){const parent=(at-1)>>>1;if(!worse(d,id,this.heapDistance[parent],this.heap[parent]))break;this.heap[at]=this.heap[parent];this.heapDistance[at]=this.heapDistance[parent];at=parent;}this.heap[at]=id;this.heapDistance[at]=d;}else if(worse(this.heapDistance[0],this.heap[0],d,id)){let at=0;while(at*2+1<count){let child=at*2+1;if(child+1<count&&worse(this.heapDistance[child+1],this.heap[child+1],this.heapDistance[child],this.heap[child]))child++;if(!worse(this.heapDistance[child],this.heap[child],d,id))break;this.heap[at]=this.heap[child];this.heapDistance[at]=this.heapDistance[child];at=child;}this.heap[at]=id;this.heapDistance[at]=d;}};
  const walk=node=>{if(node<0||row.elevation+row.height<this.low[node]-EPS||row.elevation>this.high[node]+EPS)return;const r=count===limit?Math.min(range,this.heapDistance[0]):range,bound=this.lower(node,row.position);if(bound>r+EPS||count===limit&&bound===r&&this.minId[node]>this.heap[0])return;const id=this.order[node],other=this.rows[id];if(other.id!==row.id&&overlap(row,other)){const d=distance(row,other);if(d<=range)add(id,d);}const l=this.left[node],right=this.right[node],ld=l<0?Infinity:this.lower(l,row.position),rd=right<0?Infinity:this.lower(right,row.position);if(ld<rd){walk(l);walk(right);}else{walk(right);walk(l);}};
  if(limit>0)walk(this.root);return {count,distance:count===limit&&count?this.heapDistance[0]:range,last:count===limit&&count?this.heap[0]:Infinity};
 }
 get bytes(){return this.size*(5*4+7*8);}
}

// Incremental 2D quadratic objective on linear half-planes and a speed disc.
// Lines use point.xy,direction.xy; permitted det(direction, v-point) >= 0.
function onLine(lines,index,speed,px,py,directionOnly,out){
 const at=index*4,x=lines[at],y=lines[at+1],dx=lines[at+2],dy=lines[at+3],dot=x*dx+y*dy,disc=dot*dot+speed*speed-x*x-y*y;if(disc<-EPS)return false;let left=-dot-Math.sqrt(Math.max(0,disc)),right=-dot+Math.sqrt(Math.max(0,disc));
 for(let i=0;i<index;i++){const b=i*4,den=det(dx,dy,lines[b+2],lines[b+3]),num=det(lines[b+2],lines[b+3],x-lines[b],y-lines[b+1]);if(Math.abs(den)<EPS){if(num<-EPS)return false;continue;}const t=num/den;if(den>=0)right=Math.min(right,t);else left=Math.max(left,t);if(left>right+EPS)return false;}
 const t=directionOnly?(px*dx+py*dy>0?right:left):clamp(dx*(px-x)+dy*(py-y),left,right);out[0]=x+dx*t;out[1]=y+dy*t;return true;
}
function optimize(lines,count,speed,px,py,directionOnly,out){
 const length=Math.hypot(px,py),scale=directionOnly?speed:(length>speed?speed/length:1);out[0]=px*scale;out[1]=py*scale;
 for(let i=0;i<count;i++){const at=i*4;if(det(lines[at+2],lines[at+3],lines[at]-out[0],lines[at+1]-out[1])>EPS){const x=out[0],y=out[1];if(!onLine(lines,i,speed,px,py,directionOnly,out)){out[0]=x;out[1]=y;return i;}}}return count;
}
function leastViolation(lines,count,start,speed,projected,out){
 let violation=0;
 for(let i=start;i<count;i++){const at=i*4,di=det(lines[at+2],lines[at+3],lines[at]-out[0],lines[at+1]-out[1]);if(di<=violation+EPS)continue;let used=0;
  for(let j=0;j<i;j++){const b=j*4,den=det(lines[at+2],lines[at+3],lines[b+2],lines[b+3]);let x,y;if(Math.abs(den)<EPS){if(lines[at+2]*lines[b+2]+lines[at+3]*lines[b+3]>0)continue;x=(lines[at]+lines[b])/2;y=(lines[at+1]+lines[b+1])/2;}else{const t=det(lines[b+2],lines[b+3],lines[at]-lines[b],lines[at+1]-lines[b+1])/den;x=lines[at]+t*lines[at+2];y=lines[at+1]+t*lines[at+3];}const dx=lines[b+2]-lines[at+2],dy=lines[b+3]-lines[at+3],length=Math.hypot(dx,dy);if(length<EPS)continue;projected.set([x,y,dx/length,dy/length],used++*4);}
  const oldX=out[0],oldY=out[1];if(optimize(projected,used,speed,-lines[at+3],lines[at+2],true,out)<used){out[0]=oldX;out[1]=oldY;}violation=det(lines[at+2],lines[at+3],lines[at]-out[0],lines[at+1]-out[1]);
 }
}

export class OrcaCrowd {
 constructor(){this.index=new Neighbors();this.count=0;this.scratchSize=0;this.result=new Float64Array(2);}
 release(){this.index.clear();this.cutoffs=this.lastIds=this.counts=this.lines=this.projected=this.neighbors=null;this.scratchSize=0;this.count=0;}
 solve(agents,delta){
  if(!Array.isArray(agents)||!Number.isFinite(delta)||delta<0)throw Error('군중 시간·자료를 확인하세요.');
  const rows=agents.map(a=>({...a,active:a.active??true,height:a.height??1.8,elevation:a.elevation??0,horizon:a.horizon??2,priority:a.priority??50,bias:a.bias??.05,neighborDistance:a.neighborDistance??5,maxNeighbors:a.maxNeighbors??16})).sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);
  if(new Set(rows.map(a=>a.id)).size!==rows.length||rows.some(a=>typeof a.id!=='string'||!a.id||!vector(a.position)||!vector(a.velocity)||!vector(a.preferred)||typeof a.active!=='boolean'||!Number.isFinite(a.radius)||a.radius<0||a.radius>1e9||!Number.isFinite(a.speed)||a.speed<0||a.speed>1e9||!Number.isFinite(a.height)||a.height<=0||!Number.isFinite(a.elevation)||!Number.isFinite(a.horizon)||a.horizon<=0||!Number.isFinite(a.bias)||a.bias<0||a.bias>1||!Number.isInteger(a.priority)||a.priority<0||a.priority>99||!Number.isFinite(a.neighborDistance)||a.neighborDistance<=0||a.neighborDistance>1e12||!Number.isInteger(a.maxNeighbors)||a.maxNeighbors<0))throw Error('군중 위치·속도·크기·회피 설정을 확인하세요.');
  const outputs=new Map();if(!rows.some(a=>a.active)){this.release();return outputs;}if(delta===0){for(const a of rows)if(a.active)outputs.set(a.id,{velocity:[...a.velocity],neighbors:0,infeasible:false});return outputs;}
  this.index.build(rows);const n=rows.length;if(!this.cutoffs||this.cutoffs.length!==this.index.size){this.cutoffs=new Float64Array(this.index.size);this.lastIds=new Float64Array(this.index.size);this.counts=new Int32Array(this.index.size);}let maximum=0;
  for(let i=0;i<n;i++){const a=rows[i];if(!a.active)continue;const found=this.index.nearest(a,a.maxNeighbors?Math.min(a.maxNeighbors,n-1):n-1);this.cutoffs[i]=found.distance;this.lastIds[i]=found.last;this.counts[i]=found.count;maximum=Math.max(maximum,found.count);}
  if(!this.neighbors||maximum>this.scratchSize||maximum<this.scratchSize/4){this.scratchSize=capacity(maximum);this.lines=new Float64Array(this.scratchSize*4);this.projected=new Float64Array(this.scratchSize*4);this.neighbors=new Int32Array(this.scratchSize);}
  this.count=0;for(const a of rows)if(a.active)this.count++;
  for(let i=0;i<n;i++){const a=rows[i];if(!a.active)continue;let count=0;this.index.each(a,this.cutoffs[i],this.lastIds[i],id=>{this.neighbors[count++]=id;});const list=this.neighbors.subarray(0,count);list.sort((x,y)=>distance(a,rows[x])-distance(a,rows[y])||x-y);let lines=0;
   for(const otherId of list){const b=rows[otherId],rx=b.position[0]-a.position[0],ry=b.position[1]-a.position[1],vx=a.velocity[0]-b.velocity[0],vy=a.velocity[1]-b.velocity[1],radius=a.radius+b.radius;if(radius<EPS)continue;const r=radius+1e-5*(1+radius),r2=r*r,d2=rx*rx+ry*ry,inverse=1/Math.max(delta,Math.min(a.horizon,b.horizon));let dx,dy,ux,uy;
    if(d2>r2){const wx=vx-rx*inverse,wy=vy-ry*inverse,w2=wx*wx+wy*wy,dot=wx*rx+wy*ry;if(dot<0&&dot*dot>r2*w2){const length=Math.sqrt(w2),nx=wx/length,ny=wy/length;dx=ny;dy=-nx;ux=(r*inverse-length)*nx;uy=(r*inverse-length)*ny;}else{const leg=Math.sqrt(Math.max(0,d2-r2));if(det(rx,ry,wx,wy)>0){dx=(rx*leg-ry*r)/d2;dy=(rx*r+ry*leg)/d2;}else{dx=-(rx*leg+ry*r)/d2;dy=-(-rx*r+ry*leg)/d2;}const dotVelocity=vx*dx+vy*dy;ux=dotVelocity*dx-vx;uy=dotVelocity*dy-vy;}}
    else{const wx=vx-rx/delta,wy=vy-ry/delta,length=Math.hypot(wx,wy),nx=length>EPS?wx/length:(i<otherId?1:-1),ny=length>EPS?wy/length:0;dx=ny;dy=-nx;ux=(r/delta-length)*nx;uy=(r/delta-length)*ny;}
    const d=distance(a,b),mutual=b.active&&(d<this.cutoffs[otherId]||d===this.cutoffs[otherId]&&i<=this.lastIds[otherId]);let share=1;if(mutual){share=(a.priority+1)/(a.priority+b.priority+2);if(ux*(-dy)+uy*dx<0)share=1-share;}
    const at=lines++*4;this.lines[at]=a.velocity[0]+share*ux;this.lines[at+1]=a.velocity[1]+share*uy;this.lines[at+2]=dx;this.lines[at+3]=dy;
   }
   const length=Math.hypot(...a.preferred),bias=a.bias,px=a.preferred[0]+a.preferred[1]*bias,py=a.preferred[1]-a.preferred[0]*bias,scale=length?length/Math.hypot(px,py):0,fail=optimize(this.lines,lines,a.speed,px*scale,py*scale,false,this.result);if(fail<lines)leastViolation(this.lines,lines,fail,a.speed,this.projected,this.result);
   if(!this.result.every(Number.isFinite)||Math.hypot(...this.result)>a.speed+1e-5)throw Error('회피 속도 계산 범위를 확인하세요.');outputs.set(a.id,{velocity:[this.result[0]||0,this.result[1]||0],neighbors:count,infeasible:fail<lines});
  }
  return outputs;
 }
 inspect(){return{agents:this.count,indexCapacity:this.index.size,scratchCapacity:this.scratchSize,bytes:this.index.bytes+(this.cutoffs?.byteLength||0)+(this.lastIds?.byteLength||0)+(this.counts?.byteLength||0)+(this.lines?.byteLength||0)+(this.projected?.byteLength||0)+(this.neighbors?.byteLength||0)};}
}
