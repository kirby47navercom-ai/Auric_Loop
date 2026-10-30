import {StreamingAudioPlayer} from './buffered-audio.js';
// Metadata is read once. Virtual voices retain a logical clock and URL, while
// removing src + load() releases the media decoder and its streaming buffers.
export class VirtualStreamingAudioPlayer extends StreamingAudioPlayer {
 constructor(media,output,release,context,url){
  super(media,output,release);this.clock=context;this.url=url;this.length=NaN;this.offset=0;this.started=context.currentTime;this.rate=1;this.repeating=false;this.gain=1;this.logicalPaused=true;this.virtual=false;this.epoch=0;this.loading=null;this.failure=null;
  media.removeEventListener('ended',this.ended);this.ended=()=>{if(this.disposed||this.virtual||this.loading)return;this.offset=this.length;this.logicalPaused=true;this.dispatchEvent(new Event('ended'));};media.addEventListener('ended',this.ended);
 }
 waitMetadata(){return new Promise((resolve,reject)=>{
  const media=this.active(),finish=error=>{clearTimeout(timer);media.removeEventListener('loadedmetadata',ready);media.removeEventListener('error',failed);if(this.cancelReady===cancel)this.cancelReady=null;error?reject(error):resolve();},ready=()=>finish(),failed=()=>finish(Error('스트리밍 오디오 메타데이터를 읽지 못했어요.')),cancel=()=>finish(Error('스트리밍 오디오 준비가 취소됐어요.')),timer=setTimeout(()=>finish(Error('스트리밍 오디오 준비 시간 초과')),10000);this.cancelReady=cancel;media.addEventListener('loadedmetadata',ready);media.addEventListener('error',failed);if(media.readyState>=1)queueMicrotask(ready);
 });}
 async initialize(){try{await this.waitMetadata();this.active();if(!Number.isFinite(this.media.duration)||this.media.duration<=0)throw Error('스트리밍 오디오 길이를 확인하세요.');this.length=this.media.duration;this.setVirtual(true);return this;}catch(error){this.dispose();throw error;}}
 logicalTime(){const time=this.offset+(this.logicalPaused?0:(this.clock.currentTime-this.started)*this.rate);return this.repeating?time%this.length:Math.min(this.length,time);}
 get duration(){return this.length;}
 get currentTime(){if(this.disposed)return this.offset;return this.virtual||this.loading?this.logicalTime():this.media.currentTime;}
 set currentTime(value){this.active();if(!Number.isFinite(value)||value<0)throw Error('오디오 탐색 시간을 확인하세요.');this.offset=Math.min(value,this.length);this.started=this.clock.currentTime;if(!this.virtual&&!this.loading)this.media.currentTime=this.offset;}
 captureClock(){this.offset=this.currentTime;this.started=this.clock.currentTime;}
 get playbackRate(){return this.rate;}
 set playbackRate(value){this.active();if(!Number.isFinite(value)||value<=0)throw Error('오디오 재생 속도를 확인하세요.');this.captureClock();this.rate=value;this.media.playbackRate=value;}
 get loop(){return this.repeating;}
 set loop(value){this.active();this.captureClock();this.repeating=Boolean(value);this.media.loop=this.repeating;}
 get volume(){return this.gain;}
 set volume(value){this.active();this.gain=value;this.media.volume=value;}
 get paused(){return this.disposed||this.logicalPaused;}
 get readyState(){return this.virtual?4:this.media?.readyState||0;}
 get networkState(){return this.virtual?0:this.media?.networkState||0;}
 get decoderResident(){return !this.disposed&&!this.virtual&&!!this.media?.getAttribute('src');}
 get error(){return this.failure||(!this.virtual&&!this.loading?this.media?.error:null);}
 async play(){this.active();if(!this.logicalPaused)return;if(this.offset>=this.length){this.offset=0;if(!this.virtual&&!this.loading)this.media.currentTime=0;}this.started=this.clock.currentTime;this.logicalPaused=false;if(!this.virtual&&!this.loading){await this.media.play();this.active();}}
 pause(){if(this.disposed)return;this.captureClock();this.logicalPaused=true;this.media.pause();}
 setVirtual(value){
  value=Boolean(value);if(this.disposed||this.virtual===value)return;this.captureClock();this.virtual=value;const epoch=++this.epoch;this.cancelReady?.();this.loading=null;
  if(value){this.media.pause();this.media.removeAttribute('src');this.media.load();return;}
  this.media.preload='metadata';this.media.src=this.url;this.media.load();this.media.loop=this.repeating;this.media.playbackRate=this.rate;this.media.volume=this.gain;
  const current=()=>!this.disposed&&!this.virtual&&this.epoch===epoch;
  this.loading=this.waitMetadata().then(async()=>{if(!current())return;this.media.currentTime=this.logicalTime();if(!this.logicalPaused){try{await this.media.play();}catch(error){if(current()&&!this.logicalPaused)throw error;}}if(current()){this.offset=this.media.currentTime;this.started=this.clock.currentTime;this.loading=null;}}).catch(error=>{if(!current())return;this.offset=this.logicalTime();this.logicalPaused=true;this.loading=null;this.failure={code:4,message:error.message};this.dispatchEvent(new Event('error'));});
 }
 tick(){if(!this.disposed&&!this.logicalPaused&&!this.repeating&&this.currentTime>=this.length){this.pause();this.offset=this.length;this.dispatchEvent(new Event('ended'));}}
 dispose(){if(this.disposed)return;this.captureClock();this.logicalPaused=true;++this.epoch;this.cancelReady?.();this.loading=null;const time=this.offset;super.dispose();this.offset=time;}
}
