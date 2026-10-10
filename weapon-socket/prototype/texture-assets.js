export const textureAssetTypes={cubemap:{label:'큐브맵',prefix:'TC_',group:'텍스처'},texturearray:{label:'텍스처 2D 배열',prefix:'TA_',group:'텍스처'},volumetexture:{label:'볼륨 텍스처',prefix:'TV_',group:'텍스처'}};
export const textureAssetSuffix={cubemap:'.hbcubemap.json',texturearray:'.hbtexturearray.json',volumetexture:'.hbvolumetexture.json'};
export const materialTextureTypes={texture2d:{sample:'texture',object:'textureObject',parameter:'textureObjectParameter',kind:'texture'},texturecube:{sample:'sampleCube',object:'cubeObject',parameter:'cubeParameter',kind:'cubemap'},texturearray:{sample:'sampleArray',object:'arrayObject',parameter:'arrayParameter',kind:'texturearray'},texture3d:{sample:'sampleVolume',object:'volumeObject',parameter:'volumeParameter',kind:'volumetexture'}};
export const textureNodeType=key=>Object.keys(materialTextureTypes).find(t=>Object.values(materialTextureTypes[t]).slice(0,3).includes(key));
const imagePath=p=>typeof p==='string'&&p.length<=1000&&(p===''||/^Assets\/(?:[^/\\:\x00-\x1f]+\/)*[^/\\:\x00-\x1f]+\.(png|jpe?g|webp|gif|bmp|svg)$/i.test(p)&&!p.split('/').some(v=>v==='.'||v==='..'));
export const validMaterialTexturePath=(type,path)=>type==='texture2d'?imagePath(path)&&!!path:!!materialTextureTypes[type]&&typeof path==='string'&&/^Assets\/(?:[^/\\:\x00-\x1f]+\/)*[^/\\:\x00-\x1f]+$/.test(path)&&!path.split('/').some(v=>v==='.'||v==='..')&&path.endsWith(textureAssetSuffix[materialTextureTypes[type].kind]);
export const createTextureAsset=(kind,name)=>({version:1,name,dimension:kind,images:Array(kind==='cubemap'?6:1).fill('')});
export const validTextureAsset=(kind,d)=>!!textureAssetTypes[kind]&&d?.version===1&&typeof d.name==='string'&&d.name.length>0&&d.name.length<=80&&d.dimension===kind&&Array.isArray(d.images)&&d.images.length>0&&(kind!=='cubemap'||d.images.length===6)&&d.images.every(imagePath);
export const validateTextureImages=(kind,d)=>{if(!validTextureAsset(kind,d)||d.images.some(p=>!p))throw Error('텍스처 이미지와 자료형을 확인하세요.');return d;};

// Renderers share decoding/ownership. Uploads happen only on asset creation, never per frame.
export function texturePlaceholder(THREE,type){
  const pixel=()=>new Uint8Array([255,255,255,255]);let map;
  if(type==='texturecube')map=new THREE.CubeTexture(Array.from({length:6},()=>new THREE.DataTexture(pixel(),1,1)));
  else if(type==='texturearray')map=new THREE.DataArrayTexture(pixel(),1,1,1);
  else if(type==='texture3d')map=new THREE.Data3DTexture(pixel(),1,1,1);
  else map=new THREE.DataTexture(pixel(),1,1);
  map.colorSpace=THREE.NoColorSpace;map.minFilter=map.magFilter=THREE.LinearFilter;map.needsUpdate=true;return map;
}
export async function loadMaterialTexture(THREE,binding,resources,fileUrl,renderer){
  const type=binding.type||'texture2d',kind=materialTextureTypes[type]?.kind;let map;
  if(type==='texture2d')map=await new THREE.TextureLoader().loadAsync(fileUrl(binding.path));
  else{
    const d=validateTextureImages(kind,resources?.[binding.path]),loader=new THREE.ImageLoader(),first=await loader.loadAsync(fileUrl(d.images[0])),w=first.width,h=first.height;
    if(!w||!h||type==='texturecube'&&w!==h)throw Error('텍스처 이미지 크기를 맞춰 주세요.');
    const gl=renderer?.isWebGLRenderer?renderer.getContext():renderer?.backend?.gl,limits=renderer?.backend?.device?.limits,maxSize=type==='texture3d'?(gl?.getParameter(gl.MAX_3D_TEXTURE_SIZE)??limits?.maxTextureDimension3D):(gl?.getParameter(gl.MAX_TEXTURE_SIZE)??limits?.maxTextureDimension2D),maxLayers=type==='texturearray'?(gl?.getParameter(gl.MAX_ARRAY_TEXTURE_LAYERS)??limits?.maxTextureArrayLayers):type==='texture3d'?maxSize:undefined;
    if(maxSize&&(w>maxSize||h>maxSize)||maxLayers&&d.images.length>maxLayers)throw Error('현재 그래픽 장치의 텍스처 크기나 슬라이스 한도를 넘었어요.');
    const sameSize=image=>{if(image.width!==w||image.height!==h)throw Error('텍스처 이미지 크기를 맞춰 주세요.');return image;};
    if(type==='texturecube')map=new THREE.CubeTexture([first,...await Promise.all(d.images.slice(1).map(async p=>sameSize(await loader.loadAsync(fileUrl(p)))))]);
    else{const bytes=w*h*d.images.length*4;if(!Number.isSafeInteger(bytes)||bytes>2147483647)throw Error('텍스처 데이터 크기를 확인하세요.');const pixels=new Uint8Array(bytes),canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;const c=canvas.getContext('2d',{willReadFrequently:true});if(!c)throw Error('텍스처 이미지 변환을 시작할 수 없어요.');
      try{for(let z=0;z<d.images.length;z++){const image=z===0?first:sameSize(await loader.loadAsync(fileUrl(d.images[z])));c.clearRect(0,0,w,h);c.drawImage(image,0,0);pixels.set(c.getImageData(0,0,w,h).data,z*w*h*4);}}finally{canvas.width=canvas.height=0;}
      map=type==='texturearray'?new THREE.DataArrayTexture(pixels,w,h,d.images.length):new THREE.Data3DTexture(pixels,w,h,d.images.length);map.minFilter=map.magFilter=THREE.LinearFilter;
    }
  }
  map.colorSpace=THREE.NoColorSpace;map.wrapS=map.wrapT=map.wrapR=binding.wrap==='repeat'?THREE.RepeatWrapping:THREE.ClampToEdgeWrapping;map.needsUpdate=true;return map;
}
