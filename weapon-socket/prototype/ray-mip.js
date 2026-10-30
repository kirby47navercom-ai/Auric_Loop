import {NearestFilter,NearestMipmapNearestFilter,NearestMipmapLinearFilter,LinearMipmapNearestFilter,LinearMipmapLinearFilter} from '../node_modules/three/src/constants.js';
import {authoredTextureLevels} from './texture-authored-mips.js';
import {validRayTextureFlags,rayTextureSampling} from './texture-sampling-mode.js';

import {rayMipCache as cache} from './ray-mip-cache.js';
export const rayMipFilter=map=>map.generateMipmaps===false&&!map.userData?.hbCookedMips&&!map.userData?.hbAuthoredMips?0:({[NearestMipmapNearestFilter]:1,[LinearMipmapNearestFilter]:2,[NearestMipmapLinearFilter]:3,[LinearMipmapLinearFilter]:4}[map.minFilter]||0);
export const releaseRayMips=maps=>{for(const map of maps||[])cache.delete(map);};
export function rayMipChain(map,pixels,srgb,volume=false){
 const key=[pixels.version,pixels.width,pixels.height,pixels.depth,srgb,volume,!!rayMipFilter(map)].join(':'),prior=cache.get(map);
 if(prior?.pixels===pixels&&prior.version===pixels.version&&prior.chains.has(key))return prior.chains.get(key);
 const chains=prior?.pixels===pixels&&prior.version===pixels.version?prior.chains:new Map();
 if(map.userData?.hbAuthoredMips){
  const source=authoredTextureLevels(map),convertedKey='authored:'+srgb,converted=chains.get(convertedKey)||[],count=rayMipFilter(map)?source.length:1;
  for(let level=converted.length;level<count;level++){const s=source[level],data=new Float32Array(s.data.length);for(let i=0;i<data.length;i++){let v=s.data[i]/255;if(srgb&&i%4!==3)v=v<=.04045?v/12.92:((v+.055)/1.055)**2.4;data[i]=v;}converted.push({width:s.width,height:s.height,depth:s.depth,data});}
  const levels=converted.slice(0,count);chains.set(convertedKey,converted);chains.set(key,levels);cache.set(map,{pixels,version:pixels.version,chains});return levels;
 }
 if(map.userData?.hbCookedMips){
  const source=map.mipmaps;if(volume||pixels.depth!==1||!Array.isArray(source)||!source.length||source.length>1+Math.floor(Math.log2(Math.max(pixels.width,pixels.height))))throw Error('가져온 2D 밉 체인을 확인하세요.');
  let w=pixels.width,h=pixels.height;for(const level of source){if(level.width!==w||level.height!==h||!(level.data instanceof Uint8Array||level.data instanceof Uint8ClampedArray)||level.data.length!==w*h*4)throw Error('가져온 밉 크기와 픽셀을 확인하세요.');w=Math.max(1,Math.floor(w/2));h=Math.max(1,Math.floor(h/2));}
  const convertedKey='cooked:'+srgb,converted=chains.get(convertedKey)||[],count=rayMipFilter(map)?source.length:1;
  for(let level=converted.length;level<count;level++){const s=source[level],data=new Float32Array(s.data.length);for(let i=0;i<data.length;i++){let v=s.data[i]/255;if(srgb&&i%4!==3)v=v<=.04045?v/12.92:((v+.055)/1.055)**2.4;data[i]=v;}converted.push({width:s.width,height:s.height,depth:1,data});}
  const levels=converted.slice(0,count);chains.set(convertedKey,converted);chains.set(key,levels);cache.set(map,{pixels,version:pixels.version,chains});return levels;
 }
 // Switching minification on/off must not retain two copies of level zero.
 // Grow one version-owned chain, but return separate level lists so a caller's
 // no-mip snapshot cannot silently gain levels during a later request.
 const convertedKey='generated:'+srgb+':'+volume,levels=chains.get(convertedKey)||[];
 if(!levels.length){const data=new Float32Array(pixels.data.length);
  for(let i=0;i<data.length;i++){let v=pixels.data[i]/(pixels.float?1:255);if(!Number.isFinite(v)||Math.abs(v)>65000)throw Error('광선 텍스처 픽셀 값을 확인하세요.');if(srgb&&i%4!==3)v=v<=.04045?v/12.92:((v+.055)/1.055)**2.4;if(!Number.isFinite(v)||Math.abs(v)>65000)throw Error('광선 텍스처 선형 색 값을 확인하세요.');data[i]=v;}
  levels.push({width:pixels.width,height:pixels.height,depth:pixels.depth,data});
 }
 if(rayMipFilter(map))while(levels.at(-1).width>1||levels.at(-1).height>1||volume&&levels.at(-1).depth>1){
  const source=levels.at(-1),width=Math.max(1,Math.floor(source.width/2)),height=Math.max(1,Math.floor(source.height/2)),depth=volume?Math.max(1,Math.floor(source.depth/2)):source.depth,out=new Float32Array(width*height*depth*4);
  // Area weights retain odd edge texels; array/cube layers remain independent.
  for(let z=0;z<depth;z++)for(let y=0;y<height;y++)for(let x=0;x<width;x++){
   const low=[x*source.width/width,y*source.height/height,volume?z*source.depth/depth:z],high=[(x+1)*source.width/width,(y+1)*source.height/height,volume?(z+1)*source.depth/depth:z+1],weight=(high[0]-low[0])*(high[1]-low[1])*(high[2]-low[2]),target=(x+(y+z*height)*width)*4;
   for(let iz=Math.floor(low[2]);iz<Math.ceil(high[2]);iz++)for(let iy=Math.floor(low[1]);iy<Math.ceil(high[1]);iy++)for(let ix=Math.floor(low[0]);ix<Math.ceil(high[0]);ix++){
    const w=(Math.min(ix+1,high[0])-Math.max(ix,low[0]))*(Math.min(iy+1,high[1])-Math.max(iy,low[1]))*(Math.min(iz+1,high[2])-Math.max(iz,low[2]))/weight,at=(ix+(iy+iz*source.height)*source.width)*4;
    for(let c=0;c<4;c++)out[target+c]+=source.data[at+c]*w;
   }
  }levels.push({width,height,depth,data:out});
 }
 const result=rayMipFilter(map)?levels.slice():levels.slice(0,1);chains.set(convertedKey,levels);chains.set(key,result);cache.set(map,{pixels,version:pixels.version,chains});return result;
}

