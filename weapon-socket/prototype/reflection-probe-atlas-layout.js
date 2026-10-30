// Deterministic shelves for heterogeneous prefiltered maps. Only hardware
// dimensions bound this layout; there is no probe/object count ceiling.
export function reflectionProbeAtlasLayout(items,maxSize){
 if(!Number.isSafeInteger(maxSize)||maxSize<1)throw Error('반사 아틀라스의 장치 크기가 잘못됐어요.');
 const sorted=items.map((item,index)=>({...item,index})).sort((a,b)=>b.height-a.height||b.width-a.width||a.index-b.index);
 for(const item of sorted)if(!Number.isSafeInteger(item.width)||!Number.isSafeInteger(item.height)||item.width<1||item.height<1||item.width>maxSize||item.height>maxSize)throw Error('반사 맵이 장치 아틀라스 크기를 넘어요.');
 if(!items.length)return {width:0,height:0,regions:[]};
 const minimum=items.reduce((v,i)=>Math.max(v,i.width),0),widths=new Set([minimum,maxSize,Math.min(maxSize,items.reduce((s,i)=>s+i.width,0))]);for(let w=2**Math.ceil(Math.log2(minimum));w<maxSize;w*=2)widths.add(w);
 let best=null;for(const width of widths){let x=0,y=0,row=0;const regions=[];for(const item of sorted){if(x+item.width>width){x=0;y+=row;row=0;}regions[item.index]={x,y,width:item.width,height:item.height};x+=item.width;row=Math.max(row,item.height);}const height=y+row;if(height>maxSize)continue;if(!best||width*height<best.width*best.height||width*height===best.width*best.height&&width<best.width)best={width,height,regions};}
 if(!best)throw Error('반사 아틀라스가 장치 한도를 넘어요. 캡처 해상도를 줄여주세요.');return best;
}
