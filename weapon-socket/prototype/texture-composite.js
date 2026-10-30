// Import-time normal moments. This is HB's isotropic approximation, not a
// screen-space geometric specular-AA pass. No extra runtime texture/sampler.
export const textureCompositeDefaults=Object.freeze({normalTexture:'',channel:'a',power:1});
export const textureCompositeContract=Object.freeze({
 assetKind:'texture2d',field:'composite',defaults:textureCompositeDefaults,
 channels:Object.freeze(['r','g','b','a']),powerRange:Object.freeze([0,16]),
 source:'raw image or texture2d descriptor; original RGB normal pixels, same UV layout, same or higher dimensions; nested composite is not evaluated',
 reduction:'area-weighted mean of unit source normals; never renormalize reduced moments',
 formula:'v=max(0,1-length(mean)-1e-6)/max(length(mean),1e-4); rOut=clamp(r^4+power*v,0,1)^(1/4)',
 channelSpace:'RGB uses destination import color space; alpha is linear; all other channels unchanged',
 conflict:'active alpha composition and alpha coverage preservation reject together',
 ownership:'source bytes preserved; one retained moment level, source and destination coexist during reduction; existing lazy mip worker; no per-frame work',
 approximation:'isotropic; cannot recover directional lobes, mismatched UVs or missing texture borders',
});
const localPath=p=>typeof p==='string'&&p.length<=1000&&(p===''||/^Assets\/(?:[^/\\:\x00-\x1f]+\/)*[^/\\:\x00-\x1f]+\.(?:png|jpe?g|webp|gif|bmp|svg|hbtexture2d\.json)$/i.test(p)&&!p.split('/').some(v=>v==='.'||v==='..'));
export const compositeDescriptor=p=>typeof p==='string'&&/\.hbtexture2d\.json$/i.test(p);
export function textureCompositePolicy(value={}){
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!Object.hasOwn(textureCompositeDefaults,k)))throw Error('노멀·거칠기 합성 설정을 확인하세요.');
 const p={...textureCompositeDefaults,...value};
 if(!localPath(p.normalTexture)||!textureCompositeContract.channels.includes(p.channel)||!Number.isFinite(p.power)||p.power<0||p.power>16)throw Error('합성 노멀 텍스처·채널·강도를 확인하세요.');
 return Object.freeze(p);
}
export function validateTextureComposite(value,importPolicy={}){const p=textureCompositePolicy(value);if(p.normalTexture&&p.power>0&&p.channel==='a'&&importPolicy.preserveCoverage)throw Error('알파의 거칠기 합성과 커버리지 유지는 다른 채널을 사용해야 해요.');return p;}
export function validTextureComposite(value,importPolicy){try{validateTextureComposite(value,importPolicy);return true;}catch{return false;}}
// Descriptor resolution is deliberately one level: composition reads its RGB
// source, not that asset's cooked/renormalized mips or another composition.
export function compositeNormalSource(asset,resources){
 const p=validateTextureComposite(asset.composite,asset.import);if(!p.normalTexture)return '';
 if(!compositeDescriptor(p.normalTexture))return p.normalTexture;
 const normal=resources?.[p.normalTexture];
 if(normal?.dimension!=='texture2d'||!Array.isArray(normal.images)||normal.images.length!==1||!normal.images[0]||!localPath(normal.images[0])||compositeDescriptor(normal.images[0]))throw Error('합성 노멀 텍스처의 원본 이미지를 확인하세요.');
 return normal.images[0];
}
export function textureResourceClosure(paths,resources){
 const result={};for(const path of paths){const asset=resources?.[path];if(!asset)continue;result[path]=asset;const normal=asset.composite?.normalTexture;if(compositeDescriptor(normal)&&resources?.[normal])result[normal]=resources[normal];}return result;
}
export const textureResourceIdentity=(path,resources)=>JSON.stringify(textureResourceClosure([path],resources));
function reduce(source,width,height){
 const data=new Float32Array(width*height*3),bytes=source.data instanceof Uint8Array||source.data instanceof Uint8ClampedArray;
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const x0=x*source.width/width,x1=(x+1)*source.width/width,y0=y*source.height/height,y1=(y+1)*source.height/height,area=(x1-x0)*(y1-y0),at=(x+y*width)*3;
  for(let sy=Math.floor(y0);sy<Math.ceil(y1);sy++)for(let sx=Math.floor(x0);sx<Math.ceil(x1);sx++){
   const weight=(Math.min(sx+1,x1)-Math.max(sx,x0))*(Math.min(sy+1,y1)-Math.max(sy,y0))/area,from=(sx+sy*source.width)*(bytes?4:3);
   let nx=source.data[from],ny=source.data[from+1],nz=source.data[from+2];
   if(bytes){nx=nx/127.5-1;ny=ny/127.5-1;nz=nz/127.5-1;const n=Math.hypot(nx,ny,nz);if(n>1e-20){nx/=n;ny/=n;nz/=n;}else{nx=ny=0;nz=1;}}
   data[at]+=nx*weight;data[at+1]+=ny*weight;data[at+2]+=nz*weight;
  }
 }
 return{width,height,data};
}
const decode=v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4,encode=v=>v<=.0031308?v*12.92:1.055*v**(1/2.4)-.055;
export function normalRoughnessComposite(value,normalPixels,base,srgb){
 const policy=textureCompositePolicy(value);if(!policy.normalTexture)return null;
 if(!normalPixels||normalPixels.width<base.width||normalPixels.height<base.height)throw Error('합성 노멀 원본은 대상 텍스처와 같거나 더 커야 해요.');
 let moment=normalPixels;const levels=[],channel='rgba'.indexOf(policy.channel);let peakMomentLevelBytes=0;
 const advance=(width,height)=>{if(policy.power&&(moment.width!==width||moment.height!==height)){moment=reduce(moment,width,height);peakMomentLevelBytes=Math.max(peakMomentLevelBytes,moment.data.byteLength);}};
 return{report:{policy,normalSource:{width:normalPixels.width,height:normalPixels.height},levels},advance,apply(level,sourceMip){
  if(!policy.power){levels.push({sourceMip,meanVariance:0,maxVariance:0,adjustedPixels:0});return level;}
  advance(level.width,level.height);
  // Equal-size original normals are unit vectors, hence zero base variance.
  if(moment===normalPixels){levels.push({sourceMip,meanVariance:0,maxVariance:0,adjustedPixels:0,peakMomentLevelBytes});return level;}
  let data=level.data,sum=0,max=0,adjusted=0;
  for(let i=0,n=0;i<data.length;i+=4,n+=3){const length=Math.min(1,Math.hypot(moment.data[n],moment.data[n+1],moment.data[n+2])),variance=Math.max(0,1-length-1e-6)/Math.max(length,1e-4);sum+=variance;max=Math.max(max,variance);if(!variance)continue;
   const stored=data[i+channel]/255,r=srgb&&channel<3?decode(stored):stored,out=Math.min(1,Math.max(0,r**4+policy.power*variance))**.25,next=Math.round((srgb&&channel<3?encode(out):out)*255);
   if(next!==data[i+channel]){if(data===level.data)data=new Uint8Array(data);data[i+channel]=next;adjusted++;}
  }
  levels.push({sourceMip,meanVariance:sum/(data.length/4),maxVariance:max,adjustedPixels:adjusted,peakMomentLevelBytes});if(data===level.data)return level;
  if(channel===3&&level.coverage){let covered=0;for(let i=3;i<data.length;i+=4)if(data[i]/255>=(base.alphaCutoff??.5))covered++;const achieved=covered/(data.length/4);return{...level,data,coverage:{...level.coverage,achieved,error:Math.abs(achieved-level.coverage.target)}};}
  return{...level,data};
 }};
}
