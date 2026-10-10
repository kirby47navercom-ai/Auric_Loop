import {validAssetPath} from './material-runtime.js';
import {createAudioPlayer,BufferedAudioPlayer,StreamingAudioPlayer} from './buffered-audio.js';
export const mixerDefaults={volumeDb:0,mute:false,solo:false,bypass:false,lowpass:20000,highpass:20,compressor:false,threshold:-24,ratio:4,attack:.003,release:.25};
export const mixerParameters={volumeDb:[-80,20],lowpass:[20,22000],highpass:[10,22000],threshold:[-100,0],ratio:[1,20],attack:[0,1],release:[.001,1]};
const validSettings=p=>p&&Object.entries(mixerParameters).every(([k,[min,max]])=>Number.isFinite(p[k])&&p[k]>=min&&p[k]<=max)&&['mute','solo','bypass','compressor'].every(k=>typeof p[k]==='boolean');
const label=s=>typeof s==='string'&&s.length>0&&s.length<=80;
export function createAudioMixer(name){return {version:1,name,buses:[{id:'master',name:'Master',parent:'',...mixerDefaults},{id:'music',name:'Music',parent:'master',...mixerDefaults},{id:'sfx',name:'SFX',parent:'master',...mixerDefaults},{id:'ui',name:'UI',parent:'master',...mixerDefaults}],snapshots:[],exposed:[]};}
export function validAudioMixer(data){
  if(data?.version!==1||!label(data.name)||!Array.isArray(data.buses)||!data.buses.length||data.buses.length>64||!Array.isArray(data.snapshots)||data.snapshots.length>64||!Array.isArray(data.exposed)||data.exposed.length>128)return false;
  const buses=new Map(data.buses.map(b=>[b?.id,b]));if(buses.size!==data.buses.length||new Set(data.buses.map(b=>b?.name)).size!==buses.size)return false;
  if(data.buses.filter(b=>b?.parent==='').length!==1||buses.get('master')?.parent!=='')return false;
  if(!data.buses.every(b=>{if(!label(b?.id)||!label(b.name)||!validSettings(b))return false;const seen=new Set();let at=b;while(at.parent){if(seen.has(at.id))return false;seen.add(at.id);at=buses.get(at.parent);if(!at)return false;}return true;}))return false;
  if(new Set(data.snapshots.map(s=>s?.name)).size!==data.snapshots.length||!data.snapshots.every(s=>label(s?.name)&&s.values&&typeof s.values==='object'&&!Array.isArray(s.values)&&Object.keys(s.values).length===buses.size&&data.buses.every(b=>validSettings(s.values[b.id]))))return false;
  return new Set(data.exposed.map(e=>e?.name)).size===data.exposed.length&&new Set(data.exposed.map(e=>JSON.stringify([e?.bus,e?.parameter]))).size===data.exposed.length&&data.exposed.every(e=>label(e?.name)&&buses.has(e.bus)&&Object.hasOwn(mixerParameters,e.parameter));
}
export const dbGain=db=>db<=-80?0:10**(db/20);
const scheduledValues=new WeakMap();
const schedule=(parameter,value,time)=>{if(scheduledValues.get(parameter)!==value){parameter.setValueAtTime(value,time);scheduledValues.set(parameter,value);}};
export function mixerBusAudible(data,id){
  const buses=new Map(data.buses.map(b=>[b.id,b])),solo=data.buses.filter(b=>b.solo).map(b=>b.id),chain=[];let at=buses.get(id);while(at){if(at.mute)return false;chain.push(at.id);at=buses.get(at.parent);}
  if(!solo.length)return true;if(solo.some(s=>chain.includes(s)))return true;
  // Ancestors of a solo bus must pass its routed signal.
  return solo.some(s=>{let b=buses.get(s);while(b){if(b.id===id)return true;b=buses.get(b.parent);}return false;});
}
export class MixerState {
  constructor(data){if(!validAudioMixer(data))throw Error('오디오 믹서 검증 실패');this.data=structuredClone(data);this.base=structuredClone(data.buses);this.overrides=new Map();this.transition=null;}
  set(name,value){const e=this.data.exposed.find(e=>e.name===name);if(!e)throw Error('노출된 믹서 파라미터가 없어요: '+name);const [min,max]=mixerParameters[e.parameter];if(!Number.isFinite(value)||value<min||value>max)throw Error('믹서 값의 범위를 확인하세요.');this.overrides.set(name,value);this.applyOverrides();}
  get(name){const e=this.data.exposed.find(e=>e.name===name);if(!e)throw Error('노출된 믹서 파라미터가 없어요: '+name);return this.data.buses.find(b=>b.id===e.bus)[e.parameter];}
  clear(name){if(!this.data.exposed.some(e=>e.name===name))throw Error('믹서 파라미터가 없어요.');this.overrides.delete(name);this.update(0);}
  applyOverrides(){for(const [name,value] of this.overrides){const e=this.data.exposed.find(e=>e.name===name);this.data.buses.find(b=>b.id===e.bus)[e.parameter]=value;}}
  snapshot(name,duration){const s=this.data.snapshots.find(s=>s.name===name);if(!s||!Number.isFinite(duration)||duration<0||duration>3600)throw Error('믹서 스냅샷·전환 시간을 확인하세요.');this.transition={from:structuredClone(this.base),to:structuredClone(s.values),elapsed:0,duration};this.update(0);}
  update(delta){if(this.transition){const t=this.transition;t.elapsed=Math.min(t.duration,t.elapsed+delta);const alpha=t.duration===0?1:t.elapsed/t.duration;for(const b of this.base){const to=t.to[b.id],from=t.from.find(x=>x.id===b.id);for(const key of Object.keys(mixerDefaults))b[key]=typeof to[key]==='number'?from[key]+(to[key]-from[key])*alpha:(alpha===1?to[key]:from[key]);}if(alpha===1)this.transition=null;}for(const b of this.data.buses)Object.assign(b,this.base.find(x=>x.id===b.id));this.applyOverrides();}
}
export class AudioMixerGraph {
  constructor(context,data,destination=context.destination){this.context=context;this.state=new MixerState(data);this.nodes=new Map();for(const b of data.buses){const input=context.createGain(),low=context.createBiquadFilter(),high=context.createBiquadFilter(),compressor=context.createDynamicsCompressor(),gain=context.createGain(),effectGate=context.createGain(),bypassGate=context.createGain(),meter=context.createAnalyser();low.type='lowpass';high.type='highpass';meter.fftSize=256;this.nodes.set(b.id,{input,low,high,compressor,gain,effectGate,bypassGate,meter});}for(const b of data.buses){const n=this.nodes.get(b.id);n.input.connect(n.low);n.low.connect(n.high);n.high.connect(n.compressor);n.compressor.connect(n.effectGate);n.effectGate.connect(n.gain);n.input.connect(n.bypassGate);n.bypassGate.connect(n.gain);n.gain.connect(n.meter);n.meter.connect(b.parent?this.nodes.get(b.parent).input:destination);}this.update(0);}
  input(id='master'){const n=this.nodes.get(id);if(!n)throw Error('오디오 버스가 없어요: '+id);return n.input;}
  update(delta){this.state.update(delta);const now=this.context.currentTime;for(const b of this.state.data.buses){const n=this.nodes.get(b.id);schedule(n.gain.gain,mixerBusAudible(this.state.data,b.id)?dbGain(b.volumeDb):0,now);schedule(n.effectGate.gain,b.bypass?0:1,now);schedule(n.bypassGate.gain,b.bypass?1:0,now);schedule(n.low.frequency,b.lowpass,now);schedule(n.high.frequency,b.highpass,now);schedule(n.compressor.threshold,b.compressor&&!b.bypass?b.threshold:0,now);schedule(n.compressor.ratio,b.compressor&&!b.bypass?b.ratio:1,now);schedule(n.compressor.attack,b.attack,now);schedule(n.compressor.release,b.release,now);}}
  levels(){return Object.fromEntries([...this.nodes].map(([id,n])=>{const values=n.samples?.length===n.meter.fftSize?n.samples:(n.samples=new Float32Array(n.meter.fftSize));n.meter.getFloatTimeDomainData(values);return [id,Math.sqrt(values.reduce((sum,v)=>sum+v*v,0)/values.length)];}));}
  dispose(){for(const n of this.nodes.values())for(const node of Object.values(n))node.disconnect?.();this.nodes.clear();}
}
export class AudioRouting {
  constructor({readAsset,context}={}){this.readAsset=readAsset;this.context=context;this.graphs=new Map();this.loading=new Map();this.buffers=new Map();this.bufferBytes=0;this.bufferLoads=new Map();this.observers=new Map();this.voices=new Map();this.idleMeters=[];this.streams=new Set();this.idleStreams=[];this.disposed=false;}
  stream(url,context){
    if(this.disposed)throw Error('오디오 실행이 종료됐어요.');
    let slot=this.idleStreams.pop();if(!slot){const media=new Audio();slot={media,source:context.createMediaElementSource(media)};this.streams.add(slot);}
    const {media,source}=slot;media.loop=false;media.playbackRate=1;media.volume=1;media.src=url;
    // ponytail: retained streaming nodes are bounded by peak simultaneous streams, not play count; add a configurable voice budget when needed.
    return slot.lease=new StreamingAudioPlayer(media,source,()=>{media.pause();media.removeAttribute('src');media.load();source.disconnect();slot.lease=null;if(!this.disposed)this.idleStreams.push(slot);});
  }
  async player(url){const context=await this.ensure();return createAudioPlayer(context,url,{createStream:url=>this.stream(url,context),readBuffer:async url=>{
    if(this.buffers.has(url)){const cached=this.buffers.get(url);this.buffers.delete(url);this.buffers.set(url,cached);return cached.buffer;}
    if(!this.bufferLoads.has(url)){const pending=(async()=>{const response=await fetch(url);if(!response.ok)throw Error('오디오 파일 요청 실패: '+response.status);const buffer=await context.decodeAudioData(await response.arrayBuffer());if(this.disposed)throw Error('오디오 실행이 종료됐어요.');const bytes=buffer.length*buffer.numberOfChannels*4;
      // ponytail: 32 MiB retained PCM cache; active voices/decoding can own evicted buffers.
      if(bytes<=33554432){for(const [key,cached] of this.buffers){if(this.bufferBytes+bytes<=33554432)break;this.buffers.delete(key);this.bufferBytes-=cached.bytes;}this.buffers.set(url,{buffer,bytes});this.bufferBytes+=bytes;}return buffer;})();this.bufferLoads.set(url,pending);pending.finally(()=>this.bufferLoads.delete(url)).catch(()=>{});}return this.bufferLoads.get(url);
  }});}
  async ensure(){if(this.disposed)throw Error('오디오 실행이 종료됐어요.');if(!this.context){const Context=globalThis.AudioContext||globalThis.webkitAudioContext;if(!Context)throw Error('Web Audio 실행 환경이 없어요.');this.context=new Context();}return this.context;}
  async graph(path){if(!validAssetPath(path)||!path)throw Error('오디오 믹서 경로를 확인하세요.');if(this.disposed)throw Error('오디오 실행이 종료됐어요.');if(this.graphs.has(path))return this.graphs.get(path);if(!this.loading.has(path)){const pending=(async()=>{const data=await this.readAsset(path),context=await this.ensure();if(this.disposed)throw Error('오디오 실행이 종료됐어요.');const graph=new AudioMixerGraph(context,data);this.graphs.set(path,graph);return graph;})();this.loading.set(path,pending);pending.finally(()=>this.loading.delete(path)).catch(()=>{});}return this.loading.get(path);}
  async connect(player,settings={}){
    const context=await this.ensure(),graph=settings.mixer?await this.graph(settings.mixer):null;if(this.disposed||player.disposed)throw Error('오디오 실행이 종료됐어요.');const destination=graph?graph.input(settings.bus||'master'):context.destination;
    // Retain 85 ms at 48 kHz so short clips survive delayed main-thread meter reads.
    const source=player instanceof BufferedAudioPlayer||player instanceof StreamingAudioPlayer?player.output:context.createMediaElementSource(player),gain=context.createGain(),panner=settings.spatial?context.createPanner():null;
    const idle=this.idleMeters.findIndex(entry=>entry.readyAt<=context.currentTime),meter=idle<0?context.createAnalyser():this.idleMeters.splice(idle,1)[0].meter;if(idle>=0)meter.disconnect();meter.fftSize=4096;source.connect(gain);if(panner){panner.panningModel='HRTF';panner.distanceModel='inverse';panner.refDistance=settings.refDistance||1;panner.maxDistance=settings.maxDistance||100;panner.rolloffFactor=settings.rolloff??1;gain.connect(panner);panner.connect(meter);}else gain.connect(meter);meter.connect(destination);
    player.volume=1;player.hbBaseVolume=settings.volume??1;gain.gain.value=player.hbBaseVolume;this.voices.set(player,{source,gain,panner,meter,samples:new Float32Array(meter.fftSize)});this.peakTimer??=setInterval(()=>this.sampleMeters(),16);return player;
  }
  sampleMeters(){if(this.context.state==='running'){for(const player of this.voices.keys())this.peak(player);for(const entry of this.idleMeters)if(entry.draining&&entry.readyAt<=this.context.currentTime){entry.meter.disconnect();entry.draining=false;}}if(!this.voices.size&&!this.idleMeters.some(entry=>entry.draining)){clearInterval(this.peakTimer);this.peakTimer=null;}}
  peak(player){const voice=this.voices.get(player);if(voice){voice.meter.getFloatTimeDomainData(voice.samples);let peak=player.hbPeak||0;for(const sample of voice.samples)peak=Math.max(peak,Math.abs(sample));player.hbPeak=peak;}return player.hbPeak||0;}
  position(player,position){const voice=this.voices.get(player),p=voice?.panner;if(p&&position&&(!voice.position||position.some((v,i)=>v!==voice.position[i]))){if(p.positionX){[p.positionX,p.positionY,p.positionZ].forEach((v,i)=>{if(!voice.position||voice.position[i]!==position[i])v.setValueAtTime(position[i],this.context.currentTime);});}else p.setPosition(...position);voice.position=[...position];}}
  volume(player,value){const voice=this.voices.get(player);if(voice)voice.gain.gain.value=value;}
  disconnect(player){if(typeof player.dispose==='function')player.dispose();else{player.pause?.();player.removeAttribute?.('src');player.load?.();}const voice=this.voices.get(player);if(!voice)return;for(const n of [voice.source,voice.gain,voice.panner,voice.meter])n?.disconnect();this.voices.delete(player);
    // ponytail: retain at most 16 idle analysers; concurrent voices can allocate more.
    // No inputs and a destination keep silence flowing through the history ring before reuse.
    if(!this.disposed&&this.idleMeters.length<16){voice.meter.connect(this.context.destination);this.idleMeters.push({meter:voice.meter,draining:true,readyAt:this.context.currentTime+(voice.meter.fftSize+128)/this.context.sampleRate});}
    if(this.disposed||!this.voices.size&&!this.idleMeters.some(entry=>entry.draining)){clearInterval(this.peakTimer);this.peakTimer=null;}}
  mirror(path,graph){for(const owner of this.observers.get(path)||[]){owner.gameplayDebug??={};owner.gameplayDebug.audioMixers??={};owner.gameplayDebug.audioMixers[path]=Object.fromEntries(graph.state.data.exposed.map(e=>[e.name,graph.state.get(e.name)]));}}
  async operation(key,a,b,vm){if(!['mixerSet','mixerGet','mixerClear','mixerSnapshot'].includes(key))return undefined;const graph=await this.graph(a.asset);if(key==='mixerSet')graph.state.set(a.parameter,a.value);else if(key==='mixerClear')graph.state.clear(a.parameter);else if(key==='mixerSnapshot')graph.state.snapshot(a.snapshot,a.duration);graph.update(0);const owner=vm.object(!a.target||a.target==='self'?b.self:a.target);if(owner){if(!this.observers.has(a.asset))this.observers.set(a.asset,new Set());this.observers.get(a.asset).add(owner);}this.mirror(a.asset,graph);return key==='mixerGet'?{return:graph.state.get(a.parameter)}:{};}
  update(delta,position){const listener=this.context?.listener;if(listener&&position&&(!this.listenerPosition||position.some((v,i)=>v!==this.listenerPosition[i]))){if(listener.positionX)[listener.positionX,listener.positionY,listener.positionZ].forEach((v,i)=>{if(!this.listenerPosition||this.listenerPosition[i]!==position[i])v.setValueAtTime(position[i],this.context.currentTime);});else listener.setPosition(...position);this.listenerPosition=[...position];}for(const [path,g] of this.graphs){g.update(delta);this.mirror(path,g);}}
  dispose(){this.disposed=true;for(const player of [...this.voices.keys()])this.disconnect(player);for(const slot of this.streams){slot.lease?.dispose();slot.source.disconnect();}this.streams.clear();this.idleStreams.length=0;for(const {meter} of this.idleMeters)meter.disconnect();this.idleMeters.length=0;clearInterval(this.peakTimer);this.peakTimer=null;for(const graph of this.graphs.values())graph.dispose();this.graphs.clear();this.buffers.clear();this.bufferBytes=0;this.observers.clear();this.context?.close?.().catch?.(()=>{});}
}
