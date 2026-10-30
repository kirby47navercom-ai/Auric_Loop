import {ReflectionCaptureRevision} from './reflection-capture-revision.js';
import {probeInfluenceSettings} from './reflection-probe-influence.js';
import {reflectionProxyVolume,resolveProbeProjection,probeProjectionSettings} from './reflection-probe-projection.js';
import {ProbeCandidateIndex} from './reflection-probe-spatial.js';
import {probeBlendUniforms,updateProbeBlendUniforms,probeBlendPhysicalGLSL} from './reflection-probe-blend.js';
import {ReflectionProbeAtlas} from './reflection-probe-atlas.js';
import {probeAtlasPhysicalGLSL} from './reflection-probe-atlas-shader.js';
import {reflectionProbeIntersectsBox,reflectionProbeMeshBounds} from './reflection-probe-bounds.js';
import {reflectionProbeVolume,reflectionProbeSphereVolume,probeLocalPoint,reflectionProbeFlags} from './reflection-probe-volume.js';
import {attachGPURefraction} from './gpu-refraction.js';
import * as THREE from 'three';
import {componentDefaults,validComponentProperties} from './scene-components.js';
import {ShaderChunk} from 'three';

const uniformBanks=new WeakMap();
function materialProbeUniforms(material){let uniforms=uniformBanks.get(material);if(!uniforms){uniforms={...probeBlendUniforms(),hbProbeAtlas:{value:null},hbProbeTable:{value:null},hbProbeAtlasCount:{value:0},hbProbeAtlasInfluence:{value:false},hbProbeTableWidth:{value:1}};uniformBanks.set(material,uniforms);}return uniforms;}
function usesOwnedClone(mesh,entry){const current=Array.isArray(mesh.material)?mesh.material:[mesh.material];return current.length===entry.owned.length&&current.every((m,i)=>m===entry.owned[i]);}
function probeMeshMaterial(mesh){return (Array.isArray(mesh.material)?mesh.material:[mesh.material]).some(m=>m?.isMeshStandardMaterial||m?.isMeshStandardNodeMaterial);}
const directions=[[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]],ups=[[0,-1,0],[0,-1,0],[0,0,1],[0,0,-1],[0,-1,0],[0,-1,0]];
// Capture inputs are independent of how an existing cubemap is bound/blended.
export const probeCaptureProperties=Object.freeze(['resolution','near','far','bounces','refreshMode','refreshVersion','excludeOwner']);
export function probeCaptureKey(probe,sceneSignature=null){return JSON.stringify([probe.center,probeCaptureProperties.map(key=>probe.p[key]),probe.p.refreshMode==='onChange'?sceneSignature:null]);}
export function collectReflectionProbes(scene){
  const groups=[],proxies=new Map();scene.traverse(group=>{if(!group.userData.reflectionProbes?.length&&!group.userData.reflectionProxyVolumes?.length)return;for(let parent=group;parent;parent=parent.parent)if(!parent.visible)return;groups.push(group);const rows=[];for(const entry of group.userData.reflectionProxyVolumes||[]){const p={...componentDefaults('ReflectionProxyVolume'),...entry.properties};if(!validComponentProperties('ReflectionProxyVolume',p))throw Error('반사 투영 프록시의 모양·범위를 확인하세요.');if(p.enabled)rows.push({id:entry.id,name:entry.name,p,projection:reflectionProxyVolume(group,p)});}if(rows.length)proxies.set(group.userData.objectId,rows);});
  const result=[];for(const group of groups){
    if(!group.userData.reflectionProbes)continue;
    for(const entry of group.userData.reflectionProbes){
      const p={...componentDefaults('ReflectionProbe'),...entry.properties};if(!validComponentProperties('ReflectionProbe',p))throw Error('반사 프로브 범위·해상도·캡처 설정을 확인하세요.');if(!p.enabled)continue;
      const sphere=p.volumeShape==='sphere',extent=sphere?new THREE.Vector3(p.volumeRadius,p.volumeRadius,p.volumeRadius):new THREE.Vector3(...p.size).multiplyScalar(.5),sphereCenter=new THREE.Vector3(...p.offset).applyMatrix4(group.matrixWorld),box=new THREE.Box3(extent.clone().negate().add(new THREE.Vector3(...p.offset)),extent.clone().add(new THREE.Vector3(...p.offset))).applyMatrix4(group.matrixWorld),center=new THREE.Vector3(...p.captureOffset).applyMatrix4(group.matrixWorld).toArray();
      const localBox=sphere?reflectionProbeSphereVolume(sphereCenter.toArray(),p.volumeRadius):reflectionProbeVolume(group.matrixWorld,p.offset.map((v,i)=>v-p.size[i]*.5),p.offset.map((v,i)=>v+p.size[i]*.5));if(!localBox)continue;if(sphere)box.setFromCenterAndSize(sphereCenter,new THREE.Vector3().copy(extent).multiplyScalar(2));
      result.push({id:group.userData.objectId+':'+entry.id,owner:group.userData.objectId,p,center,minimum:box.min.toArray(),maximum:box.max.toArray(),volume:localBox.volume,localBox,projection:resolveProbeProjection(p,proxies),group});
    }
  }return result;
}
export function reflectionProbeCandidates(probes,position,bounds=null,index=null){
 const result=(index?index.candidates(position,bounds):probes).filter(p=>position===null&&!bounds|| (bounds?reflectionProbeIntersectsBox(p,bounds):(p.localBox?(p.localBox.shape==='sphere'?Math.hypot(...probeLocalPoint(p.localBox,position))<=p.localBox.maximum[0]:probeLocalPoint(p.localBox,position).every((v,i)=>v>=p.localBox.minimum[i]&&v<=p.localBox.maximum[i])):position.every((v,i)=>v>=p.minimum[i]&&v<=p.maximum[i]))));
 return index?result:result.sort((a,b)=>b.p.importance-a.p.importance||a.volume-b.volume||a.id.localeCompare(b.id));
}
export function reflectionProbeBinding(p){const influence=probeInfluenceSettings(p.p);return {id:p.id,settings:{...(influence.blendPositive[3]?influence:{}),...(p.projection?.mode?probeProjectionSettings(p.projection):{}),center:[...p.center,p.p.intensity],minimum:[...(p.localBox?.minimum||p.minimum),p.p.blendDistance],maximum:[...(p.localBox?.maximum||p.maximum),0],...(p.localBox?{localX:p.localBox.localX,localY:p.localBox.localY,localZ:p.localBox.localZ,faceScale:p.localBox.faceScale}:{}),options:[1,p.p.diffuseIntensity,1,reflectionProbeFlags(p.p)]}};}
export function selectReflectionProbes(probes,position,bounds=null,limit=2,index=null){return reflectionProbeCandidates(probes,position,bounds,index).slice(0,limit).map(reflectionProbeBinding);}
export function reflectionProbeDrawBindings(probes,position,bounds=null,index=null){const list=reflectionProbeCandidates(probes,position,bounds,index);return {probes:list.slice(0,2).map(reflectionProbeBinding),globalProbes:list.length>2};}
export function probeCaptureViews(probe){
  const camera=new THREE.PerspectiveCamera(90,1,probe.p.near,probe.p.far);camera.position.fromArray(probe.center);return directions.map((direction,i)=>{camera.up.fromArray(ups[i]);camera.lookAt(new THREE.Vector3(...probe.center).add(new THREE.Vector3(...direction)));camera.updateMatrixWorld();return {camera:camera.clone(),projection:new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse)};});
}

