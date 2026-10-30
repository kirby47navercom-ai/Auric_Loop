import {validateTextureComposite,normalRoughnessComposite} from './texture-composite.js';
// Import/cook policy is independent from texture sampling. Source bytes are
// never modified; defaults preserve the existing image interpretation.
export const textureImportDefaults=Object.freeze({role:'color',colorSpace:'auto',mipmaps:true,flipGreen:false,normalizeNormals:false,preserveCoverage:false,alphaCutoff:.5,topMip:0,maxSize:0});
export const textureImportContract=Object.freeze({
 assetKind:'texture2d',suffix:'.hbtexture2d.json',defaults:textureImportDefaults,
 roles:Object.freeze(['color','normal','mask','data']),colorSpaces:Object.freeze(['auto','srgb','linear']),
 sourcePolicy:'preserved',encoding:'RGBA8',dimensions:'2d',mipReduction:'area-weighted-linear',
 coverage:'raw-alpha target; per-level scale before byte quantization; residual reported',
 normalPolicy:'linear; optional green flip and lower-mip normalization',
 selection:'topMip and maxSize before sampler selection; zero maxSize is unlimited',
 view:'texture.view settings.mip; source, size, mipLevels and importReport; view changes are not asset edits',
 edit:'document.patch with expectedRevision, document.save, editor.undo',
 worker:'one lazy queued worker for large decodes; idle termination; explicit ownership transfer',
 cancellation:'AbortSignal removes queued cooks, terminates only the active owned module worker and rejects AbortError; local synchronous math cannot be preempted; settled listeners removed',
 support:Object.freeze(['WebGL2','WebGPU','DirectX11','packed-ray-mips']),
});
export function textureImportPolicy(value={}){
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!Object.hasOwn(textureImportDefaults,k)))throw Error('텍스처 가져오기 설정을 확인하세요.');
 const p={...textureImportDefaults,...value};
 if(!['color','normal','mask','data'].includes(p.role)||!['auto','srgb','linear'].includes(p.colorSpace)||['mipmaps','flipGreen','normalizeNormals','preserveCoverage'].some(k=>typeof p[k]!=='boolean')||!Number.isFinite(p.alphaCutoff)||p.alphaCutoff<0||p.alphaCutoff>1||['topMip','maxSize'].some(k=>!Number.isSafeInteger(p[k])||p[k]<0)||p.role!=='normal'&&(p.flipGreen||p.normalizeNormals)||p.role==='normal'&&p.colorSpace==='srgb')throw Error('텍스처 가져오기 설정의 값과 역할을 확인하세요.');
 return Object.freeze(p);
}
export function validTextureImportPolicy(value){try{textureImportPolicy(value);return true;}catch{return false;}}
export const textureImportColorSpace=value=>{const p=textureImportPolicy(value);return p.colorSpace==='auto'?(p.role==='color'?'srgb':'linear'):p.colorSpace;};
const linear=Float64Array.from({length:256},(_,i)=>{const v=i/255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;});
const byte=v=>Math.min(255,Math.max(0,Math.round(v*255)));
const encode=v=>v<=.0031308?v*12.92:1.055*Math.max(0,v)**(1/2.4)-.055;
function coverageScale(raw,cutoff,target){
 const pixels=raw.length/4,threshold=(Math.ceil(cutoff*255)-.5)/255;
 if(cutoff===0)return{scale:1,coverage:1,error:Math.abs(1-target)};
 let min=Infinity,max=0;for(let i=3;i<raw.length;i+=4)if(raw[i]>0){min=Math.min(min,raw[i]);max=Math.max(max,raw[i]);}
 const count=scale=>{let n=0;for(let i=3;i<raw.length;i+=4)if(raw[i]*scale>=threshold)n++;return n/pixels;};
 let scale=1,coverage=count(1),error=Math.abs(coverage-target);if(!max||error===0)return{scale,coverage,error};
 // Search in log space, so a tiny positive alpha can still be recovered.
 // Quantized coverage may be unattainable at small mips; report its residual.
 let low=Math.log2(threshold/max)-2,high=Math.log2(threshold/min)+2;
 for(let step=0;step<24;step++){const at=(low+high)*.5,candidate=2**at,c=count(candidate),e=Math.abs(c-target);if(e<error||e===error&&Math.abs(at)<Math.abs(Math.log2(scale))){scale=candidate;coverage=c;error=e;}if(!error)break;if(c<target)low=at;else high=at;}
 return{scale,coverage,error};
}
function downsample(source,srgb){
 const width=Math.max(1,Math.floor(source.width/2)),height=Math.max(1,Math.floor(source.height/2)),data=new Float32Array(width*height*4),bytes=source.data instanceof Uint8Array||source.data instanceof Uint8ClampedArray;
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const x0=x*source.width/width,x1=(x+1)*source.width/width,y0=y*source.height/height,y1=(y+1)*source.height/height,area=(x1-x0)*(y1-y0),at=(x+y*width)*4;
  for(let sy=Math.floor(y0);sy<Math.ceil(y1);sy++)for(let sx=Math.floor(x0);sx<Math.ceil(x1);sx++){
   const weight=(Math.min(sx+1,x1)-Math.max(sx,x0))*(Math.min(sy+1,y1)-Math.max(sy,y0))/area,from=(sx+sy*source.width)*4;
   for(let c=0;c<4;c++)data[at+c]+=(bytes?(srgb&&c<3?linear[source.data[from+c]]:source.data[from+c]/255):source.data[from+c])*weight;
  }
 }
 return{width,height,data};
}
function uploadLevel(raw,p,srgb,target){
 const alpha=p.preserveCoverage?coverageScale(raw.data,p.alphaCutoff,target):{scale:1,coverage:0,error:0},data=new Uint8Array(raw.data.length);let sum=0,covered=0;
 for(let i=0;i<data.length;i+=4){
  let r=raw.data[i],g=raw.data[i+1],b=raw.data[i+2];
  if(p.role==='normal'&&p.normalizeNormals){const x=r*2-1,y=g*2-1,z=b*2-1,n=Math.hypot(x,y,z);if(n>1e-20){r=x/n*.5+.5;g=y/n*.5+.5;b=z/n*.5+.5;}else{r=.5;g=.5;b=1;}}
  data[i]=byte(srgb?encode(r):r);data[i+1]=byte(srgb?encode(g):g);data[i+2]=byte(srgb?encode(b):b);data[i+3]=byte(raw.data[i+3]*alpha.scale);sum+=raw.data[i+3];if(data[i+3]/255>=p.alphaCutoff)covered++;
 }
 return{width:raw.width,height:raw.height,data,coverage:{scale:alpha.scale,target,achieved:covered/(data.length/4),error:Math.abs(covered/(data.length/4)-target),meanSourceAlpha:sum/(data.length/4),quantizationStep:1/(data.length/4)}};
}
export function validateTextureMipPixels(pixels){
 const {width,height}=pixels??{},input=pixels?.data;
 if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<1||height<1||!(input instanceof Uint8Array||input instanceof Uint8ClampedArray)||!Number.isSafeInteger(width*height*4)||input.length!==width*height*4)throw Error('RGBA8 텍스처 원본과 크기를 확인하세요.');
 return pixels;
}
export function cookTextureMips(pixels,value={},options={}){
 if(options.authoredLevels!==undefined)return cookAuthoredTextureMips(pixels,value,options);
 const p=textureImportPolicy(value),srgb=textureImportColorSpace(p)==='srgb',{width,height,data:input}=validateTextureMipPixels(pixels);
 const config=validateTextureComposite(options.composite,p),composite=config.normalTexture?normalRoughnessComposite(config,validateTextureMipPixels(options.normalPixels),{width,height,alphaCutoff:p.alphaCutoff},srgb):null;
 let data=input;if(p.flipGreen){data=new Uint8Array(input);for(let i=1;i<data.length;i+=4)data[i]=255-data[i];}
 let visible=0,mean=0;for(let i=3;i<data.length;i+=4){if(data[i]/255>=p.alphaCutoff)visible++;mean+=data[i]/255;}const target=visible/(width*height),levels=[],coverage=[];let raw={width,height,data},mip=0,top=null;
 while(true){
  composite?.advance(raw.width,raw.height);
  const selected=mip>=p.topMip&&(!p.maxSize||Math.max(raw.width,raw.height)<=p.maxSize)||raw.width===1&&raw.height===1;
  if(selected){top??=mip;let level=mip===0?{width,height,data,coverage:{scale:1,target,achieved:target,error:0,meanSourceAlpha:mean/(width*height),quantizationStep:1/(width*height)}}:uploadLevel(raw,p,srgb,target);if(composite)level=composite.apply(level,mip);levels.push({width:level.width,height:level.height,data:level.data});coverage.push({sourceMip:mip,...level.coverage});if(!p.mipmaps)break;}
  if(raw.width===1&&raw.height===1)break;raw=downsample(raw,srgb);mip++;
 }
 const storedBytes=levels.reduce((sum,l)=>sum+l.data.byteLength,0);return{levels,report:{policy:p,...(composite?{composite:composite.report}:{}),colorSpace:srgb?'srgb':'linear',source:{width,height,bytes:input.byteLength},topMip:top,dimensions:levels.map(l=>[l.width,l.height]),storedBytes,coverage,sourcePreserved:true}};
}
export function validateAuthoredTextureMipPixels(pixels,additional){
 validateTextureMipPixels(pixels);if(!Array.isArray(additional)||additional.length!==Math.floor(Math.log2(Math.max(pixels.width,pixels.height))))throw Error('사용자 지정 2D 밉을 마지막 1 크기까지 지정하세요.');
 let width=pixels.width,height=pixels.height;for(const level of additional){validateTextureMipPixels(level);width=Math.max(1,Math.floor(width/2));height=Math.max(1,Math.floor(height/2));if(level.width!==width||level.height!==height)throw Error('사용자 지정 2D 밉의 크기를 맞춰 주세요.');}return additional;
}
// Authored levels use the same import transforms/coverage/composite as generated
// levels, but never obtain their color or alpha by downsampling the prior level.
export function cookAuthoredTextureMips(pixels,value={},options={}){
 const p=textureImportPolicy(value),srgb=textureImportColorSpace(p)==='srgb',additional=validateAuthoredTextureMipPixels(pixels,options.authoredLevels),{width,height,data:input}=pixels,config=validateTextureComposite(options.composite,p),composite=config.normalTexture?normalRoughnessComposite(config,validateTextureMipPixels(options.normalPixels),{width,height,alphaCutoff:p.alphaCutoff},srgb):null;
 let visible=0,mean=0;for(let i=3;i<input.length;i+=4){if(input[i]/255>=p.alphaCutoff)visible++;mean+=input[i]/255;}const target=visible/(width*height),levels=[],coverage=[];let top=null;
 for(const[mip,source]of [pixels,...additional].entries()){
  composite?.advance(source.width,source.height);const selected=mip>=p.topMip&&(!p.maxSize||Math.max(source.width,source.height)<=p.maxSize)||source.width===1&&source.height===1;if(!selected)continue;top??=mip;
  let data=source.data;if(p.flipGreen){data=new Uint8Array(data);for(let i=1;i<data.length;i+=4)data[i]=255-data[i];}
  let level;if(mip===0)level={width,height,data,coverage:{scale:1,target,achieved:target,error:0,meanSourceAlpha:mean/(width*height),quantizationStep:1/(width*height)}};
  else{const raw=new Float32Array(data.length);for(let i=0;i<data.length;i++)raw[i]=srgb&&i%4!==3?linear[data[i]]:data[i]/255;level=uploadLevel({width:source.width,height:source.height,data:raw},p,srgb,target);}
  if(composite)level=composite.apply(level,mip);levels.push({width:level.width,height:level.height,data:level.data});coverage.push({sourceMip:mip,...level.coverage});if(!p.mipmaps)break;
 }
 return {levels,report:{policy:p,authored:true,...(composite?{composite:composite.report}:{}),colorSpace:srgb?'srgb':'linear',source:{width,height,bytes:input.byteLength,mipLevels:additional.length+1,authoredBytes:[pixels,...additional].reduce((sum,l)=>sum+l.data.byteLength,0)},topMip:top,dimensions:levels.map(l=>[l.width,l.height]),storedBytes:levels.reduce((sum,l)=>sum+l.data.byteLength,0),coverage,sourcePreserved:true}};
}
