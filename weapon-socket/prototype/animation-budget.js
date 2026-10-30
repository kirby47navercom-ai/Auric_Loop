import {runtimeLODPhase} from './runtime-lod.js';
// A soft budget for optional visual pose evaluation. Animation time, events,
// root motion and other protected work remain the runtime's responsibility.
export const animationBudgetDefaults={enabled:true,budgetMS:2,minRate:5,maxRate:120,initialCostMS:.1,smoothing:.2};
export function animationBudgetSettings(value={}){const s={...animationBudgetDefaults,...value};if(typeof s.enabled!=='boolean'||!Number.isFinite(s.budgetMS)||s.budgetMS<=0||s.budgetMS>1000||!Number.isFinite(s.minRate)||s.minRate<=0||s.minRate>240||!Number.isFinite(s.maxRate)||s.maxRate<s.minRate||s.maxRate>240||!Number.isFinite(s.initialCostMS)||s.initialCostMS<=0||s.initialCostMS>1000||!Number.isFinite(s.smoothing)||s.smoothing<=0||s.smoothing>1)throw Error('애니메이션 예산·갱신 주기를 확인하세요.');return s;}
export class AnimationBudget {
 constructor(){this.states=new WeakMap();this.order=[];this.epoch=0;this.stats={enabled:false};}
 entry(object,settings){let entry=this.states.get(object);if(!entry){entry={fullMS:settings.initialCostMS,planningMS:0,elapsed:0,pose:{},epoch:0};this.states.set(object,entry);}return entry;}
 plan(rows,value,delta,{fps=60}={}){
  const settings=animationBudgetSettings(value);if(!Number.isFinite(delta)||delta<0||!Number.isFinite(fps)||fps<=0)throw Error('애니메이션 프레임 시간을 확인하세요.');this.settings=settings;this.epoch++;this.order.length=0;this.stats={enabled:settings.enabled,budgetMS:settings.budgetMS,observedMS:0,measuredActors:0,evaluated:0,throttled:0,protected:0,eligible:0,estimatedProtectedMS:0,minimumDemandMS:0,allocatedDemandMS:0,minimumExceedsBudget:false};if(!settings.enabled)return this.stats;
  fps=Math.min(settings.maxRate,fps,240);let reserved=0,minimum=0;for(const row of rows){if(!row?.object)throw Error('애니메이션 예산 대상을 확인하세요.');const entry=this.entry(row.object,settings);if(row.protected||!row.state?.reduceEvaluation){this.stats.protected++;reserved+=entry.fullMS;continue;}const wanted=Math.min(row.state.rate||fps,settings.maxRate,fps),base=Math.min(settings.minRate,wanted),cost=Math.max(.0001,entry.fullMS-entry.planningMS);const item=entry.plan??={entry};Object.assign(item,{row,wanted,rate:base,cost});this.order.push(item);minimum+=cost*base/fps;reserved+=entry.planningMS;this.stats.eligible++;}
  this.stats.estimatedProtectedMS=reserved;this.stats.minimumDemandMS=reserved+minimum;this.stats.minimumExceedsBudget=reserved+minimum>settings.budgetMS;
  this.order.sort((a,b)=>(b.row.priority||0)-(a.row.priority||0)||(a.row.distance??Infinity)-(b.row.distance??Infinity)||(a.row.object.id<b.row.object.id?-1:a.row.object.id>b.row.object.id?1:0));
  let remaining=Math.max(0,settings.budgetMS-reserved-minimum),demand=minimum;for(const item of this.order){const extra=Math.min(item.wanted-item.rate,remaining*fps/item.cost);item.rate+=extra;remaining-=extra*item.cost/fps;demand+=extra*item.cost/fps;}
  // The budget replaces the presentation clock rather than intersecting two
  // independently phased clocks, which could starve distant actors. Its rate
  // never exceeds their distance-LOD rate. Initial poses still evaluate once.
  for(const {row,entry,rate}of this.order){const assigned=Math.max(Math.min(settings.minRate,rate),Math.floor(rate+1e-9)),interval=1/assigned,first=entry.epoch===0;entry.elapsed+=delta;const visual=first||entry.level!==row.state.level||entry.elapsed+1e-10>=interval;if(visual)entry.elapsed=first&&row.state.stagger!==false?runtimeLODPhase(row.object.id)*interval:Math.max(0,entry.elapsed-Math.max(1,Math.floor((entry.elapsed+1e-10)/interval))*interval);if(!visual)this.stats.throttled++;Object.assign(entry.pose,row.state,{visual,budgetRate:assigned,poseRate:assigned,interpolationAlpha:Math.min(1,entry.elapsed/interval),reason:visual?row.state.reason:'animation-budget'});entry.epoch=this.epoch;entry.level=row.state.level;}
  this.stats.allocatedDemandMS=reserved+demand;return this.stats;
 }
 pose(object,fallback){const entry=this.states.get(object);return this.settings?.enabled&&entry?.epoch===this.epoch?entry.pose:fallback;}
 record(object,elapsedMS,evaluated){if(!this.settings?.enabled)return;if(!Number.isFinite(elapsedMS)||elapsedMS<0)throw Error('애니메이션 측정 시간을 확인하세요.');const entry=this.entry(object,this.settings),key=evaluated?'fullMS':'planningMS',weight=this.settings.smoothing;entry[key]+=weight*(elapsedMS-entry[key]);this.stats.observedMS+=elapsedMS;this.stats.measuredActors++;if(evaluated)this.stats.evaluated++;}
 snapshot(){return {...this.stats};}
 release(object){this.states.delete(object);}
 clear(){this.states=new WeakMap();this.order.length=0;this.settings=null;this.stats={enabled:false};}
}
