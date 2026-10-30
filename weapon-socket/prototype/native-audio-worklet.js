class NativeAudioProcessor extends AudioWorkletProcessor {
  constructor(){super();this.frames=0;this.block=new Float32Array(1024);this.pool=Array.from({length:3},()=>new Float32Array(1024));this.silent=0;this.running=true;this.port.onmessage=({data})=>{if(data==='close')this.running=false;else if(data instanceof ArrayBuffer&&this.pool.length<3)this.pool.push(new Float32Array(data));};}
  process(inputs){
    if(!this.running)return false;const channels=inputs[0],left=channels?.[0],right=channels?.[1]||left;
    for(let i=0;i<128;i++){this.block[this.frames*2]=left?.[i]||0;this.block[this.frames*2+1]=right?.[i]||0;if(++this.frames===512){
      const active=this.block.some(v=>v!==0);this.silent=active?0:this.silent+1;
      if(this.silent<=2&&this.pool.length){const bytes=this.block.buffer;this.port.postMessage(bytes,[bytes]);this.block=this.pool.pop();}this.frames=0;
    }}return true;
  }
}
registerProcessor('hb-native-audio',NativeAudioProcessor);
