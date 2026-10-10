import {validFrameSettings} from './build-profile.js';
import {storageKey} from './project-session.js';
import { validBlueprint } from './blueprint-model.js';
import {validComponents} from './scene-components.js';
import {validParent} from './scene-editor.js';
import {validSortingLayers} from './sorting-layers.js';
import {validBlueprintOverrides} from './blueprint-overrides.js';

export const STORAGE_KEY = storageKey('hbengine-ui-scene-v1');
export const defaultSurface = { color: '#889878', roughness: 0.72, metalness: 0.08, light: 3.2 };
export const defaultEnvironment = { preset: 'day', skyEnabled: true, sunEnabled: true, shadowEnabled: true, cloudsEnabled: true, fogEnabled: true, cloudDensity: 0.55, sunAzimuth: -30, sunElevation: 50, fogAmount: 0.25 };
export const defaultObjects = [
  { id: 'stone-arch', name: 'Stone arch', kind: 'arch', group: 'WORLD', position: [0, 0, -1.35], rotation: [0, 0, 0], scale: [1, 1, 1], visible: true },
  { id: 'floating-crystal', name: 'Floating crystal', kind: 'crystal', group: 'WORLD', position: [0, 1.4, -1.25], rotation: [0, 15, 0], scale: [1, 1, 1], visible: true },
  { id: 'garden-ground', name: 'Garden ground', kind: 'ground', group: 'WORLD', position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1], visible: true },
  { id: 'stepping-stones', name: 'Stepping stones', kind: 'path', group: 'WORLD', position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1], visible: true },
  { id: 'wild-grass', name: 'Wild grass', kind: 'grass', group: 'WORLD', position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1], visible: true },
  { id: 'garden-rocks', name: 'Garden rocks', kind: 'rocks', group: 'WORLD', position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1], visible: true },
  { id: 'water-pool', name: 'Water pool', kind: 'water', group: 'WORLD', position: [2.55, -0.06, 1.15], rotation: [0, 0, 0], scale: [1, 1, 1], visible: true },
  { id: 'sun-light', name: 'Sun light', kind: 'light', group: 'ENVIRONMENT', position: [-3, 7, 5], rotation: [0, 0, 0], scale: [1, 1, 1], visible: true },
  { id: 'scene-camera', name: 'Scene camera', kind: 'camera', group: 'ENVIRONMENT', position: [8.6, 7.2, 10.5], rotation: [0, 0, 0], scale: [1, 1, 1], visible: true }
];
export const clone = value => JSON.parse(JSON.stringify(value));
const kinds = new Set(['skyAtmosphere','skyLight','volumetricCloud','heightFog','cone','capsule','torus','particles','navigation','decal','arch', 'crystal', 'ground', 'path', 'grass', 'rocks', 'water', 'light', 'camera', 'cube', 'sphere', 'cylinder', 'plane', 'model','empty','group','playerStart','character','character2d','sprite','tilemap','audio','directionalLight','pointLight','spotLight','light2d','controller','gameMode','gameState','playerState']);
export const defaultRuntimeSettings={dimension:'3d',gameConfig:'',gravity:[0,-9.81,0],fixedDeltaTime:1/60,maxSubsteps:8};
export function validRuntimeSettings(value){return value&&(value.renderBackend===undefined||['webgl2','webgpu'].includes(value.renderBackend))&&(value.sortingLayers===undefined||validSortingLayers(value.sortingLayers))&&validFrameSettings(value)&&['2d','3d'].includes(value.dimension)&&typeof value.gameConfig==='string'&&value.gameConfig.length<=1000&&!value.gameConfig.includes('..')&&!/^(?:[a-z]+:|[/\\])/i.test(value.gameConfig)&&Array.isArray(value.gravity)&&value.gravity.length===3&&value.gravity.every(v=>Number.isFinite(v)&&Math.abs(v)<=1000)&&Number.isFinite(value.fixedDeltaTime)&&value.fixedDeltaTime>=1/240&&value.fixedDeltaTime<=.1&&Number.isInteger(value.maxSubsteps)&&value.maxSubsteps>=1&&value.maxSubsteps<=32;}
export const validSurface = value => !!value && /^#[0-9a-f]{6}$/i.test(value.color)
  && ['roughness','metalness'].every(k=>Number.isFinite(value[k])&&value[k]>=0&&value[k]<=1)
  && Number.isFinite(value.light)&&value.light>=0&&value.light<=10;
