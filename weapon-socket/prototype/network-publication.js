export const networkPublicationBudget=Object.freeze({states:512,rows:128,bytes:4194304});
export function networkUTF8Bytes(text){if(typeof text!=='string')throw Error('UTF8 문자열이 필요해요.');let bytes=0;for(let i=0;i<text.length;i++){const code=text.charCodeAt(i);if(code<128)bytes++;else if(code<2048)bytes+=2;else if(code>=0xd800&&code<=0xdbff&&text.charCodeAt(i+1)>=0xdc00&&text.charCodeAt(i+1)<=0xdfff){bytes+=4;i++;}else bytes+=3;}return bytes;}
// A live Map cursor advances even when the per-tick publication budget is full.
// No copied world-sized array and no second index of object identities.
export class NetworkPublication{
 constructor(replicas){this.replicas=replicas;this.cursor=null;}
 reset(){this.cursor=null;}
 *entries(){const count=this.replicas.size;if(!count){this.reset();return;}for(let visited=0;visited<count;visited++){this.cursor??=this.replicas.entries();let entry=this.cursor.next();if(entry.done){this.cursor=this.replicas.entries();entry=this.cursor.next();}if(entry.done)return;yield entry.value;}}
}
const prefix='{"type":"state","rows":[',suffix=']}';
// Cached valid row JSON is also the sent stamp. Typical small packets need no
// UTF8 scan: three bytes/code unit is a safe bound. Refine once when it matters.
export function* networkStatePackets(stamps,{rows=networkPublicationBudget.rows,bytes=networkPublicationBudget.bytes}={}){
 if(!Number.isSafeInteger(rows)||rows<1||rows>512||!Number.isSafeInteger(bytes)||bytes<prefix.length+suffix.length)throw Error('네트워크 패킷 예산을 확인하세요.');
 for(let from=0;from<stamps.length;){let to=from,size=prefix.length+suffix.length,exact=false;
  while(to<stamps.length&&to-from<rows){const stamp=stamps[to];if(typeof stamp!=='string'||!stamp)throw Error('복제 상태 직렬화 결과가 필요해요.');const comma=to>from?1:0;let length=exact?networkUTF8Bytes(stamp):stamp.length*3;
   if(size+comma+length>bytes&&!exact){size=prefix.length+suffix.length;for(let i=from;i<to;i++)size+=(i>from?1:0)+networkUTF8Bytes(stamps[i]);exact=true;length=networkUTF8Bytes(stamp);}
   if(size+comma+length>bytes){if(to===from)throw Error('복제 상태 하나가 패킷 예산을 넘었어요.');break;}
   size+=comma+length;to++;
  }
  yield {from,to,wire:prefix+stamps.slice(from,to).join(',')+suffix};from=to;
 }
}
