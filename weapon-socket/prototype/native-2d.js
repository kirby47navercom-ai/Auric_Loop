import * as THREE from 'three';

const identity=new THREE.Matrix3();
export function native2DSettings(material,size){
  const mask=material.userData.hbSpriteMask,light=material.userData.hbLight2D,transform=light?.hbLight2DMaskTransform.value.elements||identity.elements;
  return {pass:[0,mask?.hbSpriteMaskMode.value||0,light?1:0,light?.hbLight2DHasMask.value||0],screen:[...size,light?.hbLight2DLayer.value||0,light?.hbLight2DCount.value||0],origin:[...(light?.hbLight2DOrigin.value.toArray()||[0,0]),light?.hbLight2DVolume.value??-1,light?.hbLight2DCookieSize.value||1],modes:light?.hbLight2DModes.value.toArray()||[0,0,0,0],channels:light?.hbLight2DChannels.value.toArray()||[-1,-1,-1,-1],maskX:[transform[0],transform[3],transform[6],0],maskY:[transform[1],transform[4],transform[7],0],project:[0,0,0,0]};
}
export function native2DTextures(material){
  const m=material.userData.hbSpriteMask,l=material.userData.hbLight2D;
  return [m?.hbSpriteMask.value,l?.hbLight2DData.value,l?.hbLight2DShape.value,l?.hbShadowAtlas.value,l?.hbShadowRects.value,l?.hbShadowBounds.value,l?.hbLight2DCookies.value,l?.hbLight2DMask.value];
}
export function nativeMaskMaterial(map,alphaCutoff){const m=new THREE.MeshBasicMaterial({color:0xffffff,map,alphaTest:alphaCutoff,side:THREE.DoubleSide,depthTest:false,depthWrite:false,toneMapped:false});m.userData.hbNative2DPass=1;return m;}
export function nativeShadowMaterials(){
  const materials={};for(const [i,mode] of ['self','unshadow','project','inside','reset'].entries()){
    const m=new THREE.MeshBasicMaterial({side:THREE.DoubleSide,depthTest:false,depthWrite:false,toneMapped:false});m.userData.hbNative2DPass=i+2;
    m.uniforms={map:{value:null},hasMap:{value:false},transform:{value:new THREE.Matrix3()},opacity:{value:1},cutoff:{value:0},origin:{value:new THREE.Vector2()},distance:{value:1},softness:{value:0}};materials[mode]=m;
  }return materials;
}
export function native2DTarget(width,height,options){
  const target=new THREE.RenderTarget(width,height,options);Object.defineProperty(target.texture.userData,'hbNativeTarget',{value:target});return target;
}
export function nativeOffscreenDraw(node,camera,meshResource,textureResource,resources){
  node.onBeforeRender(null,null,camera,node.geometry,node.material,null);const material=node.material,mode=material.userData.hbNative2DPass,u=material.uniforms;
  if(!mode)throw Error('DirectX 2D 보조 패스 머테리얼을 확인하세요.');
  const map=mode===1?material.map:u.map.value;if(map?.matrixAutoUpdate)map.updateMatrix();const t=mode===1?map?.matrix||identity:u.transform.value,e=t.elements,wrap=value=>value===THREE.RepeatWrapping?0:value===THREE.MirroredRepeatWrapping?1:2;
  return {mesh:meshResource(node.geometry,resources),world:node.matrixWorld.toArray(),map:textureResource(map,resources),sampling:map?(map.magFilter===THREE.NearestFilter?1:0)+wrap(map.wrapS)*2+wrap(map.wrapT)*6:16,opacity:mode===1?material.opacity:u.opacity.value,uvX:[e[0],e[3],e[6],0],uvY:[e[1],e[4],e[7],0],mode,cutoff:mode===1?material.alphaTest:u.cutoff.value,project:mode===4||mode===5?[...u.origin.value.toArray(),u.distance.value,u.softness.value]:[0,0,0,0]};
}
