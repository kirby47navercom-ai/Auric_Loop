import {Vector3} from 'three';
import {parseGameJson} from './game-json.js';
import {enabledComponent} from './scene-components.js';
import {sceneWorldMatrix} from './scene-runtime.js';

const number=(v,min,max)=>Number.isFinite(v)&&v>=min&&v<=max;
const vector=v=>Array.isArray(v)&&v.length===3&&v.every(x=>number(x,-1000000,1000000));
export function projectilePattern(value){
  const p={mode:'aim',count:1,speed:8,lifetime:5,radius:.08,size:.16,angle:0,spread:90,plane:'XY',damage:1,color:[1,1,1,1],texture:'',targets:[],targetTags:[],...value};
  if(!['aim','circle','fan'].includes(p.mode)||!vector(p.origin)||!vector(p.direction||[1,0,0])||p.target!==undefined&&!vector(p.target)||!Number.isInteger(p.count)||!number(p.count,1,4096)||!number(p.speed,0,10000)||!number(p.lifetime,.001,3600)||!number(p.radius,.001,100)||!number(p.size,.001,1000)||!number(p.angle,-360000,360000)||!number(p.spread,0,360)||!number(p.damage,0,1000000)||!['XY','XZ'].includes(p.plane)||!Array.isArray(p.color)||p.color.length!==4||!p.color.every(v=>number(v,0,1))||typeof p.texture!=='string'||p.texture.length>1000||p.texture&&!/^Assets\//.test(p.texture)||/[\\:\x00-\x1f]/.test(p.texture)||p.texture.split('/').some(v=>v==='.'||v==='..')||![p.targets,p.targetTags].every(values=>Array.isArray(values)&&values.length<=512&&values.every(v=>typeof v==='string'&&v.length>0&&v.length<=200)))throw Error('투사체 패턴 값을 확인하세요.');
  return p;
}
const worldSweep=(ax,ay,az,values,offset,c,r)=>{const x=values[offset]-ax,y=values[offset+1]-ay,z=c.dimensions===2?0:values[offset+2]-az,cx=c.center[0]-ax,cy=c.center[1]-ay,cz=c.dimensions===2?0:c.center[2]-az,t=Math.max(0,Math.min(1,(cx*x+cy*y+cz*z)/(x*x+y*y+z*z||1)));return (x*t-cx)**2+(y*t-cy)**2+(z*t-cz)**2<=(c.bound+r)**2;};
const pointOnSegment=(a,b,p)=>{const d=b.map((v,i)=>v-a[i]),t=Math.max(0,Math.min(1,d.reduce((n,v,i)=>n+(p[i]-a[i])*v,0)/(d.reduce((n,v)=>n+v*v,0)||1)));return a.reduce((n,v,i)=>n+(v+d[i]*t-p[i])**2,0);};
const segmentBox=(a,b,extent,r,dimensions)=>{let enter=0,exit=1;for(let axis=0;axis<dimensions;axis++){const e=extent[axis]+r,d=b[axis]-a[axis];if(Math.abs(d)<1e-12){if(Math.abs(a[axis])>e)return false;}else{const first=(-e-a[axis])/d,last=(e-a[axis])/d;enter=Math.max(enter,Math.min(first,last));exit=Math.min(exit,Math.max(first,last));if(enter>exit)return false;}}return true;};
// Capsule axis is local Y; distance between the swept shot and the capsule axis.
const segmentCapsule=(a,b,half,r,dimensions)=>{const length=half*2,d=b.map((v,i)=>v-a[i]),aa=d.slice(0,dimensions).reduce((n,v)=>n+v*v,0),bb=d[1]*length,cc=length*length,dd=d.slice(0,dimensions).reduce((n,v,i)=>n+v*(a[i]+(i===1?half:0)),0),ee=(a[1]+half)*length;let shot=aa?Math.max(0,Math.min(1,(bb*ee-cc*dd)/(aa*cc-bb*bb||1))):0,axis=cc?Math.max(0,Math.min(1,(bb*shot+ee)/cc)):0;shot=aa?Math.max(0,Math.min(1,(bb*axis-dd)/aa)):0;axis=cc?Math.max(0,Math.min(1,(bb*shot+ee)/cc)):0;return a.slice(0,dimensions).reduce((n,v,i)=>n+(v+d[i]*shot-(i===1?-half+length*axis:0))**2,0)<=r*r;};

// Active shots use packed arrays. Removing a shot swaps the last live element.
export class ProjectileWorld {
  constructor({capacity=8192,render=()=>{},dispose=()=>{}}={}){
    if(!Number.isInteger(capacity)||capacity<1||capacity>32768)throw Error('투사체 용량 범위');
    this.capacity=capacity;this.count=0;this.serial=0;this.time=0;this.render=render;this.disposeRender=dispose;this.hits=[];this.batches=new Map();this.styles=new Map();this.position=new Float32Array(capacity*3);this.velocity=new Float32Array(capacity*3);this.life=new Float32Array(capacity);this.ids=new Float64Array(capacity);this.batch=new Uint32Array(capacity);this.style=new Uint16Array(capacity);this.radius=new Float32Array(capacity);
  }
  fire(value,owner){
    const p=projectilePattern(value);if(this.count+p.count>this.capacity)throw Error('투사체 용량 초과: '+this.capacity);
    if(this.batches.size>=1024)throw Error('활성 투사체 패턴 1024개 제한');
    const key=JSON.stringify([p.texture,p.color,p.size,p.plane]);let style=this.styles.get(key);if(!style){if(this.styles.size>=64)throw Error('투사체 렌더 스타일 64개 제한');const used=new Set([...this.styles.values()].map(v=>v.id));let styleId=1;while(used.has(styleId))styleId++;style={id:styleId,texture:p.texture,color:p.color,size:p.size,plane:p.plane};this.styles.set(key,style);}
    const id=++this.serial,handle=p.handle||'projectiles_'+id;if(typeof handle!=='string'||handle.length>160||this.batches.size&&[...this.batches.values()].some(batch=>batch.handle===handle))throw Error('투사체 핸들 중복·범위');this.batches.set(id,{id,handle,owner,pattern:p,count:p.count,style:style.id});
    const axis=p.plane==='XY'?1:2,direction=p.target?p.target.map((v,i)=>v-p.origin[i]):p.direction||[1,0,0],aim=Math.atan2(direction[axis],direction[0]);
    for(let n=0;n<p.count;n++){const at=this.count++,offset=at*3,angle=(p.mode==='circle'?n*Math.PI*2/p.count:p.mode==='fan'?aim+(p.count===1?0:(n/(p.count-1)-.5)*p.spread*Math.PI/180):aim)+p.angle*Math.PI/180;this.position.set(p.origin,offset);this.velocity.fill(0,offset,offset+3);this.velocity[offset]=Math.cos(angle)*p.speed;this.velocity[offset+axis]=Math.sin(angle)*p.speed;this.life[at]=p.lifetime;this.ids[at]=++this.serial;this.batch[at]=id;this.style[at]=style.id;this.radius[at]=p.radius;}
    this.draw();return handle;
  }
  remove(at){const batch=this.batches.get(this.batch[at]);if(batch&&!--batch.count)this.batches.delete(batch.id);const last=--this.count;if(at===last)return;for(const values of [this.life,this.ids,this.batch,this.style,this.radius])values[at]=values[last];for(const values of [this.position,this.velocity])values.copyWithin(at*3,last*3,last*3+3);}
  pruneStyles(){const used=new Set([...this.batches.values()].map(batch=>batch.style));for(const [key,style] of this.styles)if(!used.has(style.id))this.styles.delete(key);}
  clear(owner){for(let n=this.count-1;n>=0;n--)if(owner===undefined||this.batches.get(this.batch[n])?.owner===owner)this.remove(n);this.hits=this.hits.filter(hit=>owner!==undefined&&hit.owner!==owner);this.pruneStyles();this.draw();}
  advance(delta,objects){
    if(!number(delta,0,1))throw Error('투사체 프레임 시간 범위');this.time+=delta;
    const wanted=new Set(),wantedTags=new Set();for(const batch of this.batches.values()){for(const id of batch.pattern.targets)wanted.add(id);for(const tag of batch.pattern.targetTags)wantedTags.add(tag);}const colliders=[];for(const object of objects){if(object.visible===false||object.poolActive===false||object.collisionEnabled===false||!wanted.has(object.id)&&!object.tags?.some(tag=>wantedTags.has(tag)))continue;const entry=['CircleCollider2D','BoxCollider2D','CapsuleCollider2D','SphereCollider','BoxCollider','CapsuleCollider'].map(type=>({type,p:enabledComponent(object,type)})).find(c=>c.p&&!['none','physics'].includes(c.p.collisionMode));if(!entry)continue;const matrix=sceneWorldMatrix(object,objects),e=matrix.elements,scale=Math.min(Math.hypot(e[0],e[1],e[2]),Math.hypot(e[4],e[5],e[6]),Math.hypot(e[8],e[9],e[10]));if(scale<1e-8)continue;const dimensions=entry.type.endsWith('2D')?2:3,maxScale=Math.max(Math.hypot(e[0],e[1],e[2]),Math.hypot(e[4],e[5],e[6]),Math.hypot(e[8],e[9],e[10])),localCenter=entry.p.center||[0,0,0],center=new Vector3(...localCenter).applyMatrix4(matrix).toArray(),extent=entry.p.extent||[.5,.5,.5],bound=(entry.type.includes('Box')?Math.hypot(...extent.slice(0,dimensions)):entry.type.includes('Capsule')?entry.p.height/2+entry.p.radius:entry.p.radius)*maxScale;colliders.push({...entry,object,inverse:matrix.clone().invert(),scale,dimensions,center,bound});}
    const targets=new Map();for(const batch of this.batches.values())targets.set(batch.id,colliders.filter(c=>c.object.id!==batch.owner&&(batch.pattern.targets.includes(c.object.id)||batch.pattern.targetTags.some(tag=>c.object.tags?.includes(tag)))));
    for(let n=0;n<this.count;){const batch=this.batches.get(this.batch[n]),p=batch.pattern,offset=n*3,px=this.position[offset],py=this.position[offset+1],pz=this.position[offset+2];const movementDelta=Math.min(delta,this.life[n]);this.life[n]-=delta;for(let axis=0;axis<3;axis++)this.position[offset+axis]+=this.velocity[offset+axis]*movementDelta;const axis=p.plane==='XY'?1:2;let hit;
      for(const c of targets.get(batch.id)){if(c.dimensions===2&&p.plane!=='XY'||!worldSweep(px,py,pz,this.position,offset,c,this.radius[n]))continue;const center=c.p.center||[0,0,0],local=v=>new Vector3(...v).applyMatrix4(c.inverse).toArray().map((value,i)=>value-center[i]),a=local([px,py,pz]),b=local(Array.from(this.position.subarray(offset,offset+3))),radius=this.radius[n]/c.scale;let touches;
        // ponytail: nonuniform collider scale uses a conservative shot radius; exact ellipsoid sweep when required.
        if(c.type.includes('Box'))touches=segmentBox(a,b,c.p.extent||[.5,.5,.5],radius,c.dimensions);
        else if(c.type.includes('Capsule'))touches=segmentCapsule(a,b,Math.max(0,c.p.height/2-c.p.radius),radius+c.p.radius,c.dimensions);
        else touches=pointOnSegment(a.slice(0,c.dimensions),b.slice(0,c.dimensions),new Array(c.dimensions).fill(0))<=(radius+c.p.radius)**2;
        if(touches){hit=c;break;}}
      if(hit){if(this.hits.length>=4096)throw Error('읽지 않은 투사체 충돌 4096개 제한');this.hits.push({id:this.ids[n],pattern:batch.handle,owner:batch.owner,target:hit.object.id,damage:p.damage,position:Array.from(this.position.subarray(offset,offset+3)),time:this.time});}
      if(hit||this.life[n]<=0)this.remove(n);else n++;
    }this.pruneStyles();this.draw();
  }
  takeHits(owner){const result=[];this.hits=this.hits.filter(hit=>{if(hit.owner===owner&&result.length<256){result.push(hit);return false;}return true;});return result;}
  draw(){this.render(this);}
  dispose(){this.count=0;this.batches.clear();this.styles.clear();this.hits=[];this.disposeRender();}
}
export const readProjectilePattern=json=>projectilePattern(parseGameJson(json));
