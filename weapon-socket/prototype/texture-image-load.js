// Image decoding keeps the existing browser image/canvas color behavior.
// Each pending image is owned by its caller; abort removes its callbacks and
// clears only that image's request, never another loader or browser surface.
export function loadTextureImage(url,signal){
 return new Promise((resolve,reject)=>{
  signal?.throwIfAborted();
  const image=new Image(),cleanup=()=>{image.onload=image.onerror=null;signal?.removeEventListener('abort',abort);},abort=()=>{cleanup();image.src='';reject(signal.reason||new DOMException('Texture image cancelled','AbortError'));};
  image.onload=()=>{cleanup();resolve(image);};image.onerror=()=>{cleanup();reject(Error('텍스처 이미지를 읽지 못했어요.'));};
  signal?.addEventListener('abort',abort,{once:true});image.crossOrigin='anonymous';image.src=url;
 });
}
export function textureImagePixels(image,flip=false){
 const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;
 try{const context=canvas.getContext('2d',{willReadFrequently:true});if(!context)throw Error('텍스처 원본 픽셀을 읽지 못했어요.');if(flip){context.translate(0,canvas.height);context.scale(1,-1);}context.drawImage(image,0,0);return {width:canvas.width,height:canvas.height,data:context.getImageData(0,0,canvas.width,canvas.height).data};}finally{canvas.width=canvas.height=0;}
}
