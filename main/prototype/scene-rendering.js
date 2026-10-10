import {BloomRendering} from './bloom-rendering.js';
import {resolveSprite} from './sprite-import.js';
import {createGameCamera,selectGameCamera} from './game-camera.js';
import * as THREE from 'three';
import {DecalGeometry} from 'three/addons/geometries/DecalGeometry.js';
import {enabledComponent,objectComponents,componentDefaults} from './scene-components.js';
import {spriteSlices,spriteImage,tileAtlasRect,tileRenderRect} from './two-d-assets.js';
import {tilemapColliders} from './tilemap-runtime.js';
import {createThreeMaterial,materialParameterKey,materialParameters,resolveMaterialAsset} from './material-runtime.js';
import {validMaterialTexturePath,validateTextureImages} from './texture-assets.js';
import {ParticleSimulation} from './scene-systems.js';
import {TwoDRendering,spriteEffectsUniforms,createSpriteMaskMaterial} from './two-d-rendering.js';
import {SpriteRigPose} from './sprite-rig-runtime.js';
import {cacheAssetReader} from './runtime-storage.js';
import {light2DUniforms} from './two-d-lighting.js';

// Scene-owned GPU resources are released together when an object is rebuilt.
const visualTypes=new Set(['MeshRenderer','SpriteRenderer','SpriteSkin','TilemapRenderer','SpriteMask','SortingGroup','ShadowCaster2D','CompositeShadowCaster2D','Decal','ParticleSystem','NavigationGrid','Camera','DirectionalLight','PointLight','SpotLight','Light2D','Renderer2D']);
export const visualComponentSignature=object=>JSON.stringify(objectComponents(object).filter(c=>visualTypes.has(c.type)));
export function sceneRendering({read,fileUrl,loadModel,current,all=()=>[],editor=false,error,gameRenderer,runtimeWorld}){
  read=cacheAssetReader(read);
  const twoD=new TwoDRendering(),bloom=gameRenderer?.hbBloom?.()||new BloomRendering(),particlePoint=new THREE.Vector3(),particleInverse=new THREE.Matrix4();
  const textureSources=new Map();let textureBytes=0,textureEpoch=0;
  function invalidateAssets(textures=true){read.clear();if(!textures)return;textureEpoch++;for(const entry of textureSources.values())entry.promise.then(t=>t.dispose(),()=>{});textureSources.clear();textureBytes=0;}
  const texture=async(path,normal=false)=>{
    const key=JSON.stringify([path,normal]);let entry=textureSources.get(key);
    if(entry){textureSources.delete(key);textureSources.set(key,entry);}else{
      const epoch=textureEpoch;entry={bytes:0};textureSources.set(key,entry);
      entry.promise=new THREE.TextureLoader().loadAsync(fileUrl(path)).then(result=>{result.colorSpace=normal?THREE.NoColorSpace:THREE.SRGBColorSpace;
        if(epoch===textureEpoch&&textureSources.get(key)===entry){entry.bytes=(result.image.width||1)*(result.image.height||1)*4;textureBytes+=entry.bytes;while(textureSources.size>128||textureBytes>32*1024*1024){const [old,value]=textureSources.entries().next().value;textureSources.delete(old);textureBytes-=value.bytes;value.promise.then(t=>t.dispose(),()=>{});}}
        return result;
      },e=>{if(textureSources.get(key)===entry)textureSources.delete(key);throw Error('텍스처를 읽지 못했어요: '+path+(e?.message?' · '+e.message:''));});
    }
    // UV/filter state is private; Texture.clone shares the immutable image Source.
    return (await entry.promise).clone();
  };
  async function prepareSpawn(catalog){for(const template of new Set(catalog?.templates.values()||[]))for(const object of template.objects){const p=enabledComponent(object,'SpriteRenderer');if(!p)continue;const resolved=p.sprite?await resolveSprite(await read(p.sprite),read):{texture:p.texture};for(const [path,normal] of [[resolved.texture,false],[p.normalTexture||resolved.normalTexture,true],[p.lightMaskTexture,true]])if(path){const t=await texture(path,normal);t.dispose();}}}
  function own(group,resource){if(group.userData.disposed){resource.dispose();return false;}(group.userData.resources??=new Set()).add(resource);return true;}
  function lightOutline(group,p){
    if(p.lightType==='global')return;
    const bounds=group.userData.light2dCookie,half=bounds?.size.map(v=>v/2)||[p.cookieWidth/2,p.cookieHeight/2],offset=bounds?.offset||[0,0];
    const paths=p.lightType==='sprite'?[[[-half[0]+offset[0],-half[1]+offset[1]],[half[0]+offset[0],-half[1]+offset[1]],[half[0]+offset[0],half[1]+offset[1]],[-half[0]+offset[0],half[1]+offset[1]]]]:p.lightType==='freeform'?[p.shapePath]:[[p.outerRadius,p.outerAngle],...(p.innerRadius>0?[[p.innerRadius,p.innerAngle]]:[])].map(([radius,degrees])=>{
      const angle=p.lightType==='spot'?degrees*Math.PI/180:Math.PI*2,points=[];
      if(p.lightType==='spot')points.push([0,0]);for(let i=0;i<=64;i++){const a=-angle/2+angle*i/64;points.push([Math.sin(a)*radius,Math.cos(a)*radius]);}return points;
    });
    for(const path of paths){const geometry=new THREE.BufferGeometry().setFromPoints([...path,path[0]].map(point=>new THREE.Vector3(...point,0))),material=new THREE.LineBasicMaterial({color:new THREE.Color(...p.color.slice(0,3)),depthTest:false}),line=new THREE.Line(geometry,material);own(group,geometry);own(group,material);line.userData.editorHelper=true;line.userData.light2dHelper=true;line.userData.objectId=group.userData.objectId;line.renderOrder=900;group.add(line);}
  }
  async function light2d(group,p){
    group.userData.light2d=p;
    if(p.lightType==='sprite'){
      const definition=p.cookieSprite?await resolveSprite(await read(p.cookieSprite),read):null,source=definition?.texture||p.cookieTexture;
      if(source){const map=await texture(source);if(!own(group,map))return;const layout=definition?spriteImage(definition,map.image):{rect:[0,0,map.image.width,map.image.height],size:[p.cookieWidth,p.cookieHeight],offset:[0,0]};if(!layout)throw Error('광원 스프라이트 잘라내기 범위 오류');group.userData.light2dCookie={texture:map,...layout,filter:definition?.filter||'linear',key:JSON.stringify([map.source.uuid,layout.rect,definition?.filter||'linear'])};}
    }
    if(group.userData.disposed)return;
    if(p.volumetric&&p.lightType!=='global'){
      const cookie=group.userData.light2dCookie,radius=p.lightType==='freeform'?Math.max(...p.shapePath.map(q=>Math.hypot(...q)))+p.shapeFalloff:p.outerRadius,size=p.lightType==='sprite'?cookie?.size||[p.cookieWidth,p.cookieHeight]:[2*radius,2*radius],offset=cookie?.offset||[0,0];
      const geometry=new THREE.PlaneGeometry(...size),material=gameRenderer?.hbLight2DVolume?.()||new THREE.MeshStandardMaterial({transparent:true,depthWrite:false,depthTest:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide});own(group,geometry);own(group,material);light2DUniforms(material).hbLight2DVolume.value=0;
      const mesh=new THREE.Mesh(geometry,material);mesh.position.set(...offset,0);mesh.userData.objectId=group.userData.objectId;mesh.userData.light2dVolume=true;mesh.userData.draw2d={shading:'volume2d'};mesh.userData.draw2dId='volume';group.userData.light2dVolume=mesh;group.add(mesh);
    }
    if(editor)lightOutline(group,p);
  }
  function dispose(group){group.userData.disposed=true;group.userData.spriteSkin?.dispose();for(const resource of group.userData.resources||[])resource.dispose();group.userData.resources?.clear();}
  function release(group,resource){if(group.userData.resources?.delete(resource))resource.dispose();}
  function spriteMaterial(map,p,normalMap=null){
    if(gameRenderer?.hbSprite)return gameRenderer.hbSprite(map,p,normalMap);
    const color=p.color||[1,1,1,1],mode=p.blendMode||'translucent',lit=['lit','lit2d'].includes(p.shading),material=new (lit?THREE.MeshStandardMaterial:THREE.MeshBasicMaterial)({map,color:new THREE.Color(...color.slice(0,3)),transparent:['translucent','additive'].includes(mode),blending:mode==='additive'?THREE.AdditiveBlending:THREE.NormalBlending,opacity:color[3],alphaTest:mode==='masked'?(p.alphaCutoff??.5):0,side:THREE.DoubleSide,depthWrite:!['translucent','additive'].includes(mode)});
    spriteEffectsUniforms(material).hbSpriteEmission.value=p.emissiveIntensity||0;if(lit&&normalMap){material.normalMap=normalMap;const strength=p.normalStrength??1;material.normalScale.set(strength,p.normalFlipY?-strength:strength);}return material;
  }
  function spriteShadows(group,mesh,p){
    mesh.castShadow=!!p.castShadow;mesh.receiveShadow=p.shading==='lit'&&!!p.receiveShadow;if(!mesh.castShadow)return [];
    const options={map:mesh.material.map,alphaTest:p.blendMode==='opaque'?0:(p.alphaCutoff??.5),opacity:mesh.material.opacity,side:THREE.DoubleSide},depth=new THREE.MeshDepthMaterial({...options,depthPacking:THREE.RGBADepthPacking}),distance=new THREE.MeshDistanceMaterial(options);own(group,depth);own(group,distance);mesh.customDepthMaterial=depth;mesh.customDistanceMaterial=distance;
    // WebGLShadowMap copies the color material's alphaTest even onto custom materials.
    mesh.onBeforeShadow=(r,_o,camera,shadowCamera,_geometry,material)=>{material.alphaTest=options.alphaTest;if(p.billboard){mesh.onBeforeRender(r,null,camera);mesh.modelViewMatrix.multiplyMatrices(shadowCamera.matrixWorldInverse,mesh.matrixWorld);}};return [depth,distance];
  }
  async function spriteTexture(group,path,normal,definition){
    const cache=group.userData.spriteTextures??=new Map(),key=(normal?'normal:':'color:')+path;
    if(!cache.has(key)){const pending=texture(path,normal).then(value=>{own(group,value);return value;});cache.set(key,pending);pending.catch(()=>cache.delete(key));}const base=await cache.get(key);if(group.userData.disposed)return null;const map=base.clone();map.needsUpdate=true;if(!own(group,map))return null;map.magFilter=map.minFilter=definition?.filter==='linear'?THREE.LinearFilter:THREE.NearestFilter;
    // ponytail: retain at most 32 color/normal source atlases per object; larger flipbooks reload evicted sources.
    cache.delete(key);cache.set(key,Promise.resolve(base));while(cache.size>32){const [old,pending]=cache.entries().next().value;cache.delete(old);pending.then(value=>release(group,value)).catch(()=>{});}return map;
  }
  async function particles(group,p){
    if(gameRenderer?.hbParticles){const map=p.texture?await texture(p.texture):null;if(map)own(group,map);if(group.userData.disposed)return;const simulation=gameRenderer.hbParticles(group,p,map);own(group,simulation);group.userData.particleState={simulation,properties:p,gpu:true};return;}
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(p.maxParticles*3),3).setUsage(THREE.DynamicDrawUsage));geometry.setAttribute('particleColor',new THREE.BufferAttribute(new Float32Array(p.maxParticles*4),4).setUsage(THREE.DynamicDrawUsage));geometry.setAttribute('particleSize',new THREE.BufferAttribute(new Float32Array(p.maxParticles),1).setUsage(THREE.DynamicDrawUsage));geometry.setDrawRange(0,0);own(group,geometry);
    const map=p.texture?await texture(p.texture):null;if(map)own(group,map);const material=new THREE.ShaderMaterial({transparent:true,depthWrite:false,blending:p.blend==='additive'?THREE.AdditiveBlending:THREE.NormalBlending,uniforms:{map:{value:map},hasMap:{value:!!map},pixelScale:{value:1},orthographic:{value:false},viewportHeight:{value:1},sizeLimits:{value:new THREE.Vector2(p.minParticleSize,p.maxParticleSize)}},vertexShader:'attribute vec4 particleColor; attribute float particleSize; varying vec4 tint; uniform float pixelScale; uniform bool orthographic; uniform float viewportHeight; uniform vec2 sizeLimits; void main(){tint=particleColor;vec4 mv=modelViewMatrix*vec4(position,1.0);gl_Position=projectionMatrix*mv;float pixels=clamp(particleSize*pixelScale/(orthographic?1.0:max(.001,-mv.z)),sizeLimits.x*viewportHeight,sizeLimits.y*viewportHeight);gl_PointSize=max(1.0,pixels);if(pixels<=0.0)tint.a=0.0;}',fragmentShader:'uniform sampler2D map;uniform bool hasMap;varying vec4 tint;\n#include <clipping_planes_pars_fragment>\nvoid main(){\n#include <clipping_planes_fragment>\nvec4 tex=hasMap?texture2D(map,vec2(gl_PointCoord.x,1.0-gl_PointCoord.y)):vec4(1.0,1.0,1.0,1.0-smoothstep(.35,.5,length(gl_PointCoord-.5)));gl_FragColor=tint*tex;if(gl_FragColor.a<.001)discard;\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}'});own(group,material);const mesh=new THREE.Points(geometry,material);mesh.frustumCulled=false;mesh.userData.objectId=group.userData.objectId;mesh.userData.draw2dId='particles';mesh.userData.particleRenderer=true;mesh.userData.draw2d={sortingLayer:p.sortingLayer||'default',sortingOrder:p.sortingOrder||0,maskInteraction:p.maskInteraction||'none'};mesh.renderOrder=p.sortingOrder;const viewport=new THREE.Vector2();mesh.onBeforeRender=(renderer,_scene,camera)=>{renderer.getDrawingBufferSize(viewport);material.uniforms.viewportHeight.value=viewport.y;material.uniforms.sizeLimits.value.set(p.minParticleSize,p.maxParticleSize);material.uniforms.pixelScale.value=viewport.y*camera.projectionMatrix.elements[5]/2;material.uniforms.orthographic.value=!!camera.isOrthographicCamera;};group.add(mesh);group.userData.particleState={simulation:new ParticleSimulation(p),geometry,properties:p};if(!p.playOnStart)group.userData.particleState.simulation.playing=false;
  }
  function particleSnapshot(object,simulation){const state=current(object.id)?.userData.particleState;if(state)state.simulation=simulation;}
  function writeParticles(group,state,camera){
    if(state.gpu)return;
    const list=state.simulation.particles,p=state.properties,count=Math.min(list.length,p.maxParticles),position=state.geometry.attributes.position,color=state.geometry.attributes.particleColor,size=state.geometry.attributes.particleSize;
    group.updateWorldMatrix(true,false);
    let order;
    if(camera&&p.sortMode!=='none'){
      camera.updateWorldMatrix(true,false);order=state.sortIndices??= [];const keys=state.sortKeys??=new Float64Array(p.maxParticles);order.length=count;
      const e=camera.matrixWorld.elements,view=camera.matrixWorldInverse.elements,age=p.sortMode==='oldest'||p.sortMode==='youngest',depth=camera.isOrthographicCamera||p.sortMode.startsWith('depth');
      state.sortSign=p.sortMode==='oldest'||p.sortMode.endsWith('Reverse')?-1:1;
      for(let i=0;i<count;i++){order[i]=i;if(age)keys[i]=list[i].age;else{particlePoint.fromArray(list[i].position);if(p.simulationSpace!=='world')particlePoint.applyMatrix4(group.matrixWorld);keys[i]=depth?-(view[2]*particlePoint.x+view[6]*particlePoint.y+view[10]*particlePoint.z+view[14]):(particlePoint.x-e[12])**2+(particlePoint.y-e[13])**2+(particlePoint.z-e[14])**2;}}
      // ponytail: optional CPU sort is O(n log n), max 10000; GPU sorting if measured effect budgets require it.
      order.sort(state.compareParticles??= ((a,b)=>state.sortSign*(state.sortKeys[b]-state.sortKeys[a])||a-b));
    }
    const inverse=p.simulationSpace==='world'?particleInverse.copy(group.matrixWorld).invert():null;
    for(let i=0;i<count;i++){const particle=list[order?order[i]:i];particlePoint.fromArray(particle.position);if(inverse)particlePoint.applyMatrix4(inverse);position.setXYZ(i,particlePoint.x,particlePoint.y,particlePoint.z);const alpha=particle.age/particle.lifetime;for(let channel=0;channel<4;channel++)color.array[i*4+channel]=p.color[channel]+(p.endColor[channel]-p.color[channel])*alpha;size.setX(i,particle.size*(1+(p.endSize-1)*alpha));}
    for(const attribute of [position,color,size]){attribute.clearUpdateRanges();if(count){attribute.addUpdateRange(0,count*attribute.itemSize);attribute.needsUpdate=true;}}state.geometry.setDrawRange(0,count);
  }
  function tickParticles(objects,delta,running){for(const object of objects){const group=current(object.id),state=group?.userData.particleState;if(!state||group.userData.disposed)continue;group.updateWorldMatrix(true,false);if(!running)state.simulation.advance(delta,group.matrixWorld);if(state.properties.sortMode==='none')writeParticles(group,state);}}
  function syncNavigation(objects){for(const object of objects){const group=current(object.id);if(!group)continue;const state=object.gameplayDebug?.navigation,path=state?.path||[],signature=JSON.stringify([path,object.position]);if(group.userData.navigationSignature===signature)continue;group.userData.navigationSignature=signature;const old=group.userData.navigationLine;if(old){old.removeFromParent();release(group,old.geometry);release(group,old.material);}if(!path.length)continue;group.updateWorldMatrix(true,false);const inverse=group.matrixWorld.clone().invert(),points=[group.getWorldPosition(new THREE.Vector3()),...path.map(p=>new THREE.Vector3(...p))].map(v=>v.applyMatrix4(inverse)),geometry=new THREE.BufferGeometry().setFromPoints(points),material=new THREE.LineBasicMaterial({color:0x63c8ad,depthTest:false});own(group,geometry);own(group,material);const line=new THREE.Line(geometry,material);line.userData.editorHelper=true;line.renderOrder=1000;group.add(line);group.userData.navigationLine=line;}}
  function replaceMaterials(group,result,slot){
    const meshes=[];group.traverse(child=>{if(child.isMesh&&!child.userData.editorHelper&&!child.userData.sprite)meshes.push(child);});
    if(slot!==undefined&&(!Number.isInteger(slot)||slot<0||meshes.some(mesh=>slot>=(Array.isArray(mesh.material)?mesh.material.length:1)))){result.dispose();throw Error('머테리얼 슬롯 범위 오류');}
    if(!own(group,result))return;const old=new Set();for(const mesh of meshes){const list=Array.isArray(mesh.material)?[...mesh.material]:[mesh.material];if(slot===undefined){list.forEach(m=>old.add(m));mesh.material=result;}else{old.add(list[slot]);list[slot]=result;mesh.material=Array.isArray(mesh.material)?list:list[0];}}
    const used=new Set();group.traverse(child=>{for(const mat of child.material?(Array.isArray(child.material)?child.material:[child.material]):[])used.add(mat);});for(const mat of old)if(!used.has(mat))release(group,mat);
  }
  function adopt(group,child){child.traverse(node=>{if(node.geometry)own(group,node.geometry);if(node.isLight)own(group,node);for(const m of node.material?(Array.isArray(node.material)?node.material:[node.material]):[]){own(group,m);for(const v of Object.values(m))if(v?.isTexture)own(group,v);}node.userData.objectId=group.userData.objectId;});group.add(child);}
  async function material(object,path,slot){
    const group=current(object.id);if(!group)return;const token=group.userData.materialRequest=(group.userData.materialRequest||0)+1,data=await resolveMaterialAsset(await read(path),read);if(current(object.id)!==group||token!==group.userData.materialRequest||group.userData.disposed)return;
    const result=createThreeMaterial(THREE,data,{fileUrl,onError:error,renderer:gameRenderer});try{await result.userData.ready;}catch(e){result.dispose();throw e;}if(current(object.id)!==group||token!==group.userData.materialRequest||group.userData.disposed){result.dispose();return;}replaceMaterials(group,result,slot);group.userData.materialData=data;
  }
  async function materialTexture(object,key,path){
    const group=current(object.id),owned=[...group?.userData.resources||[]].filter(r=>r.userData?.hbMaterial);if(!owned.length)throw Error('노드 머테리얼을 먼저 지정하세요.');
    const types=owned.map(m=>{const p=materialParameters(m.userData.materialSource).find(p=>p.name===key),type=p?.type==='texture'?'texture2d':p?.type;if(!validMaterialTexturePath(type,path))throw Error('텍스처 파라미터 이름·자료형·경로를 확인하세요: '+key);return type;});
    const requests=group.userData.materialTextureRequests??=new Map(),generation=(requests.get(key)||0)+1;requests.set(key,generation);const request=group.userData.materialRequest;
    const resources={};for(const type of new Set(types))if(type!=='texture2d')resources[path]=validateTextureImages(({texturecube:'cubemap',texturearray:'texturearray',texture3d:'volumetexture'})[type],await read(path));
    await Promise.all(owned.map(m=>m.userData.ready));
    const valid=()=>current(object.id)===group&&!group.userData.disposed&&requests.get(key)===generation&&group.userData.materialRequest===request&&owned.every(m=>group.userData.resources.has(m));
    if(!valid())return false;
    const results=await Promise.allSettled(owned.map(m=>m.userData.prepareTexture(key,path,resources))),transactions=results.filter(r=>r.status==='fulfilled').map(r=>r.value),failure=results.find(r=>r.status==='rejected');
    if(failure||!valid()||!transactions.every(t=>t.valid())){transactions.forEach(t=>t.cancel());if(failure)throw failure.reason;return false;}
    transactions.forEach(t=>t.commit());const data=group.userData.materialData;if(data){data.parameters={...data.parameters,[key]:path};data.textureAssets=Object.fromEntries(owned.flatMap(m=>Object.entries(m.userData.materialSource.textureAssets||{})));}return true;
  }
  async function materialFloat(object,key,value){
    const group=current(object.id),source=group?.userData.materialData;if(!source)throw Error('노드 머테리얼을 먼저 지정하세요.');
    const data=structuredClone(source),node=data.graph.nodes.find(n=>materialParameterKey(n)===key);
    if(node){if(typeof node.value!=='number')throw Error('Float 파라미터가 아니에요.');data.parameters={...data.parameters,[key]:value};}else{const property={Roughness:'roughness',Metallic:'metalness',Opacity:'opacity',EmissiveIntensity:'emissiveIntensity'}[key]||key;if(!['roughness','metalness','opacity','emissiveIntensity'].includes(property))throw Error('머테리얼 파라미터가 없어요: '+key);data.surface[property]=value;}
    const owned=[...group.userData.resources||[]].filter(r=>r.userData?.hbMaterial),updated=owned.length&&owned.every(r=>r.userData.updateFloat?.(key,value));if(!updated){const result=createThreeMaterial(THREE,data,{fileUrl,onError:error,renderer:gameRenderer});replaceMaterials(group,result);}group.userData.materialData=data;
  }
  function configureSpriteEffects(mesh,properties,group){mesh.onBeforeRender=(_r,_s,camera)=>{const effects=spriteEffectsUniforms(mesh.material);effects.hbPixelPPU.value=camera.userData.cameraProperties?.pixelPerfect?camera.userData.cameraProperties.pixelPixelsPerUnit||32:0;const flash=group.userData.spriteActor?.spriteFlash;effects.hbSpriteFlash.value=flash?.remaining>0?flash.strength:0;effects.hbSpriteEmission.value=properties.emissiveIntensity||0;if(properties.billboard){const rotation=group.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(camera.getWorldQuaternion(new THREE.Quaternion()));mesh.quaternion.copy(rotation);mesh.updateWorldMatrix(true,false);}};}
  async function sprite(group,properties,path,request,isMask=false){
    const definitions=group.userData.spriteDefinitions??=new Map();if(path&&!definitions.has(path))definitions.set(path,read(path).then(data=>resolveSprite(data,read)));const definition=path?await definitions.get(path):null,source=definition?.texture||properties.texture;
    let map=null,normalMap=null,lightMask=null,layout=null,sliced;try{
      if(source){map=await spriteTexture(group,source,false,definition);if(!map)return;layout=definition?spriteImage(definition,map.image):null;if(definition&&!layout)throw Error('스프라이트 잘라내기 범위 오류');if(layout){map.offset.fromArray(layout.uv.offset);map.repeat.fromArray(layout.uv.repeat);}}
      const normalSource=!isMask&&['lit','lit2d'].includes(properties.shading)&&(properties.normalTexture||definition?.normalTexture);if(normalSource){normalMap=await spriteTexture(group,normalSource,true,definition);if(normalMap&&layout){normalMap.offset.copy(map.offset);normalMap.repeat.copy(map.repeat);}}
      if(!isMask&&properties.shading==='lit2d'&&properties.lightMaskTexture){lightMask=await spriteTexture(group,properties.lightMaskTexture,true,definition);if(lightMask&&layout){lightMask.offset.copy(map.offset);lightMask.repeat.copy(map.repeat);}}
      if(group.userData.disposed||request!==undefined&&request!==group.userData.spriteRequest){for(const r of [map,normalMap,lightMask])if(r)release(group,r);return;}
      if(map&&properties.drawMode&&properties.drawMode!=='simple')sliced=spriteSlices(definition||{version:1,name:'Texture',texture:source,normalTexture:'',pixelsPerUnit:properties.pixelsPerUnit||100,rect:[0,0,0,0],pivot:[.5,.5],filter:'nearest',border:properties.border||[properties.borderLeft||0,properties.borderBottom||0,properties.borderRight||0,properties.borderTop||0]},map.image,{size:[properties.width||1,properties.height||1],mode:properties.drawMode,origin:properties.tileOrigin||'bottomLeft'});
    }catch(error){for(const r of [map,normalMap,lightMask])if(r)release(group,r);throw error;}
    const slot=isMask?'maskMesh':'spriteMesh',old=group.userData[slot],configuration=JSON.stringify({...properties,sprite:undefined,texture:undefined,normalTexture:undefined,lightMaskTexture:undefined}),reuse=old?.userData.spriteMaterial===old?.material&&old?.userData.spriteConfiguration===configuration&&!!old.material.map===!!map&&!!old.material.normalMap===!!normalMap&&!!old.material.hbLight2DMaskTexture===!!lightMask;
    const previousMaps=reuse?[old.material.map,old.material.normalMap,old.material.hbLight2DMaskTexture]:[],mat=reuse?old.material:spriteMaterial(map,properties,normalMap);mat.map=map;mat.normalMap=normalMap;mat.hbLight2DMaskTexture=lightMask;spriteEffectsUniforms(mat);own(group,mat);
    let size=properties.useCustomSize?[properties.width||1,properties.height||1]:layout?.size||[properties.width||1,properties.height||1],offset=layout&&properties.useCustomSize?[(.5-layout.pivot[0])*size[0],(.5-layout.pivot[1])*size[1]]:layout?.offset||[0,0],geometry;const reuseGeometry=reuse&&!sliced&&old.geometry.type==='PlaneGeometry'&&old.geometry.parameters.width===size[0]&&old.geometry.parameters.height===size[1];if(reuseGeometry)geometry=old.geometry;else if(sliced){geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(sliced.positions,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(sliced.uvs,2));geometry.setAttribute('normal',new THREE.Float32BufferAttribute(sliced.normals,3));offset=sliced.offset;}else geometry=new THREE.PlaneGeometry(...size);own(group,geometry);const mesh=reuse?old:new THREE.Mesh(geometry,mat);if(reuse){if(!reuseGeometry)release(group,old.geometry);mesh.geometry=geometry;for(const shadow of [mesh.customDepthMaterial,mesh.customDistanceMaterial])if(shadow)shadow.map=map;for(const r of new Set(previousMaps))if(r&&r!==map&&r!==normalMap&&r!==lightMask)release(group,r);}mesh.userData.sprite=true;mesh.userData.objectId=group.userData.objectId;mesh.userData.spriteMaterial=mat;mesh.userData.spriteConfiguration=configuration;mesh.position.set(...offset,0);mesh.scale.set(properties.flipX?-1:1,properties.flipY?-1:1,1);mesh.renderOrder=properties.sortingOrder||0;
    if(!reuse)configureSpriteEffects(mesh,properties,group);
    if(old&&!reuse){old.removeFromParent();for(const r of [old.geometry,old.material,old.material.map,old.material.normalMap,old.material.hbLight2DMaskTexture,old.customDepthMaterial,old.customDistanceMaterial,old.userData.maskMaterial])if(r)release(group,r);}group.userData[slot]=mesh;
    if(isMask){mesh.visible=false;mesh.userData.spriteMask=true;mesh.userData.maskProperties=properties;if(reuse)mesh.userData.maskMaterial.map=map;else{mesh.userData.maskMaterial=createSpriteMaskMaterial(map,properties.alphaCutoff,gameRenderer);own(group,mesh.userData.maskMaterial);}}else{if(!reuse)spriteShadows(group,mesh,properties);mesh.userData.sortPoint=properties.sortPoint==='feet'?[0,-size[1]/2,0]:properties.sortPoint==='pivot'?[0,-offset[1],0]:[0,0,0];mesh.userData.draw2d=properties;mesh.userData.draw2dId='sprite';if(group.userData.spriteSkin){if(!reuseGeometry)group.userData.spriteSkin.attachGeometry(geometry);mesh.position.set(0,0,0);}}if(!reuse)group.add(mesh);
  }
  function spriteFlip(object,p){const group=current(object.id),mesh=group?.userData.spriteMesh;if(mesh)mesh.scale.set(p.flipX?-1:1,p.flipY?-1:1,1);if(group)group.userData.componentSignature=visualComponentSignature(object);}
  async function spriteFrame(object,path){const group=current(object.id);if(!group)return;const token=group.userData.spriteRequest=(group.userData.spriteRequest||0)+1;await sprite(group,enabledComponent(object,'SpriteRenderer')||{},path,token);if(current(object.id)===group&&!group.userData.disposed&&group.userData.spriteRequest===token)object.currentSprite=path;}
  async function tilemap(group,path,properties,data,request){
    if(!path)return;const map=data||await read(path);if(!map.tileset)return;const atlas=await texture(map.tileset);if(!own(group,atlas))return;atlas.magFilter=THREE.NearestFilter;atlas.minFilter=THREE.NearestFilter;
    let normalMap,lightMask;try{const normalSource=['lit','lit2d'].includes(properties.shading)&&(properties.normalTexture||map.normalTexture);if(normalSource){normalMap=await texture(normalSource,true);own(group,normalMap);normalMap.magFilter=normalMap.minFilter=THREE.NearestFilter;}if(properties.shading==='lit2d'&&properties.lightMaskTexture){lightMask=await texture(properties.lightMaskTexture,true);own(group,lightMask);lightMask.magFilter=lightMask.minFilter=THREE.NearestFilter;}}catch(error){release(group,atlas);if(normalMap)release(group,normalMap);if(lightMask)release(group,lightMask);throw error;}
    if(group.userData.disposed||request!==undefined&&request!==group.userData.tilemapRequest){release(group,atlas);if(normalMap)release(group,normalMap);if(lightMask)release(group,lightMask);return;}
    const material=spriteMaterial(atlas,properties,normalMap);material.hbLight2DMaskTexture=lightMask;own(group,material);group.userData.tilemapResources=[atlas,material,...normalMap?[normalMap]:[],...lightMask?[lightMask]:[]];
    // One mesh per layer keeps draw calls independent of the tile count.
    for(const [index,layer] of map.layers.entries()){if(!layer.visible)continue;const positions=[],uvs=[],indices=[];const tiles=map.layout==='isometric'?[...layer.tiles].sort((a,b)=>a.x+a.y-b.x-b.y||a.y-b.y||a.x-b.x):layer.tiles;for(const tile of tiles){const region=tileAtlasRect(map,tile.index,atlas.image);if(!region)continue;const [x,y,w,h]=tileRenderRect(map,tile),z=index*.001,v=positions.length/3,[u0,v0]=region.uv.offset,[uw,vh]=region.uv.repeat;positions.push(x,y,z,x+w,y,z,x+w,y+h,z,x,y+h,z);uvs.push(u0,v0,u0+uw,v0,u0+uw,v0+vh,u0,v0+vh);indices.push(v,v+1,v+2,v,v+2,v+3);}const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));geometry.setIndex(indices);geometry.computeVertexNormals();geometry.computeBoundingSphere();own(group,geometry);group.userData.tilemapResources.push(geometry);let layerMaterial=material;if(properties.shading==='lit2d'||properties.maskInteraction==='inside'||properties.maskInteraction==='outside'){layerMaterial=material.clone();layerMaterial.hbLight2DMaskTexture=lightMask;own(group,layerMaterial);group.userData.tilemapResources.push(layerMaterial);}const mesh=new THREE.Mesh(geometry,layerMaterial);mesh.userData.sprite=true;mesh.userData.tilemap=true;mesh.userData.draw2dId='tile:'+layer.id;mesh.userData.draw2d={...properties,sortingOrder:(properties.sortingOrder||0)+index};mesh.userData.objectId=group.userData.objectId;mesh.renderOrder=(properties.sortingOrder||0)+index;configureSpriteEffects(mesh,properties,group);group.userData.tilemapResources.push(...spriteShadows(group,mesh,properties));group.add(mesh);}
  }
  async function tilemapFrame(object,map){const group=current(object.id);if(!group)return;const token=group.userData.tilemapRequest=(group.userData.tilemapRequest||0)+1;for(const mesh of group.children.filter(c=>c.userData.tilemap))mesh.removeFromParent();for(const resource of group.userData.tilemapResources||[])release(group,resource);group.userData.tilemapResources=[];await tilemap(group,object.runtimeTilemapPath,enabledComponent(object,'TilemapRenderer')||{},map,token);}
  async function preparePhysics(objects){for(const object of objects){const path=enabledComponent(object,'TilemapRenderer')?.tilemap||object.tilemapAsset;if(!path)continue;object.tileColliders=tilemapColliders(await read(path));}}
  async function decal(group,p){
    const data=p.material?await resolveMaterialAsset(await read(p.material),read):null;
    if(group.userData.disposed)return;
    const material=data?createThreeMaterial(THREE,data,{fileUrl,onError:error,renderer:gameRenderer}):new THREE.MeshStandardMaterial({color:0xffffff,roughness:1});
    if(!own(group,material))return;
    material.transparent=true;material.opacity=p.opacity;material.depthWrite=false;material.polygonOffset=true;material.polygonOffsetFactor=-4;
    if(p.texture){const map=await texture(p.texture);if(!own(group,map))return;material.map=map;material.needsUpdate=true;}
    group.userData.decal={properties:p,material,meshes:[],signature:''};
  }
  function syncDecals(){
    const groups=all();for(const group of groups){const state=group.userData.decal;if(!state||group.userData.disposed)continue;
      const sources=groups.filter(g=>g!==group&&g.visible&&(!state.properties.target||g.userData.objectId===state.properties.target));group.updateWorldMatrix(true,false);for(const g of sources)g.updateWorldMatrix(true,true);
      // ponytail: projection rebuilds on transform/mesh changes; skinned deformation needs a GPU decal pass later.
      const signature=JSON.stringify([group.matrixWorld.elements,sources.map(g=>[g.userData.objectId,g.matrixWorld.elements,g.children.length])]);if(signature===state.signature)continue;state.signature=signature;
      for(const mesh of state.meshes){mesh.removeFromParent();release(group,mesh.geometry);}state.meshes=[];
      const position=group.getWorldPosition(new THREE.Vector3()),rotation=new THREE.Euler().setFromQuaternion(group.getWorldQuaternion(new THREE.Quaternion())),size=new THREE.Vector3(...state.properties.size).multiply(group.getWorldScale(new THREE.Vector3())),inverse=group.matrixWorld.clone().invert();
      for(const source of sources)source.traverse(mesh=>{if(!mesh.isMesh||!mesh.visible||mesh.userData.objectId&&mesh.userData.objectId!==source.userData.objectId||mesh.userData.sprite||mesh.userData.decal||mesh.userData.editorHelper)return;const geometry=new DecalGeometry(mesh,position,rotation,size);if(!geometry.attributes.position.count){geometry.dispose();return;}geometry.applyMatrix4(inverse);own(group,geometry);const projected=new THREE.Mesh(geometry,state.material);projected.userData.decal=true;projected.userData.objectId=group.userData.objectId;projected.renderOrder=state.properties.sortOrder;group.add(projected);state.meshes.push(projected);});
    }
  }
  async function build(object,group){
    group.userData.spriteActor=object;const components=objectComponents(object),meshComponent=components.find(c=>c.type==='MeshRenderer'),renderer=meshComponent?{...componentDefaults('MeshRenderer'),...meshComponent.properties}:null;
    group.userData.componentSignature=visualComponentSignature(object);const meshPath=renderer?.mesh||object.asset;
    if(meshPath){const loaded=await loadModel(meshPath);if(group.userData.disposed){const temporary=new THREE.Group();adopt(temporary,loaded.object);dispose(temporary);return;}adopt(group,loaded.object);group.userData.animations=loaded.animations;}
    const skin=components.find(c=>c.type==='SpriteSkin'&&c.properties?.enabled!==false)?.properties,rig=skin?.rig?await read(skin.rig):null;
    if(rig&&!components.some(c=>c.type==='SpriteRenderer'&&c.properties?.enabled!==false))throw Error('Sprite Skin에는 활성 Sprite Renderer가 필요해요.');
    for(const component of components){const p={...componentDefaults(component.type),...component.properties};if(p.enabled===false)continue;
      if(component.type==='Renderer2D')group.userData.renderer2d=p;
      if(component.type==='Light2D')await light2d(group,p);
      if(component.type==='ShadowCaster2D'){group.userData.shadowCaster2d=p;if(editor&&p.source==='shape')lightOutline(group,{lightType:'freeform',shapePath:p.shapePath,color:[.9,.85,.5]});}
      if(component.type==='CompositeShadowCaster2D')group.userData.shadowGroup2d=p;
      if(component.type==='SortingGroup')group.userData.sortingGroup=p;
      if(component.type==='SpriteMask')await sprite(group,p,p.sprite,undefined,true);
      if(component.type==='SpriteRenderer'&&p.visible!==false)await sprite(group,p,rig?.sprite||p.sprite||object.spriteAsset);
      if(component.type==='TilemapRenderer'&&p.visible!==false)await tilemap(group,p.tilemap||object.tilemapAsset,p,object.runtimeTilemap);
      if(component.type==='Decal')await decal(group,p);
      if(component.type==='ParticleSystem'){await particles(group,p);const state=group.userData.particleState?.simulation;if(state?.debugState&&(!editor||runtimeWorld?.()))object.gameplayDebug={...object.gameplayDebug,particles:state.debugState()};}
      if(component.type==='NavigationGrid'&&p.debug){const axes=p.plane==='XY'?[0,1]:[0,2],points=[];for(const [x,y] of [[-1,-1],[1,-1],[1,1],[-1,1],[-1,-1]]){const v=[0,0,0];v[axes[0]]=x*p.extent[axes[0]];v[axes[1]]=y*p.extent[axes[1]];points.push(new THREE.Vector3(...v));}const geometry=new THREE.BufferGeometry().setFromPoints(points),material=new THREE.LineBasicMaterial({color:0x63c8ad});own(group,geometry);own(group,material);const line=new THREE.Line(geometry,material);line.userData.editorHelper=true;group.add(line);}
      if(component.type==='Camera'){const camera=createGameCamera(p);group.add(camera);group.userData.gameCamera=camera;}
      if(['DirectionalLight','PointLight','SpotLight'].includes(component.type)&&object.kind!=='light'){const color=new THREE.Color(...p.color.slice(0,3)),light=component.type==='DirectionalLight'?new THREE.DirectionalLight(color,p.intensity):component.type==='PointLight'?new THREE.PointLight(color,p.intensity,p.radius,p.decay):new THREE.SpotLight(color,p.intensity,p.radius,THREE.MathUtils.degToRad(p.angle),p.penumbra);own(group,light);light.castShadow=p.castShadow;if(light.target){light.target.position.set(0,0,-1);group.add(light.target);}group.add(light);}
    }
    if(group.userData.disposed)return;if(rig){const pose=new SpriteRigPose(rig,{geometry:group.userData.spriteMesh?.geometry,requireSprite:true});group.add(pose.group);group.userData.spriteSkin=pose;group.userData.animations=[...group.userData.animations||[],...pose.animations];if(group.userData.spriteMesh)group.userData.spriteMesh.position.set(0,0,0);}
    group.traverse(child=>{child.userData.objectId=object.id;if(child.isMesh&&!child.userData.sprite){child.visible=renderer?.visible!==false&&renderer?.enabled!==false;child.castShadow=renderer?.castShadow!==false;child.receiveShadow=renderer?.receiveShadow!==false;}});
    const path=renderer?.material||object.materialAsset;if(path)await material(object,path);
  }
  function updateMaterialTime(time){for(const group of all())for(const resource of group.userData.resources||[])resource.userData?.updateTime?.(time);}
  function materialState(){return all().flatMap(group=>[...group.userData.resources||[]].filter(r=>r.userData?.hbMaterial).map(r=>({object:group.userData.objectId,id:r.uuid,type:r.type,version:r.version,textures:r.userData.textureState?.(),backend:r.userData.hbGPU?'WebGPU':'WebGL2',parameters:structuredClone(r.userData.materialSource.parameters||{}),surface:structuredClone(r.userData.materialSource.surface||{}),...r.userData.materialState?.()})));}
  const gameCamera=(objects,aspect,override)=>selectGameCamera(objects,aspect,override,current);
  return {particleDiagnostics:id=>current(id)?.userData.particleState?.simulation.diagnostics?.(),build,dispose,updateMaterialTime,materialState,prepareSpawn,invalidateAssets,material,materialFloat,materialTexture,spriteFrame,spriteFlip,tilemapFrame,preparePhysics,gameCamera,syncDecals,tickParticles,particleSnapshot,createParticleState:gameRenderer?.hbParticles?async(object,restart)=>{const group=current(object.id);await group?.userData.ready;const state=group?.userData.particleState?.simulation;if(!state||state.disposed)throw Error('GPU 파티클 준비가 필요해요.');if(restart){state.reset();state.playing=true;}return state;}:undefined,syncNavigation,prepare2D:(renderer,scene,camera,layers,options)=>{const groups=all();for(const group of groups){group.userData.spriteSkin?.update();const state=group.userData.particleState;if(state&&state.properties.sortMode!=='none'&&!group.userData.disposed){if(state.gpu)state.simulation.sort(camera);else writeParticles(group,state,camera);}}return twoD.prepare(renderer,scene,camera,groups,layers,options);},renderBloom:(renderer,scene,camera,objects)=>bloom.render(renderer,scene,camera,objects),disposeRenderer:renderer=>bloom.disposeRenderer(renderer),dispose2D:()=>{twoD.dispose();bloom.dispose();invalidateAssets();}};
}
