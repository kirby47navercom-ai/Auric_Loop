class MixCaptureProcessor extends AudioWorkletProcessor {
 constructor({processorOptions:{maxFrames}}){super();this.maxFrames=maxFrames;this.frames=0;this.offset=0;this.started=null;this.closed=false;this.block=new Int16Array(8192);this.pool=Array.from({length:3},()=>new Int16Array(8192));this.port.onmessage=({data})=>{if(this.closed)return;if(data==='stop')this.finish('stopped');else if(data==='abort'){this.closed=true;this.block=null;this.pool=[];}else if(data instanceof ArrayBuffer&&this.pool.length<3)this.pool.push(new Int16Array(data));};}
 flush(){if(!this.offset)return;const bytes=this.block.buffer;this.port.postMessage({type:'block',frames:this.offset,bytes},[bytes]);this.block=this.pool.pop();this.offset=0;}
 finish(reason){if(this.closed)return;this.flush();this.closed=true;this.block=null;this.pool=[];this.port.postMessage({type:'done',reason,startFrame:this.started,frames:this.frames});}
 process(inputs,outputs){
  if(this.closed)return false;if(this.started===null){this.started=currentFrame;this.port.postMessage({type:'started',startFrame:this.started});}
  const count=outputs[0]?.[0]?.length||inputs[0]?.[0]?.length||128,channels=inputs[0]||[],left=channels[0],right=channels[1]||left;
  // The connected output stays silent; this branch never doubles the mix.
  for(let i=0;i<count;i++){if(!this.block){this.finish('backpressure');return false;}if(this.frames>=this.maxFrames){this.finish('limit');return false;}for(let c=0;c<2;c++){const v=(c?right:left)?.[i]||0,s=Number.isFinite(v)?Math.max(-1,Math.min(1,v)):0;this.block[this.offset*2+c]=Math.round(s*(s<0?32768:32767));}this.offset++;this.frames++;if(this.offset===4096)this.flush();}
  if(this.frames>=this.maxFrames)this.finish('limit');return !this.closed;
 }
}
registerProcessor('hb-mix-capture',MixCaptureProcessor);
