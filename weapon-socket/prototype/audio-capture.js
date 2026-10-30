const modules=new WeakMap();
export function captureLimits(sampleRate,{maxSeconds=60,maxBytes=33554432}={}){if(!Number.isInteger(sampleRate)||sampleRate<8000||sampleRate>384000||!Number.isFinite(maxSeconds)||maxSeconds<=0||maxSeconds>3600||!Number.isInteger(maxBytes)||maxBytes<4096||maxBytes>67108864)throw Error('녹음 시간·PCM 메모리 예산을 확인하세요.');return{sampleRate,maxSeconds,maxBytes,maxFrames:Math.floor(Math.min(maxSeconds*sampleRate,maxBytes/4))};}
export function pcm16Wave(chunks,sampleRate,frames){
 if(!Number.isInteger(sampleRate)||sampleRate<8000||sampleRate>384000||!Number.isSafeInteger(frames)||frames<0||frames*4>67108864||!Array.isArray(chunks)||chunks.some(c=>!(c instanceof Int16Array)||c.length%2)||chunks.reduce((n,c)=>n+c.length/2,0)<frames)throw Error('WAV PCM 자료를 확인하세요.');
 const bytes=new Uint8Array(44+frames*4),view=new DataView(bytes.buffer),text=(at,s)=>{for(let i=0;i<s.length;i++)bytes[at+i]=s.charCodeAt(i);};text(0,'RIFF');view.setUint32(4,bytes.length-8,true);text(8,'WAVE');text(12,'fmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,2,true);view.setUint32(24,sampleRate,true);view.setUint32(28,sampleRate*4,true);view.setUint16(32,4,true);view.setUint16(34,16,true);text(36,'data');view.setUint32(40,frames*4,true);let used=0;for(const chunk of chunks){const count=Math.min(chunk.length,frames*2-used);for(let i=0;i<count;i++)view.setInt16(44+(used+i)*2,chunk[i],true);used+=count;if(used===frames*2)break;}return bytes;
}
export class MixCapture {
 constructor(context,settings={}){this.context=context;this.limits=captureLimits(context.sampleRate,settings);this.sources=new Set();this.chunks=[];this.frames=0;this.startFrame=null;this.state='starting';this.done=new Promise(resolve=>this.resolve=resolve);}
 async start(){
  const context=this.context;if(!context.audioWorklet||typeof AudioWorkletNode==='undefined')throw Error('AudioWorklet 녹음을 지원하지 않는 실행 환경이에요.');
  if(!modules.has(context)){const pending=context.audioWorklet.addModule(new URL('./audio-capture-worklet.js',import.meta.url));modules.set(context,pending);pending.catch(()=>modules.delete(context));}await modules.get(context);if(this.state!=='starting'||context.state==='closed')throw Error('녹음 시작이 취소됐어요.');
  const node=this.node=new AudioWorkletNode(context,'hb-mix-capture',{numberOfInputs:1,numberOfOutputs:1,outputChannelCount:[2],channelCount:2,channelCountMode:'explicit',processorOptions:{maxFrames:this.limits.maxFrames}});this.state='recording';node.onprocessorerror=()=>this.complete({reason:'processor-error'});node.port.onmessage=({data})=>{
   if(this.state==='disposed')return;if(data.type==='started')this.startFrame=data.startFrame;
   else if(data.type==='block'){const remaining=this.limits.maxFrames-this.frames,count=Math.min(remaining,data.frames);if(count>0){this.chunks.push(new Int16Array(data.bytes,0,count*2).slice());this.frames+=count;}if(this.node)node.port.postMessage(data.bytes,[data.bytes]);}
   else if(data.type==='done')this.complete(data);
  };node.connect(context.destination);return this.inspect();
 }
 tap(source){if(this.state!=='recording'||this.sources.has(source))return;source.connect(this.node);this.sources.add(source);}
 untap(source){if(!this.sources.delete(source))return;try{source.disconnect(this.node);}catch{}}
 detach(){for(const source of [...this.sources])this.untap(source);this.node?.disconnect();if(this.node){this.node.port.postMessage('abort');this.node.port.onmessage=null;this.node.onprocessorerror=null;this.node.port.close();}this.node=null;clearTimeout(this.timer);}
 complete({reason,startFrame=this.startFrame}={}){if(this.state==='stopped'||this.state==='disposed')return;this.startFrame=startFrame;this.reason=reason||'stopped';this.state='stopped';this.detach();this.resolve();}
 stop(){return this.finishing??=this.finish();}
 async finish(){
  if(this.state==='disposed')throw Error('녹음 자료가 해제됐어요.');if(this.state==='starting')throw Error('녹음 시작을 기다려 주세요.');
  if(this.state==='recording'){this.endFrame=Math.ceil(this.context.currentTime*this.context.sampleRate);this.node.port.postMessage('stop');this.timer=setTimeout(()=>this.complete({reason:'stop-timeout'}),2000);}
  await this.done;if(this.state!=='stopped')throw Error('녹음 자료가 해제됐어요.');const frames=this.endFrame!==undefined&&this.startFrame!==null?Math.min(this.frames,Math.max(0,this.endFrame-this.startFrame)):this.frames,info={...this.inspect(),frames,duration:frames/this.context.sampleRate,bytes:44+frames*4},bytes=pcm16Wave(this.chunks,this.context.sampleRate,frames);this.chunks.length=0;this.frames=0;this.state='disposed';return {bytes,info};
 }
 discard(){if(this.state==='disposed')return;this.node?.port.postMessage('abort');this.state='disposed';this.detach();this.chunks.length=0;this.frames=0;this.resolve();}
 inspect(){return{state:this.state,sampleRate:this.context.sampleRate,channels:2,bits:16,frames:this.frames,duration:this.frames/this.context.sampleRate,startTime:this.startFrame===null?null:this.startFrame/this.context.sampleRate,reason:this.reason||null,truncated:!!this.reason&&this.reason!=='stopped',pcmBytes:this.frames*4,maxPCMBytes:this.limits.maxBytes,maxSeconds:this.limits.maxSeconds,sources:this.sources.size};}
}
