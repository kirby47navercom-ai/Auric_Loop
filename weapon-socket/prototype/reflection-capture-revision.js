import {materialNodeKey} from './material-runtime.js';
const arrayStart=Symbol('array'),arrayEnd=Symbol('/array'),objectStart=Symbol('object'),objectEnd=Symbol('/object');
const lightFields=['intensity','distance','decay','angle','penumbra'],textureFields=['map','normalMap','roughnessMap','metalnessMap','emissiveMap','aoMap'],omitted=type=>type==='undefined'||type==='function'||type==='symbol';
const captureFields=['opacity','alphaTest','transparent','side','visible','bumpScale','displacementScale','displacementBias','lightMapIntensity','aoMapIntensity','clearcoat','clearcoatRoughness','transmission','thickness','ior','specularIntensity','reflectivity','iridescence','iridescenceIOR','sheen','sheenRoughness','anisotropy','anisotropyRotation','attenuationDistance'];
const captureTextures=['lightMap','bumpMap','displacementMap','alphaMap','specularMap','clearcoatMap','clearcoatNormalMap','clearcoatRoughnessMap','transmissionMap','thicknessMap','specularColorMap','specularIntensityMap','iridescenceMap','iridescenceThicknessMap','sheenColorMap','sheenRoughnessMap','anisotropyMap'],geometryAttributes=['position','normal','uv','uv1','color','skinIndex','skinWeight'];
// Keep scalar facts, rather than a full escaped scene string in every probe key.
export class CaptureRevision {
 constructor(){this.values=[];this.cursor=0;this.version=0;this.changed=false;this.ancestors=[];}
 begin(){this.cursor=0;this.changed=this.inProgress===true;this.inProgress=true;}
 token(value){if(this.values[this.cursor]!==value||this.cursor>=this.values.length){this.values[this.cursor]=value;this.changed=true;}this.cursor++;}
 scalar(value){this.token(value===undefined||typeof value==='number'&&!Number.isFinite(value)?null:value===0?0:value);}
 start(){this.token(arrayStart);}
 end(){this.token(arrayEnd);}
 color(value){if(!value){this.scalar(null);return;}this.start();this.scalar(value.r);this.scalar(value.g);this.scalar(value.b);this.end();}
 array(value){if(!value){this.scalar(null);return;}this.start();for(let i=0;i<value.length;i++)this.json(value[i]);this.end();}
 json(value){
  if(value&&typeof value.toJSON==='function')value=value.toJSON();
  if(typeof value==='bigint')throw new TypeError('BigInt capture input');
  if(!value||typeof value!=='object'){this.scalar(omitted(typeof value)?null:value);return;}
  if(this.ancestors.includes(value))throw new TypeError('Circular capture input');this.ancestors.push(value);
  try{if(Array.isArray(value)){this.array(value);return;}this.token(objectStart);for(const key of Object.keys(value)){const v=value[key];if(omitted(typeof v))continue;this.scalar(key);this.json(v);}this.token(objectEnd);}finally{this.ancestors.pop();}
 }
 finish(){if(this.cursor!==this.values.length){this.values.length=this.cursor;this.changed=true;}if(this.changed)this.version++;this.inProgress=false;return this.version;}
 info(){return{version:this.version,retainedScalars:this.values.length,visitedScalars:this.cursor,changed:this.changed};}
}
export class ReflectionCaptureRevision extends CaptureRevision {
 constructor(){super();this.pass=0;this.geometryVisits=new WeakMap();this.materialVisits=new WeakMap();}
 texture(t){if(t){this.start();this.scalar(t.uuid);this.scalar(t.version);this.end();}else this.scalar(null);}
 attribute(a){if(!a){this.scalar(null);return;}this.start();this.scalar(a.isInterleavedBufferAttribute?a.data.version:a.version);this.scalar(a.count);this.scalar(a.itemSize);this.scalar(a.normalized);this.end();}
 geometry(g){if(!g){this.scalar(null);return;}this.start();this.scalar(g.uuid);if(this.geometryVisits.get(g)===this.pass){this.end();return;}this.geometryVisits.set(g,this.pass);this.scalar(g.drawRange?.start);this.scalar(g.drawRange?.count);this.json(g.groups);this.attribute(g.index);for(const k of geometryAttributes)this.attribute(g.attributes[k]);this.scalar(g.morphTargetsRelative);for(const k of ['position','normal']){this.start();for(const a of g.morphAttributes[k]||[])this.attribute(a);this.end();}this.end();}
 material(m,scene){this.start();this.scalar(m.uuid);if(this.materialVisits.get(m)===this.pass){this.end();return;}this.materialVisits.set(m,this.pass);const source=m.userData?.materialSource;this.color(m.color);this.color(m.emissive);this.scalar(m.roughness);this.scalar(m.metalness);this.scalar(m.emissiveIntensity);this.json(source?.parameters);this.json(source?.surface);this.json(m.userData?.textureState?.());this.scalar(source?.graph?.nodes.some(n=>{const key=materialNodeKey(n);return key==='time'||key==='panner';})?scene.userData.hbMaterialTime||0:0);for(const k of textureFields)this.texture(m[k]);
  this.start();for(const k of captureFields)if(m[k]!==undefined){this.scalar(k);this.scalar(m[k]);}for(const k of captureTextures)if(m[k]){this.scalar(k);this.texture(m[k]);}for(const k of ['normalScale','clearcoatNormalScale'])if(m[k]){this.scalar(k);this.start();this.scalar(m[k].x);this.scalar(m[k].y);this.end();}for(const k of ['specularColor','sheenColor','attenuationColor'])if(m[k]){this.scalar(k);this.color(m[k]);}this.scalar(m.userData?.hbProbeLightmapMixing===true);this.end();this.end();}
 update(scene,meshes,lights){
  this.begin();this.pass++;this.start();this.start();for(const n of lights){this.start();this.scalar(n.uuid);this.array(n.matrixWorld.elements);this.color(n.color);this.color(n.groundColor);for(const k of lightFields)this.scalar(n[k]);this.array(n.target?.matrixWorld.elements);this.end();}this.end();
  this.color(scene.background?.isColor?scene.background:null);this.json(scene.userData.resolvedEnvironment);this.texture(scene.background?.isTexture?scene.background:null);this.start();
  for(const n of meshes){n.skeleton?.update();this.start();this.scalar(n.uuid);this.array(n.matrixWorld.elements);this.scalar(n.instanceMatrix?.version);this.array(n.morphTargetInfluences);this.array(n.skeleton?.boneMatrices);
   const materials=n.material;if(Array.isArray(materials))for(const m of materials)this.material(m,scene);else this.material(materials,scene);this.geometry(n.geometry);this.scalar(n.renderOrder);this.scalar(n.castShadow);this.scalar(n.receiveShadow);this.end();
  }this.end();this.end();return this.finish();
 }
}
