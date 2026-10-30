import {OrcaCrowd} from './orca-crowd.js';
import {avoidCrowd,crowdIndex,getNavigationMesh} from './navigation-mesh.js';
import {findNavigationPath} from './scene-systems.js';
import {enabledComponent,validComponentProperties} from './scene-components.js';
import {sceneWorldPosition,setSceneWorldPosition} from './scene-runtime.js';

const zero=()=>[0,0,0],length=v=>Math.hypot(...v),motor=o=>['CharacterMovement','CharacterMovement2D','TopDownMovement2D','PawnMovement'].some(t=>enabledComponent(o,t));
const mode=p=>p.avoidanceMode??'simple';
const plane=(o,p,objects)=>{if(p.avoidancePlane&&p.avoidancePlane!=='auto')return p.avoidancePlane;const nav=objects.find(n=>(!p.grid||n.id===p.grid)&&getNavigationMesh(n)),grid=objects.find(n=>(!p.grid||n.id===p.grid)&&enabledComponent(n,'NavigationGrid'));if(p.grid&&nav)return getNavigationMesh(nav).plane;if(grid)return enabledComponent(grid,'NavigationGrid').plane;if(enabledComponent(o,'TopDownMovement2D')||enabledComponent(o,'CharacterMovement2D'))return 'XY';return nav?getNavigationMesh(nav).plane:'XZ';};
const axes=plane=>plane==='XY'?[0,1,2]:[0,2,1];

