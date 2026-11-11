// 엔진 플레이어(prototype/*) 수정 목록: Windows 패키지·안드로이드 APK·웹 빌드가 같은 수정을 쓴다 (엔진 설치본은 건드리지 않음, docs/엔진_요청_UI입력.md)
//   1) 그림·글자(Image·Text) 위젯이 클릭을 받아 게임 화면(canvas)까지 안 감 → 타이틀 그림을 눌러도 시작 안 됨
//   2) 클릭으로 포커스를 가진 위젯이 모든 키를 삼킴 (keydown stopPropagation) → 그 뒤로 키보드가 안 먹음
//   3) Esc를 플레이어 기본 일시정지 창이 가로챔 → 게임 메뉴로 넘김
//   4·5) 키가 눌린 채로 남아 혼자 걸어가던 문제, 장면을 넘을 때 눌린 입력(키·조이스틱)을 넘기던 문제
//   6) 엔진 기본 일시정지 버튼(화면 오른쪽 위 동그라미)은 게임 메뉴와 겹치므로 숨김. 인트로부터 계속 떠 있었음
import fs from 'node:fs/promises';
import path from 'node:path';

export async function playerPatches(projectDir) {
  // 마우스 포인터를 게임 조준점으로 (tools/make_cursor.py, 가운데 16,16이 찍는 곳)
  const cursor = (await fs.readFile(path.join(projectDir, 'Assets/UI/cursor_crosshair.png'))).toString('base64');
  return {
    'prototype/ui-runtime.css': [['.hb-ui-Spacer{pointer-events:none}', '.hb-ui-Spacer,.hb-ui-Image,.hb-ui-Text{pointer-events:none}#pause-toggle{display:none!important}'
      + `@media (pointer:fine){html,body,*{cursor:url(data:image/png;base64,${cursor}) 16 16,crosshair!important}}.hb-ui-Text{display:flex;align-items:center}.hb-ui-Text[style*="text-align: center"]{justify-content:center}.hb-ui-Text[style*="text-align: right"]{justify-content:flex-end}.hb-ui-Text[data-widget-name="DialogText"]{align-items:flex-start}.hb-ui-element:focus,.hb-ui-element:focus-visible{outline:none!important}.hb-ui-TouchButton,.hb-ui-Button{box-shadow:none!important}.hb-ui-Image>img{display:block}`]],
    'prototype/ui-runtime.js': [[
      "control.addEventListener('keydown',e=>{e.stopPropagation();if(e.key==='Enter'&&node.type==='TextInput')signal('submit');});",
      "control.addEventListener('keydown',e=>{if(node.type!=='TextInput')return;e.stopPropagation();if(e.key==='Enter')signal('submit');});"]],
    'prototype/player.js': [
      ["if(e.key==='Escape'&&kiosk.enabled&&!operatorMenu){e.preventDefault();return;}if(e.key==='Escape'){e.preventDefault();releaseKeys();if(menu.open)menu.close();else{menu.showModal();services?.pauseAudio(true)?.catch(fail);}return;}",
        "if(e.key==='Escape'&&menu.open){e.preventDefault();menu.close();return;}"],
      // 4) 누를 때·뗄 때 e.key로 짝을 맞춤 → Shift·한글 입력 상태면 이름이 달라져 뗀 키가 남음. 물리 키(e.code)로 짝을 맞춘다
      ["held=new Set()", "held=new Set(),heldName=new Map()"],
      ["if(!e.repeat&&!held.has(e.key)){held.add(e.key);vm?.input(e.key,1).catch(fail);}",
        "{const k=/^Key[A-Z]$/.test(e.code)?e.code.slice(3).toLowerCase():/^Digit[0-9]$/.test(e.code)?e.code.slice(5):e.code==='Space'?' ':(e.key&&e.key!=='Unidentified'?e.key:e.code),c=e.code||e.key;if(!k||!c)return;if(!e.repeat&&!held.has(c)){held.add(c);heldName.set(c,k);vm?.input(k,1).catch(fail);}}"],
      ["document.addEventListener('keyup',e=>{if(held.delete(e.key)){e.preventDefault();vm?.input(e.key,0).catch(fail);}});",
        "document.addEventListener('keyup',e=>{const c=e.code||e.key;if(held.delete(c)){e.preventDefault();vm?.input(heldName.get(c)??e.key,0).catch(fail);heldName.delete(c);}});"],
      // 5) 장면을 넘을 때 눌린 입력을 그대로 넘김 → 로딩 중에 뗀 키·조이스틱은 해제가 사라져 새 장면에서 혼자 걷거나 벽에 붙음
      ["const carriedInput=vm?.active?vm.inputState:undefined;", "const carriedInput=undefined;held.clear();heldName.clear();"],
      // 6) 엔진 기본 일시정지 버튼 숨김 (터치 기기에선 CSS display:grid가 hidden을 덮어써 ui-runtime.css에서도 숨김). 운영자 메뉴(Ctrl+Alt+Shift+Q)는 그대로
      ["if(kiosk.enabled){$('#quit').hidden=true;$('#fullscreen').hidden=true;$('#pause-toggle').hidden=true;}",
        "$('#pause-toggle').hidden=true;if(kiosk.enabled){$('#quit').hidden=true;$('#fullscreen').hidden=true;}"],
      // 7) 그래픽카드 없는 기기에서 버벅임: 도트 게임이라 화면 배율(휴대폰 2배)·안티에일리어싱 없이 그림 → 그릴 픽셀 1/4. 엔진 88db6de는 여기서 렌더러를 만듦
      [RENDERER, RENDERER_LIGHT, 'optional'],
    ],
    // 7) 엔진 dcc7dfb부터는 렌더러를 이 파일에서 만듦 (웹·APK)
    'prototype/game-renderer.js': [['new THREE.WebGLRenderer({canvas,antialias:true})', 'new THREE.WebGLRenderer({canvas,antialias:false,powerPreference:"high-performance"})'],
      ['renderer.setPixelRatio(Math.min(devicePixelRatio,2));', 'renderer.setPixelRatio(1);', 'all']],  // 엔진 fc0a71a부터 d3d11·WebGL 두 경로 → 둘 다 (휴대폰은 WebGL)
    // 10) 소리 하나마다 음량계가 4096개 표본을 자바스크립트로 훑음 (휴대폰 측정 1.3%). 최고 음량만 보므로 256개로 (약 5ms 구간)
    'prototype/audio-mixer.js': [['meter.fftSize=4096;', 'meter.fftSize=256;', 'optional']],
    // 9) 스프라이트 애니메이션·타일맵 자료를 매 물리 단계마다 처음부터 다시 검사 (휴대폰 측정 4~5%). 같은 자료 객체는 한 번 통과하면 기억
    'prototype/two-d-assets.js': [['export function valid2DAsset(kind,data){',
      'const hbValidAssets=new WeakMap();export function valid2DAsset(kind,data){if(!data||typeof data!=="object")return hbValid2DAsset(kind,data);if(hbValidAssets.get(data)===kind)return true;const ok=hbValid2DAsset(kind,data);if(ok)hbValidAssets.set(data,kind);return ok;}function hbValid2DAsset(kind,data){']],
    // 8·11·12·15) 스프라이트 복제 텍스처 재업로드·위치만 바뀐 물체의 스프라이트 재비교·소리 장치 없는 PC는 엔진 9790ee7(11/10)부터 엔진이 직접 처리하므로 뺌
    // 13·18) UI 전송(PNG 압축)·움직이는 타이틀 그림 수정은 엔진 3dcb5bd부터 엔진이 바뀐 영역만 보내므로 뺌
    // 19) 대기 중인 적(화면 밖 예비 해골·눈알 30여 마리)의 게임플레이 기록에 값이 undefined인 칸(blackboard·parameters)이 있어
    //     전송 기록(JSON 사본엔 그 칸이 없음)과 칸 수가 달라 '안 바뀜' 판정이 늘 실패 → 매 프레임 그대로 다시 직렬화 (보스방 바뀐 줄의 절반)
    //     없는 값은 null로 (JSON으로는 같은 값)
    'prototype/gameplay-runtime.js': [['blackboard:brains.get(id)?.board.snapshot(),blackboardAsset:brains.get(id)?.asset.blackboard,', 'blackboard:brains.get(id)?.board.snapshot()??null,blackboardAsset:brains.get(id)?.asset.blackboard??null,'],
      ['parameters:machines.get(id)?.board.snapshot(),', 'parameters:machines.get(id)?.board.snapshot()??null,']],
    // 17) 엔진 3b0ed24부터 글씨 줄바꿈은 엔진(widget-visual-contract)이 함. 행사판처럼 글 칸(Text)은 세로 가운데에 (웹뷰 CSS 1번과 같음),
    //     대화창 본문처럼 위에서부터 쓸 칸은 위젯 속성 verticalAlign: "top" (tools/gen_hud.py가 넣음)
    'tools/native-widget-paint.mjs': [["const centered=['Button','TouchButton','CheckBox','TextInput'].includes(type)", "const centered=['Button','TouchButton','CheckBox','TextInput'].includes(type)||type==='Text'&&p.verticalAlign!=='top'"]],

    // 14) 네이티브: UI를 가진 물체(UI_HUD 등, 한 줄 128KB)는 UI가 한 번 바뀌면 전송 기록의 UI가 복사본이 되어 '안 바뀜' 판정이 매 프레임 실패
    //     → 매 프레임 128KB 줄을 다시 만들고 비교. 전송 기록에도 원래의 바뀌지 않는 UI 스냅샷을 다시 연결 (내용은 같은 JSON에서 나와 동일)
    'prototype/native-transport.js': [['if(!packet){next=current;sequence=1;packet={...request,objects:next,worldTransport:1,worldId:this.id,baseSequence:0,worldSequence:sequence};}',
      'if(!packet){next=current;sequence=1;packet={...request,objects:next,worldTransport:1,worldId:this.id,baseSequence:0,worldSequence:sequence};}'
      + 'for(let i=0;i<next.length;i++){const u=request.objects[i]?.gameplayDebug?.ui,g=next[i]?.gameplayDebug;if(u&&g&&g.ui!==u&&rows[i]!=="null"&&immutableNodes.has(u)&&!Object.isFrozen(g))g.ui=u;}']],
    'tools/native-game-runner.mjs': [
      // 16) 오류 기록·오류 창 (tools/package_extra/hb-crash-log.mjs, package.mjs가 패키지에 넣음). 다른 모듈보다 먼저 읽혀야 함
      ["import readline from 'node:readline';", "import './hb-crash-log.mjs';import readline from 'node:readline';"]],
  };
}
const RENDERER = 'new THREE.WebGLRenderer({canvas,antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));';
const RENDERER_LIGHT = 'new THREE.WebGLRenderer({canvas,antialias:false,powerPreference:"high-performance"});renderer.setPixelRatio(1);';

export function applyPatches(name, text, patches) {
  for (const [from, to, mode] of patches[name] || []) {
    if (!text.includes(from)) { if (mode === 'optional') continue; throw Error(`엔진이 바뀌어 패치 위치를 못 찾음: ${name} — docs/엔진_요청_UI입력.md 확인`); }
    text = mode === 'all' ? text.split(from).join(to) : text.replace(from, to);  // all: 같은 코드가 여러 곳이면 모두
  }
  return text;
}
