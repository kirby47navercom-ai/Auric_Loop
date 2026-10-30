import {validEffectScaling} from './effect-scaling-schema.js';
import {validEffectMagnitudeSource} from './effect-magnitude-inputs.js';
import {validGameplayTag} from './scene-systems.js';
const num=(v,a=-1e9,b=1e9)=>Number.isFinite(v)&&v>=a&&v<=b;
const name=v=>typeof v==='string'&&/^[\w가-힣 .-]{1,80}$/.test(v);
const list=(v,check,max=256)=>Array.isArray(v)&&v.length<=max&&v.every(check);
const tags=v=>list(v,validGameplayTag,32);
const asset=v=>typeof v==='string'&&/^Assets\/.+\.hb(?:ability|effect)\.json$/.test(v)&&!v.includes('..');
export const abilitySetPath=v=>typeof v==='string'&&v.length<=1000&&/^Assets\/(?:[^/\\:\x00-\x1f]+\/)*[^/\\:\x00-\x1f]+\.hbabilityset\.json$/.test(v)&&!v.split('/').some(p=>p==='.'||p==='..');
export const validAttributeCalculation=c=>c===undefined||c&&name(c.attribute)&&['base','current','bonus'].includes(c.policy)&&[c.coefficient,c.preAdd,c.postAdd].every(v=>num(v))&&(c.curve===''||typeof c.curve==='string'&&/^Assets\/.+\.hbcurve\.json$/.test(c.curve)&&!c.curve.split('/').some(p=>p==='.'||p==='..')&&!/[\\:\x00-\x1f]/.test(c.curve))&&typeof c.track==='string'&&c.track.length<=80;
export const abilityAssetTypes={ability:{label:'게임플레이 능력',prefix:'GA_',group:'게임플레이'},effect:{label:'게임플레이 효과',prefix:'GE_',group:'게임플레이'},abilityset:{label:'속성·능력 세트',prefix:'AS_',group:'게임플레이'}};
export const abilityAssetSuffix={ability:'.hbability.json',effect:'.hbeffect.json',abilityset:'.hbabilityset.json'};
export function createAbilityAsset(kind,name){
  if(kind==='abilityset')return {version:1,name,parent:'',includes:[],attributes:[{name:'Health',base:100,min:0,max:100},{name:'Mana',base:100,min:0,max:100}],abilities:[],grantedTags:[]};
  if(kind==='ability')return {version:1,name,cooldown:1,duration:0,costs:[],requiredTags:[],blockedTags:[],grantedTags:[],effects:[],onActivate:'',onEnd:'',cues:[]};
  return {version:1,name,duration:0,period:0,executeOnApply:true,stackLimit:1,stackPolicy:'refresh',modifiers:[{attribute:'Health',operation:'add',magnitude:-10}],grantedTags:[],cues:[]};
}
export function validAbilityAsset(kind,d){
  if(kind==='abilityset')return d?.version===1&&name(d.name)&&(d.parent===undefined||d.parent===''||abilitySetPath(d.parent))&&(d.includes===undefined||Array.isArray(d.includes)&&d.includes.every(abilitySetPath)&&new Set(d.includes).size===d.includes.length)&&list(d.attributes,a=>name(a?.name)&&[a.base,a.min,a.max].every(v=>num(v))&&a.min<=a.base&&a.base<=a.max&&validAttributeCalculation(a.calculation),Infinity)&&new Set(d.attributes.map(a=>a.name)).size===d.attributes.length&&list(d.abilities,p=>asset(p)&&p.endsWith('.hbability.json'),Infinity)&&new Set(d.abilities).size===d.abilities.length&&list(d.grantedTags,validGameplayTag,Infinity);
  if(d?.cues!==undefined&&!list(d.cues,c=>validGameplayTag(c?.tag)&&typeof c.event==='string'&&c.event.trim().length>0&&c.event.length<=80&&!/[\x00-\x1f]/.test(c.event)&&(kind==='ability'?['activate','end']:['apply','period','remove']).includes(c.on),128))return false;
  if(d?.version!==1||!name(d.name)||!tags(d.grantedTags)||!(d.duration===-1||num(d.duration,0,86400)))return false;
  if(kind==='effect')return num(d.period,0,86400)&&typeof d.executeOnApply==='boolean'&&Number.isInteger(d.stackLimit)&&num(d.stackLimit,1,10000)&&['refresh','extend','independent','reject'].includes(d.stackPolicy)&&list(d.modifiers,m=>name(m?.attribute)&&['add','multiply','override'].includes(m.operation)&&num(m.magnitude)&&validEffectScaling(m.scaling)&&validEffectMagnitudeSource(m.magnitudeSource));
  return kind==='ability'&&num(d.cooldown,0,86400)&&list(d.costs,c=>name(c?.attribute)&&num(c.amount,0))&&tags(d.requiredTags)&&tags(d.blockedTags)&&list(d.effects,asset)&&[d.onActivate,d.onEnd].every(v=>typeof v==='string'&&v.length<=80);
}
