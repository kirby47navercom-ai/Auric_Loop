const text=(v,n=160)=>typeof v==='string'&&v.length<=n;
const name=v=>text(v,80)&&!!v.trim(),number=(v,min,max)=>Number.isFinite(v)&&v>=min&&v<=max;
const vector=v=>Array.isArray(v)&&v.length===3&&v.every(x=>number(x,-100000,100000));
const unique=(v,key)=>Array.isArray(v)&&new Set(v.map(x=>x?.[key])).size===v.length;
export const retargetRotationModes=['interpolated','oneToOne','reversed','none'];
export const retargetTranslationModes=['none','scaled','absolute'];
export const retargetAssetTypes={retargetrig:{label:'골격 리타게팅 리그',prefix:'RIG_',group:'애니메이션'},retarget:{label:'애니메이션 리타게터',prefix:'RT_',group:'애니메이션'},skeletalclip:{label:'골격 애니메이션 클립',prefix:'SK_',group:'애니메이션'}};
export const retargetAssetSuffix={retargetrig:'.hbretargetrig.json',retarget:'.hbretarget.json',skeletalclip:'.hbskeletalclip.json'};
export const retargetNodeDefaults=()=>({asset:'',sourceActor:'',profile:'',alpha:1,parameter:'',debug:false});
export const retargetChainDefaults=()=>({id:crypto.randomUUID(),name:'Chain',source:'',target:'',rotation:'interpolated',translation:'none',rotationAlpha:1,translationAlpha:1,ik:false,ikPosition:1,ikRotation:1,offset:[0,0,0],precision:.001,iterations:16});
export const retargetProfileDefaults=()=>({id:crypto.randomUUID(),name:'Default',basePose:'retarget',sourcePose:'Bind',targetPose:'Bind',scale:'auto',scaleFactor:1,sourceRoot:'',targetRoot:'',sourcePelvis:'',targetPelvis:'',rootMode:'none',rootRotation:true,pelvisAlpha:1,offset:[0,0,0],rootMotion:false,chains:[]});
export function createRetargetAsset(kind,name){
 if(kind==='retargetrig')return {version:1,name,model:'',chains:[],poses:[{name:'Bind',bones:[]}]};
 if(kind==='skeletalclip')return {version:1,name,duration:1,tracks:[]};
 const profile=retargetProfileDefaults();return {version:1,name,sourceRig:'',targetRig:'',defaultProfile:profile.id,profiles:[profile]};
}
export function validRetargetNode(p){return text(p.asset,1000)&&text(p.sourceActor)&&text(p.profile)&&number(p.alpha,0,1)&&text(p.parameter,80)&&typeof p.debug==='boolean';}
export function validRetargetAsset(kind,d){try{
 if(d?.version!==1||!name(d.name))return false;
 if(kind==='retargetrig')return text(d.model,1000)&&unique(d.chains,'name')&&d.chains.every(c=>name(c.name)&&text(c.start)&&text(c.end))&&unique(d.poses,'name')&&d.poses.length>0&&d.poses.some(p=>p.name==='Bind')&&d.poses.every(p=>name(p.name)&&unique(p.bones,'bone')&&p.bones.every(b=>text(b.bone)&&!!b.bone&&vector(b.position)&&vector(b.rotation)))&&d.poses.find(p=>p.name==='Bind').bones.length===0;
 if(kind==='retarget')return text(d.sourceRig,1000)&&text(d.targetRig,1000)&&unique(d.profiles,'id')&&unique(d.profiles,'name')&&!d.profiles.some(p=>d.profiles.some(q=>q!==p&&p.name===q.id))&&d.profiles.length>0&&d.profiles.some(p=>p.id===d.defaultProfile)&&d.profiles.every(p=>text(p.id)&&!!p.id&&name(p.name)&&(p.basePose===undefined||['input','retarget'].includes(p.basePose))&&text(p.sourcePose)&&text(p.targetPose)&&['auto','manual'].includes(p.scale)&&number(p.scaleFactor,.0001,10000)&&['sourceRoot','targetRoot','sourcePelvis','targetPelvis'].every(k=>text(p[k]))&&['none','scaled','absolute'].includes(p.rootMode)&&typeof p.rootRotation==='boolean'&&typeof p.rootMotion==='boolean'&&number(p.pelvisAlpha,0,1)&&vector(p.offset)&&unique(p.chains,'id')&&unique(p.chains,'target')&&p.chains.every(c=>text(c.id)&&!!c.id&&name(c.name)&&text(c.source)&&text(c.target)&&retargetRotationModes.includes(c.rotation)&&retargetTranslationModes.includes(c.translation)&&['rotationAlpha','translationAlpha','ikPosition','ikRotation'].every(k=>number(c[k],0,1))&&typeof c.ik==='boolean'&&vector(c.offset)&&number(c.precision,.000001,1)&&Number.isInteger(c.iterations)&&c.iterations>=1&&c.iterations<=128));
 if(kind==='skeletalclip')return number(d.duration,.000001,86400)&&unique(d.tracks,'name')&&d.tracks.length<=1024&&d.tracks.every(t=>text(t?.name,300)&&/\.(position|quaternion|scale)$/.test(t.name)&&t.type===(t.name.endsWith('.quaternion')?'quaternion':'vector')&&Array.isArray(t.times)&&t.times.length>0&&t.times.every((v,i)=>number(v,0,d.duration)&&(i===0||v>t.times[i-1]))&&Array.isArray(t.values)&&t.values.length===t.times.length*(t.type==='quaternion'?4:3)&&t.values.every(v=>number(v,-100000,100000))&&(t.type!=='quaternion'||t.times.every((_,i)=>Math.abs(Math.hypot(...t.values.slice(i*4,i*4+4))-1)<.001)))&&d.tracks.reduce((n,t)=>n+t.values.length,0)<=8000000;
 return false;
 }catch{return false;}}
// Exact mapping never guesses. Fuzzy mode rejects ties and left/right mismatches.
export function autoMapRetarget(profile,source,target,{fuzzy=false,emptyOnly=false}={}){
 const canonical=s=>s.toLowerCase().replace(/[^a-z0-9가-힣]/g,''),side=s=>/left|^l(?=arm|leg|hand|foot)|왼/.test(s)?'left':/right|^r(?=arm|leg|hand|foot)|오른/.test(s)?'right':'';
 for(const chain of target.chains){let mapping=profile.chains.find(c=>c.target===chain.name);if(emptyOnly&&mapping?.source)continue;const key=canonical(chain.name),exact=source.chains.filter(c=>canonical(c.name)===key);let match=exact.length===1?exact[0]:null;
  if(!match&&fuzzy){const ranked=source.chains.filter(c=>side(canonical(c.name))===side(key)).map(c=>({c,score:canonical(c.name).includes(key)||key.includes(canonical(c.name))?1:0})).filter(v=>v.score);if(ranked.length===1)match=ranked[0].c;}
  if(!mapping){mapping=retargetChainDefaults();mapping.name=chain.name;mapping.target=chain.name;profile.chains.push(mapping);}mapping.source=match?.name||'';
 }return profile;
}
