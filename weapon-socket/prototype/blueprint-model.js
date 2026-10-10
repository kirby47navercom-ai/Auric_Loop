import {blueprintClasses} from './class-types.js';
import {componentDefaults,validComponents} from './scene-components.js';
export {componentDefaults};
import {validNative,validNativeReference,nativePins,nativeMember} from './native-model.js';
import {coreApi,serviceApi} from './core-api.js';
const pin = (id,label,type='exec',array=false) => ({id,label,type,array});
export const variableTypes = { bool:'Boolean · 불리언', int:'Integer · 정수', float:'Float · 실수', string:'String · 문자열', vec2:'Vector2 · 벡터2', vec3:'Vector3 · 벡터3', color:'Color · 색상', transform:'Transform · 변환', object:'Object · 클래스 참조', hit:'HitResult · 구조체' };
export const typeColors = { exec:'#d1dadd', bool:'#d88380', int:'#89c8c1', float:'#9dcc7f', string:'#dba0cd', vec2:'#e2bc71', vec3:'#e2bc71', color:'#99bfea', transform:'#d99f72', object:'#88b9e0', hit:'#ae9ece', any:'#aab9be' };
export const catalog = [
  {key:'construction',title:'Construction Script',ko:'생성 시 구성',group:'이벤트',keywords:'construction constructor 컨스트럭션 컨스트럭터 생성 구성',kind:'event',inputs:[],outputs:[pin('then','실행')]},
  {key:'beginPlay',title:'Begin Play',ko:'게임 시작',group:'이벤트',keywords:'beginplay 비긴 시작 플레이',kind:'event',inputs:[],outputs:[pin('then','실행')]},
  {key:'tick',title:'Event Tick',ko:'매 프레임',group:'이벤트',keywords:'event tick 이벤트 틱 델타 시간',kind:'event',inputs:[],outputs:[pin('then','실행'),pin('delta','Delta seconds','float')]},
  {key:'fixedTick',title:'Fixed Update',ko:'고정 물리 업데이트',group:'이벤트',keywords:'fixed update physics 물리 고정 틱 프레임',kind:'event',inputs:[],outputs:[pin('then','실행'),pin('delta','Fixed delta seconds','float')]},
  {key:'beginOverlap',title:'Begin Overlap',ko:'겹침 시작',group:'이벤트',keywords:'actor component overlap begin 비긴 오버랩 충돌 트리거',kind:'event',inputs:[],outputs:[pin('then','실행'),pin('other','Other actor','object')]},
  {key:'overlapStay',title:'Overlap Stay',ko:'겹침 유지',group:'이벤트',keywords:'trigger overlap stay 겹침 유지 접촉 물리',kind:'event',inputs:[],outputs:[pin('then','실행'),pin('other','Other actor','object'),pin('delta','Fixed delta seconds','float')]},
  {key:'endOverlap',title:'End Overlap',ko:'겹침 종료',group:'이벤트',keywords:'end overlap 끝 엔드 충돌',kind:'event',inputs:[],outputs:[pin('then','실행'),pin('other','Other actor','object')]},
  {key:'input',title:'Input Event',ko:'키·마우스 이벤트',group:'이벤트',keywords:'input key keyboard mouse click 입력 키보드 마우스 클릭 버튼',kind:'event',inputs:[],outputs:[pin('then','Pressed'),pin('released','Released')]},
  {key:'customEvent',title:'Custom Event',ko:'사용자 이벤트',group:'이벤트',keywords:'custom event 커스텀 사용자 정의',kind:'event',inputs:[],outputs:[pin('then','실행')]},
  {key:'callParent',title:'Call Parent',ko:'부모 호출',group:'클래스',keywords:'parent super 부모 상속 호출',inputs:[pin('exec','실행')],outputs:[pin('then','다음')]},
  {key:'parentEntry',title:'Parent Event',ko:'부모 이벤트',group:'클래스',internal:true,inputs:[],outputs:[]},
  {key:'branch',title:'Branch',ko:'조건 분기',group:'흐름 제어',keywords:'branch if 조건 분기 참 거짓',kind:'condition',inputs:[pin('exec','실행'),pin('condition','Condition','bool')],outputs:[pin('true','True'),pin('false','False')]},
  {key:'delay',title:'Delay',ko:'기다리기',group:'흐름 제어',keywords:'delay wait 딜레이 지연 대기',inputs:[pin('exec','실행'),pin('duration','Duration','float')],outputs:[pin('then','Completed')]},
  {key:'sequence',title:'Sequence',ko:'순서대로 실행',group:'흐름 제어',keywords:'sequence 시퀀스 순서',inputs:[pin('exec','실행')],outputs:[pin('first','Then 0'),pin('second','Then 1')]},
  {key:'print',title:'Print String',ko:'문자열 출력',group:'디버그',keywords:'print string log 문자열 로그 출력',inputs:[pin('exec','실행'),pin('message','Message','string')],outputs:[pin('then','다음')]},
  {key:'location',title:'Get Position',ko:'위치 가져오기',group:'오브젝트',keywords:'get actor location position 위치 벡터 좌표',inputs:[pin('target','Target','object')],outputs:[pin('return','Return value','vec3')]},
  {key:'setPosition',title:'Set Position',ko:'위치 설정',group:'오브젝트',keywords:'set actor location position 위치 이동 설정',inputs:[pin('exec','실행'),pin('target','Target','object'),pin('position','Position','vec3')],outputs:[pin('then','다음')]},
  {key:'vec3',title:'Make Vector3',ko:'벡터3 만들기',group:'수학',keywords:'make vector vec3 vector3 xyz 벡터3',inputs:[pin('x','X','float'),pin('y','Y','float'),pin('z','Z','float')],outputs:[pin('return','Vector3','vec3')]},
  {key:'vec2',title:'Make Vector2',ko:'벡터2 만들기',group:'수학',keywords:'make vector vec2 vector2 xy 벡터2',inputs:[pin('x','X','float'),pin('y','Y','float')],outputs:[pin('return','Vector2','vec2')]},
  {key:'add',title:'Add Float',ko:'실수 더하기',group:'수학',keywords:'add float plus 덧셈 더하기 합',inputs:[pin('a','A','float'),pin('b','B','float')],outputs:[pin('return','Result','float')]},
  {key:'arrayLength',title:'Array Length',ko:'배열 길이',group:'배열',keywords:'array length size 배열 길이 크기',inputs:[pin('array','Array','any',true)],outputs:[pin('return','Length','int')]},
  {key:'trace',title:'Raycast',ko:'레이캐스트',group:'물리',keywords:'raycast line trace hit result 레이 선 충돌 검사 구조체',inputs:[pin('exec','실행'),pin('start','Start','vec3'),pin('end','End','vec3')],outputs:[pin('then','다음'),pin('return','Hit result','hit')]},
  {key:'members',title:'Get Object Members',ko:'공개 멤버 읽기',group:'오브젝트',keywords:'object class member property 클래스 객체 멤버 속성',inputs:[pin('target','Target','object')],outputs:[pin('name','Name','string'),pin('position','Position','vec3'),pin('visible','Visible','bool')]},
  {key:'door',title:'Open Door',ko:'문 열기',group:'C++ 공개 함수',keywords:'door open 문 열기 cpp c++',inputs:[pin('exec','실행')],outputs:[pin('then','다음')]},
  {key:'sound',title:'Play Sound',ko:'효과음 재생',group:'오디오',keywords:'audio play sound 효과음 소리 재생',inputs:[pin('exec','실행'),pin('name','Sound','string')],outputs:[pin('then','다음')]},
  {key:'customFunction',title:'Custom Function',ko:'사용자 함수',group:'사용자 정의',keywords:'custom function 사용자 함수 커스텀',inputs:[pin('exec','실행')],outputs:[pin('then','다음')]}
];
const spec=(key,title,ko,group,inputs,outputs,keywords='')=>({key,title,ko,group,inputs,outputs,keywords:title+' '+ko+' '+keywords});
const flow=(key,title,ko,group,inputs=[],outputs=[])=>spec(key,title,ko,group,[pin('exec','실행'),...inputs],[pin('then','다음'),...outputs]);
catalog.push(
  spec('timeline','Timeline','타임라인','시간',[pin('play','Play'),pin('start','Play from Start'),pin('stop','Stop'),pin('reverse','Reverse'),pin('reverseEnd','Reverse from End'),pin('setTime','Set New Time'),pin('time','New Time','float')],[pin('update','Update'),pin('finished','Finished'),pin('direction','Direction','string')]),
  spec('reroute','Reroute','연결 정리','사용자 정의',[pin('value','Input','float')],[pin('value','Output','float')]),
  spec('isValid','Is Valid','객체 유효성','오브젝트',[pin('target','Object','object')],[pin('return','Valid','bool')]),
  flow('cast','Cast To Class','클래스 변환','오브젝트',[pin('target','Object','object'),pin('class','Class','string')],[pin('object','Object','object'),pin('failed','Cast failed')]),
  ...[['multiply','Multiply','곱하기'],['subtract','Subtract','빼기'],['divide','Divide','나누기'],['min','Min','최솟값'],['max','Max','최댓값'],['power','Power','거듭제곱']].map(([k,en,ko])=>spec(k,en,ko,'수학',[pin('a','A','float'),pin('b','B','float')],[pin('return','Result','float')])),
  ...[['abs','Abs','절댓값'],['sqrt','Sqrt','제곱근'],['sin','Sin','사인'],['cos','Cos','코사인'],['floor','Floor','내림'],['ceil','Ceil','올림'],['round','Round','반올림']].map(([k,en,ko])=>spec(k,en,ko,'수학',[pin('value','Value','float')],[pin('return','Result','float')])),
  spec('clamp','Clamp','범위 제한','수학',[pin('value','Value','float'),pin('min','Min','float'),pin('max','Max','float')],[pin('return','Result','float')]),
  spec('lerp','Lerp','선형 보간','수학',[pin('a','A','float'),pin('b','B','float'),pin('alpha','Alpha','float')],[pin('return','Result','float')]),
  spec('random','Random Float in Range','범위 안 무작위','수학',[pin('min','Min','float'),pin('max','Max','float')],[pin('return','Value','float')]),
  ...[['greater','Greater','크다'],['less','Less','작다'],['equal','Equal','같다'],['notEqual','Not Equal','다르다']].map(([k,en,ko])=>spec(k,en,ko,'비교',[pin('a','A','float'),pin('b','B','float')],[pin('return','Result','bool')])),
  ...[['and','AND','그리고'],['or','OR','또는']].map(([k,en,ko])=>spec(k,en,ko,'논리',[pin('a','A','bool'),pin('b','B','bool')],[pin('return','Result','bool')])),
  spec('not','NOT','반전','논리',[pin('value','Value','bool')],[pin('return','Result','bool')]),
  spec('select','Select Float','조건 값 선택','논리',[pin('condition','Condition','bool'),pin('a','True value','float'),pin('b','False value','float')],[pin('return','Result','float')]),
  ...[['vectorAdd','Add Vector','벡터 더하기'],['vectorSubtract','Subtract Vector','벡터 빼기']].map(([k,en,ko])=>spec(k,en,ko,'벡터',[pin('a','A','vec3'),pin('b','B','vec3')],[pin('return','Result','vec3')])),
  spec('vectorScale','Scale Vector','벡터 배율','벡터',[pin('value','Vector','vec3'),pin('scale','Scale','float')],[pin('return','Result','vec3')]),
  spec('vectorLength','Vector Length','벡터 길이','벡터',[pin('value','Vector','vec3')],[pin('return','Length','float')]),
  spec('normalize','Normalize Vector','벡터 정규화','벡터',[pin('value','Vector','vec3')],[pin('return','Result','vec3')]),
  spec('distance','Distance','거리','벡터',[pin('a','A','vec3'),pin('b','B','vec3')],[pin('return','Distance','float')]),
  ...[['dot','Dot Product','내적','float'],['cross','Cross Product','외적','vec3']].map(([k,en,ko,t])=>spec(k,en,ko,'벡터',[pin('a','A','vec3'),pin('b','B','vec3')],[pin('return','Result',t)])),
  spec('vectorLerp','Lerp Vector','벡터 보간','벡터',[pin('a','A','vec3'),pin('b','B','vec3'),pin('alpha','Alpha','float')],[pin('return','Result','vec3')]),
  spec('makeTransform','Make Transform','트랜스폼 만들기','변환',[pin('position','Position','vec3'),pin('rotation','Rotation','vec3'),pin('scale','Scale','vec3')],[pin('return','Transform','transform')]),
  spec('getTransform','Get Transform','트랜스폼 가져오기','변환',[pin('target','Target','object')],[pin('return','Transform','transform')]),
  flow('setTransform','Set Transform','트랜스폼 설정','변환',[pin('target','Target','object'),pin('value','Transform','transform')]),
  ...[['getRotation','Get Rotation','회전 가져오기'],['getScale','Get Scale','크기 가져오기']].map(([k,en,ko])=>spec(k,en,ko,'변환',[pin('target','Target','object')],[pin('return','Value','vec3')])),
  ...[['setRotation','Set Rotation','회전 설정'],['setScale','Set Scale','크기 설정'],['translate','Add Offset','위치 더하기'],['rotate','Add Rotation','회전 더하기']].map(([k,en,ko])=>flow(k,en,ko,'변환',[pin('target','Target','object'),pin('value','Value','vec3')])),
  spec('self','Self','자기 자신','오브젝트',[],[pin('return','Self','object')]),
  flow('spawn','Spawn Actor','액터 생성','오브젝트',[pin('class','Class','string'),pin('transform','Transform','transform')],[pin('actor','Actor','object')]),
  flow('destroy','Destroy Actor','액터 제거','오브젝트',[pin('target','Target','object')]),
  flow('visibility','Set Visibility','표시 설정','오브젝트',[pin('target','Target','object'),pin('visible','Visible','bool')]),
  flow('attach','Attach To','부모에 연결','오브젝트',[pin('target','Target','object'),pin('parent','Parent','object')]),
  spec('getComponent','Get Component','컴포넌트 찾기','컴포넌트',[pin('target','Target','object'),pin('class','Component class','string')],[pin('return','Component','object')]),
  flow('addComponent','Add Component','컴포넌트 추가','컴포넌트',[pin('target','Target','object'),pin('class','Component class','string')],[pin('return','Component','object')]),
  flow('componentEnabled','Set Component Enabled','컴포넌트 활성화','컴포넌트',[pin('target','Component','object'),pin('enabled','Enabled','bool')]),
  spec('concat','Append String','문자열 합치기','문자열',[pin('a','A','string'),pin('b','B','string')],[pin('return','Result','string')]),
  spec('stringLength','String Length','문자열 길이','문자열',[pin('value','String','string')],[pin('return','Length','int')]),
  spec('contains','Contains','문자열 포함','문자열',[pin('value','String','string'),pin('search','Search','string')],[pin('return','Result','bool')]),
  spec('toString','Float To String','실수를 문자열로','문자열',[pin('value','Value','float')],[pin('return','String','string')]),
  spec('arrayGet','Array Get','배열 원소 읽기','배열',[pin('array','Array','float',true),pin('index','Index','int')],[pin('return','Item','float')]),
  flow('arraySet','Array Set','배열 원소 설정','배열',[pin('array','Array','float',true),pin('index','Index','int'),pin('item','Item','float')]),
  flow('arrayAdd','Array Add','배열 원소 추가','배열',[pin('array','Array','float',true),pin('item','Item','float')],[pin('index','Index','int')]),
  flow('arrayRemove','Array Remove Index','배열 원소 삭제','배열',[pin('array','Array','float',true),pin('index','Index','int')]),
  spec('arrayFind','Array Find','배열 원소 찾기','배열',[pin('array','Array','float',true),pin('item','Item','float')],[pin('return','Index','int')]),
  spec('arrayContains','Array Contains','배열 원소 포함','배열',[pin('array','Array','float',true),pin('item','Item','float')],[pin('return','Contains','bool')]),
  spec('forLoop','For Loop','반복 실행','흐름 제어',[pin('exec','실행'),pin('first','First index','int'),pin('last','Last index','int')],[pin('body','Loop body'),pin('index','Index','int'),pin('completed','Completed')]),
  spec('forEach','For Each Loop','배열 반복','흐름 제어',[pin('exec','실행'),pin('array','Array','float',true)],[pin('body','Loop body'),pin('item','Item','float'),pin('index','Index','int'),pin('completed','Completed')]),
  flow('doOnce','Do Once','한 번 실행','흐름 제어',[pin('reset','Reset')]),
  spec('flipFlop','Flip Flop','번갈아 실행','흐름 제어',[pin('exec','실행')],[pin('a','A'),pin('b','B'),pin('isA','Is A','bool')]),
  spec('gate','Gate','실행 게이트','흐름 제어',[pin('exec','Enter'),pin('open','Open'),pin('close','Close'),pin('toggle','Toggle')],[pin('then','Exit')]),
  flow('timer','Set Timer','타이머 설정','시간',[pin('duration','Time','float'),pin('loop','Looping','bool'),pin('event','Event name','string')],[pin('handle','Handle','string')]),
  flow('clearTimer','Clear Timer','타이머 해제','시간',[pin('handle','Handle','string')]),
  spec('time','Get Game Time','게임 시간','시간',[],[pin('return','Seconds','float')]),
  flow('lineTrace','Line Trace','선 충돌 검사','물리',[pin('start','Start','vec3'),pin('end','End','vec3'),pin('channel','Channel','string')],[pin('hit','Hit','hit')]),
  flow('impulse','Add Impulse','충격량 추가','물리',[pin('target','Target','object'),pin('impulse','Impulse','vec3')]),
  flow('collisionEnabled','Set Collision Enabled','충돌 활성화','물리',[pin('target','Target','object'),pin('enabled','Enabled','bool')]),
  flow('playAnimation','Play Animation','애니메이션 재생','애니메이션',[pin('target','Target','object'),pin('clip','Clip','string'),pin('loop','Looping','bool')]),
  flow('stopAnimation','Stop Animation','애니메이션 정지','애니메이션',[pin('target','Target','object')]),
  flow('playSoundAt','Play Sound At Location','위치에서 소리 재생','오디오',[pin('sound','Sound','string'),pin('position','Position','vec3'),pin('volume','Volume','float')]),
  flow('stopSound','Stop Sound','소리 정지','오디오',[pin('sound','Sound','string')]),
  flow('setMaterial','Set Material','머테리얼 지정','렌더링',[pin('target','Target','object'),pin('material','Material','string'),pin('slot','Slot','int')]),
  flow('materialTexture','Set Material Texture','머테리얼 텍스처 설정','렌더링',[pin('target','Target','object'),pin('parameter','Parameter','string'),pin('texture','Texture','string')]),
  flow('materialFloat','Set Material Float','머테리얼 실수 설정','렌더링',[pin('target','Target','object'),pin('parameter','Parameter','string'),pin('value','Value','float')]),
  flow('lightIntensity','Set Light Intensity','광원 밝기 설정','렌더링',[pin('target','Light','object'),pin('value','Intensity','float')]),
  flow('openScene','Open Scene','장면 열기','장면',[pin('scene','Scene','string')]),
  flow('createWidget','Create Widget','위젯 생성','UI',[pin('class','Widget class','string')],[pin('widget','Widget','object')]),
  flow('addViewport','Add To Viewport','뷰포트에 위젯 추가','UI',[pin('widget','Widget','object')]),
  flow('setText','Set Text','텍스트 설정','UI',[pin('widget','Widget','object'),pin('text','Text','string')]),
  flow('saveGame','Save Game','게임 저장','저장',[pin('slot','Slot','string')],[pin('success','Success','bool')]),
  flow('loadGame','Load Game','게임 불러오기','저장',[pin('slot','Slot','string')],[pin('data','Data','object')])
);
catalog.push(
  spec('doN','Do N','정해진 횟수 실행','흐름 제어',[pin('exec','Enter'),pin('reset','Reset'),pin('count','N','int')],[pin('then','Exit'),pin('counter','Counter','int')]),
  spec('multiGate','Multi Gate','여러 경로 순차 실행','흐름 제어',[pin('exec','Enter'),pin('reset','Reset'),pin('loop','Loop','bool'),pin('random','Random','bool'),pin('startIndex','Start index','int')],[pin('out0','Out 0'),pin('out1','Out 1'),pin('out2','Out 2'),pin('index','Index','int')]),
  spec('whileLoop','While Loop','조건 반복','흐름 제어',[pin('exec','Enter'),pin('condition','Condition','bool')],[pin('body','Loop body'),pin('completed','Completed')]),
  spec('forLoopBreak','For Loop With Break','중단 가능한 반복','흐름 제어',[pin('exec','Enter'),pin('break','Break'),pin('first','First index','int'),pin('last','Last index','int')],[pin('body','Loop body'),pin('index','Index','int'),pin('completed','Completed')]),
  spec('forEachBreak','For Each With Break','중단 가능한 배열 반복','흐름 제어',[pin('exec','Enter'),pin('break','Break'),pin('array','Array','float',true)],[pin('body','Loop body'),pin('item','Item','float'),pin('index','Index','int'),pin('completed','Completed')]),
  flow('retriggerDelay','Retriggerable Delay','다시 시작하는 지연','흐름 제어',[pin('duration','Duration','float')]),
  ...[['switchInt','int','정수'],['switchString','string','문자열']].map(([key,type,ko])=>spec(key,'Switch '+(type==='int'?'Integer':'String'),ko+' 분기','흐름 제어',[pin('exec','Enter'),pin('selection','Selection',type),...Array.from({length:3},(_,i)=>pin('case'+i,'Case '+i,type))],[...Array.from({length:3},(_,i)=>pin('out'+i,'Case '+i)),pin('default','Default')]))
);
catalog.find(s=>s.key==='forEachBreak').arrayType=true;
catalog.find(s=>s.key==='doN').defaults={count:1};
catalog.filter(s=>s.group==='배열'&&s.key!=='arrayLength'||s.key==='forEach').forEach(s=>s.arrayType=true);
catalog.push(
  {key:'endPlay',title:'End Play',ko:'게임 종료',group:'이벤트',keywords:'end play 종료 끝',kind:'event',inputs:[],outputs:[pin('then','실행'),pin('reason','Reason','string')]},
  {key:'hitEvent',title:'Event Hit',ko:'충돌 이벤트',group:'이벤트',keywords:'hit collision 충돌 히트',kind:'event',inputs:[],outputs:[pin('then','실행'),pin('other','Other actor','object'),pin('hit','Hit result','hit')]},
  {key:'hitStay',title:'Collision Stay',ko:'충돌 유지',group:'이벤트',keywords:'hit collision stay 접촉 충돌 유지 물리',kind:'event',inputs:[],outputs:[pin('then','실행'),pin('other','Other actor','object'),pin('hit','Hit result','hit'),pin('delta','Fixed delta seconds','float')]},
  {key:'endHit',title:'Collision Exit',ko:'충돌 종료',group:'이벤트',keywords:'hit collision exit end 접촉 충돌 종료 끝',kind:'event',inputs:[],outputs:[pin('then','실행'),pin('other','Other actor','object'),pin('hit','Last contact','hit')]},
  {key:'inputAction',title:'Input Action',ko:'입력 액션 이벤트',group:'이벤트',keywords:'input action ia 입력 액션 started triggered completed',kind:'event',inputs:[],outputs:[pin('started','Started'),pin('triggered','Triggered'),pin('completed','Completed'),pin('ongoing','Ongoing'),pin('canceled','Canceled'),pin('value','Action value','bool'),pin('elapsed','Elapsed seconds','float')]},
  {key:'inputAxis',title:'Input Axis',ko:'축 입력',group:'이벤트',keywords:'input axis 입력 축 이동 마우스',kind:'event',inputs:[],outputs:[pin('then','실행'),pin('value','Axis value','float')]},
  {key:'anyDamage',title:'Any Damage',ko:'피해 이벤트',group:'이벤트',keywords:'damage hit 피해 데미지',kind:'event',inputs:[],outputs:[pin('then','실행'),pin('damage','Damage','float'),pin('instigator','Instigator','object')]},
  spec('makeColor','Make Color','색상 만들기','수학',[pin('r','R','float'),pin('g','G','float'),pin('b','B','float'),pin('a','A','float')],[pin('return','Color','color')])
);
for(const entry of [...coreApi,...serviceApi]){const existing=catalog.find(n=>n.key===entry.key);if(existing)Object.assign(existing,entry,{keywords:(existing.keywords||'')+' '+entry.keywords});else catalog.push(entry);}
const catalogByKey=new Map(catalog.map(node=>[node.key,node]));
export const fieldsFor = type => ({vec2:[pin('x','X','float'),pin('y','Y','float')],vec3:[pin('x','X','float'),pin('y','Y','float'),pin('z','Z','float')],color:[pin('r','R','float'),pin('g','G','float'),pin('b','B','float'),pin('a','A','float')],transform:[pin('position','Position','vec3'),pin('rotation','Rotation','vec3'),pin('scale','Scale','vec3')],hit:[pin('hit','Blocking hit','bool'),pin('position','Impact point','vec3'),pin('normal','Normal','vec3'),pin('actor','Actor','object')]}[type]||[]);
export function defaultsFor(type){ return {bool:false,int:0,float:0,string:'',vec2:[0,0],vec3:[0,0,0],color:[1,1,1,1],transform:{position:[0,0,0],rotation:[0,0,0],scale:[1,1,1]},object:null,hit:{hit:false,position:[0,0,0],normal:[0,1,0],actor:null}}[type]; }
export function validValue(type,value){
  const vector=(size)=>Array.isArray(value)&&value.length===size&&value.every(Number.isFinite);
  if(type==='bool')return typeof value==='boolean';if(type==='int')return Number.isInteger(value)&&value>=-2147483648&&value<=2147483647;if(type==='float')return Number.isFinite(value);if(type==='string')return typeof value==='string'&&value.length<=4096;
  if(type==='vec2')return vector(2);if(type==='vec3')return vector(3);if(type==='color')return vector(4)&&value.every(v=>v>=0&&v<=1);if(type==='object')return value===null||(typeof value==='string'&&value.length<=200);
  if(type==='transform')return value&&['position','rotation','scale'].every(k=>validValue('vec3',value[k]));if(type==='hit')return value&&validValue('bool',value.hit)&&validValue('vec3',value.position)&&validValue('vec3',value.normal)&&validValue('object',value.actor);return false;
}
export function defaultInputValue(n,p){return n.inputValues?.[p.id]??catalogByKey.get(n.key)?.defaults?.[p.id]??p.default??(p.array?[]:defaultsFor(p.type));}
export function basePins(node,direction,graph){
  if(node.key==='parentEntry')return basePins({...node,key:node.parentKey},direction,graph);
  if(node.key==='callParent'){
    const d=(graph.functions||[]).find(d=>d.id===node.parentDefinitionId);if(d)return direction==='in'?d.inputs:d.outputs;
    const entry=[...(graph.parentNodes||graph.nodes),...((graph.parentConstruction||graph.construction)?.nodes||[])].find(n=>n.id===node.parentEntryId);const data=entry?basePins(entry,'out',graph).filter(p=>p.type!=='exec'):[];
    return direction==='in'?[pin('exec','실행'),...data]:[pin('then','다음')];
  }
  if(node.key==='inputAction')return direction==='in'?[]:catalog.find(s=>s.key==='inputAction').outputs.map(p=>p.id==='value'?{...p,type:node.valueType||'bool'}:p);
  if(node.key==='timeline'){const s=catalog.find(s=>s.key==='timeline');return direction==='in'?s.inputs:[...s.outputs,...(node.timeline?.tracks||[]).map(t=>pin(t.id,t.name,t.type==='event'?'exec':t.type))];}
  if(node.key==='reroute')return [pin('value',direction==='in'?'Input':'Output',node.valueType||'float',node.array??false)];
  if(node.key.startsWith('native'))return nativePins(graph,node,direction);
  if(['dispatcherCall','dispatcherBind','dispatcherUnbind','dispatcherEvent','interfaceCall'].includes(node.key)){
    const d=[...(graph.dispatchers||[]),...(graph.interfaces||[])].find(d=>d.id===node.symbolId);if(!d)return [];
    const target=pin('target','Target','object');
    if(node.key==='dispatcherEvent')return direction==='out'?[pin('then','실행'),...d.inputs]:[];
    if(node.key==='dispatcherBind'||node.key==='dispatcherUnbind')return direction==='in'?[pin('exec','실행'),target,pin('event','Event name','string')]:[pin('then','다음')];
    return direction==='in'?[pin('exec','실행'),target,...d.inputs]:[pin('then','다음'),...(d.outputs||[])];
  }
  if(['callFunction','callMacro','functionInput','functionOutput','macroInput','macroOutput'].includes(node.key)){
    const definition=[...(graph.functions||[]),...(graph.macros||[])].find(d=>d.id===node.definitionId);if(!definition)return [];
    if(node.key.endsWith('Input'))return direction==='out'?definition.inputs:[];
    if(node.key.endsWith('Output'))return direction==='in'?definition.outputs:[];
    return direction==='in'?definition.inputs:definition.outputs;
  }
  if(node.key==='getVariable'||node.key==='setVariable'){const v=graph.variables.find(v=>v.id===node.variableId);if(!v)return [];const value=pin('value',v.name,v.type,v.container==='array');return node.key==='getVariable'?(direction==='out'?[value]:[]):direction==='in'?[pin('exec','실행'),value]:[pin('then','다음')];}
  const s=catalog.find(s=>s.key===node.key);return [...(s?.[direction==='out'?'outputs':'inputs']||[]).map(p=>s.arrayType&&p.type==='float'?{...p,type:node.valueType||'float'}:p),...(direction==='out'?node.customOutputs:node.customInputs)||[]];
}
export function effectivePins(node,direction,graph){
  const expand=p=>!p.array&&(node.splitPins||[]).includes(direction+':'+p.id)&&fieldsFor(p.type).length?fieldsFor(p.type).flatMap(f=>expand({...f,id:p.id+'.'+f.id,parent:p.id})): [p];
  return basePins(node,direction,graph).flatMap(expand);
}
function pinForId(node,direction,graph,id){const parts=id.split('.'),first=parts.shift();let p=basePins(node,direction,graph).find(p=>p.id===first);for(const field of parts)p=p&&fieldsFor(p.type).find(p=>p.id===field);return p;}
export function canConnect(graph,from,to){

  const a=graph.nodes.find(n=>n.id===from.node),b=graph.nodes.find(n=>n.id===to.node);const out=a&&effectivePins(a,'out',graph).find(p=>p.id===from.pin),input=b&&effectivePins(b,'in',graph).find(p=>p.id===to.pin);
  if(!out||!input)return {ok:false,reason:'연결할 핀을 찾을 수 없어요.'};
  if(out.array!==input.array||(out.type!==input.type&&out.type!=='any'&&input.type!=='any'))return {ok:false,reason:`타입이 달라요: ${out.type}${out.array?'[]':''} → ${input.type}${input.array?'[]':''}`};
  if(out.type==='exec'&&input.type==='exec'&&['break','reset','open','close','toggle'].includes(to.pin))return {ok:true};
  if(from.node===to.node)return {ok:false,reason:'같은 노드에는 연결할 수 없어요.'};
  const reaches=(id,seen=new Set())=>{if(id===from.node)return true;if(seen.has(id))return false;seen.add(id);return graph.edges.filter(e=>e.from.node===id&&!['break','reset','open','close','toggle'].includes(e.to.pin)).some(e=>reaches(e.to.node,seen));};
  if(reaches(to.node))return {ok:false,reason:'이 프로토타입에서는 순환 연결을 지원하지 않아요.'};return {ok:true};
}
export function connect(graph,from,to){const result=canConnect(graph,from,to);if(!result.ok)return result;graph.edges=graph.edges.filter(e=>!(e.to.node===to.node&&e.to.pin===to.pin)&&!(e.from.node===from.node&&e.from.pin===from.pin&&effectivePins(graph.nodes.find(n=>n.id===from.node),'out',graph).find(p=>p.id===from.pin).type==='exec'));graph.edges.push({from:{...from},to:{...to}});return result;}
export function splitPin(graph,nodeId,direction,pinId,recombine=false){const n=graph.nodes.find(n=>n.id===nodeId);if(!n)return false;const pins=effectivePins(n,direction,graph),p=pins.find(p=>p.id===pinId)||pinForId(n,direction,graph,pinId),key=direction+':'+pinId;
  if(!recombine&&(!p||p.array||!fieldsFor(p.type).length))return false;n.splitPins=n.splitPins||[];if(recombine)n.splitPins=n.splitPins.filter(k=>k!==key&&!k.startsWith(key+'.'));else if(!n.splitPins.includes(key))n.splitPins.push(key);
  if(direction==='in'&&p){const fields=fieldsFor(p.type),value=n.inputValues?.[pinId]??defaultsFor(p.type);n.inputValues??={};if(recombine){const values=fields.map((f,i)=>n.inputValues[pinId+'.'+f.id]??(Array.isArray(value)?value[i]:value?.[f.id])??defaultsFor(f.type));n.inputValues[pinId]=Array.isArray(value)?values:Object.fromEntries(fields.map((f,i)=>[f.id,values[i]]));for(const id of Object.keys(n.inputValues))if(id.startsWith(pinId+'.'))delete n.inputValues[id];}else fields.forEach((f,i)=>n.inputValues[pinId+'.'+f.id]=Array.isArray(value)?value[i]:value?.[f.id]??defaultsFor(f.type));}
  graph.edges=graph.edges.filter(e=>{const end=direction==='out'?e.from:e.to;return !(end.node===nodeId&&(end.pin===pinId||end.pin.startsWith(pinId+'.')));});return true;
}

