import * as THREE from 'three';

// ponytail: cookies are at most256x256/64 layers (16MiB); tiled arrays can retain larger artwork when needed.
export class LightCookieArray{
  constructor(){this.texture=null;this.keys=[];this.size=0;this.uploads=0;}
  prepare(lights){
    const cookies=[...new Map(lights.filter(g=>g.userData.light2d.lightType==='sprite'&&g.userData.light2d.targetSortingLayers.length).map(g=>g.userData.light2dCookie).filter(Boolean).map(c=>[c.key,c])).values()];
    if(!cookies.length){this.dispose();return new Map();}
    const size=Math.min(256,2**Math.ceil(Math.log2(Math.max(...cookies.flatMap(c=>c.rect.slice(2)))))),depth=2**Math.ceil(Math.log2(cookies.length));
    if(!this.texture||this.size!==size||this.texture.image.depth!==depth){this.texture?.dispose();this.texture=new THREE.DataArrayTexture(new Uint8Array(size*size*depth*4),size,size,depth);this.texture.colorSpace=THREE.SRGBColorSpace;this.texture.minFilter=this.texture.magFilter=THREE.LinearFilter;this.size=size;this.keys=[];}
    const indices=new Map();let changed=false;
    for(const [i,cookie] of cookies.entries()){
      indices.set(cookie.key,i);if(this.keys[i]===cookie.key)continue;
      const canvas=this.canvas??=document.createElement('canvas');canvas.width=canvas.height=size;const context=canvas.getContext('2d',{willReadFrequently:true});context.imageSmoothingEnabled=cookie.filter==='linear';context.drawImage(cookie.texture.image,...cookie.rect,0,0,size,size);
      this.texture.image.data.set(context.getImageData(0,0,size,size).data,i*size*size*4);this.texture.addLayerUpdate(i);this.keys[i]=cookie.key;changed=true;
    }
    this.keys.length=cookies.length;if(changed){this.texture.needsUpdate=true;this.uploads++;}return indices;
  }
  dispose(){this.texture?.dispose();this.texture=null;this.keys=[];this.size=0;this.canvas=null;}
}
