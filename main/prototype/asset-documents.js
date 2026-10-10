import {textureAssetTypes,textureAssetSuffix,createTextureAsset,validTextureAsset,materialTextureTypes} from './texture-assets.js';
import {retargetAssetTypes,retargetAssetSuffix,createRetargetAsset,validRetargetAsset} from './animation-retarget-assets.js';
import {nativeSourceReference} from './native-model.js';
import {validDataAsset} from './data-assets.js';
import {defaultBlueprint,makeNode,componentDefaults,validBlueprint,defaultTimeline,validTimeline} from './blueprint-model.js';
import {defaultSurface,validSurface,validScene,defaultEnvironment} from './model.js';
import {blueprintClasses} from './class-types.js';
import {materialGraph,materialFunctionGraph,materialLayerGraph,validMaterialLayer,validMaterialLayers,validMaterialParameters,materialDefaults,validMaterialGraph,validMaterialFunction,validMaterialSurface,validAssetPath} from './material-runtime.js';
import {twoDTypes,twoDSuffix,create2DAsset,valid2DAsset} from './two-d-assets.js';
import {gameplayTypes,gameplaySuffix,createGameplayAsset,validGameplayAsset,gameplayValidationError} from './gameplay-assets.js';
import {createWidgetAsset,validWidgetAsset} from './ui-assets.js';
import {createAudioMixer,validAudioMixer} from './audio-mixer.js';
import {validActionSettings} from './input-actions.js';
import {createAnimationGraph,validAnimationGraph} from './animation-graph-assets.js';
import {createSpriteRig,validSpriteRig} from './sprite-rig-assets.js';
import {createBlueprintResolver} from './blueprint-inheritance.js';
import {blueprintInstanceDefaults} from './blueprint-overrides.js';
import {isBlueprintParent} from './blueprint-model.js';
export {materialGraph,evaluateMaterial} from './material-runtime.js';
const copy=v=>structuredClone(v);
export const assetSuffix={blueprint:'.hbblueprint.json',material:'.hbmaterial.json',materialfunction:'.hbmaterialfunction.json',materiallayer:'.hbmateriallayer.json',materialblend:'.hbmaterialblend.json',materialinstance:'.hbmaterialinstance.json',physicalmaterial:'.hbphysicalmaterial.json',prefab:'.hbprefab.json',gameconfig:'.hbgameconfig.json',audioasset:'.hbaudioasset.json',animation:'.hbanimation.json',scene:'.hbscene.json',inputaction:'.hbinputaction.json',inputmapping:'.hbinputmapping.json',curve:'.hbcurve.json',data:'.hbdata.json'};
export const assetTypes={materiallayer:{label:'머테리얼 레이어',prefix:'ML_',group:'머테리얼'},materialblend:{label:'머테리얼 레이어 블렌드',prefix:'MLB_',group:'머테리얼'},materialfunction:{label:'머테리얼 함수',prefix:'MF_',group:'머테리얼'},blueprint:{label:'블루프린트 클래스',prefix:'BP_',group:'게임플레이'},code:{label:'C++ 클래스',prefix:'',group:'게임플레이'},inputaction:{label:'Input Action',prefix:'IA_',group:'입력'},inputmapping:{label:'Input Mapping Context',prefix:'IMC_',group:'입력'},material:{label:'머테리얼',prefix:'M_',group:'렌더링'},materialinstance:{label:'머테리얼 인스턴스',prefix:'MI_',group:'렌더링'},physicalmaterial:{label:'물리 머테리얼',prefix:'PM_',group:'물리'},prefab:{label:'프리팹',prefix:'PF_',group:'게임플레이'},gameconfig:{label:'게임 설정',prefix:'GS_',group:'프로젝트'},audioasset:{label:'오디오 에셋',prefix:'S_',group:'오디오'},animation:{label:'트랜스폼 애니메이션',prefix:'AN_',group:'애니메이션'},curve:{label:'커브',prefix:'Curve_',group:'애니메이션'},data:{label:'데이터 에셋',prefix:'DA_',group:'데이터'},scene:{label:'레벨',prefix:'L_',group:'월드'}};
Object.assign(assetSuffix,textureAssetSuffix);Object.assign(assetTypes,textureAssetTypes);
Object.assign(assetSuffix,retargetAssetSuffix);Object.assign(assetTypes,retargetAssetTypes);
Object.assign(assetSuffix,twoDSuffix);Object.assign(assetTypes,twoDTypes);
Object.assign(assetSuffix,gameplaySuffix);Object.assign(assetTypes,gameplayTypes);
assetSuffix.widget='.hbwidget.json';assetTypes.widget={label:'위젯 UI',prefix:'W_',group:'사용자 인터페이스'};
assetSuffix.audiomixer='.hbaudiomixer.json';assetTypes.audiomixer={label:'오디오 믹서',prefix:'MX_',group:'오디오'};
assetSuffix.animgraph='.hbanimgraph.json';assetTypes.animgraph={label:'애니메이션 그래프',prefix:'AG_',group:'애니메이션'};
assetSuffix.spriterig='.hbspriterig.json';assetTypes.spriterig={label:'2D 스프라이트 리그',prefix:'SR_',group:'2D'};
export const assetTitle=path=>path.split('/').pop().replace(/\.hb[a-z]+\.json$/i,'');
export async function loadSceneBindings(objects,read,readText){
  const loaded=new Map(),contexts=new Map(),actions=new Map(),bindings=[];
  const load=async(path,kind)=>{if(!loaded.has(path)){const data=await read(path);if(!validAsset(kind,data))throw Error('에셋 검증 실패: '+path);loaded.set(path,data);}return loaded.get(path);};
  const blueprint=createBlueprintResolver(path=>load(path,'blueprint'),readText);
  const action=async(path,stack=new Set())=>{if(stack.has(path))throw Error('Input Action 조합 순환: '+path);if(actions.has(path))return;stack.add(path);const data=await load(path,'inputaction');actions.set(path,data);if(data.chordAction)await action(data.chordAction,stack);stack.delete(path);};
  for(const object of objects){if(!object.blueprintAsset)continue;const root=await blueprint(object.blueprintAsset),defaults=blueprintInstanceDefaults(root,object);bindings.push({root,self:object.id,path:object.blueprintAsset,variableValues:defaults.variables,componentOverrides:defaults.components});
    if(root.settings?.inputMapping){const path=root.settings.inputMapping,context=await load(path,'inputmapping');contexts.set(path,context);for(const m of context.mappings){if(!m.action)throw Error('Input Action을 선택하세요: '+path);await action(m.action);}}
  }
  return {bindings,inputAssets:{contexts,actions}};
}
export const defaultGameConfig={dimension:'3d',startupScene:'',startupBlueprint:'',defaultInputMapping:'',gameMode:'',gameState:'',gameInstance:'',defaultController:'',playerState:'',defaultPawn:'',spawnPosition:[0,1,0],autoSpawnPlayer:true,gravity:[0,-9.81,0],fixedDeltaTime:1/60,maxSubsteps:8,window:{width:1280,height:720,fullscreen:false,vsync:true}};
export function createAsset(kind,name,parent='Actor'){
  if(!name||name.length>80||/[<>:"/\\|?*\x00-\x1f]/.test(name))throw Error('에셋 이름을 확인하세요.');
  if(kind in textureAssetTypes)return createTextureAsset(kind,name);
  if(kind in twoDTypes)return create2DAsset(kind,name);
  if(kind in gameplayTypes)return createGameplayAsset(kind,name);
  if(kind in retargetAssetTypes)return createRetargetAsset(kind,name);
  if(kind==='widget')return createWidgetAsset(name);
  if(kind==='audiomixer')return createAudioMixer(name);
  if(kind==='animgraph')return createAnimationGraph(name);
  if(kind==='spriterig')return createSpriteRig(name);
  if(kind==='blueprint'){
    if(isBlueprintParent(parent))return {version:1,name,settings:{parentClass:parent},nodes:[],edges:[],variables:[],components:[],functions:[],macros:[],comments:[],dispatchers:[],interfaces:[]};
    const type=blueprintClasses[parent];if(!type)throw Error('지원하지 않는 부모 클래스예요.');
    const root=copy(defaultBlueprint);root.name=name;root.nodes=['beginPlay','tick','endPlay'].map((key,i)=>({...makeNode(key,70,55+i*165),id:key}));root.edges=[];root.variables=[];root.functions=[];root.macros=[];root.comments=[];root.dispatchers=[];root.interfaces=[];delete root.native;
    root.components=type.components.map((type,i)=>({id:'component_'+i,name:type,type,properties:componentDefaults(type)}));root.settings={parentClass:parent,tickEnabled:true,tickInterval:0,overlapEnabled:true};return root;
  }
  if(kind==='scene')return {version:1,sceneName:name,objects:[],surface:copy(defaultSurface),environment:copy(defaultEnvironment)};
  if(['materiallayer','materialblend'].includes(kind))return {version:1,name,domain:kind==='materialblend'?'blend':'layer',surface:copy(materialDefaults),description:'',category:'머테리얼 레이어',expose:false,graph:materialLayerGraph(kind==='materialblend')};
  if(kind==='materialfunction')return {version:1,name,surface:copy(materialDefaults),description:'',category:'사용자 함수',expose:true,graph:materialFunctionGraph()};
  if(kind==='material')return {version:1,name,surface:copy(materialDefaults),graph:materialGraph()};
  if(kind==='materialinstance')return {version:1,name,parent:'',parameters:{},surfaceOverrides:{}};
  if(kind==='physicalmaterial')return {version:1,name,friction:.5,restitution:.1,density:1,frictionCombine:'average',restitutionCombine:'average'};
  if(kind==='prefab')return {version:1,name,root:'root',objects:[{id:'root',name,kind:'cube',group:'PREFAB',position:[0,0,0],rotation:[0,0,0],scale:[1,1,1],visible:true}]};
  if(kind==='gameconfig')return {version:1,name,...copy(defaultGameConfig)};
  if(kind==='audioasset')return {version:1,name,clip:'',volume:1,pitch:1,loop:false,spatial:false,autoplay:false,refDistance:1,maxDistance:100,rolloff:1,mixer:'',bus:'master'};
  if(kind==='inputaction')return {version:1,name,valueType:'bool',consumeInput:true,trigger:'pressed',deadZone:0};
  if(kind==='inputmapping')return {version:1,name,priority:0,mappings:[]};
  if(kind==='data')return {version:1,name,fields:[]};
  if(kind==='curve')return {version:1,name,timeline:copy(defaultTimeline)};
  if(kind==='animation')return {version:1,name,model:'',timeline:{...copy(defaultTimeline),length:3,tracks:[{id:'position',name:'Position',type:'vec3',interpolation:'auto',keys:[{time:0,value:[0,0,0]},{time:1.5,value:[0,1,0]},{time:3,value:[0,0,0]}]},{id:'rotation',name:'Rotation',type:'vec3',interpolation:'linear',keys:[{time:0,value:[0,0,0]},{time:3,value:[0,180,0]}]}]}};
  throw Error('에셋 종류를 확인하세요.');
}
export function assetValidationError(kind,data){return kind in gameplayTypes?gameplayValidationError(kind,data):kind+" 에셋 검증 실패";}
export function validAsset(kind,data){
  if(kind in textureAssetTypes)return validTextureAsset(kind,data);
  if(kind in twoDTypes)return valid2DAsset(kind,data);
  if(kind in gameplayTypes)return validGameplayAsset(kind,data);
  if(kind==='widget')return validWidgetAsset(data);
  if(kind==='audiomixer')return validAudioMixer(data);
  if(kind in retargetAssetTypes)return validRetargetAsset(kind,data);
  if(kind==='animgraph')return validAnimationGraph(data);
  if(kind==='spriterig')return validSpriteRig(data);
  if(kind==='text')return typeof data==='string'&&data.length<=1048576;
  if(kind==='blueprint')return validBlueprint(data);
  if(kind==='scene')return validScene(data);
  if(['inputaction','inputmapping','data','curve','materialinstance','physicalmaterial','prefab','gameconfig','audioasset'].includes(kind)&&!(data?.version===1&&typeof data.name==='string'&&data.name.length>0&&data.name.length<=80))return false;
  if(kind==='inputaction')return ['bool','float','vec2','vec3'].includes(data.valueType)&&typeof data.consumeInput==='boolean'&&validActionSettings(data)&&validAssetPath(data.chordAction||'')&&Number.isFinite(data.deadZone)&&data.deadZone>=0&&data.deadZone<=1;
  if(kind==='inputmapping')return Number.isInteger(data.priority)&&Math.abs(data.priority)<=10000&&Array.isArray(data.mappings)&&data.mappings.length<=128&&data.mappings.every(m=>typeof m.action==='string'&&m.action.length<=1000&&typeof m.key==='string'&&m.key.length>0&&m.key.length<=40&&[0,1,2].includes(m.axis)&&Number.isFinite(m.scale)&&Math.abs(m.scale)<=100);
  if(kind==='data')return validDataAsset(data);
  if(kind==='curve')return validTimeline(data.timeline);
  if(kind==='animation')return data?.version===1&&typeof data.name==='string'&&data.name.length<=80&&typeof data.model==='string'&&data.model.length<=1000&&validTimeline(data.timeline);
  if(['materiallayer','materialblend'].includes(kind))return validMaterialLayer(data,kind==='materialblend');
  if(kind==='materialfunction')return validMaterialFunction(data)&&data.domain===undefined;
  if(kind==='material')return data?.version===1&&validMaterialSurface(data.surface)&&(!data.graph||data.graph.mode===undefined&&validMaterialGraph(data.graph));
  if(kind==='materialinstance')return validAssetPath(data.parent)&&validMaterialParameters(data.parameters)&&(data.layerStacks===undefined||data.layerStacks&&typeof data.layerStacks==='object'&&!Array.isArray(data.layerStacks)&&Object.entries(data.layerStacks).every(([id,layers])=>/^[A-Za-z0-9_-]{1,100}$/.test(id)&&validMaterialLayers(layers)))&&data.surfaceOverrides&&typeof data.surfaceOverrides==='object'&&!Array.isArray(data.surfaceOverrides)&&Object.keys(data.surfaceOverrides).every(key=>key in materialDefaults)&&validMaterialSurface({...materialDefaults,...data.surfaceOverrides});
  if(kind==='physicalmaterial')return Number.isFinite(data.friction)&&data.friction>=0&&data.friction<=10&&Number.isFinite(data.restitution)&&data.restitution>=0&&data.restitution<=1&&Number.isFinite(data.density)&&data.density>0&&data.density<=10000&&['frictionCombine','restitutionCombine'].every(key=>['average','min','max','multiply'].includes(data[key]));
  if(kind==='prefab')return typeof data.root==='string'&&data.objects?.some(object=>object.id===data.root)&&validScene({version:1,objects:data.objects,surface:defaultSurface});
  if(kind==='gameconfig')return (data.dimension===undefined||['2d','3d'].includes(data.dimension))&&['startupScene','startupBlueprint','defaultInputMapping','gameMode','gameState','defaultController','playerState','defaultPawn'].every(key=>validAssetPath(data[key]))&&(data.gameInstance===undefined||validAssetPath(data.gameInstance))&&['gravity','spawnPosition'].every(key=>Array.isArray(data[key])&&data[key].length===3&&data[key].every(v=>Number.isFinite(v)&&Math.abs(v)<=10000))&&typeof data.autoSpawnPlayer==='boolean'&&Number.isFinite(data.fixedDeltaTime)&&data.fixedDeltaTime>=.001&&data.fixedDeltaTime<=1&&Number.isInteger(data.maxSubsteps)&&data.maxSubsteps>=1&&data.maxSubsteps<=64&&data.window&&['width','height'].every(key=>Number.isInteger(data.window[key])&&data.window[key]>=320&&data.window[key]<=16384)&&['fullscreen','vsync'].every(key=>typeof data.window[key]==='boolean');
  if(kind==='audioasset')return (data.mixer===undefined||validAssetPath(data.mixer))&&(data.bus===undefined||typeof data.bus==='string'&&data.bus.length>0&&data.bus.length<=80)&&validAssetPath(data.clip)&&Number.isFinite(data.volume)&&data.volume>=0&&data.volume<=4&&Number.isFinite(data.pitch)&&data.pitch>=.1&&data.pitch<=4&&['loop','spatial','autoplay'].every(key=>typeof data[key]==='boolean')&&['refDistance','maxDistance','rolloff'].every(key=>Number.isFinite(data[key])&&data[key]>=0&&data[key]<=100000)&&data.refDistance>0&&data.maxDistance>=data.refDistance;
  return true;
}
export function instantiatePrefab(data,{position=[0,0,0],id=()=>crypto.randomUUID()}={}){
  if(!validAsset('prefab',data))throw Error('프리팹 검증 실패');const ids=new Map(data.objects.map(object=>[object.id,id()]));
  const objects=copy(data.objects).map(object=>{const old=object.id,parent=object.parent||object.parentId;object.id=ids.get(old);if(parent&&ids.has(parent)){object.parent=ids.get(parent);if(object.parentId!==undefined)object.parentId=object.parent;}else{delete object.parent;delete object.parentId;object.position=object.position.map((value,index)=>value+position[index]);}object.prefabRoot=ids.get(data.root);return object;});
  if(!validScene({version:1,objects,surface:defaultSurface}))throw Error('프리팹 계층 검증 실패');return objects;
}
export function renameAssetReferences(value,from,to){const keys=new Set(['blueprintAsset','materialAsset','asset','inputMapping','headerPath','sourcePath','action','model','parent','parentClass','texture','normalTexture','vectorTexture','physicalMaterial','sourceMesh','prefabAsset','gameConfigAsset','startupScene','startupBlueprint','defaultInputMapping','gameMode','gameState','gameInstance','defaultController','playerState','defaultPawn','clip','sheet','blend','chordAction','context','sprite','rig','tileset','blackboard','mixer','widget']);const remap=path=>typeof path==='string'&&(path===from||path.startsWith(from+'/'))?to+path.slice(from.length):path;let changed=false;if(!value||typeof value!=='object')return false;for(const [key,item] of Object.entries(value)){if((keys.has(key)||key==='value'&&(materialTextureTypes[value.valueType]||materialTextureTypes[value.type])||key==='textureObject'||key==='preview'&&materialTextureTypes[value.valueType])&&typeof item==='string'){const next=remap(item);if(next!==item){value[key]=next;changed=true;}}else if(key==='images'&&Array.isArray(item)&&value.dimension in textureAssetTypes){for(let i=0;i<item.length;i++){const next=remap(item[i]);if(next!==item[i]){item[i]=next;changed=true;}}}else if(key==='inputValues'&&item&&typeof item==='object'&&(value.key==='functionInput'&&materialTextureTypes[value.valueType]||value.key==='functionCall')){for(const [id,v] of Object.entries(item)){if(value.key==='functionInput'||value.signature?.inputs.some(p=>p.id===id&&materialTextureTypes[p.type])){const next=remap(v);if(next!==v){item[id]=next;changed=true;}}}}else if(['parameters','blendParameters','nativeDefaults','nativeProperties','overrides'].includes(key)&&item&&typeof item==='object'){const walk=object=>{for(const [name,parameter] of Object.entries(object)){if(typeof parameter==='string'){const next=remap(parameter);if(next!==parameter){object[name]=next;changed=true;}}else if(parameter&&typeof parameter==='object')walk(parameter);}};walk(item);}else if(item&&typeof item==='object')changed=renameAssetReferences(item,from,to)||changed;}return changed;}
// One data record per path. Switching a view must never replace another asset's edits.
export class AssetDocuments {
  constructor(){this.items=new Map();this.active=null;}
  open(path,kind,data){if(!this.items.has(path)){if(!validAsset(kind,data))throw Error(assetValidationError(kind,data)+': '+path);this.items.set(path,{path,kind,data:copy(data),saved:JSON.stringify(data),history:[],future:[],view:{},dirty:false});}return this.items.get(path);}
  select(path){if(!this.items.has(path))throw Error('열린 문서가 없어요.');this.active=path;return this.current;}
  get current(){return this.items.get(this.active);}
  async save(doc,write){const before=JSON.stringify(doc.data),data=copy(doc.data);if(doc.kind==='blueprint'&&data.native){const metadata=doc.view?.nativeMetadata;data.native=nativeSourceReference(metadata&&metadata.headerPath===data.native.headerPath&&metadata.sourcePath===data.native.sourcePath?metadata:data.native);}if(!validAsset(doc.kind,data))throw Error(assetValidationError(doc.kind,data)+': '+doc.path);const text=doc.kind==='text'?data:JSON.stringify(data,null,2);await write(doc.path,text,doc.saved);const savedData=doc.kind==='text'?text:JSON.parse(text);if(JSON.stringify(doc.data)===before)doc.data=savedData;doc.saved=JSON.stringify(savedData);doc.dirty=JSON.stringify(doc.data)!==doc.saved;}
  close(path,discard=false){const doc=this.items.get(path);if(doc?.dirty&&!discard)return false;this.items.delete(path);if(this.active===path)this.active=[...this.items.keys()].at(-1)||null;return true;}
  rename(from,to){for(const [path,doc] of [...this.items]){if(path===from||path.startsWith(from+'/')){const next=to+path.slice(from.length);this.items.delete(path);doc.path=next;this.items.set(next,doc);if(this.active===path)this.active=next;}if(renameAssetReferences(doc.data,from,to))doc.dirty=true;for(const snapshot of [...doc.history,...doc.future])renameAssetReferences(snapshot,from,to);}}
}