export const defaultTimeline={length:1,loop:false,autoplay:false,playRate:1,lastKeyframe:false,ignoreTimeDilation:false,tracks:[{id:'Alpha',name:'Alpha',type:'float',interpolation:'linear',keys:[{time:0,value:0},{time:1,value:1}]}]};
export const curveModes=['auto','user','break','linear','constant','step'];
export function validTimeline(t){
  return t&&Number.isFinite(t.length)&&t.length>0&&t.length<=10000&&typeof t.loop==='boolean'&&typeof t.autoplay==='boolean'&&['lastKeyframe','ignoreTimeDilation'].every(k=>t[k]===undefined||typeof t[k]==='boolean')&&(t.playRate===undefined||Number.isFinite(t.playRate)&&t.playRate>0&&t.playRate<=100)&&Array.isArray(t.tracks)&&t.tracks.length<=16&&new Set(t.tracks.map(t=>t?.id)).size===t.tracks.length&&t.tracks.every(track=>track&&/^[A-Za-z_][A-Za-z0-9_]{0,79}$/.test(track.id)&&!['update','finished','direction'].includes(track.id)&&typeof track.name==='string'&&track.name.length<=80&&['float','vec3','color','event'].includes(track.type)&&(track.type==='event'||curveModes.includes(track.interpolation))&&Array.isArray(track.keys)&&track.keys.length<=128&&track.keys.every((k,i)=>k&&Number.isFinite(k.time)&&k.time>=0&&k.time<=t.length&&(!i||track.keys[i-1].time<k.time)&&(track.type==='event'||validValue(track.type,k.value))&&(k.interpolation===undefined||curveModes.includes(k.interpolation))&&['arriveTangent','leaveTangent'].every(p=>k[p]===undefined||validValue(track.type,k[p]))));
}
export function timelineLength(t){return t.lastKeyframe?Math.max(.001,...t.tracks.flatMap(track=>track.keys.map(k=>k.time))):t.length;}
export function sampleTimeline(track,time){
  if(track.type==='event')return undefined;if(!track.keys.length)return defaultsFor(track.type);
  let i=track.keys.findLastIndex(k=>k.time<=time);if(i<0)return structuredClone(track.keys[0].value);const a=track.keys[i],b=track.keys[i+1],mode=a.interpolation||track.interpolation;
  if(!b||mode==='step'||mode==='constant')return structuredClone(a.value);const duration=b.time-a.time,u=Math.max(0,Math.min(1,(time-a.time)/duration));
  const value=(v,c)=>Array.isArray(v)?v[c]:v;
  const slope=(index,c)=>{const lo=track.keys[Math.max(0,index-1)],hi=track.keys[Math.min(track.keys.length-1,index+1)];return hi===lo?0:(value(hi.value,c)-value(lo.value,c))/(hi.time-lo.time);};
  const interpolate=(v,c)=>{const end=value(b.value,c);if(mode==='linear')return v+(end-v)*u;const m0=value(a.leaveTangent,c)??slope(i,c),m1=value(b.arriveTangent,c)??slope(i+1,c);return (2*u**3-3*u*u+1)*v+(u**3-2*u*u+u)*duration*m0+(-2*u**3+3*u*u)*end+(u**3-u*u)*duration*m1;};
  return Array.isArray(a.value)?a.value.map(interpolate):interpolate(a.value,0);
}
export function makeNode(key,x=40,y=40,variableId){return {id:'node_'+crypto.randomUUID().replaceAll('-',''),key,position:{x,y},splitPins:[],...(variableId?{variableId}:{}),...(key==='timeline'?{timeline:JSON.parse(JSON.stringify(defaultTimeline))}:{})};}
export function nodeTitle(n,graph){const v=graph.variables.find(v=>v.id===n.variableId),d=[...(graph.functions||[]),...(graph.macros||[])].find(d=>d.id===n.definitionId),native=n.key.startsWith('native')?nativeMember(graph,n):null,s=[...(graph.dispatchers||[]),...(graph.interfaces||[])].find(d=>d.id===n.symbolId);return n.title||(native?(n.key==='nativeGet'?'Get ':n.key==='nativeSet'?'Set ':n.key==='nativeEvent'?'Event ':'')+(n.key==='nativeMembers'?'Members · '+native.c?.name:native.f?.label||native.p?.name||'C++'):s?({dispatcherCall:'Call ',dispatcherBind:'Bind ',dispatcherUnbind:'Unbind ',dispatcherEvent:'Event ',interfaceCall:'Message '}[n.key])+s.name:n.key.endsWith('Input')?'Entry · 입력':n.key.endsWith('Output')?'Return · 출력':d?.name||((n.key==='getVariable'?'Get ':n.key==='setVariable'?'Set ':'')+(v?.name||catalog.find(s=>s.key===n.key)?.title||'Node')));}
export const defaultBlueprint={version:1,name:'BP_Garden',components:[{id:'transform',name:'Transform',type:'Transform'},{id:'mesh',name:'Mesh renderer',type:'MeshRenderer'},{id:'collider',name:'Box collider',type:'BoxCollider'}],variables:[
  {id:'hasKey',name:'hasKey',type:'bool',container:'single',value:false},{id:'doorName',name:'doorName',type:'string',container:'single',value:'GardenDoor'},
  {id:'targetPosition',name:'targetPosition',type:'vec3',container:'single',value:[0,0,0]},{id:'speed',name:'speed',type:'float',container:'single',value:3},{id:'waypoints',name:'waypoints',type:'vec3',container:'array',value:[[0,0,0],[1,0,1]]}],
  nodes:[{id:'begin',key:'beginPlay',position:{x:28,y:30},splitPins:[]},{id:'print',key:'print',position:{x:270,y:30},splitPins:[]},{id:'overlap',key:'beginOverlap',position:{x:28,y:205},splitPins:[]},{id:'branch',key:'branch',position:{x:270,y:205},splitPins:[]},{id:'door',key:'door',position:{x:512,y:205},splitPins:[]},{id:'tick',key:'tick',position:{x:28,y:410},splitPins:[]},{id:'location',key:'location',position:{x:512,y:410},splitPins:[]},{id:'getKey',key:'getVariable',variableId:'hasKey',position:{x:270,y:395},splitPins:[]}],
  edges:[{from:{node:'begin',pin:'then'},to:{node:'print',pin:'exec'}},{from:{node:'overlap',pin:'then'},to:{node:'branch',pin:'exec'}},{from:{node:'branch',pin:'true'},to:{node:'door',pin:'exec'}},{from:{node:'getKey',pin:'value'},to:{node:'branch',pin:'condition'}}],
  functions:[],macros:[],comments:[],construction:{nodes:[{id:'construction',key:'construction',position:{x:28,y:50},splitPins:[]}],edges:[],comments:[]}
};
// Earlier asset creation copied this exact example, including its implicit zero
// location. Only the unedited generated graph is removed from the runtime copy.
export function legacyTemplateConstruction(graph){
  const template={nodes:[{id:'construction',key:'construction',position:{x:28,y:50},splitPins:[]},{id:'setup',key:'setPosition',position:{x:290,y:50},splitPins:[]}],edges:[{from:{node:'construction',pin:'then'},to:{node:'setup',pin:'exec'}}],comments:[]};
  const same=(a,b)=>{if(Object.is(a,b))return true;if(!a||!b||typeof a!=='object'||typeof b!=='object'||Array.isArray(a)!==Array.isArray(b))return false;const keys=Object.keys(a);return keys.length===Object.keys(b).length&&keys.every(k=>Object.hasOwn(b,k)&&same(a[k],b[k]));};return same(graph,template);
}
// A view shares metadata, but writes node/link changes back to its own saved graph.
export function graphContext(root,view='event'){
  const target=view==='event'?root:view==='construction'?root.construction:[...(root.functions||[]),...(root.macros||[])].find(d=>d.id===view)?.graph;
  if(!target)return root;if(target===root)return root;
  return {variables:root.variables,components:root.components,functions:root.functions,macros:root.macros,native:root.native,settings:root.settings,inheritance:root.inheritance,parentNodes:root.nodes,parentConstruction:root.construction,dispatchers:root.dispatchers,interfaces:root.interfaces,get nodes(){return target.nodes;},set nodes(v){target.nodes=v;},get edges(){return target.edges;},set edges(v){target.edges=v;},get comments(){return target.comments||[];},set comments(v){target.comments=v;}};
}
export function allGraphContexts(root){return ['event',...(root.construction?['construction']:[]),...(root.functions||[]).map(d=>d.id),...(root.macros||[]).map(d=>d.id)].map(v=>graphContext(root,v));}
export function pasteNodes(root,view,clipboard,position){
  if(!clipboard||!Array.isArray(clipboard.nodes)||!clipboard.nodes.length||!Array.isArray(clipboard.edges))return {ok:false,reason:'복사한 노드가 없어요.'};
  const candidate=JSON.parse(JSON.stringify(root)),graph=graphContext(candidate,view);if(graph.nodes.length+clipboard.nodes.length>1000)return {ok:false,reason:'그래프의 노드 1000개 제한이에요.'};
  const ids=new Map(),left=Math.min(...clipboard.nodes.map(n=>n.position.x)),top=Math.min(...clipboard.nodes.map(n=>n.position.y));
  const nodes=clipboard.nodes.map(n=>{const next=JSON.parse(JSON.stringify(n));next.id=makeNode(n.key).id;ids.set(n.id,next.id);next.position={x:Math.max(-10000,Math.min(10000,position.x+n.position.x-left)),y:Math.max(-10000,Math.min(10000,position.y+n.position.y-top))};return next;});
  graph.nodes.push(...nodes);graph.edges.push(...clipboard.edges.map(e=>({from:{node:ids.get(e.from.node),pin:e.from.pin},to:{node:ids.get(e.to.node),pin:e.to.pin}})));
  if(!validBlueprint(candidate,{resolved:!!candidate.inheritance}))return {ok:false,reason:'이 그래프의 타입·이벤트·함수 규칙에 맞지 않는 노드예요.'};
  const original=graphContext(root,view);original.nodes=graph.nodes;original.edges=graph.edges;return {ok:true,nodes};
}
export function makeDefinition(root,kind,name){
  if(!['function','macro'].includes(kind)||!name?.trim()||name.length>80||[...(root.functions||[]),...(root.macros||[])].some(d=>d.name===name.trim()))return {ok:false,reason:'이름을 확인하세요.'};
  const id='def_'+crypto.randomUUID().replaceAll('-',''),entry={...makeNode(kind+'Input',35,50),definitionId:id},exit={...makeNode(kind+'Output',370,50),definitionId:id};
  const definition={id,name:name.trim(),inputs:[pin('exec','실행')],outputs:[pin('then','다음')],graph:{nodes:[entry,exit],edges:[{from:{node:entry.id,pin:'exec'},to:{node:exit.id,pin:'then'}}],comments:[]}};
  root[kind==='function'?'functions':'macros']??=[];root[kind==='function'?'functions':'macros'].push(definition);return {ok:true,definition};
}
export function makeComment(graph,ids,position={x:40,y:40}){
  const nodes=graph.nodes.filter(n=>ids.includes(n.id)),left=nodes.length?Math.min(...nodes.map(n=>n.position.x))-25:position.x,top=nodes.length?Math.min(...nodes.map(n=>n.position.y))-35:position.y;
  return {id:'comment_'+crypto.randomUUID().replaceAll('-',''),text:'주석',position:{x:Math.max(-10000,left),y:Math.max(-10000,top)},size:{width:nodes.length?Math.min(10000,Math.max(...nodes.map(n=>n.position.x+205))-left):360,height:nodes.length?Math.min(10000,Math.max(...nodes.map(n=>n.position.y+85+Math.max(effectivePins(n,'in',graph).length,effectivePins(n,'out',graph).length)*27))-top):190},color:'#657b59',fontSize:14,moveNodes:true,nodeIds:nodes.map(n=>n.id)};
}
export function collapseNodes(root,graph,ids,kind,name){
  const selected=new Set(ids),nodes=graph.nodes.filter(n=>selected.has(n.id));
  if(!['function','macro'].includes(kind)||!name?.trim()||name.length>80)return {ok:false,reason:'이름을 1~80자로 입력하세요.'};
  if(!nodes.length)return {ok:false,reason:'먼저 묶을 노드를 선택하세요.'};
  if(nodes.some(n=>catalog.find(s=>s.key===n.key)?.kind==='event'||['nativeEvent','dispatcherEvent'].includes(n.key)||n.key.endsWith('Input')||n.key.endsWith('Output')))return {ok:false,reason:'이벤트와 Entry / Return은 묶음 밖에 두세요.'};
  if(kind==='function'&&nodes.some(n=>['delay','retriggerDelay','callMacro'].includes(n.key)))return {ok:false,reason:'Delay·매크로 호출이 있는 흐름은 매크로로 묶어주세요.'};
  if([...(root.functions||[]),...(root.macros||[])].some(d=>d.name===name.trim()))return {ok:false,reason:'이미 있는 함수·매크로 이름이에요.'};
  const incoming=graph.edges.filter(e=>!selected.has(e.from.node)&&selected.has(e.to.node)),outgoing=graph.edges.filter(e=>selected.has(e.from.node)&&!selected.has(e.to.node));
  const inputs=[],outputs=[],inputMap=new Map(),outputMap=new Map();
  for(const e of incoming){const key=e.from.node+':'+e.from.pin;if(!inputMap.has(key)){const p=effectivePins(graph.nodes.find(n=>n.id===e.to.node),'in',graph).find(p=>p.id===e.to.pin);const port={...p,id:'in'+inputs.length};delete port.parent;inputs.push(port);inputMap.set(key,port.id);}}
  for(const e of outgoing){const key=e.from.node+':'+e.from.pin;if(!outputMap.has(key)){const p=effectivePins(graph.nodes.find(n=>n.id===e.from.node),'out',graph).find(p=>p.id===e.from.pin);const port={...p,id:'out'+outputs.length};delete port.parent;outputs.push(port);outputMap.set(key,port.id);}}
  // Open ports make a newly collapsed group useful even before wiring it externally.
  for(const n of nodes)for(const direction of ['in','out'])for(const p of effectivePins(n,direction,graph)){
    const connected=graph.edges.some(e=>{const end=direction==='in'?e.to:e.from;return end.node===n.id&&end.pin===p.id;});if(connected)continue;
    const ports=direction==='in'?inputs:outputs,map=direction==='in'?inputMap:outputMap,key=n.id+':'+p.id,port={...p,id:(direction==='in'?'in':'out')+ports.length};delete port.parent;ports.push(port);map.set(key,port.id);
  }
  if(inputs.length>30||outputs.length>30)return {ok:false,reason:'묶음의 입력·출력은 각각 30개까지 지원해요.'};
  if(kind==='function'&&(inputs.filter(p=>p.type==='exec').length>1||outputs.filter(p=>p.type==='exec').length>1))return {ok:false,reason:'여러 실행 입출력이 있는 흐름은 매크로로 묶어주세요.'};
  const id='def_'+crypto.randomUUID().replaceAll('-',''),x=Math.min(...nodes.map(n=>n.position.x)),y=Math.min(...nodes.map(n=>n.position.y));
  const inside=nodes.map(n=>({...structuredClone(n),position:{x:Math.min(10000,n.position.x-x+260),y:Math.min(10000,n.position.y-y+40)}})),right=Math.max(...inside.map(n=>n.position.x))+250;
  const entry={...makeNode(kind+'Input',30,40),definitionId:id},exit={...makeNode(kind+'Output',Math.min(10000,right),40),definitionId:id};
  const edges=graph.edges.filter(e=>selected.has(e.from.node)&&selected.has(e.to.node)).map(e=>structuredClone(e));
  for(const e of incoming)edges.push({from:{node:entry.id,pin:inputMap.get(e.from.node+':'+e.from.pin)},to:{...e.to}});
  for(const e of outgoing)if(!edges.some(x=>x.to.node===exit.id&&x.to.pin===outputMap.get(e.from.node+':'+e.from.pin)))edges.push({from:{...e.from},to:{node:exit.id,pin:outputMap.get(e.from.node+':'+e.from.pin)}});
  for(const n of nodes)for(const p of effectivePins(n,'in',graph)){const port=inputMap.get(n.id+':'+p.id);if(port)edges.push({from:{node:entry.id,pin:port},to:{node:n.id,pin:p.id}});}
  for(const n of nodes)for(const p of effectivePins(n,'out',graph)){const port=outputMap.get(n.id+':'+p.id);if(port&&!edges.some(e=>e.to.node===exit.id&&e.to.pin===port))edges.push({from:{node:n.id,pin:p.id},to:{node:exit.id,pin:port}});}
  const definition={id,name:name.trim(),inputs,outputs,graph:{nodes:[entry,...inside,exit],edges,comments:[]}};
  const call={...makeNode(kind==='function'?'callFunction':'callMacro',x,y),definitionId:id};
  const rewired=graph.edges.filter(e=>!selected.has(e.from.node)&&!selected.has(e.to.node));
  for(const e of incoming)if(!rewired.some(x=>x.to.node===call.id&&x.to.pin===inputMap.get(e.from.node+':'+e.from.pin)))rewired.push({from:{...e.from},to:{node:call.id,pin:inputMap.get(e.from.node+':'+e.from.pin)}});
  for(const e of outgoing)rewired.push({from:{node:call.id,pin:outputMap.get(e.from.node+':'+e.from.pin)},to:{...e.to}});
  const candidate={...graph,nodes:graph.nodes.filter(n=>!selected.has(n.id)).concat(call),edges:rewired,functions:[...(root.functions||[]),...(kind==='function'?[definition]:[])],macros:[...(root.macros||[]),...(kind==='macro'?[definition]:[])]};
  if(candidate.edges.some(e=>!canConnect({...candidate,edges:candidate.edges.filter(x=>x!==e)},e.from,e.to).ok))return {ok:false,reason:'선택 사이의 외부 노드 때문에 순환 연결이 생겨요. 중간 노드도 함께 선택하세요.'};
  root[kind==='function'?'functions':'macros']??=[];root[kind==='function'?'functions':'macros'].push(definition);graph.nodes=graph.nodes.filter(n=>!selected.has(n.id)).concat(call);graph.edges=rewired;
  return {ok:true,definition,call};
}
const safeId=s=>typeof s==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(s);
export const isBlueprintParent=s=>typeof s==='string'&&s.startsWith('Assets/')&&s.endsWith('.hbblueprint.json')&&s.length<=1000&&!/[\\:\x00-\x1f]/.test(s)&&s.split('/').every(p=>p&&p!=='.'&&p!=='..');
export function boundedBlueprintValue(value,budget={left:200000},depth=0){if(--budget.left<0||depth>6)return false;if(value===null||typeof value==='boolean')return true;if(typeof value==='number')return Number.isFinite(value);if(typeof value==='string')return value.length<=100000;if(Array.isArray(value))return value.length<=65536&&value.every(v=>boundedBlueprintValue(v,budget,depth+1));return !!value&&typeof value==='object'&&Object.keys(value).length<=128&&Object.entries(value).every(([k,v])=>k.length<=200&&!['__proto__','prototype','constructor'].includes(k)&&boundedBlueprintValue(v,budget,depth+1));}
export function validBlueprint(g,{resolved=false}={}){
  if(g?.inheritance!==undefined&&!resolved)return false;
  const deferred=(isBlueprintParent(g?.settings?.parentClass)||validNativeReference(g?.native))&&!resolved;
  const unresolvedNode=n=>deferred&&(['getVariable','setVariable'].includes(n.key)&&safeId(n.variableId)&&!g.variables.some(v=>v.id===n.variableId)||['nativeCall','nativeEvent','nativeGet','nativeSet','nativeMembers'].includes(n.key)&&typeof n.nativeId==='string'&&/^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)?$/.test(n.nativeId)&&n.nativeId.length<=200&&!nativeMember(g,n).c||['callFunction','callMacro'].includes(n.key)&&safeId(n.definitionId)&&![...(g.functions||[]),...(g.macros||[])].some(d=>d.id===n.definitionId)||['dispatcherCall','dispatcherBind','dispatcherUnbind','dispatcherEvent','interfaceCall'].includes(n.key)&&safeId(n.symbolId)&&![...(g.dispatchers||[]),...(g.interfaces||[])].some(d=>d.id===n.symbolId)||n.key==='callParent'&&(safeId(n.parentFunctionId)||n.parentEvent&&typeof n.parentEvent.key==='string'&&boundedBlueprintValue(n.parentEvent)));
  if(!g||g.version!==1||typeof g.name!=='string'||g.name.length>200||!Array.isArray(g.nodes)||g.nodes.length>1000||!Array.isArray(g.variables)||g.variables.length>100||!Array.isArray(g.components)||g.components.length>100||!Array.isArray(g.edges)||g.edges.length>5000)return false;
  if(new Set(g.nodes.map(n=>n?.id)).size!==g.nodes.length||new Set(g.variables.map(v=>v?.id)).size!==g.variables.length||new Set(g.variables.map(v=>v?.name)).size!==g.variables.length)return false;
  if(!g.variables.every(v=>v&&safeId(v.id)&&typeof v.name==='string'&&v.name.length>0&&v.name.length<=80&&Object.hasOwn(variableTypes,v.type)&&['single','array'].includes(v.container)&&(v.container==='array'?Array.isArray(v.value)&&v.value.length<=128&&v.value.every(x=>validValue(v.type,x)):validValue(v.type,v.value))))return false;
  if(!validComponents(g.components))return false;
  if(g.native!==undefined&&!validNative(g.native,validValue))return false;
  if(g.native?.header!==undefined&&(typeof g.native.header!=='string'||g.native.header.length>100000))return false;
  if(g.settings?.inputMapping!==undefined&&(typeof g.settings.inputMapping!=='string'||g.settings.inputMapping.length>1000||g.settings.inputMapping.includes('..')))return false;
  if(g.settings?.nativeDefaults!==undefined){const values=g.settings.nativeDefaults;if(!values||typeof values!=='object'||Array.isArray(values)||Object.keys(values).length>100)return false;for(const [key,value] of Object.entries(values)){const {p}=nativeMember(g,{nativeId:key});if(!p?!(deferred&&/^[A-Za-z_][A-Za-z0-9_]*\.[A-Za-z_][A-Za-z0-9_]*$/.test(key)&&key.length<=200&&boundedBlueprintValue(value)):p.array?!(Array.isArray(value)&&value.length<=128&&value.every(v=>validValue(p.type,v))):!validValue(p.type,value))return false;}}
  for(const key of ['variableDefaults','componentOverrides'])if(g.settings?.[key]!==undefined){const values=g.settings[key];if(!values||Array.isArray(values)||typeof values!=='object'||Object.keys(values).length>100||!Object.entries(values).every(([id,value])=>safeId(id)&&boundedBlueprintValue(value)))return false;if(!deferred&&!resolved)return false;}
  if(g.watches!==undefined&&(!Array.isArray(g.watches)||g.watches.length>100||!g.watches.every(w=>w&&safeId(w.view)&&safeId(w.node)&&['in','out'].includes(w.direction)&&typeof w.pin==='string'&&/^[A-Za-z0-9_.-]{1,100}$/.test(w.pin))))return false;
  if(g.settings!==undefined&&(!g.settings||typeof g.settings!=='object'||(g.settings.parentClass!==undefined&&!deferred&&![...Object.keys(blueprintClasses),...(g.native?.classes.filter(c=>c.blueprintable).map(c=>c.name)||[])].includes(g.settings.parentClass))||['tickEnabled','overlapEnabled'].some(k=>g.settings[k]!==undefined&&typeof g.settings[k]!=='boolean')||(g.settings.tickInterval!==undefined&&(!Number.isFinite(g.settings.tickInterval)||g.settings.tickInterval<0||g.settings.tickInterval>10000))))return false;
  const definitions=[...(Array.isArray(g.functions)?g.functions:[]),...(Array.isArray(g.macros)?g.macros:[])];
  for(const key of ['functions','macros'])if(g[key]!==undefined&&(!Array.isArray(g[key])||g[key].length>50))return false;
  const validPorts=ports=>Array.isArray(ports)&&ports.length<=30&&new Set(ports.map(p=>p?.id)).size===ports.length&&ports.every(p=>p&&safeId(p.id)&&typeof p.label==='string'&&p.label.length<=80&&(p.type==='exec'||p.type==='any'||Object.hasOwn(variableTypes,p.type))&&typeof p.array==='boolean'&&!(p.type==='exec'&&p.array));
  for(const key of ['dispatchers','interfaces'])if(g[key]!==undefined&&(!Array.isArray(g[key])||g[key].length>50||new Set(g[key].map(d=>d?.id)).size!==g[key].length||!g[key].every(d=>d&&safeId(d.id)&&typeof d.name==='string'&&d.name.length>0&&d.name.length<=80&&validPorts(d.inputs)&&validPorts(d.outputs)&&![...d.inputs,...d.outputs].some(p=>p.type==='exec'||['exec','then','target','event'].includes(p.id))&&(key!=='dispatchers'||d.outputs.length===0))))return false;
  const symbols=[...(g.dispatchers||[]),...(g.interfaces||[])];if(new Set(symbols.map(d=>d.id)).size!==symbols.length)return false;
  const validNativeNode=n=>{const {c,f,p}=nativeMember(g,n);return n.key==='nativeMembers'?!!c:n.key==='nativeCall'?!!f:n.key==='nativeEvent'?!!f&&f.event!=='none'&&c.name===g.settings?.parentClass:n.key==='nativeGet'?!!p:n.key==='nativeSet'?!!p&&!p.readOnly:false;};
  const validSymbolNode=n=>n.key==='interfaceCall'?(g.interfaces||[]).some(d=>d.id===n.symbolId):['dispatcherCall','dispatcherBind','dispatcherUnbind','dispatcherEvent'].includes(n.key)&&(g.dispatchers||[]).some(d=>d.id===n.symbolId);
  if(new Set(definitions.map(d=>d?.id)).size!==definitions.length||new Set(definitions.map(d=>d?.name)).size!==definitions.length||!definitions.every(d=>d&&safeId(d.id)&&typeof d.name==='string'&&d.name.length>0&&d.name.length<=80&&validPorts(d.inputs)&&validPorts(d.outputs)&&d.graph))return false;
  for(const context of allGraphContexts(g)){
    if(!Array.isArray(context.nodes)||context.nodes.length>1000||!Array.isArray(context.edges)||context.edges.length>5000||new Set(context.nodes.map(n=>n?.id)).size!==context.nodes.length)return false;
    if(context.comments!==undefined&&(!Array.isArray(context.comments)||context.comments.length>100||new Set(context.comments.map(c=>c?.id)).size!==context.comments.length||!context.comments.every(c=>c&&safeId(c.id)&&typeof c.text==='string'&&c.text.length<=2000&&c.position&&['x','y'].every(k=>Number.isFinite(c.position[k])&&Math.abs(c.position[k])<=10000)&&c.size&&Number.isFinite(c.size.width)&&c.size.width>=120&&c.size.width<=10000&&Number.isFinite(c.size.height)&&c.size.height>=80&&c.size.height<=10000&&/^#[0-9a-f]{6}$/i.test(c.color)&&Number.isFinite(c.fontSize)&&c.fontSize>=10&&c.fontSize<=32&&typeof c.moveNodes==='boolean'&&Array.isArray(c.nodeIds)&&c.nodeIds.length<=1000&&c.nodeIds.every(safeId))))return false;
    if(!context.nodes.every(n=>n&&safeId(n.id)&&typeof n.key==='string'&&(catalog.some(s=>s.key===n.key)||validNativeNode(n)||validSymbolNode(n)||(['getVariable','setVariable'].includes(n.key)&&(g.variables.some(v=>v.id===n.variableId)||deferred&&safeId(n.variableId)))||(['callFunction','callMacro','functionInput','functionOutput','macroInput','macroOutput'].includes(n.key)&&(definitions.some(d=>d.id===n.definitionId)||deferred&&safeId(n.definitionId)))||unresolvedNode(n)&&(!n.key.startsWith('native')||typeof n.nativeId==='string'&&/^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)?$/.test(n.nativeId)&&n.nativeId.length<=200))&&n.position&&['x','y'].every(k=>Number.isFinite(n.position[k])&&Math.abs(n.position[k])<=10000)&&Array.isArray(n.splitPins)&&n.splitPins.length<=30&&n.splitPins.every(k=>typeof k==='string'&&/^(in|out):[a-zA-Z0-9_.-]+$/.test(k))&&(n.title===undefined||(typeof n.title==='string'&&n.title.length<=80))))return false;
    for(const n of context.nodes){if(n.key==='parentEntry'&&(!resolved||!catalog.some(s=>s.key===n.parentKey&&s.kind==='event')&&n.parentKey!=='nativeEvent'&&n.parentKey!=='dispatcherEvent'))return false;if(n.key==='callParent'&&(!deferred&&!resolved||resolved&&!safeId(n.parentEntryId)&&!safeId(n.parentDefinitionId)))return false;if(n.key==='callFunction'&&!(g.functions||[]).some(d=>d.id===n.definitionId)&&!deferred)return false;if(n.key==='callMacro'&&!(g.macros||[]).some(d=>d.id===n.definitionId)&&!deferred)return false;}
    for(const n of context.nodes){
      if(n.key==='inputAction'&&(!['bool','float','vec2','vec3'].includes(n.valueType||'bool')||(n.options?.action!==undefined&&(typeof n.options.action!=='string'||n.options.action.length>1000))))return false;
      if(n.key==='timeline'&&(context!==g||!validTimeline(n.timeline)))return false;
      if(n.array!==undefined&&typeof n.array!=='boolean')return false;
      if(n.valueType!==undefined&&!Object.hasOwn(variableTypes,n.valueType))return false;
      if(n.comment!==undefined&&(typeof n.comment!=='string'||n.comment.length>2000))return false;
      if(['enabled','breakpoint'].some(k=>n[k]!==undefined&&typeof n[k]!=='boolean'))return false;
      if(n.options!==undefined&&(!n.options||typeof n.options!=='object'||(n.options.tickInterval!==undefined&&(!Number.isFinite(n.options.tickInterval)||n.options.tickInterval<0||n.options.tickInterval>10000))||['componentId','key','eventName'].some(k=>n.options[k]!==undefined&&(typeof n.options[k]!=='string'||n.options[k].length>80))))return false;
      if(n.inputValues!==undefined){if(!n.inputValues||typeof n.inputValues!=='object'||Array.isArray(n.inputValues)||Object.keys(n.inputValues).length>30)return false;for(const [id,value] of Object.entries(n.inputValues)){const p=pinForId(n,'in',context,id);if(!p?!(unresolvedNode(n)&&/^[A-Za-z0-9_.-]{1,100}$/.test(id)&&boundedBlueprintValue(value)):p.type==='exec'||(p.array?!(Array.isArray(value)&&value.length<=128&&value.every(v=>p.type==='any'||validValue(p.type,v))):!validValue(p.type,value)))return false;}}
    }
    for(const n of context.nodes)for(const key of ['customInputs','customOutputs'])if(n[key]!==undefined&&(!['customEvent','customFunction'].includes(n.key)||!Array.isArray(n[key])||n[key].length>20||!n[key].every(p=>p&&safeId(p.id)&&typeof p.label==='string'&&p.label.length<=80&&Object.hasOwn(variableTypes,p.type)&&typeof p.array==='boolean')))return false;
    for(const n of context.nodes)for(const direction of ['in','out']){const pins=basePins(n,direction,context);if(new Set(pins.map(p=>p.id)).size!==pins.length)return false;}
    const usedInputs=new Set(),usedExec=new Set();
    for(const e of context.edges){if(!e?.from||!e?.to||!['from','to'].every(k=>safeId(e[k].node)&&typeof e[k].pin==='string'&&/^[A-Za-z0-9_.-]{1,100}$/.test(e[k].pin)))return false;const inputKey=e.to.node+':'+e.to.pin;if(usedInputs.has(inputKey))return false;usedInputs.add(inputKey);const a=context.nodes.find(n=>n.id===e.from.node),b=context.nodes.find(n=>n.id===e.to.node);if(!a||!b||a===b)return false;const result=canConnect({...context,edges:context.edges.filter(x=>x!==e)},e.from,e.to);if(!result.ok&&!(deferred&&result.reason==='연결할 핀을 찾을 수 없어요.'&&(unresolvedNode(a)||unresolvedNode(b))))return false;const p=effectivePins(a,'out',context).find(p=>p.id===e.from.pin);if(p?.type==='exec'){const k=e.from.node+':'+e.from.pin;if(usedExec.has(k))return false;usedExec.add(k);}}
  }
  for(const [collection,kind] of [['functions','function'],['macros','macro']])for(const d of g[collection]||[]){
    if(!['Input','Output'].every(s=>d.graph.nodes.filter(n=>n.key===kind+s&&n.definitionId===d.id).length===1))return false;
    if(d.graph.nodes.some(n=>catalog.find(s=>s.key===n.key)?.kind==='event'||['nativeEvent','dispatcherEvent'].includes(n.key)))return false;
    if(d.pure!==undefined&&typeof d.pure!=='boolean')return false;
    if(d.pure&&[...d.inputs,...d.outputs].some(p=>p.type==='exec'))return false;
    if(kind==='function'&&(d.inputs.filter(p=>p.type==='exec').length>1||d.outputs.filter(p=>p.type==='exec').length>1||d.graph.nodes.some(n=>['delay','retriggerDelay','callMacro'].includes(n.key))))return false;
  }
  return true;
}
