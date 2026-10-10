const finite=v=>Number.isFinite(v)&&Math.abs(v)<=100000;
const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
const tau=Math.PI*2,epsilon=1e-9;
export const animationBlendModes=['cartesian','directional','freeformDirectional'];
export const animationAxisSmoothing=['linear','exponential'];
export const animationBlendNotifyModes=['all','highest','none'];
export const defaultAnimationAxis=name=>({name,min:-1,max:1,divisions:8,snap:false,wrap:false,smoothing:0,smoothingType:'linear'});
export function validAnimationBlendSpace(p,parameters){
  if(!animationBlendModes.includes(p.mode)||parameters.get(p.parameterX)!=='float'||parameters.get(p.parameterY)!=='float'||p.parameterX===p.parameterY)return false;
  for(const key of ['x','y']){const a=p.axes?.[key];if(!a||typeof a.name!=='string'||!a.name||a.name.length>80||!finite(a.min)||!finite(a.max)||a.max-a.min<1e-6||!Number.isInteger(a.divisions)||a.divisions<1||a.divisions>64||typeof a.snap!=='boolean'||typeof a.wrap!=='boolean'||!finite(a.smoothing)||a.smoothing<0||a.smoothing>60||!animationAxisSmoothing.includes(a.smoothingType))return false;}
  if(p.samples.some(s=>!finite(s.x)||!finite(s.y)||s.x<p.axes.x.min||s.x>p.axes.x.max||s.y<p.axes.y.min||s.y>p.axes.y.max))return false;
  const points=p.samples;
  if(points.some((s,i)=>points.slice(i+1).some(t=>Math.hypot((s.x-t.x)/(p.axes.x.max-p.axes.x.min),(s.y-t.y)/(p.axes.y.max-p.axes.y.min))<1e-8)))return false;
  if(p.mode==='freeformDirectional'&&!points.some(s=>s.x===0&&s.y===0))return false;
  if(p.mode==='directional'&&points.some((s,i)=>Math.hypot(s.x,s.y)>0&&points.slice(i+1).some(t=>s.x*t.x+s.y*t.y>0&&Math.abs(s.x*t.y-s.y*t.x)<1e-8*Math.hypot(s.x,s.y)*Math.hypot(t.x,t.y))))return false;
  return true;
}
export function animationAxisValue(value,axis){const size=axis.max-axis.min;return axis.wrap?axis.min+((value-axis.min)%size+size)%size:clamp(value,axis.min,axis.max);}
export function snapAnimationSample(value,axis){const size=axis.max-axis.min;return clamp(axis.snap?axis.min+Math.round((value-axis.min)*axis.divisions/size)*size/axis.divisions:value,axis.min,axis.max);}
const cross=(a,b,c)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
function circle(a,b,c){const d=2*cross(a,b,c);if(Math.abs(d)<1e-12)return null;const ab={x:b.x-a.x,y:b.y-a.y},ac={x:c.x-a.x,y:c.y-a.y},bb=ab.x*ab.x+ab.y*ab.y,cc=ac.x*ac.x+ac.y*ac.y,x=(ac.y*bb-ab.y*cc)/d,y=(ab.x*cc-ac.x*bb)/d;return {x:a.x+x,y:a.y+y,r:x*x+y*y};}
function triangulate(points){
  const count=points.length,all=[...points,{x:-10,y:-10},{x:10,y:-10},{x:0,y:10}],triangle=(a,b,c)=>({ids:[a,b,c],circle:circle(all[a],all[b],all[c])});let triangles=[triangle(count,count+1,count+2)];
  for(let i=0;i<count;i++){const p=points[i],edges=new Map(),kept=[];for(const t of triangles){const c=t.circle;if(c&&(p.x-c.x)**2+(p.y-c.y)**2<=c.r+1e-12){for(let j=0;j<3;j++){const a=t.ids[j],b=t.ids[(j+1)%3],key=Math.min(a,b)+':'+Math.max(a,b);if(edges.has(key))edges.delete(key);else edges.set(key,[a,b]);}}else kept.push(t);}for(const [a,b] of edges.values()){const t=triangle(a,b,i);if(t.circle)kept.push(t);}triangles=kept;}
  return triangles.filter(t=>t.ids.every(i=>i<count)).map(t=>t.ids);
}
function hull(points){const sorted=points.map((p,i)=>({...p,i})).sort((a,b)=>a.x-b.x||a.y-b.y),part=values=>{const result=[];for(const p of values){while(result.length>1&&cross(result.at(-2),result.at(-1),p)<=1e-12)result.pop();result.push(p);}return result;};return [...part(sorted).slice(0,-1),...part([...sorted].reverse()).slice(0,-1)].map(p=>p.i);}
// Geometry is compiled once; each context reuses a 64-or-fewer sample weight buffer.
export class AnimationBlendSpace {
  constructor(properties){this.p=properties;this.points=properties.samples.map(s=>({x:(s.x-properties.axes.x.min)/(properties.axes.x.max-properties.axes.x.min),y:(s.y-properties.axes.y.min)/(properties.axes.y.max-properties.axes.y.min)}));this.triangles=properties.mode==='cartesian'?triangulate(this.points):[];const boundary=hull(this.points),sorted=this.points.map((p,i)=>({...p,i})).sort((a,b)=>a.x-b.x||a.y-b.y);this.edges=this.triangles.length?boundary.map((i,k)=>[i,boundary[(k+1)%boundary.length]]):sorted.slice(1).map((p,k)=>[sorted[k].i,p.i]);this.origin=properties.samples.findIndex(s=>s.x===0&&s.y===0);this.directions=[];
    for(let i=0;i<properties.samples.length;i++){const s=properties.samples[i],radius=Math.hypot(s.x,s.y);if(!radius)continue;const angle=(Math.atan2(s.y,s.x)+tau)%tau;let group=this.directions.find(g=>Math.abs(Math.sin(angle-g.angle))<1e-8&&Math.cos(angle-g.angle)>0);if(!group){group={angle,samples:[]};this.directions.push(group);}group.samples.push({i,radius});}this.directions.sort((a,b)=>a.angle-b.angle);for(const g of this.directions)g.samples.sort((a,b)=>a.radius-b.radius);
  }
  sample(x,y,out){out.fill(0);const p=this.p,xn=(x-p.axes.x.min)/(p.axes.x.max-p.axes.x.min),yn=(y-p.axes.y.min)/(p.axes.y.max-p.axes.y.min),point={x:xn,y:yn};
    for(let i=0;i<this.points.length;i++)if(Math.hypot(xn-this.points[i].x,yn-this.points[i].y)<1e-12){out[i]=1;return out;}
    if(p.mode!=='cartesian')return this.directional(x,y,out);
    for(const ids of this.triangles){const [a,b,c]=ids.map(i=>this.points[i]),area=cross(a,b,c),wa=cross(b,c,point)/area,wb=cross(c,a,point)/area,wc=1-wa-wb;if(Math.min(wa,wb,wc)>=-epsilon){const values=[Math.max(0,wa),Math.max(0,wb),Math.max(0,wc)],sum=values.reduce((a,b)=>a+b,0);ids.forEach((id,i)=>out[id]=values[i]/sum);return out;}}
    let best=Infinity,edge,weight=0;for(const [i,j] of this.edges){const a=this.points[i],b=this.points[j],dx=b.x-a.x,dy=b.y-a.y,t=clamp(((xn-a.x)*dx+(yn-a.y)*dy)/(dx*dx+dy*dy),0,1),distance=(xn-a.x-dx*t)**2+(yn-a.y-dy*t)**2;if(distance<best){best=distance;edge=[i,j];weight=t;}}if(edge){out[edge[0]]=1-weight;out[edge[1]]=weight;}else out[0]=1;return out;
  }
  directional(x,y,out){const radius=Math.hypot(x,y),angle=(Math.atan2(y,x)+tau)%tau,groups=this.directions;if(!groups.length){out[this.origin]=1;return out;}if(!radius){if(this.origin>=0)out[this.origin]=1;else for(const g of groups)out[g.samples[0].i]=1/groups.length;return out;}
    const radial=(g,weight)=>{const s=g.samples;let hi=s.findIndex(s=>s.radius>=radius);if(hi<0){out[s.at(-1).i]+=weight;return;}if(hi===0){const w=this.origin<0?1:clamp(radius/s[0].radius,0,1);out[s[0].i]+=weight*w;if(this.origin>=0)out[this.origin]+=weight*(1-w);return;}const lo=s[hi-1],t=(radius-lo.radius)/(s[hi].radius-lo.radius);out[lo.i]+=weight*(1-t);out[s[hi].i]+=weight*t;};
    if(groups.length===1){radial(groups[0],1);return out;}let hi=groups.findIndex(g=>g.angle>=angle);if(hi<0)hi=0;const lo=(hi+groups.length-1)%groups.length,span=(groups[hi].angle-groups[lo].angle+tau)%tau,t=((angle-groups[lo].angle+tau)%tau)/span;radial(groups[lo],1-t);radial(groups[hi],t);return out;
  }
}
export function makeAnimationBlendContext(program){return {program,weights:new Float64Array(program.p.samples.length),axes:[],input:[0,0],value:[0,0],frame:-1};}
export function updateAnimationBlendContext(state,parameters,delta,frame){if(state.frame===frame)return state;const p=state.program.p;for(const [i,key,name] of [[0,'x',p.parameterX],[1,'y',p.parameterY]]){const a=p.axes[key],target=animationAxisValue(parameters.get(name),a),size=a.max-a.min;let s=state.axes[i];if(!s)state.axes[i]=s={value:target,from:target,target,time:0};state.input[i]=target;if(target!==s.target){s.from=s.value;s.target=target;s.time=0;}s.time+=delta;let difference=target-s.value;if(a.wrap)difference=((difference+size/2)%size+size)%size-size/2;if(!a.smoothing)s.value=target;else if(a.smoothingType==='exponential')s.value=animationAxisValue(s.value+difference*(1-Math.exp(-delta/a.smoothing)),a);else{let distance=target-s.from;if(a.wrap)distance=((distance+size/2)%size+size)%size-size/2;s.value=animationAxisValue(s.from+distance*Math.min(1,s.time/a.smoothing),a);}state.value[i]=s.value;}state.program.sample(...state.value,state.weights);state.frame=frame;return state;}
