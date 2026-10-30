import {MontageClipIndex} from './montage-clip-index.js';
import {motionBuffer,appendMotion,validRootMotion} from './animation-root-motion.js';
import {AnimationGraphPlayer} from './animation-graph-runtime.js';
import {createAnimationGraph,makeAnimationNode} from './animation-graph-assets.js';

const emptySlotNames=Object.freeze([]);
// Montage clocks belong to gameplaySystems. Clip sampling uses the same compiled
// bindings/pose buffers as graph clips, without writing an intermediate scene pose.
export class AnimationMontagePlayer {
  static async load(data,options){
    if(!validRootMotion(data.rootMotion))throw Error('몽타주 루트 모션 설정 오류');const graph=createAnimationGraph(data.name);graph.rootMotionMode=data.rootMotion?.enabled?'all':'none';const direct=makeAnimationNode('direct');graph.nodes=[graph.nodes[1],direct];graph.nodes[0].inputs.pose=direct.id;direct.properties.samples=[];const sources=new Map();
    for(const segment of data.clips)if(!sources.has(segment.clip)){const node=makeAnimationNode('clip');node.properties.clip=segment.clip;node.properties.loop=false;if(data.rootMotion)node.properties.rootMotion=structuredClone(data.rootMotion);graph.nodes.push(node);sources.set(segment.clip,node.id);const input='pose'+sources.size;direct.inputs[input]=node.id;direct.properties.samples.push({input,weight:0,parameter:''});}
    const program=await AnimationGraphPlayer.load(graph,options);try{return new AnimationMontagePlayer(data,program,sources);}catch(error){program.dispose();throw error;}
  }
  constructor(data,program,sources){this.clipIndex=data.clips.length>=32?new MontageClipIndex(data):null;this.data=data;this.program=program;this.sources=sources;this.slots=new Map();for(const segment of data.clips){const name=segment.slot||'DefaultSlot';if(!this.slots.has(name))this.slots.set(name,{player:program,pose:program.allocatePose(),sprites:program.referenceSprites,weight:0,active:false});}this.slotNames=Object.freeze([...this.slots.keys()]);this.output=program.allocatePose();}
  validateGraph(graph){for(const name of this.slots.keys())if(!graph.data.nodes.some(n=>graph.reachable.has(n.id)&&n.type==='slot'&&n.properties.group===(this.data.group||'DefaultGroup')&&n.properties.slot===name))throw Error('그래프에 몽타주 슬롯을 연결하세요: '+(this.data.group||'DefaultGroup')+'.'+name);}
  sample(time,weight){this.time=time;this.weight=weight;for(const value of this.slots.values())value.active=false;const indexed=this.clipIndex?.sample(time);if(indexed){for(const entry of indexed)this.sampleSegment(entry.segment,time,weight);}else for(const segment of this.data.clips){if(segment.start>time||segment.start+segment.duration<time||segment.start+segment.duration===time&&time!==this.data.length)continue;this.sampleSegment(segment,time,weight);}}
  sampleSegment(segment,time,weight){const value=this.slots.get(segment.slot||'DefaultSlot');if(value.active)throw Error('같은 슬롯의 클립은 겹칠 수 없어요.');Object.assign(value,this.program.sampleClip(this.sources.get(segment.clip),segment.sourceStart+(time-segment.start)*segment.rate,value.pose));value.weight=weight;value.active=true;}
  extractRange(previous,current,weight,out){if(!this.program.rootTracks.size||previous===current)return;const indexed=this.clipIndex?.range(previous,current);if(indexed){this.clipIndex.rangeBusy=true;try{for(const entry of indexed)this.extractSegment(entry.segment,previous,current,weight,out);}finally{this.clipIndex.rangeBusy=false;}}else for(const segment of this.data.clips)this.extractSegment(segment,previous,current,weight,out);}
  extractSegment(segment,previous,current,weight,out){const start=Math.max(previous,segment.start),end=Math.min(current,segment.start+segment.duration);if(end<=start)return;const id=this.sources.get(segment.clip),track=this.program.rootTracks.get(id);if(!track?.p.enabled)return;const name=segment.slot||'DefaultSlot';let value=out.get(name);if(!value){value={motion:motionBuffer(),weight:0};out.set(name,value);}this.scratchMotion??=motionBuffer();track.extract(segment.sourceStart+(start-segment.start)*segment.rate,segment.sourceStart+(end-segment.start)*segment.rate,false,this.scratchMotion);appendMotion(value.motion,this.scratchMotion,weight);value.weight+=weight*(end-start);}

  slot(name){const value=this.slots.get(name);return value?.active?value:null;}
  prepareBlend(players){
    if(!players.length)return;for(const player of players)this.program.adoptProgram(player.program,false);
    this.blendedPoses??=new Map();this.mappedPose??=this.program.allocatePose();this.blendedPoses.set('',this.output);
    for(const name of new Set([...this.slots.keys(),...players.flatMap(player=>[...player.slots.keys()])]))if(!this.blendedPoses.has(name))this.blendedPoses.set(name,this.program.allocatePose());
  }
  compose(values,name=''){
    if(values.length===1)return values[0];if(!values.length)return null;
    for(const value of values)if(value.player!==this.program)this.program.adoptProgram(value.player,false);
    this.blendedPoses??=new Map();let pose=this.blendedPoses.get(name);if(!pose){pose=this.program.allocatePose();this.blendedPoses.set(name,pose);}
    for(let i=0;i<pose.length;i++)pose[i].set(this.program.rest[i]);
    const total=values.reduce((sum,value)=>sum+value.weight,0);let accumulated=0,sprites=new Map();
    for(const value of values){if(!value.weight)continue;const alpha=value.weight/(accumulated+value.weight),map=value.player===this.program?null:this.program.adoptProgram(value.player,false);
      // Map each program's bindings once; mix reuses the compiled pose buffers.
      this.mappedPose??=this.program.allocatePose();for(let i=0;i<pose.length;i++){const index=map?(map[i]??-1):i;this.mappedPose[i].set(index<0?this.program.rest[i]:value.pose[index]);}
      this.program.mix(pose,pose,this.mappedPose,alpha);sprites=this.program.mergeSprites(sprites,value.sprites,alpha);accumulated+=value.weight;
    }
    return {player:this.program,pose,sprites,weight:Math.min(1,total)};
  }
  async apply(){for(const value of this.slots.values())if(value.active){this.program.mix(this.output,this.program.rest,value.pose,value.weight);await this.program.applyPose({pose:this.output,sprites:this.program.mergeSprites(this.program.referenceSprites,value.sprites,value.weight)});return;}}
  dispose(){this.clipIndex=null;this.program.dispose();this.slots.clear();this.slotNames=emptySlotNames;this.sources.clear();this.blendedPoses?.clear();this.mappedPose=null;}
}
