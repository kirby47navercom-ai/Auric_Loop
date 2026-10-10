import * as THREE from 'three';
import {componentDefaults,defaultsForObject,makeSceneComponent,validComponentProperties} from './scene-components.js';
export const skyPresets={
  day:{top:0x548baf,horizon:0xc2d4cc,ground:0x536f70,cloud:0xe4eee8,ambient:1.1,exposure:.83,light:3.2,elevation:50},
  overcast:{top:0x74858e,horizon:0xb9c8c6,ground:0x52666b,cloud:0xb8c9c8,ambient:1.25,exposure:.88,light:1.2,elevation:40},
  sunset:{top:0x596487,horizon:0xe9b18b,ground:0x635858,cloud:0xeac5ae,ambient:.65,exposure:.9,light:3,elevation:15},
  night:{top:0x111e37,horizon:0x415672,ground:0x293849,cloud:0x64788d,ambient:.3,exposure:1,light:.45,elevation:25}
};
export const environmentActorKinds={skyAtmosphere:'SkyAtmosphere',skyLight:'SkyLight',volumetricCloud:'VolumetricCloud',heightFog:'ExponentialHeightFog'};
const rgba=hex=>[...new THREE.Color(hex).toArray(),1],color=value=>new THREE.Color(...value.slice(0,3));
const components=object=>object.components||defaultsForObject(object.kind);
const environmentTypes=new Set(Object.values(environmentActorKinds));
export function makeEnvironmentActor(kind,{id=crypto.randomUUID(),name,properties={},position=[0,0,0],rotation=[0,0,0],scale=[1,1,1],visible=true}={}){
  const type=environmentActorKinds[kind]||(kind==='directionalLight'?'DirectionalLight':null);
  if(!type)throw Error('환경 오브젝트 종류를 확인하세요.');if(!validComponentProperties(type,properties))throw Error('환경 컴포넌트 값을 확인하세요.');
  if(typeof id!=='string'||!id.length||id.length>100||name!==undefined&&(typeof name!=='string'||!name.length||name.length>200)||typeof visible!=='boolean'||![[position,1000000],[rotation,10000],[scale,10000]].every(([values,max])=>Array.isArray(values)&&values.length===3&&values.every(value=>Number.isFinite(value)&&Math.abs(value)<=max))||scale.some(value=>value<.01))throw Error('환경 오브젝트 변환 값을 확인하세요.');
  return {id,name:name||({SkyAtmosphere:'Sky Atmosphere',SkyLight:'Sky Light',VolumetricCloud:'Volumetric Cloud',ExponentialHeightFog:'Exponential Height Fog',DirectionalLight:'Sun Light'}[type]),kind,group:'ENVIRONMENT',position:[...position],rotation:[...rotation],scale:[...scale],visible,components:[makeSceneComponent('Transform',{},'component_0'),makeSceneComponent(type,properties,'component_1')]};
}
// Explicit authoring operation; loading a legacy scene never creates actors.
export function environmentActorPreset(environment={},surface={light:3.2},{idPrefix='environment'}={}){
  const p=skyPresets[environment.preset]||skyPresets.day,az=THREE.MathUtils.degToRad(environment.sunAzimuth??-30),el=THREE.MathUtils.degToRad(environment.sunElevation??p.elevation),direction=new THREE.Vector3(Math.sin(az)*Math.cos(el),Math.sin(el),Math.cos(az)*Math.cos(el)),rotation=new THREE.Euler().setFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,0,1),direction)).toArray().slice(0,3).map(THREE.MathUtils.radToDeg);
  return {environment:{...environment,mode:'actors'},objects:[
    makeEnvironmentActor('skyAtmosphere',{id:idPrefix+'_sky',properties:{enabled:environment.skyEnabled!==false,topColor:rgba(p.top),horizonColor:rgba(p.horizon),groundColor:rgba(p.ground),exposure:p.exposure}}),
    makeEnvironmentActor('skyLight',{id:idPrefix+'_ambient',properties:{enabled:environment.skyEnabled!==false,color:rgba(p.horizon),groundColor:rgba(p.ground),intensity:p.ambient}}),
    makeEnvironmentActor('directionalLight',{id:idPrefix+'_sun',position:direction.toArray().map(v=>v*10),rotation,properties:{enabled:environment.sunEnabled!==false,color:rgba(environment.preset==='night'?0xa5b9e1:environment.preset==='sunset'?0xffbb80:0xffeed7),intensity:surface.light??p.light,castShadow:environment.shadowEnabled!==false,atmosphereSunLight:true}}),
    makeEnvironmentActor('volumetricCloud',{id:idPrefix+'_clouds',properties:{enabled:environment.cloudsEnabled!==false,coverage:environment.cloudDensity??.55,color:rgba(p.cloud)}}),
    makeEnvironmentActor('heightFog',{id:idPrefix+'_fog',properties:{enabled:environment.fogEnabled!==false,density:.008+(environment.fogAmount??.25)*.045,color:rgba(p.ground)}})
  ]};
}
function worldMatrix(object,byId,cache,visiting=new Set()){
  if(cache.has(object.id))return cache.get(object.id);if(visiting.has(object.id))return new THREE.Matrix4();visiting.add(object.id);
  const local=new THREE.Matrix4().compose(new THREE.Vector3(...object.position),new THREE.Quaternion().setFromEuler(new THREE.Euler(...object.rotation.map(THREE.MathUtils.degToRad))),new THREE.Vector3(...object.scale)),parent=byId.get(object.parent),world=parent?worldMatrix(parent,byId,cache,visiting).clone().multiply(local):local;
  visiting.delete(object.id);cache.set(object.id,world);return world;
}
function actorVisible(object,byId){const seen=new Set();for(let current=object;current;current=byId.get(current.parent)){if(seen.has(current.id)||current.visible===false)return false;seen.add(current.id);}return true;}
export function resolveSceneEnvironment(environment={},surface={light:3.2},objects=[]){
  const managed=environment.mode==='actors'||objects.some(object=>components(object).some(c=>environmentTypes.has(c.type))),preset=skyPresets[environment.preset]||skyPresets.day;
  if(!managed){const az=THREE.MathUtils.degToRad(environment.sunAzimuth??-30),el=THREE.MathUtils.degToRad(environment.sunElevation??preset.elevation);return {mode:'legacy',preset,sky:environment.skyEnabled===false?null:{...preset,topColor:rgba(preset.top),horizonColor:rgba(preset.horizon),groundColor:rgba(preset.ground),sunDiskScale:1,sunHeightTint:false},ambient:{color:rgba(preset.horizon),groundColor:rgba(preset.ground),intensity:environment.skyEnabled===false?.25:preset.ambient,indirectIntensity:environment.skyEnabled===false?.12:.6},suns:environment.sunEnabled===false?[]:[{object:'sun-light',direction:[Math.sin(az)*Math.cos(el),Math.sin(el),Math.cos(az)*Math.cos(el)],color:rgba(environment.preset==='night'?0xa5b9e1:environment.preset==='sunset'?0xffbb80:0xffeed7),intensity:surface.light??preset.light,castShadow:environment.shadowEnabled!==false,index:0}],cloud:environment.cloudsEnabled===false?null:{coverage:environment.cloudDensity??.55,color:rgba(preset.cloud),opacity:.6,layerBottomHeight:4,layerHeight:1.2,radius:16,windSpeed:environment.windSpeed??.45,position:[0,0,0],rotation:[0,0,0],scale:[1,1,1]},fog:environment.fogEnabled===false?null:{legacy:true,color:rgba(preset.ground),near:10,far:90-(environment.fogAmount??.25)*66}};}
  const byId=new Map(objects.map(o=>[o.id,o])),matrices=new Map(),members=[];
  for(const object of objects){if(!actorVisible(object,byId))continue;for(const component of components(object)){if(!environmentTypes.has(component.type)&&component.type!=='DirectionalLight')continue;const p={...componentDefaults(component.type),...component.properties};if(!p.enabled||!validComponentProperties(component.type,p))continue;members.push({object,type:component.type,p,matrix:worldMatrix(object,byId,matrices)});}}
  const first=type=>members.filter(m=>m.type===type).sort((a,b)=>b.p.priority-a.p.priority)[0],sky=first('SkyAtmosphere'),cloud=first('VolumetricCloud'),fog=first('ExponentialHeightFog'),ambient={color:[0,0,0,1],groundColor:[0,0,0,1],intensity:0,indirectIntensity:0,realTimeCapture:false,captureResolution:64,objects:[]};
  for(const {object,p} of members.filter(m=>m.type==='SkyLight')){ambient.intensity+=p.intensity;ambient.indirectIntensity+=p.indirectIntensity*p.intensity;ambient.realTimeCapture||=p.realTimeCapture;ambient.captureResolution=Math.max(ambient.captureResolution,Number(p.captureResolution));ambient.objects.push(object.id);for(let i=0;i<3;i++){ambient.color[i]+=p.color[i]*p.intensity;ambient.groundColor[i]+=p.groundColor[i]*p.intensity;}}
  if(ambient.intensity)for(let i=0;i<3;i++){ambient.color[i]/=ambient.intensity;ambient.groundColor[i]/=ambient.intensity;}
  const suns=members.filter(m=>m.type==='DirectionalLight'&&m.p.atmosphereSunLight).sort((a,b)=>a.p.atmosphereSunLightIndex-b.p.atmosphereSunLightIndex||b.p.intensity-a.p.intensity).filter((m,i,list)=>i===0||m.p.atmosphereSunLightIndex!==list[i-1].p.atmosphereSunLightIndex).map(({object,p,matrix})=>({object:object.id,direction:new THREE.Vector3(0,0,1).transformDirection(matrix).toArray(),color:p.color,intensity:p.intensity,castShadow:p.castShadow,index:p.atmosphereSunLightIndex}));
  let cloudConfig=null;if(cloud){const position=new THREE.Vector3(),quaternion=new THREE.Quaternion(),scale=new THREE.Vector3();cloud.matrix.decompose(position,quaternion,scale);cloudConfig={...cloud.p,object:cloud.object.id,position:position.toArray(),rotation:new THREE.Euler().setFromQuaternion(quaternion).toArray().slice(0,3),scale:scale.toArray()};}
  return {mode:'actors',preset,sky:sky?{...sky.p,object:sky.object.id}:null,ambient,suns,cloud:cloudConfig,fog:fog?{...fog.p,object:fog.object.id,height:new THREE.Vector3().setFromMatrixPosition(fog.matrix).y}:null};
}
export function createSky(scene,renderer){
  const skyMaterial=new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,fog:false,uniforms:{topColor:{value:new THREE.Color()},horizonColor:{value:new THREE.Color()},sunDirection:{value:new THREE.Vector3()},sunColor:{value:new THREE.Color()},moonDirection:{value:new THREE.Vector3()},moonColor:{value:new THREE.Color()},sunDiskPower:{value:350}},
    vertexShader:'varying vec3 skyDirection;void main(){skyDirection=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader:'varying vec3 skyDirection;uniform vec3 topColor;uniform vec3 horizonColor;uniform vec3 sunDirection;uniform vec3 sunColor;uniform vec3 moonDirection;uniform vec3 moonColor;uniform float sunDiskPower;void main(){vec3 d=normalize(skyDirection);float h=smoothstep(-0.12,0.85,d.y);vec3 c=mix(horizonColor,topColor,h);c+=sunColor*pow(max(dot(d,normalize(sunDirection)),0.0),sunDiskPower)*0.55;c+=moonColor*pow(max(dot(d,normalize(moonDirection)),0.0),sunDiskPower)*0.55;gl_FragColor=vec4(c,1.0);}'});
  const material=renderer?.hbSkyMaterial?.(skyMaterial.uniforms)||skyMaterial;if(material!==skyMaterial)skyMaterial.dispose();
  const skyDome=new THREE.Mesh(new THREE.SphereGeometry(1,32,16),material);skyDome.renderOrder=-1000;skyDome.frustumCulled=false;skyDome.userData.environmentRender=true;scene.add(skyDome);
  const cloudGroup=new THREE.Group(),cloudMaterial=new THREE.MeshBasicMaterial({color:0xe4eee8,transparent:true,opacity:.60,depthWrite:false,fog:false});
  for(let i=0;i<10;i++){const cluster=new THREE.Group(),angle=i*Math.PI/5;cluster.position.set(Math.cos(angle)*16,4+Math.sin(i*2)*1.2,Math.sin(angle)*16);for(let j=0;j<5;j++){const puff=new THREE.Mesh(new THREE.SphereGeometry(.65+((i+j)%3)*.2,16,10),cloudMaterial);puff.position.set((j-2)*.8,Math.sin(j*2)*.23,Math.cos(j)*.3);puff.scale.set(1.3,.55,1);cluster.add(puff);}cluster.rotation.y=-angle;cluster.userData.basePosition=cluster.position.toArray();cloudGroup.add(cluster);}
  cloudGroup.userData.environmentRender=true;cloudGroup.userData.windPhase=0;scene.add(cloudGroup);return {skyDome,cloudGroup};
}
export function heightFogAmount({density,heightFalloff,height=0,startDistance=0,cutoffDistance=100000,maxOpacity=1},cameraHeight,worldHeight,distance){
  if(distance<=startDistance||distance>=cutoffDistance||density<=0)return 0;const start=distance?startDistance/distance:0,startHeight=cameraHeight+(worldHeight-cameraHeight)*start,span=worldHeight-startHeight,k=Math.max(0,heightFalloff),endRatio=k*span,integral=Math.abs(endRatio)<.001?1:-Math.expm1(-Math.max(-40,Math.min(40,endRatio)))/endRatio,optical=density*Math.exp(Math.max(-40,Math.min(40,-k*(startHeight-height))))*(distance-startDistance)*integral;
  return Math.min(maxOpacity,Math.max(0,-Math.expm1(-optical)));
}
function heightFogState(scene){return scene.userData.heightFogUniforms??={hbHeightFog:{value:new THREE.Vector4()},hbHeightFogDistances:{value:new THREE.Vector2()},hbHeightFogCameraY:{value:0},hbHeightFogCameraPosition:{value:new THREE.Vector3()},hbHeightFogEnabled:{value:0}};}
const heightFogFragment=`
#ifdef USE_FOG
  if(hbHeightFogEnabled>0.5){
    float hbDistance=length(hbHeightFogWorldPosition-hbHeightFogCameraPosition);
    float hbStart=hbHeightFogDistances.x;
    float hbStartRatio=clamp(hbStart/max(hbDistance,0.00001),0.0,1.0);
    float hbStartHeight=mix(hbHeightFogCameraY,hbHeightFogWorldY,hbStartRatio);
    float hbSpan=hbHeightFogWorldY-hbStartHeight;
    float hbRatio=hbHeightFog.y*hbSpan;
    float hbIntegral=abs(hbRatio)<0.001?1.0:(1.0-exp(clamp(-hbRatio,-40.0,40.0)))/hbRatio;
    float hbDensity=hbHeightFog.x*exp(clamp(-hbHeightFog.y*(hbStartHeight-hbHeightFog.z),-40.0,40.0));
    float hbFog=clamp(1.0-exp(-hbDensity*max(0.0,hbDistance-hbStart)*hbIntegral),0.0,hbHeightFog.w);
    if(hbDistance>=hbHeightFogDistances.y)hbFog=0.0;
    gl_FragColor.rgb=mix(gl_FragColor.rgb,fogColor,hbFog);
  }else{
    #ifdef FOG_EXP2
      float fogFactor=1.0-exp(-fogDensity*fogDensity*vFogDepth*vFogDepth);
    #else
      float fogFactor=smoothstep(fogNear,fogFar,vFogDepth);
    #endif
    gl_FragColor.rgb=mix(gl_FragColor.rgb,fogColor,fogFactor);
  }
#endif`;
function patchHeightFogMaterial(material,scene){
  if(material.userData.hbHeightFog||material.fog===false)return;const previous=material.onBeforeCompile,key=material.customProgramCacheKey.call(material);
  material.userData.hbHeightFog=true;material.onBeforeCompile=function(shader,renderer){previous.call(this,shader,renderer);if(!shader.vertexShader.includes('#include <fog_vertex>')||!shader.fragmentShader.includes('#include <fog_fragment>'))return;Object.assign(shader.uniforms,heightFogState(scene));shader.vertexShader='varying float hbHeightFogWorldY;varying vec3 hbHeightFogWorldPosition;\n'+shader.vertexShader.replace('#include <fog_vertex>',`#include <fog_vertex>
    vec4 hbFogPosition=vec4(transformed,1.0);
    #ifdef USE_BATCHING
      hbFogPosition=batchingMatrix*hbFogPosition;
    #endif
    #ifdef USE_INSTANCING
      hbFogPosition=instanceMatrix*hbFogPosition;
    #endif
    hbHeightFogWorldPosition=(modelMatrix*hbFogPosition).xyz;
    hbHeightFogWorldY=hbHeightFogWorldPosition.y;`);shader.fragmentShader='varying float hbHeightFogWorldY;varying vec3 hbHeightFogWorldPosition;uniform vec4 hbHeightFog;uniform vec2 hbHeightFogDistances;uniform float hbHeightFogCameraY;uniform vec3 hbHeightFogCameraPosition;uniform float hbHeightFogEnabled;\n'+shader.fragmentShader.replace('#include <fog_fragment>',heightFogFragment);};
  material.customProgramCacheKey=function(){return key+'|hb-height-fog-v1';};material.needsUpdate=true;
}
export function captureSkyEnvironment(renderer,{skyDome,cloudGroup},resolved,state){
  state.generator??=renderer.hbPMREM?.()||new THREE.PMREMGenerator(renderer);const captureScene=new THREE.Scene(),tint=color(resolved.ambient.color),materials=new Set();
  captureScene.background=color(resolved.sky?.groundColor||[.02,.025,.03,1]).multiply(tint);
  if(skyDome?.visible){const dome=skyDome.clone();dome.position.set(0,0,0);dome.scale.setScalar(100);dome.material=skyDome.material.clone();materials.add(dome.material);for(const key of ['topColor','horizonColor','sunColor','moonColor'])dome.material.uniforms[key].value.multiply(tint);captureScene.add(dome);}
  if(cloudGroup?.visible){const clouds=cloudGroup.clone(),copied=new Map();if(resolved.cloud)clouds.position.fromArray(resolved.cloud.position);clouds.traverse(node=>{if(!node.material)return;const list=Array.isArray(node.material)?node.material:[node.material],mapped=list.map(source=>{if(!copied.has(source)){const material=source.clone();material.color?.multiply(tint);copied.set(source,material);materials.add(material);}return copied.get(source);});node.material=Array.isArray(node.material)?mapped:mapped[0];});captureScene.add(clouds);}
  try{return state.generator.fromScene(captureScene,0,.1,1000000,{size:resolved.ambient.captureResolution});}finally{for(const material of materials)material.dispose();}
}
// Logical actor configuration is shared, but each WebGL context owns its GPU capture.
export function updateSkyCapture(scene,renderer,sky,resolved,{now=performance.now(),capture=captureSkyEnvironment}={}){
  const states=scene.userData.skyCaptures??=new Map();let state=states.get(renderer);
  if(!scene.userData.skyCaptureBase)scene.userData.skyCaptureBase={environment:scene.environment,renderer};
  const base=scene.userData.skyCaptureBase;
  if(!state){state={baseEnvironment:base.environment,renderer,target:null,generator:null,signature:'',members:'',lastCapture:-Infinity,dirty:false,captures:0};states.set(renderer,state);}scene.userData.skyCapture=state;
  if(resolved.mode==='legacy'){
    if(base.renderer!==renderer&&renderer?.isWebGLRenderer){state.generator??=new THREE.PMREMGenerator(renderer);if(!state.baseTarget){const legacy={...resolved,ambient:{...resolved.ambient,color:[1,1,1,1],captureResolution:128}};state.baseTarget=capture(renderer,sky,legacy,state);state.baseEnvironment=state.baseTarget.texture;}}
    scene.environment=state.baseEnvironment;state.target?.dispose();state.target=null;state.signature='';state.members='';return;
  }
  if(resolved.ambient.indirectIntensity<=0){scene.environment=null;state.target?.dispose();state.target=null;state.signature='';state.members='';return;}
  if(!renderer?.isWebGLRenderer&&renderer?.hbBackend!=='webgpu'&&capture===captureSkyEnvironment)return;
  const members=JSON.stringify(resolved.ambient.objects),signature=JSON.stringify([resolved.sky,resolved.suns,resolved.cloud,resolved.ambient.color,resolved.ambient.captureResolution,members]);
  if(state.target){scene.environment=state.target.texture;if(signature===state.signature&&!state.dirty)return;if(!resolved.ambient.realTimeCapture&&!state.dirty&&members===state.members)return;if(!state.dirty&&now-state.lastCapture<250)return;}
  const previous=state.target,next=capture(renderer,sky,resolved,state);state.target=next;state.signature=signature;state.members=members;state.lastCapture=now;state.dirty=false;state.captures++;scene.environment=next.texture;previous?.dispose();
}
export function recaptureSceneEnvironment(scene){for(const state of scene.userData.skyCaptures?.values()||[])state.dirty=true;}
export function releaseSceneEnvironmentRenderer(scene,renderer){const states=scene?.userData.skyCaptures,state=states?.get(renderer);if(!state)return;if(scene.environment===state.target?.texture||scene.environment===state.baseTarget?.texture)scene.environment=scene.userData.skyCaptureBase.environment;state.target?.dispose();state.baseTarget?.dispose();state.generator?.dispose();states.delete(renderer);if(scene.userData.skyCapture===state)delete scene.userData.skyCapture;}
export function disposeSceneEnvironment(scene){if(!scene)return;for(const renderer of [...scene.userData.skyCaptures?.keys()||[]])releaseSceneEnvironmentRenderer(scene,renderer);if(scene.userData.skyCaptureBase)scene.environment=scene.userData.skyCaptureBase.environment;delete scene.userData.skyCaptures;delete scene.userData.skyCapture;delete scene.userData.skyCaptureBase;const target=scene.userData.environmentTarget;if(target){target.dispose();if(scene.environment===target.texture)scene.environment=null;delete scene.userData.environmentTarget;}}