// Cube LOD is explicit. Fixed level/spatial filters cannot observe derivatives.
export function rayTextureNeedsFootprint(instruction){
 const kind=instruction[8],flags=instruction[10];
 if(!Number.isInteger(kind)||kind<0||kind>3||!validRayTextureFlags(flags))return true;
 const sampling=rayTextureSampling(kind,flags);if(sampling.mode==='lod'||sampling.mode==='gradient')return false;
 const mode=Math.floor(sampling.filter/2),nearest=sampling.filter%2;
 return mode!==0&&mode!==5||nearest!==(mode===5?1:0);
}

// Mark coordinate ancestors before register reuse; no derivative storage for unrelated shading.
export function rayCoordinateInstructions(instructions,live=null){
 const definitions=new Map(),parents=[],needed=new Set();
 for(let n=0;n<instructions.length;n++){const i=instructions[n];parents[n]=i.slice(4,8).map(r=>definitions.get(r)).filter(n=>n!==undefined);if(i[0]===9&&rayTextureNeedsFootprint(i)&&(!live||live.has(n))){for(const r of i.slice(4,6)){const p=definitions.get(r);if(p!==undefined)needed.add(p);}}if(i[0]!==8)definitions.set(i[1],n);}
 for(let n=instructions.length-1;n>=0;n--)if(needed.has(n))for(const p of parents[n])needed.add(p);
 return needed;
}
// A uniform value can change with the committed material clock while staying
// constant across this footprint. Track instruction versions, never register
// numbers: a later constant overwrite must not inherit an earlier UV delta.
export function rayVaryingCoordinateInstructions(instructions,live=null){
 const needed=rayCoordinateInstructions(instructions,live),definitions=new Map(),varying=[];
 for(let n=0;n<instructions.length;n++){const i=instructions[n],op=i[0];varying[n]=op===1||op===3||op===4||![0,2,5,8].includes(op)&&i.slice(4,8).some(r=>r>=0&&varying[definitions.get(r)]);if(op!==8)definitions.set(i[1],n);}
 return new Set([...needed].filter(n=>varying[n]));
}
// Reuse the register-version-aware coordinate dependency walk. This is shader
// preparation metadata, never a per-frame material or texture scan.
export const rayDifferentialOperations=programs=>[...new Set(programs.flatMap(p=>[...rayVaryingCoordinateInstructions(p.instructions)].map(n=>p.instructions[n][0])))].sort((a,b)=>a-b);
export const rayTextureFlags=map=>(map.magFilter===NearestFilter?1:0)+2*(rayMipFilter(map)||(rayMinNearest(map)?5:0));
export const rayMinNearest=map=>[NearestFilter,NearestMipmapNearestFilter,NearestMipmapLinearFilter].includes(map.minFilter);