export function validScene(value) {
  return value && value.version === 1 && Array.isArray(value.objects)
    && new Set(value.objects.map(o => o?.id)).size === value.objects.length
    && value.objects.every(o => o && typeof o.id === 'string' && typeof o.name === 'string' && o.name.length <= 200
      && (o.kind!=='model'||typeof o.asset==='string'&&o.asset.length<=1000&&!o.asset.includes('..')) && (o.blueprint===undefined||typeof o.blueprint==='string'&&o.blueprint.length<=80) && ['blueprintAsset','materialAsset'].every(k=>o[k]===undefined||typeof o[k]==='string'&&o[k].length<=1000&&!o[k].includes('..')) && (o.materialSurface===undefined||validSurface(o.materialSurface)) && kinds.has(o.kind) && typeof o.visible === 'boolean'
      && ['position', 'rotation', 'scale'].every(key => Array.isArray(o[key]) && o[key].length === 3 && o[key].every(n => Number.isFinite(n) && Math.abs(n) <= (key==='position'?1000000:10000)))
      && o.scale.every(n => n >= 0.01))
    && value.objects.every(o=>validBlueprintOverrides(o.overrides)&&(o.components===undefined||validComponents(o.components))&&(o.parent===undefined||typeof o.parent==='string'&&validParent(value.objects,o.id,o.parent))&&(o.locked===undefined||typeof o.locked==='boolean')&&(o.tags===undefined||Array.isArray(o.tags)&&o.tags.length<=32&&o.tags.every(t=>typeof t==='string'&&t.length<=80))&&['spriteAsset','tilemapAsset','prefabAsset'].every(k=>o[k]===undefined||typeof o[k]==='string'&&o[k].length<=1000&&!o[k].includes('..')))
    && (value.runtime===undefined||validRuntimeSettings(value.runtime))
    && validSurface(value.surface)
    && (value.sceneName === undefined || (typeof value.sceneName === 'string' && value.sceneName.length > 0 && value.sceneName.length <= 80))
    && (value.environment === undefined || validEnvironment(value.environment))
    && (value.blueprint === undefined || validBlueprint(value.blueprint));
}
export function validEnvironment(env) {
  return env && ['day','overcast','sunset','night'].includes(env.preset)
    && (env.mode===undefined||['legacy','actors'].includes(env.mode))
    && ['skyEnabled','sunEnabled','cloudsEnabled','fogEnabled'].every(k => typeof env[k] === 'boolean')
    && (env.shadowEnabled===undefined||typeof env.shadowEnabled==='boolean')
    && ['cloudDensity','fogAmount'].every(k => Number.isFinite(env[k]) && env[k] >= 0 && env[k] <= 1)
    && Number.isFinite(env.sunAzimuth) && env.sunAzimuth >= -180 && env.sunAzimuth <= 180
    && Number.isFinite(env.sunElevation) && env.sunElevation >= -90 && env.sunElevation <= 90;
}
export function fileKind(name) {
  const extension = name.split('.').pop().toLowerCase();
  if (['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'tga', 'hdr', 'exr', 'svg'].includes(extension)) return 'texture';
  if (['glb', 'gltf', 'fbx', 'obj', 'blend', 'dae'].includes(extension)) return 'model';
  if (['avi', 'mp4', 'mov', 'webm', 'wav', 'mp3', 'ogg', 'flac'].includes(extension)) return 'media';
  return 'unsupported';
}
