import {sphericalEnvironmentMips} from './environment-mips.js';
export {sphericalEnvironmentMips} from './environment-mips.js';
import {DataUtils,HalfFloatType,FloatType} from 'three';
import {HDRLoader} from 'three/addons/loaders/HDRLoader.js';
import {EXRLoader} from 'three/addons/loaders/EXRLoader.js';
const cache=new WeakMap();


export async function loadPathEnvironment(path,url){
 if(!/^Assets\/(?:[^/\\:\x00-\x1f]+\/)*[^/\\:\x00-\x1f]+\.(hdr|exr)$/i.test(path)||path.split('/').some(p=>p==='.'||p==='..'))throw Error('HDRI는 프로젝트의 HDR·EXR 파일을 지정하세요.');
 const loader=/\.exr$/i.test(path)?new EXRLoader():new HDRLoader();loader.setDataType(FloatType);return loader.loadAsync(url(path));
}
// Exact lat-long texel solid angles keep the sampling PDF finite at both poles.
export function packPathEnvironment(map,lod=true){
 if(!map)return null;const old=cache.get(map);if(old?.version===map.version&&old.image===map.image&&old.lod===lod)return old;
 const {width:w,height:h,data}=map.image||{},count=w*h;if(!Number.isInteger(w)||!Number.isInteger(h)||w<1||h<1||w>16384||h>16384||!data||data.length!==count*4||count+Math.ceil(count/2)>=2**24)throw Error('HDRI 크기와 RGBA 원본을 확인하세요.');
 const radiance=new Float32Array(count*4),weights=new Float64Array(count);let totalWeight=0;
 for(let y=0;y<h;y++){const area=2*Math.PI/w*(Math.cos(Math.PI*y/h)-Math.cos(Math.PI*(y+1)/h));for(let x=0;x<w;x++){const i=y*w+x;for(let c=0;c<3;c++){const v=map.type===HalfFloatType?DataUtils.fromHalfFloat(data[i*4+c]):data[i*4+c];if(!Number.isFinite(v)||v<0||v>65000)throw Error('HDRI 선형 방사휘도 범위를 확인하세요.');radiance[i*4+c]=v;}weights[i]=area*(.2126*radiance[i*4]+.7152*radiance[i*4+1]+.0722*radiance[i*4+2]);totalWeight+=weights[i];}}
 const levels=lod?sphericalEnvironmentMips(radiance,w,h):[],base=count+Math.ceil(count/2),mipOffset=lod?base:0,texels=base+levels.length*3+levels.slice(1).reduce((n,l)=>n+l.width*l.height,0);
 if(texels>=2**24)throw Error('HDRI 밉 주소가 GPU 한계를 넘었어요.');const textureWidth=Math.min(4096,texels),textureHeight=Math.ceil(texels/textureWidth),values=new Float32Array(textureWidth*textureHeight*4);values.set(radiance);
 let pointer=base+levels.length,poles=base+levels.length+levels.slice(1).reduce((n,l)=>n+l.width*l.height,0);for(let level=0;level<levels.length;level++){const l=levels[level],pole=poles+level*2;values.set([level?pointer:0,l.width,l.height,pole],(base+level)*4);if(level){values.set(l.data,pointer*4);pointer+=l.width*l.height;}for(let side=0;side<2;side++){const y=side?l.height-1:0,rgb=[0,0,0];for(let x=0;x<l.width;x++)for(let c=0;c<3;c++)rgb[c]+=l.data[(y*l.width+x)*4+c];for(let c=0;c<3;c++)values[(pole+side)*4+c]=rgb[c]/l.width;}}
 const small=[],large=[],scaled=new Float64Array(count);for(let i=0;i<count;i++){const y=Math.floor(i/w),area=2*Math.PI/w*(Math.cos(Math.PI*y/h)-Math.cos(Math.PI*(y+1)/h)),probability=totalWeight>0?weights[i]/totalWeight:area/(4*Math.PI);values[i*4+3]=probability/area;scaled[i]=probability*count;(scaled[i]<1?small:large).push(i);}
 while(small.length&&large.length){const a=small.pop(),b=large.pop(),at=count*4+a*2;values[at]=scaled[a];values[at+1]=b;scaled[b]+=scaled[a]-1;(scaled[b]<1?small:large).push(b);}for(const i of [...small,...large]){values[count*4+i*2]=1;values[count*4+i*2+1]=i;}
 const result={values,width:w,height:h,textureWidth,textureHeight,texels,mipOffset,mipLevels:levels.length,lod,version:map.version,image:map.image};cache.set(map,result);return result;
}
export function releasePathEnvironment(map){if(map)cache.delete(map);}
