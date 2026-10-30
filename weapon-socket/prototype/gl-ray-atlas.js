const renderers=new WeakMap();
const fields=['source','wrapS','wrapT','magFilter','minFilter','anisotropy','format','internalFormat','type','generateMipmaps','premultiplyAlpha','flipY','unpackAlignment','colorSpace'];
const same=(texture,old)=>texture.image?.width===old.width&&texture.image?.height===old.height&&fields.every(key=>Object.is(texture[key],old[key]));
const stamp=texture=>Object.assign({width:texture.image?.width,height:texture.image?.height},Object.fromEntries(fields.map(key=>[key,texture[key]])));
// Three r180 applies DataTexture.updateRanges even to newly allocated storage.
// CPU-only preparation may have queued one changing row before the first draw.
// Initialize/recover the whole atlas once per GL resource; normal row uploads
// remain owned by Three. No extra texture, framebuffer or readback is created.
export function prepareGLRayAtlas(renderer,texture){
 if(!renderer?.isWebGLRenderer||!texture?.userData?.hbRayScene)return false;
 let record=renderers.get(renderer);if(!record){record={textures:new WeakMap(),fullUploads:0,fullBytes:0,lastReason:null};renderers.set(renderer,record);}const old=record.textures.get(texture),properties=renderer.properties.get(texture),handle=properties.__webglTexture;
 if(old&&handle&&old.handle===handle&&same(texture,old.stamp))return false;
 const reason=!old?'initial':handle!==old.handle||!handle?'resource':'sampler',ranges=texture.updateRanges.map(r=>({...r}));texture.clearUpdateRanges();texture.needsUpdate=true;
 try{renderer.initTexture(texture);}catch(error){texture.clearUpdateRanges();for(const r of ranges)texture.addUpdateRange(r.start,r.count);throw error;}
 const uploaded=renderer.properties.get(texture).__webglTexture;if(uploaded){record.textures.set(texture,{handle:uploaded,stamp:stamp(texture)});record.fullUploads++;record.fullBytes+=texture.image.data.byteLength;record.lastReason=reason;}return !!uploaded;
}
export function glRayAtlasInfo(renderer){const r=renderers.get(renderer);return r?{fullUploads:r.fullUploads,fullBytes:r.fullBytes,lastReason:r.lastReason,scope:'owned Float32 ray atlas full initialization/recovery only; subsequent Three row uploads and driver heap excluded'}:null;}
