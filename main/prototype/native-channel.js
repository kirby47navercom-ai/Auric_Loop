// A failed or lost reply is never retried: the C++ function may already have run.
export function createNativeChannel(descriptor,fallback,host=globalThis,rendererQuery){
  host.hbMobileSetRendererQuery?.(rendererQuery);
  let socket,opening,sequence=0,unavailable=false;const pending=new Map();
  const fail=message=>{for(const p of pending.values()){host.clearTimeout(p.timer);p.reject(Error(message));}pending.clear();};
  async function connect(){if(opening)return opening;opening=new Promise((resolve,reject)=>{
    const url=new URL(descriptor.path,host.location.href);url.protocol=url.protocol==='https:'?'wss:':'ws:';socket=new host.WebSocket(url);const timer=host.setTimeout(()=>{socket.close();reject(Error('C++ 채널 연결 시간 초과'));},5000);
    socket.onopen=()=>{host.clearTimeout(timer);resolve();};socket.onerror=()=>{host.clearTimeout(timer);reject(Error('C++ 채널 연결 실패'));};
    socket.onclose=()=>{host.clearTimeout(timer);reject(Error('C++ 채널 종료'));fail('C++ 채널이 종료됐어요. 실행을 다시 시작하세요.');opening=null;};
    socket.onmessage=async({data})=>{try{const reply=JSON.parse(data),p=pending.get(reply.id);if(!p)throw Error('C++ 채널 응답 ID 오류');if(reply.query){let result;try{if(!rendererQuery||!['particleCount','particlePlay','particleStop','particlePause','particleEmit'].includes(reply.query.key)||!Number.isSafeInteger(reply.queryId))throw Error('GPU 질의 범위 오류');result={value:await rendererQuery(reply.query)};}catch(error){result={error:error.message};}if(socket.readyState===1)socket.send(JSON.stringify({id:reply.id,queryId:reply.queryId,...result}));return;}pending.delete(reply.id);host.clearTimeout(p.timer);reply.error?p.reject(Error(reply.error)):p.resolve(reply.result?.transport?{...reply.result,transport:{...reply.result.transport,channel:'websocket'}}:reply.result);}catch(error){fail(error.message);socket.close();}};
  });return opening;}
  host.addEventListener?.('pagehide',()=>{socket?.close();fail('편집기 창 종료');});
  return async packet=>{
    if(!descriptor||descriptor.version!==1||unavailable||!host.WebSocket)return fallback(packet).then(result=>result?.transport?{...result,transport:{...result.transport,channel:'http'}}:result);
    try{await connect();}catch{unavailable=true;return fallback(packet);}
    if(socket.readyState!==1)throw Error('C++ 채널이 닫혔어요.');
    return new Promise((resolve,reject)=>{const id=++sequence,timer=host.setTimeout(()=>{fail('C++ 채널 응답 시간 초과');socket.close();},15000);pending.set(id,{resolve,reject,timer});try{socket.send(JSON.stringify({id,...packet}));}catch(error){pending.delete(id);host.clearTimeout(timer);reject(error);}});
  };
}
