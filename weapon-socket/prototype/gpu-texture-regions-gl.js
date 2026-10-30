import {textureUploadRegions} from './texture-region-updates.js';

// Advance pinned Three's own version bookkeeping through initTexture, while
// replacing only this already-created texture's full uploads with our boxes.
// All context methods are restored before returning; no draw/frame wrapper.
export function initGLTextureRegions(renderer,map){
 const props=renderer.properties.get(map),resource=props.__webglTexture,patches=textureUploadRegions(map,props.__version);if(!resource||!patches)return false;
 const gl=renderer.getContext(),sub2=gl.texSubImage2D,sub3=gl.texSubImage3D,cube=!!map.isCubeTexture,layered=!!map.isDataArrayTexture||!!map.isData3DTexture,target=cube?gl.TEXTURE_CUBE_MAP:map.isData3DTexture?gl.TEXTURE_3D:map.isDataArrayTexture?gl.TEXTURE_2D_ARRAY:gl.TEXTURE_2D,binding=cube?gl.TEXTURE_BINDING_CUBE_MAP:map.isData3DTexture?gl.TEXTURE_BINDING_3D:map.isDataArrayTexture?gl.TEXTURE_BINDING_2D_ARRAY:gl.TEXTURE_BINDING_2D;
 const owned=t=>(t===target||cube&&t>=gl.TEXTURE_CUBE_MAP_POSITIVE_X&&t<=gl.TEXTURE_CUBE_MAP_NEGATIVE_Z)&&gl.getParameter(binding)===resource;
 gl.texSubImage2D=function(t,...args){if(!owned(t))return sub2.call(this,t,...args);};gl.texSubImage3D=function(t,...args){if(!owned(t))return sub3.call(this,t,...args);};
 try{renderer.initTexture(map);}finally{gl.texSubImage2D=sub2;gl.texSubImage3D=sub3;}
 const previous=gl.getParameter(binding),parameters=[gl.UNPACK_ALIGNMENT,gl.UNPACK_FLIP_Y_WEBGL,gl.UNPACK_ROW_LENGTH,gl.UNPACK_IMAGE_HEIGHT,gl.UNPACK_SKIP_PIXELS,gl.UNPACK_SKIP_ROWS,gl.UNPACK_SKIP_IMAGES],values=parameters.map(p=>gl.getParameter(p));
 try{gl.bindTexture(target,resource);parameters.forEach((p,i)=>gl.pixelStorei(p,i===0?1:0));for(const p of patches){if(layered)sub3.call(gl,target,p.level,p.x,p.y,p.z,p.width,p.height,p.depth,gl.RGBA,gl.UNSIGNED_BYTE,p.data);else{const slice=p.width*p.height*4;for(let z=0;z<p.depth;z++)sub2.call(gl,cube?gl.TEXTURE_CUBE_MAP_POSITIVE_X+p.z+z:target,p.level,p.x,p.y,p.width,p.height,gl.RGBA,gl.UNSIGNED_BYTE,p.data.subarray(z*slice,(z+1)*slice));}}}
 finally{parameters.forEach((p,i)=>gl.pixelStorei(p,values[i]));gl.bindTexture(target,previous);}return true;
}
