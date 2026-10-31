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
    // 8) 그림(스프라이트)이 바뀔 때마다 그림 파일 전체를 그래픽카드로 다시 올림 (휴대폰 측정에서 CPU의 7~8%, 1280x512 모음은 한 번에 2.6MB)
    //    엔진은 그림을 바꿀 때 원본 텍스처를 복제하는데, three.js 복제(copy)와 needsUpdate가 원본 이미지 버전을 올려 다시 올리게 함 → 복제가 올린 버전을 되돌림
    //    그리고 바로 앞 복제를 한 장 더 붙잡아 둬 그래픽카드 쪽 텍스처가 0번 쓰임이 되어 지워졌다 다시 올라가지 않게 함 (물체가 사라질 때 같이 지움)
    // 10) 소리 하나마다 음량계가 4096개 표본을 자바스크립트로 훑음 (휴대폰 측정 1.3%). 최고 음량만 보므로 256개로 (약 5ms 구간)
    'prototype/audio-mixer.js': [['meter.fftSize=4096;', 'meter.fftSize=256;', 'optional']],
    // 9) 스프라이트 애니메이션·타일맵 자료를 매 물리 단계마다 처음부터 다시 검사 (휴대폰 측정 4~5%). 같은 자료 객체는 한 번 통과하면 기억
    'prototype/two-d-assets.js': [['export function valid2DAsset(kind,data){',
      'const hbValidAssets=new WeakMap();export function valid2DAsset(kind,data){if(!data||typeof data!=="object")return hbValid2DAsset(kind,data);if(hbValidAssets.get(data)===kind)return true;const ok=hbValid2DAsset(kind,data);if(ok)hbValidAssets.set(data,kind);return ok;}function hbValid2DAsset(kind,data){']],
    'prototype/scene-rendering.js': [
      ['const map=base.clone();map.needsUpdate=true;', 'const map=base.clone();map.source.version--;map.userData.hbSpriteClone=true;'],
      ['function release(group,resource){if(group.userData.resources?.delete(resource))resource.dispose();}',
        'function release(group,resource){if(resource?.userData?.hbSpriteClone&&group.userData.resources?.has(resource)){const kept=group.userData.hbKeptClone;group.userData.hbKeptClone=resource;if(kept&&kept!==resource&&group.userData.resources.delete(kept))kept.dispose();return;}if(group.userData.resources?.delete(resource))resource.dispose();}'],
    ],
    // 12) 네이티브: 그래픽카드 텍스처를 텍스처 객체(uuid)마다 따로 올림 → 그림이 바뀔 때마다 생기는 복제(8번)가 그림 모음 전체를 새로 인코딩·업로드(보스방 1800프레임에 3033번, 이게 프레임 튐의 주원인). 복제는 원본 이미지(source)·설정이 같으면 한 텍스처를 같이 씀
    //     ponytail: 같이 쓰는 텍스처는 게임 끝날 때까지 안 지움 (그림 모음 수만큼만, 장면마다 몇 MB). 메모리가 문제면 복제 수를 세서 해제
    'prototype/native-scene-renderer.js': [['function textureResource(texture,resources,allowUV1=false){',
      'function hbTexKey(t,u){return t.userData.hbSpriteClone?["hbs",t.source.uuid,t.colorSpace,t.flipY,t.generateMipmaps,t.format,t.type,t.channel,t.wrapS,t.wrapT,t.magFilter,t.minFilter,u?1:0].join(":"):t.uuid;}'
      + 'function textureResource(texture,resources,allowUV1=false){'],
      ['const key=texture.uuid;if(textures.get(key)!==texture.version){',
        'const key=hbTexKey(texture,allowUV1),hbVer=texture.userData.hbSpriteClone?texture.source.version:texture.version;if(textures.get(key)!==hbVer){'],
      ["track(texture,'textures',key,textures);", "if(key===texture.uuid)track(texture,'textures',key,textures);"],
      ['textures.set(key,texture.version);', 'textures.set(key,hbVer);']],
    // 13) 네이티브: UI(체력·글자·배너)가 바뀔 때마다 화면 크기 UI 전체를 PNG로 압축해 보냄. 기본 압축이 1280x720에 23ms → 보스전 프레임 튐의 주원인
    //     (지역 이름 배너가 사라지는 1초 동안 매 프레임). 같은 PNG를 가장 빠른 압축(zlib 1)으로 만들어 3ms
    'tools/native-widget-layer.mjs': [["import path from 'node:path';", "import path from 'node:path';"+FAST_PNG],
      ["png:(await canvas.encode('png')).toString('base64')", "png:hbFastPng(canvas).toString('base64')"],
      // 17) 글씨를 웹뷰(어제 행사판)와 같게: 웹뷰는 칸보다 긴 글을 다음 줄로 넘기고(pre-wrap) 칸 밖으로도 그리는데, 네이티브는 한 줄에 우겨 넣어
      //     글자가 납작해지고 칸에서 잘렸음. 대화창 본문은 웹뷰처럼 위에서부터 (tools/player_patches.mjs 1번 CSS의 DialogText)
      ["ctx.save();ctx.beginPath();ctx.rect(0,0,w,h);ctx.clip();const lines=String(p.text||(node.type==='TextInput'?p.placeholder:'')).split('\\n');for(let i=0;i<lines.length;i++)ctx.fillText(lines[i],tx,h/2+(i-(lines.length-1)/2)*p.fontSize*scale*1.2,Math.max(1,w-offset*2));ctx.restore();",
        "ctx.save();const hbMax=Math.max(1,w-offset*2),hbLh=p.fontSize*scale*1.2,lines=[];"
        + "for(const raw of String(p.text||(node.type==='TextInput'?p.placeholder:'')).split('\\n')){if(p.wrap===false){lines.push(raw);continue;}let line='';"
        + "for(const tok of raw.match(/\\s+|[\\uac00-\\ud7a3\\u3130-\\u318f]|[^\\s\\uac00-\\ud7a3\\u3130-\\u318f]+/g)||['']){const next=line+tok;if(line.trim()&&ctx.measureText(next).width>hbMax){lines.push(line.trimEnd());line=tok.trimStart();}else line=next;}lines.push(line);}"
        + "const hbTop=node.name==='DialogText'?p.padding*scale+hbLh/2:h/2-(lines.length-1)/2*hbLh;"
        + "for(let i=0;i<lines.length;i++)ctx.fillText(lines[i],tx,hbTop+i*hbLh);ctx.restore();"]],
    // 14) 네이티브: UI를 가진 물체(UI_HUD 등, 한 줄 128KB)는 UI가 한 번 바뀌면 전송 기록의 UI가 복사본이 되어 '안 바뀜' 판정이 매 프레임 실패
    //     → 매 프레임 128KB 줄을 다시 만들고 비교. 전송 기록에도 원래의 바뀌지 않는 UI 스냅샷을 다시 연결 (내용은 같은 JSON에서 나와 동일)
    'prototype/native-transport.js': [['if(!packet){next=current;sequence=1;packet={...request,objects:next,worldTransport:1,worldId:this.id,baseSequence:0,worldSequence:sequence};}',
      'if(!packet){next=current;sequence=1;packet={...request,objects:next,worldTransport:1,worldId:this.id,baseSequence:0,worldSequence:sequence};}'
      + 'for(let i=0;i<next.length;i++){const u=request.objects[i]?.gameplayDebug?.ui,g=next[i]?.gameplayDebug;if(u&&g&&g.ui!==u&&rows[i]!=="null"&&immutableNodes.has(u)&&!Object.isFrozen(g))g.ui=u;}']],
    // 15) 네이티브: 소리 출력 장치가 없는 PC(스피커·이어폰 없음, 원격 접속)에서 AudioContext 생성이 실패하면 게임이 바로 꺼짐 (빨간 오류 창)
    //     → 실패하면 소리 없이(sinkId none) 시작
    'tools/native-game-runner.mjs': [["const createContext=()=>new AudioContext({sampleRate:48000,latencyHint:'interactive',...(options.silent?{sinkId:{type:'none'}}:{})});",
      "const createContext=()=>{try{return new AudioContext({sampleRate:48000,latencyHint:'interactive',...(options.silent?{sinkId:{type:'none'}}:{})});}catch(error){console.error('소리 장치 없음, 소리 없이 시작:',error?.message);return new AudioContext({sampleRate:48000,latencyHint:'interactive',sinkId:{type:'none'}});}};"],
      // 16) 오류 기록·오류 창 (tools/package_extra/hb-crash-log.mjs, package.mjs가 패키지에 넣음). 다른 모듈보다 먼저 읽혀야 함
      ["import readline from 'node:readline';", "import './hb-crash-log.mjs';import readline from 'node:readline';"]],
    // 11) 네이티브(엔진 a471833): C++가 물체를 움직일 때마다(위치만 바뀌어도) 스프라이트 상태 전체를 JSON으로 만들어 비교 → 보스전 프레임 계산 2배
    //     반복 타일 갱신이 필요한 건 컴포넌트(크기·모드)가 바뀔 때뿐이라 그때만 맞춤
    'tools/run-project.mjs': [
      ['const update=object=>{const mesh=meshes.get(object.id);if(mesh){', 'const update=(object,sync=true)=>{const mesh=meshes.get(object.id);if(mesh){', 'optional'],
      ['return presentation?.update?.(object,mesh);}};', 'return sync?presentation?.update?.(object,mesh):undefined;}};', 'optional'],
      ['if(state.position!==undefined||state.components!==undefined){const pending=update(object);', 'if(state.position!==undefined||state.components!==undefined){const pending=update(object,state.components!==undefined);', 'optional'],
    ],
  };
}
// 13) 표준 PNG(RGBA 8비트, 필터 없음)를 zlib 1단계로: 투명한 곳이 많은 UI라 크기도 작음 (1280x720 약 23KB)
const FAST_PNG = "import hbZlib from 'node:zlib';const hbCrcT=new Int32Array(256).map((_,n)=>{let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;return c;});"
  + "const hbCrc=b=>{let c=-1;for(let i=0;i<b.length;i++)c=hbCrcT[(c^b[i])&255]^(c>>>8);return (c^-1)>>>0;};"
  + "const hbChunk=(t,d)=>{const l=Buffer.alloc(4);l.writeUInt32BE(d.length);const td=Buffer.concat([Buffer.from(t,'latin1'),d]);const c=Buffer.alloc(4);c.writeUInt32BE(hbCrc(td));return Buffer.concat([l,td,c]);};"
  + "function hbFastPng(canvas){const w=canvas.width,h=canvas.height,img=canvas.getContext('2d').getImageData(0,0,w,h).data,raw=Buffer.alloc((w*4+1)*h);for(let y=0;y<h;y++)raw.set(img.subarray(y*w*4,(y+1)*w*4),y*(w*4+1)+1);"
  + "const ih=Buffer.alloc(13);ih.writeUInt32BE(w,0);ih.writeUInt32BE(h,4);ih[8]=8;ih[9]=6;return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),hbChunk('IHDR',ih),hbChunk('IDAT',hbZlib.deflateSync(raw,{level:1})),hbChunk('IEND',Buffer.alloc(0))]);}";
const RENDERER = 'new THREE.WebGLRenderer({canvas,antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));';
const RENDERER_LIGHT = 'new THREE.WebGLRenderer({canvas,antialias:false,powerPreference:"high-performance"});renderer.setPixelRatio(1);';

export function applyPatches(name, text, patches) {
  for (const [from, to, mode] of patches[name] || []) {
    if (!text.includes(from)) { if (mode === 'optional') continue; throw Error(`엔진이 바뀌어 패치 위치를 못 찾음: ${name} — docs/엔진_요청_UI입력.md 확인`); }
    text = mode === 'all' ? text.split(from).join(to) : text.replace(from, to);  // all: 같은 코드가 여러 곳이면 모두
  }
  return text;
}
