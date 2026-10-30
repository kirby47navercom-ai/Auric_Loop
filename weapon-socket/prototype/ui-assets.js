import {listLayout} from './list-layout.js';
import {validWidgetClass} from './widget-class.js';
import {widgetRowBindings} from './widget-row.js';
import {virtualDefaults} from './virtual-controls.js';
import {validAssetPath} from './material-runtime.js';

export const widgetTypes={Canvas:'캔버스',Widget:'재사용 위젯',NamedSlot:'명명 슬롯',Panel:'패널',HorizontalBox:'가로 상자',VerticalBox:'세로 상자',Grid:'그리드',ListView:'가상 목록',TreeView:'가상 트리',ScrollBox:'스크롤 상자',Text:'텍스트',Image:'이미지',Button:'버튼',ProgressBar:'진행 막대',Slider:'슬라이더',CheckBox:'체크 상자',TextInput:'입력 상자',Spacer:'여백',Joystick:'가상 조이스틱',DPad:'가상 십자키',TouchButton:'터치 버튼',TouchPad:'터치 카메라 패드'};
export const widgetContainers=new Set(['Widget','NamedSlot','Canvas','Panel','HorizontalBox','VerticalBox','Grid','ScrollBox']);
export const widgetEvents=['click','changed','submit','focus','blur','pressed','released'];
export const widgetScaleRules={fit:'화면 안에 맞춤',width:'너비 기준',height:'높이 기준',match:'너비·높이 혼합',cover:'화면 채우기'};
export const widgetDefaults={...virtualDefaults,widgetAsset:'',widgetOverrides:'{}',widgetEvents:'{}',widgetBindings:'{}',stringTable:'',textKey:'',textArguments:'{}',style:'',styleName:'Default',styleOverrides:'',ariaLabel:'',rowHeight:40,variableRows:false,autoRows:false,listItems:'[]',selectedIndex:-1,selectedItemId:'',text:'',texture:'',font:'',rotation:0,scale:[1,1],fillDirection:'leftToRight',fillTexture:'',backgroundTexture:'',nineSlice:[0,0,0,0],fontSize:24,color:'#e4e9ef',background:'#263443',accent:'#589ad6',hover:'#365778',pressed:'#1e4061',borderColor:'#4a5f73',borderWidth:0,radius:4,opacity:1,visible:true,enabled:true,focusable:true,tooltip:'',align:'left',value:0,min:0,max:1,step:.01,padding:8,gap:8,columns:2,checked:false,placeholder:'',maxLength:256,wrap:true};
export function createWidgetNode(type='Text',id=crypto.randomUUID(),parent='root'){
  if(!Object.hasOwn(widgetTypes,type))throw Error('위젯 종류를 확인하세요.');
  const properties={...widgetDefaults,text:{Text:'텍스트',Button:'버튼',TouchButton:'공격',CheckBox:'선택'}[type]||''};
  if(type==='Widget')properties.widgetSlots='{}';
  if(['ListView','TreeView'].includes(type))Object.assign(properties,{selectionMode:'single',selectedIndices:'[]',selectedItemIds:'[]',rowWriteback:false,reorderable:false,transferGroup:''});
  if(type==='TouchPad'){properties.axisX='LookX';properties.axisY='LookY';}if(['Joystick','DPad','TouchPad'].includes(type))properties.background='#1c253b99';if(type==='TouchButton'){properties.background='#263443bb';properties.align='center';properties.radius=100;}
  if(['Text','Image','Spacer','Widget','NamedSlot','Canvas','HorizontalBox','VerticalBox','Grid'].includes(type))properties.background='#00000000';
  return {id,name:type,parent,type,slot:{anchors:[0,0,0,0],offset:[32,32,['Joystick','DPad','TouchPad'].includes(type)?220:type==='TouchButton'?112:type==='ProgressBar'?280:200,['Joystick','DPad','TouchPad'].includes(type)?220:type==='TouchButton'?112:type==='Text'?40:48],alignment:[0,0],zIndex:0,fill:0},properties,events:{},bindings:{}};
}
export function createWidgetAsset(name){const root=createWidgetNode('Canvas','root','');root.name='Root';root.slot.anchors=[0,0,1,1];root.slot.offset=[0,0,0,0];return {version:1,name,referenceSize:[1280,720],scaleMode:'constant',nodes:[root]};}
const text=(s,max=80)=>typeof s==='string'&&s.length<=max;
const finite=(v,min,max)=>Number.isFinite(v)&&v>=min&&v<=max;
const vector=(v,size,min,max)=>Array.isArray(v)&&v.length===size&&v.every(n=>finite(n,min,max));
const color=v=>typeof v==='string'&&/^#[\da-f]{6}([\da-f]{2})?$/i.test(v);
export function validWidgetAsset(data,{expanded=false}={}){
  if(!data||!validWidgetClass(data))return false;
  if(data?.version!==1||!text(data.name)||!data.name||!vector(data.referenceSize,2,64,16384)||!['constant','scale'].includes(data.scaleMode)||(data.safeArea!==undefined&&typeof data.safeArea!=='boolean')||(data.adaptiveOrientation!==undefined&&typeof data.adaptiveOrientation!=='boolean')||!Array.isArray(data.nodes)||data.nodes.length<1||data.nodes.length>(expanded?10000:256))return false;
  if(data.scaleRule!==undefined&&!Object.hasOwn(widgetScaleRules,data.scaleRule)||data.scaleMatch!==undefined&&!finite(data.scaleMatch,0,1)||data.safeAreaPadding!==undefined&&!vector(data.safeAreaPadding,4,0,4096))return false;
  const nodes=new Map(data.nodes.map(n=>[n?.id,n]));if(nodes.size!==data.nodes.length||new Set(data.nodes.map(n=>n?.name)).size!==nodes.size)return false;
  const roots=data.nodes.filter(n=>n?.parent==='');if(roots.length!==1||roots[0].type!=='Canvas')return false;
  const children=new Map();for(const n of data.nodes)children.set(n?.parent,(children.get(n?.parent)||0)+1);
  if(data.nodes.some(n=>n?.type==='NamedSlot'&&(children.get(n.id)||0)>1))return false;
  return data.nodes.every(n=>{
    if(!text(n?.id,expanded?2048:80)||!n.id||!text(n.name,expanded?2048:80)||!n.name||!Object.hasOwn(widgetTypes,n.type)||!text(n.parent,expanded?2048:80))return false;
    let at=n;const seen=new Set();while(at.parent){if(seen.has(at.id)||seen.size>(expanded?64:32))return false;seen.add(at.id);at=nodes.get(at.parent);if(!at||!widgetContainers.has(at.type))return false;}
    return validWidgetProperties(n)&&n.events&&typeof n.events==='object'&&!Array.isArray(n.events)&&Object.entries(n.events).every(([k,v])=>widgetEvents.includes(k)&&text(v,80))&&n.bindings&&typeof n.bindings==='object'&&!Array.isArray(n.bindings)&&Object.entries(n.bindings).every(([k,v])=>['text','value','visible','enabled','checked'].includes(k)&&text(v,80));
  });
}
export function validWidgetProperties(n){
    const s=n.slot,p=n.properties;
    if(p?.transferGroup!==undefined&&(!['ListView','TreeView'].includes(n.type)||typeof p.transferGroup!=='string'||p.transferGroup.length>80))return false;
    if(p?.selectionMode!==undefined&&(!['ListView','TreeView'].includes(n.type)||!['none','single','multiple'].includes(p.selectionMode)))return false;
    if(p?.reorderable!==undefined&&(!['ListView','TreeView'].includes(n.type)||typeof p.reorderable!=='boolean')||p?.rowWriteback!==undefined&&(!['ListView','TreeView'].includes(n.type)||typeof p.rowWriteback!=='boolean'))return false;
    for(const key of ['selectedIndices','selectedItemIds'])if(p?.[key]!==undefined){try{const values=JSON.parse(p[key]);if(!['ListView','TreeView'].includes(n.type)||typeof p[key]!=='string'||p[key].length>20000000||!Array.isArray(values)||values.length>100000||new Set(values).size!==values.length||values.some(v=>key==='selectedIndices'? !Number.isInteger(v)||v<0||v>=100000:typeof v!=='string'||!v||v.length>160))return false;}catch{return false;}}
    if(p?.rowWidget!==undefined&&(!['ListView','TreeView'].includes(n.type)||!validAssetPath(p.rowWidget)||p.rowWidget&&!p.rowWidget.endsWith('.hbwidget.json')))return false;
    if(p?.rowBindings!==undefined){try{if(!['ListView','TreeView'].includes(n.type)||typeof p.rowBindings!=='string')return false;widgetRowBindings(p.rowBindings);}catch{return false;}}
    if(p?.exposeOnInstanceOnly!==undefined&&(n.type!=='NamedSlot'||typeof p.exposeOnInstanceOnly!=='boolean'))return false;
    if(p?.widgetAsset!==undefined&&!validAssetPath(p.widgetAsset)||p?.widgetReferenceSize!==undefined&&!vector(p.widgetReferenceSize,2,64,16384))return false;
    for(const key of ['widgetOverrides','widgetEvents','widgetBindings'])if(p?.[key]!==undefined){try{if(typeof p[key]!=='string'||p[key].length>262144)return false;const map=JSON.parse(p[key]);if(!map||typeof map!=='object'||Array.isArray(map)||Object.keys(map).some(k=>['__proto__','constructor','prototype'].includes(k))||key!=='widgetOverrides'&&Object.values(map).some(v=>!text(v,80)))return false;}catch{return false;}}
    if(p?.widgetSlots!==undefined){try{if(n.type!=='Widget'||typeof p.widgetSlots!=='string'||p.widgetSlots.length>262144)return false;const slots=JSON.parse(p.widgetSlots);if(!slots||typeof slots!=='object'||Array.isArray(slots)||Object.entries(slots).some(([name,asset])=>!text(name,2048)||!name||['__proto__','constructor','prototype'].includes(name)||asset!==null&&(!validAssetPath(asset)||!asset||!asset.endsWith('.hbwidget.json'))))return false;}catch{return false;}}

    if(p?.selectedItemId!==undefined&&!text(p.selectedItemId,160))return false;
    if(p?.variableRows!==undefined&&typeof p.variableRows!=='boolean'||p?.autoRows!==undefined&&typeof p.autoRows!=='boolean')return false;
    if(['ListView','TreeView'].includes(n.type)){try{listLayout(JSON.parse(p?.listItems||'[]'),{rowHeight:p?.rowHeight||40,variable:p?.variableRows||false,tree:n.type==='TreeView'});}catch{return false;}}
    if(!s||!vector(s.anchors,4,0,1)||s.anchors[0]>s.anchors[2]||s.anchors[1]>s.anchors[3]||!vector(s.offset,4,-16384,16384)||!vector(s.alignment,2,0,1)||!Number.isInteger(s.zIndex)||!finite(s.zIndex,-1000,1000)||!finite(s.fill,0,100))return false;
    if(p&&(p.stringTable!==undefined&&!validAssetPath(p.stringTable)||p.style!==undefined&&!validAssetPath(p.style)||p.textKey!==undefined&&!text(p.textKey,120)||p.styleName!==undefined&&!text(p.styleName,80)||p.ariaLabel!==undefined&&!text(p.ariaLabel,1000)||p.styleOverrides!==undefined&&!text(p.styleOverrides,1000)||p.rowHeight!==undefined&&!finite(p.rowHeight,8,4096)||p.selectedIndex!==undefined&&(!Number.isInteger(p.selectedIndex)||p.selectedIndex< -1)))return false;
    for(const [key,array] of [['textArguments',false],['listItems',true]])if(p?.[key]!==undefined){try{const v=JSON.parse(p[key]);if(array?(!Array.isArray(v)||v.length>100000):(!v||typeof v!=='object'||Array.isArray(v)))return false;}catch{return false;}}
    if(!p||!text(p.text,10000)||!text(p.tooltip,1000)||!text(p.placeholder,1000)||!validAssetPath(p.texture)||!['left','center','right'].includes(p.align))return false;
    if(p.font!==undefined&&!validAssetPath(p.font)||p.rotation!==undefined&&!finite(p.rotation,-360000,360000)||p.scale!==undefined&&!vector(p.scale,2,0,100)||p.fillDirection!==undefined&&!['leftToRight','rightToLeft','bottomToTop','topToBottom','radial'].includes(p.fillDirection)||p.nineSlice!==undefined&&!vector(p.nineSlice,4,0,4096)||['fillTexture','backgroundTexture'].some(k=>p[k]!==undefined&&!validAssetPath(p[k])))return false;
    if(p.vectorTexture!==undefined&&(!validAssetPath(p.vectorTexture)||p.vectorTexture&&!/\.svg$/i.test(p.vectorTexture))||p.imageFit!==undefined&&!['contain','cover','fill','none','scale-down'].includes(p.imageFit)||p.imageRendering!==undefined&&!['auto','pixelated'].includes(p.imageRendering))return false;
    if(!['color','background','accent','hover','pressed','borderColor'].every(k=>color(p[k]))||!['visible','enabled','focusable','checked','wrap'].every(k=>typeof p[k]==='boolean'))return false;
    if(!finite(p.fontSize,6,256)||!finite(p.borderWidth,0,32)||!finite(p.radius,0,512)||!finite(p.opacity,0,1)||!finite(p.padding,0,512)||!finite(p.gap,0,512)||!Number.isInteger(p.columns)||!finite(p.columns,1,32)||!Number.isInteger(p.maxLength)||!finite(p.maxLength,1,10000))return false;
    if(!finite(p.min,-1e6,1e6)||!finite(p.max,-1e6,1e6)||p.min>=p.max||!(['ListView','TreeView'].includes(n.type)?Number.isInteger(p.value)&&p.value>=-1&&p.value<=100000:finite(p.value,p.min,p.max))||!finite(p.step,.000001,1e6))return false;
    for(const key of ['inputKey','axisX','axisY','keyUp','keyDown','keyLeft','keyRight'])if(p[key]!==undefined&&(!text(p[key],80)||!p[key]))return false;
    if(p.inputMode!==undefined&&!['keys','axes'].includes(p.inputMode)||p.deadZone!==undefined&&!finite(p.deadZone,0,.95)||p.floating!==undefined&&typeof p.floating!=='boolean'||p.deviceVisibility!==undefined&&!['all','touch','mouse'].includes(p.deviceVisibility))return false;
    return true;
}
export function widgetDescendants(data,id){const result=new Set([id]);let size;do{size=result.size;for(const n of data.nodes)if(result.has(n.parent))result.add(n.id);}while(size!==result.size);return result;}
export function reparentWidget(data,id,parent){const n=data.nodes.find(n=>n.id===id),p=data.nodes.find(n=>n.id===parent);if(!n?.parent||!p||!widgetContainers.has(p.type)||widgetDescendants(data,id).has(parent))throw Error('위젯 계층을 순환시키거나 루트를 이동할 수 없어요.');if(p.type==='NamedSlot'&&data.nodes.some(x=>x.parent===parent&&x.id!==id))throw Error('명명 슬롯에는 자식 하나만 넣을 수 있어요.');n.parent=parent;}
export function addWidget(data,type,{parent=data.nodes.find(n=>!n.parent).id,name,id=crypto.randomUUID()}={}){const owner=data.nodes.find(n=>n.id===parent);if(!widgetContainers.has(owner?.type))throw Error('위젯 부모는 컨테이너여야 해요.');if(owner.type==='NamedSlot'&&data.nodes.some(n=>n.parent===parent))throw Error('명명 슬롯에는 자식 하나만 넣을 수 있어요.');const node=createWidgetNode(type,id,parent);if(name!==undefined)node.name=name;else{let i=1;while(data.nodes.some(n=>n.name===node.name))node.name=type+'_'+i++;}if(data.nodes.some(n=>n.id===id||n.name===node.name))throw Error('위젯 ID·이름이 중복돼요.');data.nodes.push(node);return node.id;}
export function removeWidget(data,id){const node=data.nodes.find(n=>n.id===id);if(!node?.parent)throw Error('루트 위젯은 삭제할 수 없어요.');const ids=widgetDescendants(data,id);data.nodes=data.nodes.filter(n=>!ids.has(n.id));return [...ids];}
export function duplicateWidget(data,id,{parent,offset=[16,16]}={}){const source=data.nodes.find(n=>n.id===id);if(!source?.parent)throw Error('루트 위젯은 복제할 수 없어요.');parent??=source.parent;if(!widgetContainers.has(data.nodes.find(n=>n.id===parent)?.type)||!vector(offset,2,-16384,16384))throw Error('복제 부모·위치를 확인하세요.');if(data.nodes.find(n=>n.id===parent)?.type==='NamedSlot'&&data.nodes.some(n=>n.parent===parent))throw Error('명명 슬롯에는 자식 하나만 넣을 수 있어요.');const ids=widgetDescendants(data,id),copies=structuredClone(data.nodes.filter(n=>ids.has(n.id))),map=new Map(copies.map(n=>[n.id,crypto.randomUUID()])),names=new Set(data.nodes.map(n=>n.name));for(const n of copies){const old=n.id;n.id=map.get(old);n.parent=old===id?parent:map.get(n.parent);let i=1,name=n.name+'_Copy';while(names.has(name))name=n.name+'_Copy'+i++;n.name=name;names.add(name);}const root=copies.find(n=>n.id===map.get(id));root.slot.offset[0]+=offset[0];root.slot.offset[1]+=offset[1];data.nodes.push(...copies);return root.id;}
// Canvas offsets: fixed anchors use x/y/width/height; stretched anchors use left/top/right/bottom margins.
export function widgetRect(slot,width,height){const a=slot.anchors,o=slot.offset,x=a[0]*width+o[0],y=a[1]*height+o[1],w=a[0]===a[2]?o[2]:(a[2]-a[0])*width-o[0]-o[2],h=a[1]===a[3]?o[3]:(a[3]-a[1])*height-o[1]-o[3];return {x:x-w*slot.alignment[0],y:y-h*slot.alignment[1],width:Math.max(0,w),height:Math.max(0,h)};}

