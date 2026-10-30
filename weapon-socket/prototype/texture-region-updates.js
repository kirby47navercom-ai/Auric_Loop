import {residentMipSource,residentMipBase} from './texture-resident-view.js';
import {authoredTextureLevels} from './texture-authored-mips.js';
import {textureUploadBytes} from './native-texture-mips.js';
import {diskMipSource} from './texture-disk-mips.js';

const updates=new WeakMap();
const levelsOf=texture=>{
 if(diskMipSource(residentMipSource(texture)))throw Error('디스크 밉은 읽기 전용이에요. 런타임 픽셀 수정에는 일반 가져오기 텍스처를 사용하세요.');
 if(texture.userData?.hbAuthoredMips)return authoredTextureLevels(texture);
 if(!texture.userData?.hbCookedMips)return null;const levels=texture.mipmaps,base=texture.image;if(!texture.isDataTexture||!Array.isArray(levels)||!levels.length||levels.length>1+Math.floor(Math.log2(Math.max(base.width,base.height))))throw Error('2D 밉 자료를 확인하세요.');let w=base.width,h=base.height;
 for(const[index,l]of levels.entries()){if(!Number.isSafeInteger(w)||!Number.isSafeInteger(h)||w<1||h<1||l.width!==w||l.height!==h||!(l.data instanceof Uint8Array||l.data instanceof Uint8ClampedArray)||l.data.length!==w*h*4||index===0&&l.data!==base.data)throw Error('2D 밉 소유권과 크기를 확인하세요.');w=Math.max(1,Math.floor(w/2));h=Math.max(1,Math.floor(h/2));}return levels.map(l=>({...l,depth:1}));
};
const integer=v=>Number.isSafeInteger(v)&&v>=0;
// Runtime data only. The source asset remains unchanged; ordinary version
// invalidation resets material/ray history exactly as a full texture edit does.
function preparePhysicalRegionWrite(texture,patches,write=true,allowEmpty=false,copy=true){
 const levels=levelsOf(texture);if(texture.generateMipmaps||!levels?.length||!Array.isArray(patches)||!allowEmpty&&!patches.length)throw Error('명시적 RGBA8 밉과 갱신 영역을 확인하세요.');
 const owned=patches.map(p=>{if(!p||![p.level,p.x,p.y,p.z,p.width,p.height,p.depth].every(integer)||!p.width||!p.height||!p.depth)throw Error('텍스처 갱신 영역은 정수 크기가 필요해요.');const l=levels[p.level];if(!l||!(l.data instanceof Uint8Array||l.data instanceof Uint8ClampedArray)||p.x>=l.width||p.width>l.width-p.x||p.y>=l.height||p.height>l.height-p.y||p.z>=l.depth||p.depth>l.depth-p.z||!(p.data instanceof Uint8Array||p.data instanceof Uint8ClampedArray)||!Number.isSafeInteger(p.width*p.height*p.depth*4)||p.data.length!==p.width*p.height*p.depth*4)throw Error('텍스처 갱신 경계와 RGBA8 자료가 달라요.');return {...p,data:copy?new Uint8Array(p.data):p.data};});
 const baseVersion=texture.version,image=texture.image,mips=texture.mipmaps;let committed=false;const valid=()=>!committed&&texture.version===baseVersion&&texture.image===image&&texture.mipmaps===mips;
 return {valid,owned,commit(){if(!valid())throw Error('텍스처 갱신 준비 뒤 자료가 바뀌었어요.');committed=true;
 if(write)for(const p of owned){const l=levels[p.level],stride=p.width*4;for(let z=0;z<p.depth;z++)for(let y=0;y<p.height;y++){const at=((p.z+z)*l.height*l.width+(p.y+y)*l.width+p.x)*4,row=p.data.subarray((z*p.height+y)*stride,(z*p.height+y+1)*stride);l.data.set(row,at);
 // Engine-loaded cubes normally share one packed buffer. Also preserve
 // accepted distinct owned face buffers when authoredTextureLevels flattened them.
 if(texture.isCubeTexture){const face=(p.level===0?texture:texture.mipmaps[p.level-1]).images[p.z+z].image.data;if(face.buffer!==l.data.buffer||face.byteOffset!==l.data.byteOffset+(p.z+z)*l.width*l.height*4)face.set(row,((p.y+y)*l.width+p.x)*4);}
 }}
 texture.needsUpdate=true;
 const bytes=owned.reduce((n,p)=>n+p.data.byteLength,0),total=levels.reduce((n,l)=>n+l.data.byteLength,0);if(bytes<=total)updates.set(texture,{baseVersion,version:texture.version,image:texture.image,mips:texture.mipmaps,patches:owned});else updates.delete(texture);
 return {version:texture.version,regions:owned.length,bytes};}};
}
export function prepareTextureRegionWrite(texture,patches){
 const source=residentMipSource(texture),original=preparePhysicalRegionWrite(source,patches);if(source===texture)return {valid:original.valid,commit:original.commit};
 const base=residentMipBase(texture),physical=preparePhysicalRegionWrite(texture,original.owned.filter(p=>p.level>=base).map(p=>({...p,level:p.level-base})),false,true,false),valid=()=>original.valid()&&physical.valid();
 return {valid,commit(){if(!valid())throw Error('텍스처 갱신 준비 뒤 자료가 바뀌었어요.');const sourceResult=original.commit(),result=physical.commit();return {...result,logicalRegions:sourceResult.regions,logicalBytes:sourceResult.bytes,residentBase:base};}};
}
export const writeTextureRegions=(texture,patches)=>prepareTextureRegionWrite(texture,patches).commit();
export function textureRegionColors(level,origin,size,colors){
 if(!integer(level)||!Array.isArray(origin)||origin.length!==3||!origin.every(integer)||!Array.isArray(size)||size.length!==3||!size.every(v=>integer(v)&&v>0)||!Number.isSafeInteger(size[0]*size[1]*size[2]*4)||!Array.isArray(colors)||colors.length!==size[0]*size[1]*size[2]||colors.some(c=>!Array.isArray(c)||c.length!==4||c.some(v=>!Number.isFinite(v)||v<0||v>1)))throw Error('텍스처 영역·픽셀 수·0~1 RGBA 색상을 확인하세요.');
 const data=new Uint8Array(colors.length*4);for(let i=0;i<colors.length;i++)for(let c=0;c<4;c++)data[i*4+c]=Math.round(colors[i][c]*255);return {level,x:origin[0],y:origin[1],z:origin[2],width:size[0],height:size[1],depth:size[2],data};
}
export function textureRegionUpdates(texture,seenVersion){const state=updates.get(texture);return state&&state.baseVersion===seenVersion&&state.version===texture.version&&state.image===texture.image&&state.mips===texture.mipmaps?state.patches:null;}
export function textureUploadRegions(texture,seenVersion){const patches=textureRegionUpdates(texture,seenVersion);if(!patches)return null;const levels=levelsOf(texture);return patches.map(p=>({level:p.level,x:p.x,y:texture.flipY?levels[p.level].height-p.y-p.height:p.y,z:p.z,width:p.width,height:p.height,depth:p.depth,data:textureUploadBytes(p.data,p.height,p.width*4,texture.flipY)}));}
export function packedTextureRegionUpdates(texture,seenVersion,encode){const patches=textureUploadRegions(texture,seenVersion);return patches?{kind:'textureRegions',patches:patches.map(({data,...p})=>({...p,rgbaBase64:encode(data)}))}:null;}
export const textureRegionUpdateContract=Object.freeze({version:1,api:'writeTextureRegions(texture,[{level,x,y,z,width,height,depth,data:Uint8Array}])',cpp:'Materials::SetTextureRegion(target,parameter,level,origin,size,vector<Color> pixels)',node:'materialTextureRegion',format:'owned explicit RGBA8 mip chains; 2D, array layers, six cube faces, volume slices; Color uses normalized storage-encoded RGBA with no extra color transform',validation:'whole batch validated and snapshotted before mutation; texel coordinates and tightly packed top-down slice-major RGBA8',history:'normal texture.version invalidation; authored source files untouched; resident views validate/write source logical levels and upload only physical level-minus-base boxes, nonresident edits retain an empty version batch',retention:'one batch no larger than owned levels; missed versions/full uploads remain correct; no unbounded journal',backends:Object.freeze({d3d11:'existing resource UpdateSubresource boxes',webgpu:'existing resource queue.writeTexture boxes',webgl2:'prepareGPUAuthoredMips after writes uses existing texSubImage2D/3D boxes; engine runtime does this automatically; unavailable/stale resource uses full upload'})});
