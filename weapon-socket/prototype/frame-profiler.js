// A bounded window of completed frames, including awaited script/physics work.
// Work time measures CPU/WebGL submission, not display presentation or GPU time.
export class FrameProfiler {
  constructor(limit=600,targetFrameRate=120){this.limit=limit;this.targetFrameRate=targetFrameRate;this.inactiveMs=0;this.pausedAt=null;this.reset();}
  reset(){this.samples=[];this.last=null;}
  setActive(active,now){if(!active&&this.pausedAt===null)this.pausedAt=now;else if(active&&this.pausedAt!==null){this.inactiveMs+=now-this.pausedAt;this.pausedAt=null;}}
  time(now){return now-this.inactiveMs-(this.pausedAt===null?0:now-this.pausedAt);}
  frame(start,end,simulation,render){if(this.last!==null)this.samples.push({interval:start-this.last,work:end-start,simulation,render});this.last=start;if(this.samples.length>this.limit)this.samples.shift();}
  snapshot(){const percentile=(key,p)=>{const values=this.samples.map(s=>s[key]).sort((a,b)=>a-b);return values.length?values[Math.min(values.length-1,Math.floor((values.length-1)*p))]:null;};const mean=key=>this.samples.length?this.samples.reduce((sum,s)=>sum+s[key],0)/this.samples.length:null,interval=mean('interval');return {targetFrameRate:this.targetFrameRate,budgetMs:1000/this.targetFrameRate,overBudget:this.samples.filter(s=>s.work>1000/this.targetFrameRate).length,frames:this.samples.length,fps:interval?1000/interval:null,intervalMs:{mean:interval,p50:percentile('interval',.5),p95:percentile('interval',.95)},workMs:{mean:mean('work'),p50:percentile('work',.5),p95:percentile('work',.95)},simulationMs:{mean:mean('simulation'),p95:percentile('simulation',.95)},renderSubmissionMs:{mean:mean('render'),p95:percentile('render',.95)},over16ms:this.samples.filter(s=>s.work>16.667).length,over33ms:this.samples.filter(s=>s.work>33.333).length};}
}
