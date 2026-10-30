export async function createNativeAudioContext(Context){
  const webview=globalThis.chrome?.webview;if(!webview?.postMessage)throw Error('Windows 오디오 연결이 없어요.');
  const context=new Context({sampleRate:48000,sinkId:{type:'none'},latencyHint:'interactive'});let node,buffer,closed=false,serial=0,nextId=1;const requests=new Map(),free=[0,1,2,3],held=new Map();
  const request=(op,extra={})=>new Promise((resolve,reject)=>{const id=nextId++,timer=setTimeout(()=>{requests.delete(id);reject(Error('Windows 오디오 응답 시간 초과'));},10000);requests.set(id,{resolve,reject,timer});webview.postMessage({channel:'hb.audio',op,id,...extra});});
  const messages=({data})=>{if(data?.channel!=='hb.audio')return;if(data.slot!==undefined){const bytes=held.get(data.slot);if(!bytes)return;held.delete(data.slot);free.push(data.slot);if(node)node.port.postMessage(bytes,[bytes]);if(!data.ok)console.error(data.error);return;}const pending=requests.get(data.id);if(pending){clearTimeout(pending.timer);requests.delete(data.id);data.ok?pending.resolve(data.value):pending.reject(Error(data.error));}};
  let resolveBuffer;const received=new Promise(resolve=>resolveBuffer=resolve),shared=e=>{if(e.additionalData?.channel==='hb.audio'){buffer=e.getBuffer();resolveBuffer(buffer);}};
  webview.addEventListener('message',messages);webview.addEventListener('sharedbufferreceived',shared);
  const dispose=async()=>{if(closed)return;closed=true;node?.port.postMessage('close');node?.disconnect();node?.port.close();webview.removeEventListener('sharedbufferreceived',shared);try{await request('close');}finally{webview.removeEventListener('message',messages);for(const p of requests.values()){clearTimeout(p.timer);p.reject(Error('Windows 오디오가 종료됐어요.'));}requests.clear();if(buffer)webview.releaseBuffer(buffer);}};
  try{
    if(!context.setSinkId||context.sinkId?.type!=='none')throw Error('WebView2 Runtime을 업데이트해야 Windows 게임 오디오를 분리할 수 있어요.');
    await context.audioWorklet.addModule(new URL('./native-audio-worklet.js',import.meta.url));await request('init');await Promise.race([received,new Promise((_,reject)=>setTimeout(()=>reject(Error('Windows 오디오 버퍼 시간 초과')),10000))]);
    node=new AudioWorkletNode(context,'hb-native-audio',{numberOfInputs:1,numberOfOutputs:1,outputChannelCount:[2],channelCount:2,channelCountMode:'explicit'});node.connect(context.destination);
    node.port.onmessage=({data})=>{if(closed)return;const slot=free.pop();if(slot===undefined){node.port.postMessage(data,[data]);return;}const samples=new Float32Array(data);new Float32Array(buffer,slot*4096,1024).set(samples);held.set(slot,data);webview.postMessage({channel:'hb.audio',op:'block',slot,serial:++serial});};
    await context.resume();const close=context.close.bind(context);context.close=async()=>{try{await dispose();}finally{await close();}};
    return {context,destination:node,stats:()=>request('stats')};
  }catch(error){await dispose().catch(()=>{});await context.close().catch(()=>{});throw error;}
}