export function applySceneEnvironment({scene,environment,surface,runtimeSettings,ambientLight,mainRenderer,groundFloor,skyDome,cloudGroup,sun,objects=[]}){
  const resolved=resolveSceneEnvironment(environment,surface,objects);if(!scene)return resolved;const p=resolved.preset,sky=resolved.sky,uniforms=heightFogState(scene);
  scene.background??=new THREE.Color();if(scene.background.isColor)scene.background.copy(sky?color(sky.groundColor):new THREE.Color(0x272f34));
  scene.environmentIntensity=resolved.ambient.indirectIntensity;if(ambientLight){ambientLight.intensity=resolved.ambient.intensity;ambientLight.color.copy(color(resolved.ambient.color));ambientLight.groundColor?.copy(color(resolved.ambient.groundColor));}if(mainRenderer)mainRenderer.toneMappingExposure=sky?.exposure??1;
  if(groundFloor){groundFloor.material.color.copy(sky?color(sky.groundColor):new THREE.Color(p.ground));if(!groundFloor.userData.editorHelper)groundFloor.visible=runtimeSettings?.dimension!=='2d';}
  if(skyDome){skyDome.visible=!!sky;const u=skyDome.material.uniforms;if(sky){u.topColor.value.copy(color(sky.topColor));u.horizonColor.value.copy(color(sky.horizonColor));if(sky.sunHeightTint&&resolved.suns[0]){const sunset=1-THREE.MathUtils.smoothstep(resolved.suns[0].direction[1],0,.45);u.horizonColor.value.lerp(new THREE.Color(0xe9b18b),sunset*.55);u.topColor.value.lerp(new THREE.Color(0x596487),sunset*.3);}u.sunDiskPower.value=350/Math.max(.05,sky.sunDiskScale||.05);}
    for(let i=0;i<2;i++){const light=resolved.suns.find(s=>s.index===i),dir=i?'moonDirection':'sunDirection',tint=i?'moonColor':'sunColor';u[dir].value.fromArray(light?.direction||[0,-1,0]);u[tint].value.copy(light&&sky?.sunDiskScale?color(light.color).multiplyScalar(Math.min(1,light.intensity)):new THREE.Color(0,0,0));}
  }
  if(resolved.mode==='legacy'&&sun){const s=resolved.suns[0];sun.castShadow=environment?.shadowEnabled!==false;sun.intensity=s?.intensity||0;if(s){sun.color.copy(color(s.color));sun.parent.position.fromArray(s.direction).multiplyScalar(10);sun.parent.updateWorldMatrix(true,false);sun.target.position.copy(sun.parent.worldToLocal(new THREE.Vector3()));}if(mainRenderer?.shadowMap)mainRenderer.shadowMap.needsUpdate=true;}
  if(cloudGroup){const cloud=resolved.cloud;cloudGroup.visible=!!cloud&&cloud.coverage>0;cloudGroup.userData.configuration=cloud;cloudGroup.userData.heightFogUniforms=uniforms;for(const [i,cluster] of cloudGroup.children.entries()){cluster.visible=!!cloud&&i<Math.ceil(cloud.coverage*10);if(!cloud)continue;const material=cluster.children[0]?.material;if(material){material.color.copy(color(cloud.color));material.opacity=cloud.opacity*cloud.color[3];}const base=cluster.userData.basePosition;cluster.position.set(base[0]*cloud.radius/16,cloud.layerBottomHeight+(base[1]-4)*cloud.layerHeight/1.2,base[2]*cloud.radius/16);cluster.scale.set(cloud.radius/16,cloud.layerHeight/1.2,cloud.radius/16);}if(cloud){cloudGroup.position.fromArray(cloud.position);cloudGroup.rotation.set(...cloud.rotation);cloudGroup.scale.fromArray(cloud.scale);}}
  const fog=resolved.fog;uniforms.hbHeightFogEnabled.value=fog&&!fog.legacy?1:0;if(!fog)scene.fog=null;else if(fog.legacy){if(!scene.fog?.isFog)scene.fog=new THREE.Fog(color(fog.color),fog.near,fog.far);else{scene.fog.color.copy(color(fog.color));scene.fog.near=fog.near;scene.fog.far=fog.far;}}else{if(!scene.fog?.isFogExp2)scene.fog=new THREE.FogExp2(color(fog.color),fog.density);else{scene.fog.color.copy(color(fog.color));scene.fog.density=fog.density;}uniforms.hbHeightFog.value.set(fog.density,fog.heightFalloff,fog.height,fog.maxOpacity);uniforms.hbHeightFogDistances.value.set(fog.startDistance,fog.cutoffDistance);scene.traverse(node=>{for(const material of node.material?(Array.isArray(node.material)?node.material:[node.material]):[])if(mainRenderer?.hbBackend!=='webgpu')patchHeightFogMaterial(material,scene);});}
  mainRenderer?.hbFog?.(scene,fog,uniforms);scene.userData.resolvedEnvironment=resolved;updateSkyCapture(scene,mainRenderer,{skyDome,cloudGroup},resolved);return resolved;
}
export function syncSkyToCamera({skyDome,cloudGroup},camera,delta=0){
  if(!camera)return;const position=camera.getWorldPosition(new THREE.Vector3());if(skyDome){skyDome.position.copy(position);skyDome.scale.setScalar(Math.max(.01,(camera.far||1000)*.85));}
  if(cloudGroup){const cloud=cloudGroup.userData.configuration,u=cloudGroup.userData.heightFogUniforms;if(u){u.hbHeightFogCameraY.value=position.y;u.hbHeightFogCameraPosition.value.copy(position);}if(cloud){cloudGroup.userData.windPhase=(cloudGroup.userData.windPhase+(Number.isFinite(delta)?delta:0)*cloud.windSpeed*.02)%(Math.PI*2);cloudGroup.position.set(position.x+cloud.position[0],cloud.position[1],position.z+cloud.position[2]);cloudGroup.rotation.set(...cloud.rotation);cloudGroup.rotation.y+=cloudGroup.userData.windPhase;}}
}
