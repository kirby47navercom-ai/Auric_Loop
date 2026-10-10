import {retargetNodeDefaults,validRetargetNode} from './animation-retarget-assets.js';
import {animationIKTypes,animationIKDefaults,validAnimationIK} from './animation-ik.js';
import {rootMotionModes,rootMotionDefaults,validRootMotion} from './animation-root-motion.js';
import {makeAnimationMachine,validAnimationMachine,animationStateLimits,animationBlendCurves,addAnimationState,validAnimationParameter} from './animation-state-assets.js';
import {defaultAnimationSync,validAnimationSync} from './animation-sync.js';
import {defaultAnimationAxis,validAnimationBlendSpace,animationBlendNotifyModes} from './animation-blend-space.js';
const numeric=v=>Number.isFinite(v)&&Math.abs(v)<=100000;
const text=(v,max=1000)=>typeof v==='string'&&v.length<=max;
const identifier=v=>text(v,80)&&/^[A-Za-z_가-힣][\w가-힣]*$/.test(v);
export const animationGraphNodes={
  retargetPose:{label:'Retarget Pose · 골격 리타게팅',inputs:['pose'],group:'리타게팅'},
  twoBoneIK:{label:'Two Bone IK · 두 관절 IK',inputs:['pose'],group:'골격 제어'},
  ccdIK:{label:'CCDIK · 관절 회전 제한',inputs:['pose'],group:'골격 제어'},
  fabrik:{label:'FABRIK · 체인 IK',inputs:['pose'],group:'골격 제어'},
  output:{label:'Output Pose · 최종 포즈',inputs:['pose'],group:'출력'},
  rest:{label:'Reference Pose · 기준 포즈',inputs:[],group:'포즈'},
  stateMachine:{label:'State Machine · 포즈 상태 머신',inputs:[],group:'상태'},
  sync:{label:'Sync · 포즈 동기화',inputs:['pose'],group:'동기화'},
  slot:{label:'Slot · 몽타주 슬롯',inputs:['pose'],group:'레이어'},
  clip:{label:'Sequence Player · 클립 재생',inputs:[],group:'포즈'},
  blend:{label:'Blend · 두 포즈 혼합',inputs:['a','b'],group:'혼합'},
  blend1d:{label:'Blend 1D · 1차원 혼합',inputs:[],group:'혼합'},
  blend2d:{label:'Blend Space · 2차원 혼합',inputs:[],group:'혼합'},
  direct:{label:'Direct Blend · 직접 혼합',inputs:[],group:'혼합'},
  select:{label:'Blend by Bool · 조건 혼합',inputs:['false','true'],group:'혼합'},
  selectEnum:{label:'Blend by Enum · 열거형 선택 혼합',inputs:[],group:'혼합'},
  selectInt:{label:'Blend by Integer · 정수 선택 혼합',inputs:[],group:'혼합'},
  layer:{label:'Layered Blend · 뼈별 혼합',inputs:['base','overlay'],group:'레이어'},
  additive:{label:'Apply Additive · 가산 포즈',inputs:['base','additive'],group:'레이어'}
};
export function animationInputs(node){return node.type==='stateMachine'?node.properties.states.map(s=>s.input):['blend1d','blend2d','direct','selectInt','selectEnum'].includes(node.type)?node.properties.samples.map(s=>s.input):animationGraphNodes[node.type]?.inputs||[];}
export function makeAnimationNode(type,x=100,y=100){
  if(!animationGraphNodes[type])throw Error('애니메이션 노드 종류 오류');
  const properties={retargetPose:retargetNodeDefaults(),twoBoneIK:animationIKDefaults('twoBoneIK'),fabrik:animationIKDefaults('fabrik'),ccdIK:animationIKDefaults('ccdIK'),clip:{rootMotion:rootMotionDefaults(),clip:'',loop:true,rate:1,offset:0,sync:defaultAnimationSync(),notifies:[],notifyStates:[]},sync:{group:'Locomotion'},slot:{group:'DefaultGroup',slot:'DefaultSlot',alwaysUpdateSource:false},blend:{alpha:.5,parameter:''},blend1d:{parameter:'Speed',notifyMode:'all',samples:[{input:'pose0',threshold:0},{input:'pose1',threshold:1}]},blend2d:{parameterX:'Strafe',parameterY:'Speed',mode:'cartesian',notifyMode:'all',axes:{x:defaultAnimationAxis('Right'),y:defaultAnimationAxis('Forward')},samples:[{input:'pose0',x:0,y:0},{input:'pose1',x:1,y:0},{input:'pose2',x:0,y:1}]},direct:{normalize:true,samples:[{input:'pose0',parameter:'',weight:1},{input:'pose1',parameter:'',weight:0}]},select:{parameter:'Moving',duration:.2},selectEnum:{parameter:'Mode',curve:'linear',childUpdate:'active',samples:[{input:'pose0',value:null,duration:.2},{input:'pose1',value:1,duration:.2}]},selectInt:{parameter:'PoseIndex',curve:'linear',childUpdate:'active',samples:[{input:'pose0',duration:.2},{input:'pose1',duration:.2}]},layer:{alpha:1,parameter:'',filters:[{bone:'*',depth:0}]},additive:{alpha:1,parameter:''}}[type]||{};
  return {id:crypto.randomUUID(),type,name:animationGraphNodes[type].label.split(' · ')[0],x,y,inputs:{},properties:type==='stateMachine'?makeAnimationMachine():structuredClone(properties)};
}
export function createAnimationGraph(name){const output=makeAnimationNode('output',680,180),rest=makeAnimationNode('rest',140,180);output.inputs.pose=rest.id;return {version:1,name,model:'',parameters:[{name:'Speed',type:'float',value:0},{name:'Moving',type:'bool',value:false}],output:output.id,nodes:[rest,output]};}
export function addAnimationStatePose(data,machine,settings={}){const state=addAnimationState(machine,settings),rest=makeAnimationNode('rest',100,180);rest.scope=machine.id+'/'+state.id;data.nodes.push(rest);machine.inputs[state.input]=rest.id;return state;}
export function validAnimationGraph(data){
  try{
    if(data?.version!==1||!text(data.name,80)||!data.name||!text(data.model)||data.rootMotionMode!==undefined&&!rootMotionModes.includes(data.rootMotionMode)||!Array.isArray(data.parameters)||data.parameters.length>64||new Set(data.parameters.map(p=>p?.name)).size!==data.parameters.length||data.parameters.some(p=>!validAnimationParameter(p))||!Array.isArray(data.nodes)||!data.nodes.length||data.nodes.length>256)return false;
    const machines=data.nodes.filter(n=>n.type==='stateMachine');if(machines.length>animationStateLimits.machines||machines.reduce((sum,n)=>sum+(n.properties?.states?.length||0),0)>animationStateLimits.states)return false;
    const nodes=new Map(data.nodes.map(n=>[n?.id,n])),params=new Map(data.parameters.map(p=>[p.name,p.type]));if(nodes.size!==data.nodes.length||nodes.get(data.output)?.type!=='output'||data.nodes.filter(n=>n.type==='output').length!==1||data.nodes.filter(n=>n.type==='clip').length>64)return false;
    const scopes=new Set(machines.flatMap(n=>(n.properties?.states||[]).map(s=>n.id+'/'+s.id)));if(data.nodes.some(n=>n.scope!==undefined&&!scopes.has(n.scope)))return false;
    const param=(p,type)=>p===''||params.get(p)===type;
    for(const node of nodes.values()){
      if(!text(node.id,120)||!node.id||!animationGraphNodes[node.type]||!text(node.name,80)||!numeric(node.x)||!numeric(node.y)||!node.inputs||typeof node.inputs!=='object'||Array.isArray(node.inputs)||!node.properties||typeof node.properties!=='object'||Array.isArray(node.properties))return false;
      const p=node.properties;
      if(node.type==='retargetPose'&&(!validRetargetNode(p)||!param(p.parameter,'float')))return false;
      if(node.type==='stateMachine'&&!validAnimationMachine(p,data.parameters))return false;
      if(animationIKTypes.includes(node.type)&&(!validAnimationIK(node.type,p)||!param(p.parameter,'float')))return false;
      if(node.type==='clip'&&(!text(p.clip)||typeof p.loop!=='boolean'||!numeric(p.rate)||p.rate<0||p.rate>100||!numeric(p.offset)||p.offset<0||!validAnimationSync(p)||!validRootMotion(p.rootMotion)))return false;
      if(node.type==='sync'&&(!text(p.group,80)||!p.group))return false;
      if(node.type==='slot'&&(!text(p.group,80)||!p.group.trim()||!text(p.slot,80)||!p.slot.trim()||typeof p.alwaysUpdateSource!=='boolean'))return false;
      if(['blend','layer','additive'].includes(node.type)&&(!numeric(p.alpha)||p.alpha<0||p.alpha>1||!param(p.parameter,'float')))return false;
      if(node.type==='select'&&(params.get(p.parameter)!=='bool'||!numeric(p.duration)||p.duration<0||p.duration>60))return false;
      if(['blend1d','blend2d','direct','selectInt','selectEnum'].includes(node.type)){
        if(!Array.isArray(p.samples)||!p.samples.length||p.samples.length>64||new Set(p.samples.map(s=>s?.input)).size!==p.samples.length||p.samples.some(s=>!identifier(s?.input)))return false;
        if(['selectInt','selectEnum'].includes(node.type)&&(params.get(p.parameter)!==(node.type==='selectInt'?'int':'enum')||!Object.hasOwn(animationBlendCurves,p.curve)||!['active','reset','all'].includes(p.childUpdate)||p.samples.some(s=>!numeric(s.duration)||s.duration<0||s.duration>60)))return false;
        if(node.type==='selectEnum'){const domain=data.parameters.find(v=>v.name===p.parameter);if(p.samples[0].value!==null||p.samples.slice(1).some(v=>!domain.values.some(e=>e.value===v.value))||new Set(p.samples.map(v=>v.value)).size!==p.samples.length)return false;}
        if(node.type==='blend1d'&&(params.get(p.parameter)!=='float'||new Set(p.samples.map(s=>s.threshold)).size!==p.samples.length||p.samples.some(s=>!numeric(s.threshold))))return false;
        if(['blend1d','blend2d'].includes(node.type)&&!animationBlendNotifyModes.includes(p.notifyMode===undefined?'all':p.notifyMode))return false;
        if(node.type==='blend2d'&&!validAnimationBlendSpace(p,params))return false;
        if(node.type==='direct'&&(typeof p.normalize!=='boolean'||p.samples.some(s=>!param(s.parameter,'float')||!numeric(s.weight)||s.weight<0||s.weight>1)))return false;
      }
      if(node.type==='layer'&&(!Array.isArray(p.filters)||!p.filters.length||p.filters.length>64||p.filters.some(f=>!text(f?.bone,120)||!f.bone||!Number.isInteger(f.depth)||Math.abs(f.depth)>128)))return false;
      const allowed=animationInputs(node);if(Object.keys(node.inputs).some(k=>!allowed.includes(k))||Object.values(node.inputs).some(id=>!nodes.has(id)||nodes.get(id).type==='output'))return false;
    }
    const visiting=new Set(),heights=new Map();function height(id){if(visiting.has(id))return Infinity;if(heights.has(id))return heights.get(id);visiting.add(id);const value=1+Math.max(0,...Object.values(nodes.get(id).inputs).map(height));visiting.delete(id);heights.set(id,value);return value;}
    return data.nodes.every(n=>height(n.id)<=65);
  }catch{return false;}
}
export function validateAnimationProgram(data){if(!validAnimationGraph(data))throw Error('애니메이션 그래프 검증 실패');const nodes=new Map(data.nodes.map(n=>[n.id,n])),seen=new Set();function visit(id){if(seen.has(id))return;seen.add(id);const node=nodes.get(id);for(const input of animationInputs(node)){if(!node.inputs[input])throw Error(node.name+'의 '+input+' 포즈를 연결하세요.');visit(node.inputs[input]);}if(node.type==='retargetPose'&&!node.properties.asset)throw Error(node.name+'의 리타게터를 지정하세요.');if(node.type==='clip'&&!node.properties.clip)throw Error(node.name+'의 클립을 지정하세요.');}visit(data.output);return seen;}
export function distributeAnimationThresholds(node,min,max){if(node.type!=='blend1d'||!numeric(min)||!numeric(max)||max<=min)throw Error('임계값 범위를 확인하세요.');const samples=node.properties.samples;for(let i=0;i<samples.length;i++)samples[i].threshold=min+(max-min)*i/Math.max(1,samples.length-1);}
