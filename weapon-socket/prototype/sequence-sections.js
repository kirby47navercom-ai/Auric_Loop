import {wrappedSequenceTime,appendSectionSourceRanges} from './sequence-source-ranges.js';
import {validSectionWeightCurve} from './sequence-weight-curve.js';
import {validSequenceKeyBudget} from './sequence-key-storage.js';
import {validSequenceSectionBlend} from './sequence-blending.js';
import {validSectionTimeWarp,sectionSourceTime,sectionWarpBoundaries,sectionWarpApproach,trimSequenceSectionStart} from './sequence-time-warp.js';
const safeId=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(v),finite=(v,min,max)=>Number.isFinite(v)&&v>=min&&v<=max;
const assetPath=v=>typeof v==='string'&&v.length<=1000&&v.endsWith('.hbsequence.json')&&!/[\\:\x00-\x1f]/.test(v)&&!v.split('/').some(p=>p==='.'||p==='..'||!p);
export function validSequenceSections(data){
 const rows=data.sections;if(rows===undefined)return true;
 return Array.isArray(rows)&&rows.length<=256&&new Set(rows.map(s=>s?.id)).size===rows.length&&rows.every(s=>s&&validSectionWeightCurve(s.weightCurve)&&validSequenceSectionBlend(s)&&validSectionTimeWarp(s.timeWarp)&&safeId(s.id)&&typeof s.name==='string'&&s.name.length>0&&s.name.length<=80&&Object.keys(s).every(k=>['id','name','kind','asset','start','duration','sourceStart','rate','loop','muted','row','bias','timeWarp','weight','blendMode','weightCurve'].includes(k))&&['shot','subsequence'].includes(s.kind)&&assetPath(s.asset)&&finite(s.start,0,86400)&&finite(s.duration,.001,86400)&&s.start+s.duration<=data.length+1e-8&&finite(s.sourceStart,s.loop?-86400:0,86400)&&finite(s.rate,.001,100)&&typeof s.loop==='boolean'&&typeof s.muted==='boolean'&&Number.isInteger(s.row)&&s.row>=0&&s.row<=255&&Number.isInteger(s.bias)&&s.bias>=-2147483648&&s.bias<=2147483647);
}
export function editSequenceSection(data,{operation='update',id,section}={}){
 const next=structuredClone(data);next.sections??=[];let result;
 if(operation==='add'){result={id:'section_'+crypto.randomUUID().replaceAll('-',''),name:'Sub-Sequence',kind:'subsequence',asset:'',start:0,duration:Math.min(1,data.length),sourceStart:0,rate:1,loop:false,muted:false,row:0,bias:100,...section};next.sections.push(result);}
 else{const index=next.sections.findIndex(s=>s.id===id);if(index<0)throw Error('시퀀스 구간을 선택하세요.');if(operation==='remove')result=next.sections.splice(index,1)[0];else if(operation==='trimStart'){if(!section||Object.keys(section).some(k=>k!=='start'))throw Error('앞부분 자르기 시작 시간을 확인하세요.');result=next.sections[index]=trimSequenceSectionStart(next.sections[index],section.start);}else if(operation==='update'){if(section&&Object.keys(section).some(k=>!Object.hasOwn(next.sections[index],k)&&!['timeWarp','weight','blendMode','weightCurve'].includes(k)||k==='id'))throw Error('시퀀스 구간 속성을 확인하세요.');Object.assign(next.sections[index],section);for(const field of['timeWarp','weight','blendMode','weightCurve'])if(next.sections[index][field]===null)delete next.sections[index][field];result=next.sections[index];}else throw Error('구간 편집 명령을 확인하세요.');}
 if(!validSequenceSections(next)||Array.isArray(next.tracks)&&!validSequenceKeyBudget(next))throw Error('하위 시퀀스 경로·구간·가중치·키 예산을 확인하세요.');data.sections=next.sections;return result;
}
export async function loadSequenceTree(path,read,{isCurrent}={}){
 const cache=new Map();let count=0;
 async function visit(asset,stack=[],priority=0,section=null){
  if(isCurrent&&!isCurrent())throw Error('시퀀스 로드가 취소됐어요.');
  if(stack.includes(asset))throw Error('하위 시퀀스 순환: '+[...stack,asset].join(' → '));if(stack.length>=32||++count>1024)throw Error('하위 시퀀스 깊이/인스턴스 한도를 넘었어요.');
  let data=cache.get(asset);if(!data){data=await read(asset,'sequenceasset');cache.set(asset,data);}if(isCurrent&&!isCurrent())throw Error('시퀀스 로드가 취소됐어요.');if(!validSequenceSections(data))throw Error('하위 시퀀스 구간 형식 오류: '+asset);
  if(section&&!section.loop&&section.sourceStart>data.length)throw Error('하위 시퀀스 시작 오프셋이 길이를 넘어요: '+asset);
  const total=priority+(data.priority??0)+(section?.bias??0);if(!Number.isInteger(total)||total<-2147483648||total>2147483647)throw Error('누적 시퀀스 우선순위가 int32 범위를 넘어요.');
  const node={asset,data,section,priority:total,children:[]};for(const child of data.sections||[])if(!child.muted)node.children.push(await visit(child.asset,[...stack,asset],total,child));return node;
 }
 return visit(path);
}
export function selectedShot(sections,time){return sections.filter(s=>!s.muted&&s.kind==='shot'&&s.start<=time&&time<s.start+s.duration).sort((a,b)=>a.row-b.row||b.start-a.start||(a.id<b.id?-1:a.id>b.id?1:0))[0]?.id;}
export function sectionActive(section,sections,time,shot){return !section.muted&&section.start<=time&&time<section.start+section.duration&&(section.kind!=='shot'||(shot===undefined?selectedShot(sections,time):shot)===section.id);}
export function sectionTime(section,child,time){const local=sectionSourceTime(section,time);return section.loop?wrappedSequenceTime(local,child.length):Math.max(0,Math.min(child.length,local));}
export function sectionRanges(section,sections,child,ranges,sampler){
 const result=[],shot=time=>sampler?sampler.shot(time):selectedShot(sections,time),active=time=>sectionActive(section,sections,time,shot(time)??null);
 for(const range of ranges){const reverse=range.end<range.begin,direction=reverse?-1:1,start=Math.max(Math.min(range.begin,range.end),section.start),end=Math.min(Math.max(range.begin,range.end),section.start+section.duration);if(end<start||end===start&&!(range.initial||start===section.start)||start===end&&!active(start))continue;
  let cuts=sampler?[start,...sampler.boundariesBetween(start,end),end]:[...new Set([start,end,...sections.filter(s=>s.kind==='shot'&&!s.muted).flatMap(s=>[s.start,s.start+s.duration]).filter(t=>t>start&&t<end)])].sort((a,b)=>a-b);if(section.timeWarp)cuts=[...new Set([...cuts,...sectionWarpBoundaries(section,start,end)])].sort((a,b)=>a-b);if(reverse)cuts.reverse();const parts=start===end?[[start,end]]:cuts.slice(0,-1).map((v,i)=>[v,cuts[i+1]]);
  for(const [a,b]of parts){if(section.kind==='shot'&&shot(a===b?a:(a+b)/2)!==section.id)continue;const x=sectionSourceTime(section,a,a===b?0:reverse?-1:1),y=sectionSourceTime(section,b,a===b?0:reverse?1:-1),initial=!reverse&&a===section.start&&range.begin<section.start||range.initial&&a===range.begin,exclusive=!!(range.endExclusive&&b===range.end)||!active(b),beginExclusive=!!(range.beginExclusive&&a===range.begin)||!active(a);appendSectionSourceRanges(result,section,child,x,y,{initial,exclusive,beginExclusive,approach:sectionWarpApproach(section,a,direction)});}
 }
 return result;
}
export const sequenceTreeNodes=root=>{const out=[],walk=n=>{out.push(n);for(const child of n.children||[])walk(child);};walk(root);return out;};