// One owner per play world. ORCA reads a frozen world-space snapshot, then all
// solutions are applied. The pathfinder and collision motor remain separate.
export class NavigationRuntime extends Map {
 constructor(update=()=>{}){super();this.update=update;this.solvers=new Map();}
 path(o,p,destination,objects){
  const ignore=[o.id,o.controller].filter(Boolean);
  if(mode(p)==='orca')for(const other of objects)if(other.poolActive!==false&&enabledComponent(other,'NavigationAgent')&&!enabledComponent(other,'NavigationObstacle'))ignore.push(other.id);
  return findNavigationPath(objects,sceneWorldPosition(o,objects),destination,{gridId:p.grid,ignore,radius:p.radius,height:p.height,margin:p.stoppingDistance,areaMask:p.areaMask??4294967295,areaCosts:p.areaCosts??'{}',plane:plane(o,p,objects)});
 }
 move(o,destination,objects){const p=enabledComponent(o,'NavigationAgent');if(!p)throw Error('Navigation Agent 컴포넌트가 필요해요.');const path=this.path(o,p,destination,objects),previous=this.get(o.id);this.set(o.id,{plane:plane(o,p,objects),destination:[...destination],path,index:0,elapsed:0,status:path.length?'moving':'failed',velocity:previous?.velocity||zero(),preferred:zero()});this.publish(o);return !!path.length;}
 configure(o,settings){
  const p=enabledComponent(o,'NavigationAgent');if(!p)throw Error('Navigation Agent 컴포넌트가 필요해요.');
  const next={...p,...settings};if(!validComponentProperties('NavigationAgent',next))throw Error('경로 회피 설정을 확인하세요.');const component=o.components.find(c=>c.type==='NavigationAgent'&&c.properties?.enabled!==false);component.properties={...component.properties,...settings};const state=this.get(o.id);if(state)state.elapsed=Infinity;this.update(o);
 }
 stop(o){this.delete(o.id);delete o.navigationControl;o.gameplayDebug={...o.gameplayDebug,navigation:{status:'idle',path:[],velocity:zero(),preferred:zero(),neighbors:0,infeasible:false}};}
 publish(o){const state=this.get(o.id);if(!state)return;o.gameplayDebug={...o.gameplayDebug,navigation:{plane:state.plane,status:state.status,destination:state.destination,path:state.path,index:state.index,velocity:state.velocity,preferred:state.preferred,neighbors:state.neighbors||0,infeasible:!!state.infeasible,avoidance:mode(enabledComponent(o,'NavigationAgent')||{})}};}
 clear(){super.clear();for(const solver of this.solvers?.values()||[])solver.release();this.solvers?.clear();}
 inspect(){return{paths:this.size,planes:Object.fromEntries([...this.solvers].map(([p,s])=>[p,s.inspect()]))};}
 tick(delta,objects){
  if(!this.size){for(const s of this.solvers.values())s.release();this.solvers.clear();return;}
  const agents=objects.flatMap(o=>{const p=enabledComponent(o,'NavigationAgent');return p&&o.poolActive!==false?[{o,p,current:sceneWorldPosition(o,objects),plane:plane(o,p,objects)}]:[];}),byId=new Map(agents.map(a=>[a.o.id,a])),pending=[];
  for(const [id,state] of this){
   const agent=byId.get(id);if(!agent){this.delete(id);const o=objects.find(o=>o.id===id);if(o)delete o.navigationControl;continue;}
   const {o,p,current}=agent;state.plane=agent.plane;state.preferred=zero();state.velocity=state.velocity||zero();state.neighbors=0;state.infeasible=false;
   if(state.status==='moving'){
    state.elapsed+=delta;if(state.elapsed>=p.repathInterval){state.path=this.path(o,p,state.destination,objects);state.index=0;state.elapsed=0;if(!state.path.length)state.status='failed';}
    while(state.index<state.path.length&&length(state.path[state.index].map((v,i)=>v-current[i]))<=p.stoppingDistance)state.index++;
    if(state.index>=state.path.length)state.status=state.path.length?'arrived':'failed';
    else{const offset=state.path[state.index].map((v,i)=>v-current[i]),distance=length(offset);state.preferred=offset.map(v=>v/distance*Math.min(p.speed,delta>0?distance/delta:p.speed));pending.push({...agent,state,distance});}
   }
   if(state.status!=='moving'){state.velocity=zero();delete o.navigationControl;}
  }
  const simple=new Map();for(const name of new Set(pending.filter(a=>mode(a.p)==='simple').map(a=>a.plane)))simple.set(name,crowdIndex(agents.filter(a=>a.plane===name).map(a=>({id:a.o.id,position:a.current,velocity:a.o.velocity,radius:a.p.radius,height:a.p.height,poolActive:a.o.poolActive})),name));const solutions=new Map(),activePlanes=new Set(pending.filter(a=>mode(a.p)==='orca').map(a=>a.plane));
  for(const name of activePlanes){
   const [x,y,up]=axes(name),rows=agents.map(({o,p,current,plane})=>{const state=this.get(o.id),active=mode(p)==='orca'&&plane===name&&state?.status==='moving',velocity=motor(o)?o.velocity||zero():state?.velocity||o.velocity||zero();return{id:o.id,position:[current[x],current[y]],velocity:[velocity[x],velocity[y]],preferred:active?[state.preferred[x],state.preferred[y]]:[0,0],radius:p.radius,speed:p.speed,height:p.height,elevation:current[up]-p.height/2,active,horizon:p.avoidanceHorizon??2,neighborDistance:p.neighborDistance??5,maxNeighbors:p.maxNeighbors??16,priority:p.avoidancePriority??50,bias:p.avoidanceBias??.05};});
   let solver=this.solvers.get(name);if(!solver)this.solvers.set(name,solver=new OrcaCrowd());for(const [id,result] of solver.solve(rows,delta)){const velocity=zero();velocity[x]=result.velocity[0];velocity[y]=result.velocity[1];solutions.set(id,{...result,velocity});}
  }
  for(const [name,solver] of this.solvers)if(!activePlanes.has(name)){solver.release();this.solvers.delete(name);}
  // Parents first keeps a direct agent's world position independent of whether
  // a moving parent was listed before or after it in the scene document.
  const objectIndex=new Map(objects.map(o=>[o.id,o])),depths=new Map(),depth=(o,seen=new Set())=>{if(!o||seen.has(o.id))return 0;if(depths.has(o.id))return depths.get(o.id);seen.add(o.id);const d=o.parent?depth(objectIndex.get(o.parent),seen)+1:0;depths.set(o.id,d);return d;};
  for(const a of pending)a.depth=depth(a.o);pending.sort((a,b)=>a.depth-b.depth||(a.o.id<b.o.id?-1:a.o.id>b.o.id?1:0));
  for(const a of pending){const {o,p,current,state,distance}=a;
   const result=solutions.get(o.id);let velocity;
   if(result){velocity=result.velocity;state.neighbors=result.neighbors;state.infeasible=result.infeasible;}
   else if(mode(p)==='simple'){const preferredLength=length(state.preferred),direction=avoidCrowd(o.id,current,state.preferred.map(v=>preferredLength?v/preferredLength:0),simple.get(a.plane).near(current),{radius:p.radius,speed:p.speed,plane:a.plane,height:p.height});velocity=direction.map(v=>v*Math.min(p.speed,delta>0?distance/delta:p.speed));}
   else velocity=state.preferred;
   state.velocity=velocity;if(motor(o))o.navigationControl={direction:velocity.map(v=>p.speed?v/p.speed:0),speed:p.speed,...(mode(p)==='orca'?{instant:true}:{})};
   else if(delta>0){setSceneWorldPosition(o,current.map((v,i)=>v+velocity[i]*delta),objects);this.update(o);}
  }
  for(const {o} of agents)this.publish(o);
 }
}