// Three owns browser PMREM convolution; native captures/filter/SH remain on D3D11.
export class ReflectionProbesRendering{
  constructor(){this.views=new Map();}
  prepare(renderer,scene){
    if(renderer.hbBackend==='d3d11')return;
    scene.updateMatrixWorld();const probes=collectReflectionProbes(scene);let view=this.views.get(renderer);
    if(!probes.length){if(view)this.disposeRenderer(renderer);return;}
    if(!view){view={generator:renderer.hbPMREM?.()||new THREE.PMREMGenerator(renderer),probes:new Map(),materials:new Map(),clones:new Map(),baseMaps:new Map(),baseUsed:new Set(),anchor:null,rotation:new THREE.Matrix4(),rotationEuler:new THREE.Euler(),baseFilters:0,captures:0};this.views.set(renderer,view);}
    const needsRevision=probes.some(p=>p.p.refreshMode==='onChange'),meshes=[],lights=[];scene.traverseVisible(n=>{if(needsRevision&&n.isLight)lights.push(n);if(n.isMesh&&!n.userData.editorHelper&&!n.userData.draw2d)meshes.push(n);});
    const used=new Set(probes.map(p=>p.id));for(const [id,entry] of view.probes)if(!used.has(id)){entry.target.dispose();view.probes.delete(id);}
    const live=new Set(meshes);for(const [mesh,entry]of view.clones){const owned=usesOwnedClone(mesh,entry);if(live.has(mesh)&&owned)continue;if(owned)mesh.material=entry.original;for(const m of entry.owned){const state=view.materials.get(m);if(state){this.restore(m,state);view.materials.delete(m);}m.dispose();}view.clones.delete(mesh);}
    // Share authored uniform nodes and hooks; independent probe state must not freeze game material edits.
    const claimed=new Set();for(const mesh of meshes){const source=Array.isArray(mesh.material)?mesh.material:[mesh.material];if(source.some(m=>claimed.has(m))){const owned=source.map(m=>{const copy=new m.constructor().copy(m),state=view.materials.get(m);copy.userData=m.userData;copy.onBeforeCompile=state?.compile||m.onBeforeCompile;copy.customProgramCacheKey=state?.key||m.customProgramCacheKey;copy.setupEnvironment=state?.environment||m.setupEnvironment;copy.setupSpecular=m.setupSpecular;if(m.hbLayeredRefraction)attachGPURefraction(copy);if(state){copy.envMap=state.map;copy.envMapIntensity=state.intensity;copy.envNode=state.node;}return copy;});view.clones.set(mesh,{original:mesh.material,owned});mesh.material=Array.isArray(mesh.material)?owned:owned[0];}for(const m of Array.isArray(mesh.material)?mesh.material:[mesh.material])claimed.add(m);}
    if(!needsRevision)view.captureRevision=null;const changed=needsRevision?(view.captureRevision??=new ReflectionCaptureRevision()).update(scene,meshes,lights):null;

    const probeBounds=new THREE.Box3(),probeAt=new THREE.Vector3();view.baseUsed.clear();let pairs=0;
    const baseMap=texture=>{
      if(!texture)return null;if(texture.isPMREMTexture||texture.mapping===THREE.CubeUVReflectionMapping)return texture;
      if(!texture.isCubeTexture&&texture.mapping!==THREE.EquirectangularReflectionMapping)return null;
      view.baseUsed.add(texture);let entry=view.baseMaps.get(texture);const key=[texture.version,texture.pmremVersion].join(':');
      if(!entry||entry.key!==key){const target=texture.isCubeTexture?view.generator.fromCubemap(texture):view.generator.fromEquirectangular(texture);entry?.target.dispose();entry={key,target};view.baseMaps.set(texture,entry);view.baseFilters++;}return entry.target.texture;
    };
    const anchor=()=>{if(!view.anchor){const t=new THREE.DataTexture(new Uint16Array(336*64*4),336,64,THREE.RGBAFormat,THREE.HalfFloatType);t.mapping=THREE.CubeUVReflectionMapping;t.isPMREMTexture=true;t.minFilter=t.magFilter=THREE.LinearFilter;t.generateMipmaps=false;t.needsUpdate=true;view.anchor=t;}return view.anchor;};
    const bind=()=>{
      view.candidateIndex??=new ProbeCandidateIndex();view.candidateIndex.update(probes);
      const lists=new Map(meshes.map(mesh=>[mesh,reflectionProbeCandidates(probes,mesh.getWorldPosition(probeAt).toArray(),reflectionProbeMeshBounds(mesh,probeBounds),view.candidateIndex)])),needsAtlas=meshes.some(mesh=>lists.get(mesh).length>2&&probeMeshMaterial(mesh));
      if(needsAtlas){view.atlas??=new ReflectionProbeAtlas();view.atlas.update(renderer,view.candidateIndex.ranked,view.probes);}
      const seen=new Set();pairs=0;view.globalMeshes=0;for(const mesh of meshes){
        const list=lists.get(mesh),global=list.length>2&&probeMeshMaterial(mesh),candidates=list.slice(0,2).filter(p=>view.probes.has(p.id));if(candidates.length===2)pairs++;if(global)view.globalMeshes++;
        const primary=candidates[0],secondary=candidates[1],maps=candidates.map(p=>view.probes.get(p.id).target.texture);
        for(const material of Array.isArray(mesh.material)?mesh.material:[mesh.material]){
          if(!material?.isMeshStandardMaterial&&!material?.isMeshStandardNodeMaterial)continue;seen.add(material);let state=view.materials.get(material);
          if(!state){
            state={map:material.envMap,intensity:material.envMapIntensity,node:material.envNode,refraction:material.hbProbeRefraction,environment:material.setupEnvironment,compile:material.onBeforeCompile,key:material.customProgramCacheKey,cacheKey:material.customProgramCacheKey(),uniforms:materialProbeUniforms(material),rotation:new THREE.Matrix3(),global};view.materials.set(material,state);
            if(renderer.hbProbeEnvironment){
              material.setupEnvironment=function(builder){return this.envNode?.isLightingNode?this.envNode:state.environment.call(this,builder);};
              // Core Three materials are converted to node materials after the
              // render-object cache lookup. Include the binding identity so a
              // direct/atlas transition cannot reuse the old node builder.
              material.customProgramCacheKey=function(){return state.key.call(this)+'|hb-probe-node:'+(this.envNode?.uuid||'base')+'|lm-mix:'+(this.userData.hbProbeLightmapMixing===true?1:0);};
            }
            else{
              material.onBeforeCompile=(shader,r)=>{state.compile.call(material,shader,r);Object.assign(shader.uniforms,state.uniforms);shader.vertexShader='varying vec3 hbProbePosition;\n'+shader.vertexShader.replace('#include <worldpos_vertex>','#include <worldpos_vertex>\nvec4 hbProbeLocal=vec4(transformed,1.0);\n#ifdef USE_INSTANCING\nhbProbeLocal=instanceMatrix*hbProbeLocal;\n#endif\nhbProbePosition=(modelMatrix*hbProbeLocal).xyz;');shader.fragmentShader=shader.fragmentShader.replace('#include <envmap_physical_pars_fragment>',state.global?probeAtlasPhysicalGLSL():probeBlendPhysicalGLSL());if(state.global)shader.fragmentShader=shader.fragmentShader.replace('void main() {','void main() {\nif(!hbProbeAtlasInfluence)hbAtlasChoose(vec3(0),vec3(0));');};material.customProgramCacheKey=()=>state.cacheKey+(state.global?'|hb-probe-atlas-v4':'|hb-probe-blend-v3');
            }material.needsUpdate=true;
          }
          if(state.global!==global){state.global=global;material.needsUpdate=true;}
          const authoredMap=state.map||state.node?.value?.isTexture&&state.node.value,fallback=baseMap(authoredMap||scene.environment),baseIntensity=authoredMap?state.intensity:(scene.environmentIntensity??1),map=primary||fallback?anchor():state.map;if(material.envMap!==map){material.envMap=map;material.needsUpdate=true;}material.envMapIntensity=primary?primary.p.intensity:state.intensity;
          const rotation=authoredMap?material.envMapRotation:scene.environmentRotation;if(rotation){view.rotationEuler.copy(rotation);if(!renderer.hbProbeEnvironment){view.rotationEuler.x*=-1;view.rotationEuler.y*=-1;view.rotationEuler.z*=-1;}state.rotation.setFromMatrix4(view.rotation.makeRotationFromEuler(view.rotationEuler));}else state.rotation.identity();
          state.uniforms.hbProbeLightmapMixing.value=material.userData.hbProbeLightmapMixing===true;
          if(renderer.hbProbeEnvironment){
            const blended=!!(primary||fallback),key=global?'gpuGlobal':'gpu';if(blended&&!state[key])state[key]=renderer.hbProbeEnvironment(primary,maps[0]||fallback,global?view.atlas:null);const binding=state[key],node=blended?binding.node:state.node;if(material.envNode!==node){material.envNode=node;material.needsUpdate=true;}if(blended){if(global)binding.setAtlas(view.atlas);binding.update(primary,maps[0],secondary,maps[1],fallback,baseIntensity,state.rotation);}material.hbProbeRefraction=blended?binding:state.refraction;
          }else{updateProbeBlendUniforms(state.uniforms,candidates,maps,fallback,baseIntensity,state.rotation);state.uniforms.hbProbeAtlas.value=global?view.atlas.target.texture:null;state.uniforms.hbProbeTable.value=global?view.atlas.table:null;state.uniforms.hbProbeAtlasCount.value=global?view.atlas.count:0;state.uniforms.hbProbeAtlasInfluence.value=global&&view.atlas.influenceActive;state.uniforms.hbProbeTableWidth.value=global?view.atlas.width:1;}
        }
      }
      for(const[m,state]of view.materials)if(!seen.has(m)){this.restore(m,state);view.materials.delete(m);}
      if(!needsAtlas&&view.atlas){for(const state of view.materials.values()){state.gpuGlobal?.dispose();delete state.gpuGlobal;}view.atlas.dispose();view.atlas=null;}
    };
    // Capture culling needs the current CPU pose before the camera renders it.
    for(const mesh of meshes)if(mesh.isInstancedMesh||mesh.isSkinnedMesh||mesh.geometry?.morphAttributes.position?.length)reflectionProbeMeshBounds(mesh,probeBounds);
    const keys=new Map(probes.map(probe=>[probe.id,probeCaptureKey(probe,changed)]));
    const dirty=probes.filter(p=>view.probes.get(p.id)?.key!==keys.get(p.id));
    if(dirty.length){const iterations=Math.max(...dirty.map(p=>p.p.bounces));
      for(let bounce=0;bounce<iterations;bounce++){
        if(bounce>0)bind();const next=new Map();
        try{for(const probe of dirty){const p=probe.p;if(bounce>=p.bounces)continue;const hidden=[],materials=[],skies=[],environment=scene.environment;scene.environment=null;
          scene.traverse(n=>{if(n.visible&&(n.userData.editorHelper||n.userData.draw2d||p.excludeOwner&&n.userData.objectId===probe.owner||n.isMesh&&(Array.isArray(n.material)?n.material:[n.material]).some(m=>m?.transmission>0||m?.transmissionNode))){hidden.push(n);n.visible=false;}if(n.userData.environmentRender&&n.material?.uniforms?.topColor){skies.push([n,n.position.clone(),n.scale.clone()]);n.position.fromArray(probe.center);n.scale.setScalar(p.far*.85);n.updateMatrixWorld();}if(bounce===0&&n.isMesh)for(const m of Array.isArray(n.material)?n.material:[n.material]){if(!m||materials.some(e=>e[0]===m))continue;materials.push([m,m.envMap,m.envNode]);m.envMap=null;m.envNode=null;m.needsUpdate=true;}});
          try{const target=view.generator.fromScene(scene,0,p.near,p.far,{size:p.resolution,position:new THREE.Vector3(...probe.center)});next.set(probe.id,{key:bounce===p.bounces-1?keys.get(probe.id):null,target,size:p.resolution});view.captures++;}finally{scene.environment=environment;for(const n of hidden)n.visible=true;for(const [n,position,scale] of skies){n.position.copy(position);n.scale.copy(scale);n.updateMatrixWorld();}for(const [m,map,node] of materials){m.envMap=map;m.envNode=node;m.needsUpdate=true;}}
        }}catch(e){for(const entry of next.values())entry.target.dispose();throw e;}
        // Commit after every capture finishes, so all probes read the same previous iteration.
        for(const [id,entry]of next){view.probes.get(id)?.target.dispose();view.probes.set(id,entry);}
      }
    }
    bind();
    for(const [texture,entry]of view.baseMaps)if(!view.baseUsed.has(texture)){entry.target.dispose();view.baseMaps.delete(texture);}
    renderer.hbProbeResources={captureRevision:view.captureRevision?.info()||null,count:view.probes.size,captures:view.captures,blendedMeshes:pairs,globalMeshes:view.globalMeshes||0,atlas:view.atlas?.info()||null,candidates:view.candidateIndex?.info()||null,baseFilters:view.baseFilters,baseMaps:view.baseMaps.size,anchorBytes:view.anchor?.image.data.byteLength||0,browserSelection:'two direct maps when bounds intersect at most two; otherwise pixel-select first two covering probes from sorted atlas; affine fade/base remainder/instanced world positions'};
  }
  restore(material,state){for(const key of ['hbProbeBaseMap','hbProbeMap0','hbProbeMap1','hbProbeAtlas','hbProbeTable'])state.uniforms[key].value=null;state.gpu?.dispose?.();state.gpuGlobal?.dispose();material.envMap=state.map;material.envMapIntensity=state.intensity;material.envNode=state.node;material.setupEnvironment=state.environment;material.onBeforeCompile=state.compile;material.customProgramCacheKey=state.key;if(state.refraction===undefined)delete material.hbProbeRefraction;else material.hbProbeRefraction=state.refraction;material.needsUpdate=true;}
  disposeRenderer(renderer){const view=this.views.get(renderer);if(!view)return;for(const [m,state] of view.materials)this.restore(m,state);for(const [mesh,entry] of view.clones){if(usesOwnedClone(mesh,entry))mesh.material=entry.original;for(const m of entry.owned)m.dispose();}for(const p of view.probes.values())p.target.dispose();for(const e of view.baseMaps.values())e.target.dispose();view.baseMaps.clear();view.atlas?.dispose();view.anchor?.dispose();view.generator.dispose();this.views.delete(renderer);renderer.hbProbeResources={count:0};}
  dispose(){for(const renderer of this.views.keys())this.disposeRenderer(renderer);}
}
