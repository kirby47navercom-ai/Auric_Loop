// Weak references share reverse PCM across active voices without retaining a
// second decoded cache. Virtual voices never request the reverse allocation.
const reversedPCM=new WeakMap();
export function reverseAudioBuffer(context,buffer){
  const cached=reversedPCM.get(buffer)?.deref();if(cached)return cached;
  const reversed=context.createBuffer(buffer.numberOfChannels,buffer.length,buffer.sampleRate);
  for(let channel=0;channel<buffer.numberOfChannels;channel++){const source=buffer.getChannelData(channel),out=reversed.getChannelData(channel);for(let i=0,j=source.length-1;i<out.length;i++,j--)out[i]=source[j];}
  reversedPCM.set(buffer,new WeakRef(reversed));return reversed;
}
// A source node can start only once; resume/seek creates a new node over shared PCM.
export class BufferedAudioPlayer extends EventTarget {
  constructor(context,buffer){super();this.context=context;this.buffer=buffer;this.output=context.createGain();this.offset=0;this.started=0;this.rate=1;this.repeating=false;this.source=null;this.paused=true;this.disposed=false;this.readyState=4;this.networkState=1;this.error=null;this.volume=1;this.playSerial=0;}
  get duration(){return this.buffer.duration;}
  get currentTime(){const time=this.offset+(this.paused?0:(this.context.currentTime-this.started)*this.rate);return this.repeating?((time%this.duration)+this.duration)%this.duration:Math.max(0,Math.min(this.duration,time));}
  set currentTime(value){if(!Number.isFinite(value)||value<0)throw Error('오디오 탐색 시간을 확인하세요.');const playing=!this.paused;this.pause();this.offset=Math.min(value,this.duration);if(playing)this.start();}
  get playbackRate(){return this.rate;}
  set playbackRate(value){if(!Number.isFinite(value)||!Number.isFinite(Math.fround(value))||Math.fround(value)===0)throw Error('오디오 재생 속도를 확인하세요.');if(value===this.rate)return;const flip=Math.sign(value)!==Math.sign(this.rate);this.offset=this.currentTime;this.started=this.context.currentTime;this.rate=value;if(this.source){if(flip){this.stopSource();this.start();}else this.source.playbackRate.value=Math.abs(value);}}
  get loop(){return this.repeating;}
  set loop(value){value=Boolean(value);if(value===this.repeating)return;this.offset=this.currentTime;this.started=this.context.currentTime;this.repeating=value;if(this.source)this.source.loop=value;}
  start(){
    if(this.disposed)throw Error('오디오 실행이 종료됐어요.');
    if(this.virtual){this.started=this.context.currentTime;this.paused=false;return;}
    const buffer=this.rate<0?reverseAudioBuffer(this.context,this.buffer):this.buffer,source=this.context.createBufferSource();source.buffer=buffer;source.loop=this.repeating;source.playbackRate.value=Math.abs(this.rate);source.connect(this.output);this.source=source;this.started=this.context.currentTime;this.paused=false;
    source.onended=()=>{source.disconnect();if(this.source!==source)return;this.source=null;this.offset=this.rate<0?0:this.duration;this.paused=true;this.dispatchEvent(new Event('ended'));};
    try{source.start(0,this.rate<0?this.duration-this.offset:this.offset);}catch(error){this.source=null;this.paused=true;source.disconnect();throw error;}
  }
  async play(){if(this.disposed)throw Error('오디오 실행이 종료됐어요.');if(!this.paused)return;const serial=++this.playSerial;if(this.context.state==='suspended'&&!this.virtual)await this.context.resume();if(this.disposed)throw Error('오디오 실행이 종료됐어요.');if(serial!==this.playSerial)return;if(this.paused){if(this.rate>0&&this.offset>=this.duration)this.offset=0;else if(this.rate<0&&this.offset<=0)this.offset=this.duration;this.start();}}
  stopSource(){const source=this.source;this.source=null;if(source){source.onended=null;source.stop();source.disconnect();}}
  setVirtual(value){value=Boolean(value);if(value===Boolean(this.virtual))return;this.offset=this.currentTime;this.started=this.context.currentTime;this.stopSource();this.virtual=value;if(!this.paused&&!value)this.start();}
  tick(){if(!this.paused&&!this.repeating&&(this.rate<0?this.currentTime<=0:this.currentTime>=this.duration)){this.stopSource();this.offset=this.rate<0?0:this.duration;this.paused=true;this.dispatchEvent(new Event('ended'));}}
  pause(){++this.playSerial;if(this.paused)return;this.offset=this.currentTime;this.paused=true;this.stopSource();}
  dispose(){this.pause();this.disposed=true;this.output.disconnect();}
}

// A lease keeps stopped handles and their callbacks separate from a reused media element.
export class StreamingAudioPlayer extends EventTarget {
  constructor(media,output,release){super();this.media=media;this.output=output;this.release=release;this.disposed=false;this.ended=()=>this.dispatchEvent(new Event('ended'));media.addEventListener('ended',this.ended);}
  active(){if(this.disposed)throw Error('오디오 실행이 종료됐어요.');return this.media;}
  get duration(){return this.media?.duration??this.lastDuration;}
  get currentTime(){return this.media?.currentTime??this.lastTime;}
  set currentTime(value){const media=this.active();if(!Number.isFinite(value)||value<0)throw Error('오디오 탐색 시간을 확인하세요.');media.currentTime=value;}
  get playbackRate(){return this.media?.playbackRate??1;}
  set playbackRate(value){const media=this.active();if(!Number.isFinite(value)||value<=0)throw Error('오디오 재생 속도를 확인하세요.');media.playbackRate=value;}
  get loop(){return this.media?.loop??false;}
  set loop(value){this.active().loop=Boolean(value);}
  get volume(){return this.media?.volume??1;}
  set volume(value){this.active().volume=value;}
  get paused(){return this.media?.paused??true;}
  get readyState(){return this.media?.readyState??0;}
  get networkState(){return this.media?.networkState??0;}
  get error(){return this.media?.error??null;}
  async play(){await this.active().play();this.active();}
  pause(){this.media?.pause();}
  dispose(){if(this.disposed)return;this.disposed=true;const media=this.media;this.lastTime=media.currentTime;this.lastDuration=media.duration;media.removeEventListener('ended',this.ended);this.media=null;this.output=null;this.release();this.release=null;this.ended=null;}
}

export async function createAudioPlayer(context,url,{buffered=['ios','android'].includes(globalThis.hbMobileTarget),readBuffer,createStream}={}){
  if(!buffered)return createStream?createStream(url):new Audio(url);
  const buffer=readBuffer?await readBuffer(url):await(async()=>{const response=await fetch(url);if(!response.ok)throw Error('오디오 파일 요청 실패: '+response.status);return context.decodeAudioData(await response.arrayBuffer());})();
  if(!Number.isFinite(buffer.duration)||buffer.duration<=0)throw Error('오디오 길이를 확인하세요.');
  return new BufferedAudioPlayer(context,buffer);
}
