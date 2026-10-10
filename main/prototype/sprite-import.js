import {spriteImage,valid2DAsset} from './two-d-assets.js';
const integer=(n,min,max)=>Number.isInteger(n)&&n>=min&&n<=max;
const rectOK=r=>Array.isArray(r)&&r.length===4&&r.every(n=>integer(n,0,32768))&&r[2]>0&&r[3]>0;
export function validSpriteSlices(slices){return Array.isArray(slices)&&slices.length<=1000&&new Set(slices.map(s=>s?.id)).size===slices.length&&slices.every(s=>s&&typeof s.id==='string'&&/^[\w-]{1,80}$/.test(s.id)&&typeof s.name==='string'&&s.name.trim()&&s.name.length<=120&&(s.asset===undefined||typeof s.asset==='string'&&s.asset.length<=2000&&!/^(?:[A-Za-z]:|[\\/])/.test(s.asset)&&!s.asset.replaceAll('\\','/').split('/').includes('..')&&!/[\x00-\x1f]/.test(s.asset))&&rectOK(s.rect)&&Array.isArray(s.pivot)&&s.pivot.length===2&&s.pivot.every(n=>Number.isFinite(n)&&n>=0&&n<=1)&&Array.isArray(s.border)&&s.border.length===4&&s.border.every(n=>integer(n,0,32768)));}
const opaque=(image,x,y,threshold)=>image.data?.[(y*image.width+x)*4+3]>threshold;
export function trimSpriteRect(image,rect,threshold=0){
  if(!integer(threshold,0,254)||!rectOK(rect)||rect[0]+rect[2]>image.width||rect[1]+rect[3]>image.height||!image.data||image.data.length!==image.width*image.height*4)throw Error('이미지 픽셀·영역을 확인하세요.');
  let left=image.width,top=image.height,right=-1,bottom=-1;for(let y=rect[1];y<rect[1]+rect[3];y++)for(let x=rect[0];x<rect[0]+rect[2];x++)if(opaque(image,x,y,threshold)){left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x);bottom=Math.max(bottom,y);}
  return right<0?null:[left,top,right-left+1,bottom-top+1];
}
export function sliceSprite(sprite,image,settings={}){
  const source=spriteImage(sprite,image);if(!source)throw Error('스프라이트 영역을 확인하세요.');
  const {mode='size',width=32,height=32,columns=1,rows=1,margin=0,spacing=0,keepEmpty=true,threshold=0}=settings;
  if(typeof keepEmpty!=='boolean'||!['size','count','automatic'].includes(mode)||!integer(threshold,0,254)||!integer(margin,0,4096)||!integer(spacing,0,4096))throw Error('자르기 설정을 확인하세요.');
  const [x,y,w,h]=source.rect,rects=[],hasPixels=image.data?.length===image.width*image.height*4;
  if(mode==='automatic'){
    if(!hasPixels||w*h>16777216)throw Error('자동 자르기는 1600만 픽셀 이하 RGBA 이미지가 필요해요.');
    const visited=new Uint8Array(w*h),queue=new Int32Array(w*h);
    for(let py=0;py<h;py++)for(let px=0;px<w;px++){const seed=py*w+px;if(visited[seed]||!opaque(image,x+px,y+py,threshold))continue;let head=0,tail=0,l=px,t=py,r=px,b=py;queue[tail++]=seed;visited[seed]=1;
      while(head<tail){const at=queue[head++],cx=at%w,cy=Math.floor(at/w);l=Math.min(l,cx);r=Math.max(r,cx);t=Math.min(t,cy);b=Math.max(b,cy);for(let direction=0;direction<4;direction++){const nx=cx+(direction===0?-1:direction===1?1:0),ny=cy+(direction===2?-1:direction===3?1:0);if(nx>=0&&ny>=0&&nx<w&&ny<h){const i=ny*w+nx;if(!visited[i]&&opaque(image,x+nx,y+ny,threshold)){visited[i]=1;queue[tail++]=i;}}}}
      rects.push([x+l,y+t,r-l+1,b-t+1]);if(rects.length>1000)throw Error('한 번에 1000개까지 자를 수 있어요.');
    }
  }else{
    let cw=width,ch=height,nx,ny;if(mode==='count'){if(!integer(columns,1,1000)||!integer(rows,1,1000))throw Error('열·행을 확인하세요.');nx=columns;ny=rows;cw=Math.floor((w-2*margin-(nx-1)*spacing)/nx);ch=Math.floor((h-2*margin-(ny-1)*spacing)/ny);}
    else{if(!integer(cw,1,4096)||!integer(ch,1,4096))throw Error('셀 크기를 확인하세요.');nx=Math.max(0,Math.floor((w-2*margin+spacing)/(cw+spacing)));ny=Math.max(0,Math.floor((h-2*margin+spacing)/(ch+spacing)));}
    if(cw<1||ch<1||nx*ny>1000)throw Error('셀 크기·자르기 개수를 확인하세요.');if(!keepEmpty&&!hasPixels)throw Error('빈 셀 제외에는 이미지 픽셀이 필요해요.');
    for(let row=0;row<ny;row++)for(let column=0;column<nx;column++){const rect=[x+margin+column*(cw+spacing),y+margin+row*(ch+spacing),cw,ch];if(keepEmpty||trimSpriteRect(image,rect,threshold))rects.push(rect);}
  }
  return rects.map((rect,i)=>({id:crypto.randomUUID(),name:sprite.name.slice(0,110)+'_'+String(i+1).padStart(3,'0'),rect,pivot:[...sprite.pivot],border:[0,0,0,0]}));
}
const overlap=(a,b)=>Math.max(0,Math.min(a[0]+a[2],b[0]+b[2])-Math.max(a[0],b[0]))*Math.max(0,Math.min(a[1]+a[3],b[1]+b[3])-Math.max(a[1],b[1]));
export function mergeSpriteSlices(existing,generated,method='delete'){
  if(!validSpriteSlices(existing)||!validSpriteSlices(generated)||!['delete','safe','smart'].includes(method))throw Error('분할 목록·적용 방식을 확인하세요.');
  if(method==='delete')return structuredClone(generated);const result=structuredClone(existing),updated=new Set();
  for(const next of generated){const matches=result.map((s,i)=>({s,i,area:overlap(s.rect,next.rect)})).filter(m=>m.area>0).sort((a,b)=>b.area-a.area||a.i-b.i);if(!matches.length)result.push(structuredClone(next));else if(method==='smart'){const best=matches.find(m=>!updated.has(m.s.id));if(best){best.s.rect=[...next.rect];updated.add(best.s.id);}}}
  if(result.length>1000)throw Error('분할 목록 1000개 제한 초과');return result;
}
// A child keeps its asset path and slice identity when the source sheet is sliced again.
export async function resolveSprite(sprite,read){
  if(!valid2DAsset('sprite',sprite))throw Error('스프라이트 검증 실패');if(!sprite.sheet)return sprite;
  const sheet=await read(sprite.sheet);if(!valid2DAsset('sprite',sheet)||sheet.sheet)throw Error('원본 스프라이트 시트를 확인하세요.');const slice=sheet.slices?.find(s=>s.id===sprite.sliceId);if(!slice)throw Error('스프라이트 분할이 제거됐어요: '+sprite.sliceId);
  return {...sprite,name:slice.name,texture:sheet.texture,normalTexture:sheet.normalTexture||'',pixelsPerUnit:sheet.pixelsPerUnit,filter:sheet.filter,rect:[...slice.rect],pivot:[...slice.pivot],border:[...slice.border]};
}
