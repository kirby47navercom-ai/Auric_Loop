import {createBlueprintResolver} from './blueprint-inheritance.js';
import {derivesFrom} from './class-types.js';
import {sceneWorldPosition,sceneWorldMatrix,setSceneWorldPosition} from './scene-runtime.js';
import {Quaternion,Vector3,Euler,MathUtils} from 'three';
import {parseNativeHeader,canonicalNativeText} from './native-model.js';
import {createAsset} from './asset-documents.js';

const copy=value=>structuredClone(value);
export {validGameJson,parseGameJson} from './game-json.js';
import {validGameJson} from './game-json.js';

export async function gameInstanceBlueprint(path,{readAsset,readText}){
  if(typeof path!=='string'||path.length>1000||/[\\:\x00-\x1f]/.test(path)||path.split('/').some(p=>!p||p==='.'||p==='..'))throw Error('GameInstance 경로 오류');
  if(!path.startsWith('Source/'))return {root:await createBlueprintResolver(readAsset,readText)(path),asset:path};
  const [headerPath,requested,...extra]=path.split('#');if(extra.length||!/^Source\/.+\.(?:h|hpp)$/.test(headerPath)||requested!==undefined&&!/^[A-Za-z_]\w{0,79}$/.test(requested))throw Error('GameInstance C++ 경로·클래스 오류');
  const sourcePath=headerPath.replace(/\.(h|hpp)$/,'.cpp'),header=canonicalNativeText(await readText(headerPath)),source=canonicalNativeText(await readText(sourcePath)),metadata=parseNativeHeader(header);
  const gameClass=c=>{const seen=new Set();while(c){if(c.base==='GameInstance')return true;if(seen.has(c.name))return false;seen.add(c.name);c=metadata.classes.find(item=>item.name===c.base);}return false;};
  const candidates=metadata.classes.filter(gameClass),selected=requested?candidates.find(c=>c.name===requested):candidates.length===1?candidates[0]:null;if(!selected)throw Error('GameInstance 파생 C++ 클래스 이름을 #클래스명으로 지정하세요.');
  const root=createAsset('blueprint','BP_'+selected.name,'GameInstance');root.settings.parentClass=selected.name;root.native={...metadata,headerPath,sourcePath,header,source};return {root,asset:'Assets/__HBGameInstance_'+selected.name+'.hbblueprint.json'};
}

// One instance belongs to a Play session; scene worlds borrow it without owning it.
export class RuntimeGame {
  constructor(){this.inputLifetime=new AbortController();this.id=crypto.randomUUID();this.state={};this.arguments={};this.instance=null;this.binding=null;this.root=null;this.path=null;this.initialized=false;this.nativeBuilds=new Map();}
  setState(value){if(!validGameJson(value))throw Error('GameInstance 상태 JSON을 확인하세요.');this.state=copy(value);}
  setArguments(value={}){if(!validGameJson(value)||value.spawn!==undefined&&(typeof value.spawn!=='string'||!value.spawn||value.spawn.length>200))throw Error('장면 인자를 확인하세요.');this.arguments=copy(value);}
  async attach(objects,path='',readAsset,readText){
    if(this.path!==null&&path!==this.path)throw Error('한 실행의 GameInstance 클래스는 장면에서 바꿀 수 없어요.');
    let root,asset=path;
    if(this.instance){objects.push(this.instance);return this.root?[{root:this.root,self:this.instance.id,path:this.instance.blueprintAsset||this.instance.nativeBuildAsset,retained:true}]:[];}
    if(path){({root,asset}=await gameInstanceBlueprint(path,{readAsset,readText}));const parent=root.settings.parentClass,nativeBase=root.native?.classes.find(c=>c.name===parent)?.base;if(!path.startsWith('Source/')&&!derivesFrom(nativeBase||parent,'GameInstance'))throw Error('GameInstance 파생 블루프린트가 필요해요: '+path);}
    this.path=path;this.instance={id:'gameinstance_'+this.id,name:root?.name||'GameInstance',kind:'empty',group:'GAMEPLAY',frameworkRole:'gameInstance',visible:false,position:[0,0,0],rotation:[0,0,0],scale:[1,1,1],components:[],...(path?path.startsWith('Source/')?{nativeBuildAsset:asset}:{blueprintAsset:path}:{})};
    this.root=root;objects.push(this.instance);return root?[{root,self:this.instance.id,path:asset}]:[];
  }
  bind(binding){this.binding=binding;return binding;}
  reset(){this.inputLifetime.abort();this.inputLifetime=new AbortController();this.id=crypto.randomUUID();this.state={};this.arguments={};this.initialized=false;this.instance=null;this.binding=null;this.root=null;this.path=null;return this.id;}
  snapshot(){return {id:this.id,actor:this.instance?.id||null,state:copy(this.state),arguments:copy(this.arguments)};}
}

export function applyTravelSpawn(objects,gameplay,args){
  if(!args?.spawn)return;
  const start=objects.find(o=>o.kind==='playerStart'&&(o.id===args.spawn||o.name===args.spawn||o.tags?.includes(args.spawn)));
  if(!start)throw Error('도착 장면의 PlayerStart를 찾을 수 없어요: '+args.spawn);
  const pawn=objects.find(o=>o.id===gameplay.pawn);if(!pawn)throw Error('도착 장면에 플레이어가 없어요.');
  setSceneWorldPosition(pawn,sceneWorldPosition(start,objects),objects);
  const orientation=new Quaternion();sceneWorldMatrix(start,objects).decompose(new Vector3(),orientation,new Vector3());
  const parent=objects.find(o=>o.id===(pawn.parentId||pawn.parent));if(parent){const rotation=new Quaternion();sceneWorldMatrix(parent,objects).decompose(new Vector3(),rotation,new Vector3());orientation.premultiply(rotation.invert());}
  pawn.rotation=new Euler().setFromQuaternion(orientation).toArray().slice(0,3).map(MathUtils.radToDeg);
}