export function widgetScale(data,width,height){
  if(data.scaleMode!=='scale')return 1;
  const reference=data.adaptiveOrientation&&(width<height)!==(data.referenceSize[0]<data.referenceSize[1])?[...data.referenceSize].reverse():data.referenceSize;
  const x=Math.max(.01,width/reference[0]),y=Math.max(.01,height/reference[1]),rule=data.scaleRule||'fit';
  return rule==='width'?x:rule==='height'?y:rule==='cover'?Math.max(x,y):rule==='match'?x**(1-(data.scaleMatch??.5))*y**(data.scaleMatch??.5):Math.min(x,y);
}
export function widgetImageSource(properties,scale,pixelRatio=1){
  const effective=scale*pixelRatio;
  return properties.vectorTexture&&Math.abs(effective-Math.round(effective))>.001?properties.vectorTexture:properties.texture||properties.vectorTexture||'';
}

export function addMobileControls(data,{movement='Joystick'}={}){
  if(!['Joystick','DPad'].includes(movement))throw Error('모바일 이동 컨트롤을 확인하세요.');const ids=[];
  const add=(type,name,anchors,offset,key)=>{const id=addWidget(data,type,{name:data.nodes.some(n=>n.name===name)?undefined:name});const n=data.nodes.find(n=>n.id===id);n.slot={...n.slot,anchors,offset,alignment:[anchors[0],anchors[1]],zIndex:20};n.properties.deviceVisibility='touch';if(key)n.properties.inputKey=key;ids.push(id);return n;};
  add(movement,'Move',[0,1,0,1],[48,-48,220,220]);const attack=add('TouchButton','Attack',[1,1,1,1],[-48,-48,112,112],'LeftMouseButton');attack.properties.text='공격';const jump=add('TouchButton','Jump',[1,1,1,1],[-184,-112,100,100],'space');jump.properties.text='점프';
  data.safeArea=true;data.adaptiveOrientation=true;data.scaleMode='scale';return ids;
}
