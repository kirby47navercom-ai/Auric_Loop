// 부스용 패키지를 만들어 바탕화면에 복사한다.
// 실행: <HBEngine 사용자용 폴더>/runtime/node.exe tools/package.mjs [프로필 id=windows] [대상 폴더=바탕화면\AuricLoop_데모]
// 바탕화면에는 폴더 하나만 둔다: 빌드가 끝나면 같은 이름의 이전 패키지를 지우고 바꿔 넣음 (실행 중이면 실패)
//
// 엔진 플레이어 UI 문제를 빌드 결과에서만 고친다 (엔진 설치본은 건드리지 않음, docs/엔진_요청_UI입력.md):
//   1) 그림·글자(Image·Text) 위젯이 마우스 클릭을 받아 게임 화면(canvas)까지 안 감 → 타이틀 그림을 눌러도 시작 안 됨
//   2) 클릭으로 포커스를 가진 위젯이 모든 키를 삼킴 (keydown stopPropagation) → 그 뒤로 키보드가 안 먹음
//   3) Esc를 플레이어 기본 일시정지 창이 가로챔 → 게임 메뉴로 넘김
//   4·5) 키가 눌린 채로 남아 혼자 걸어가던 문제
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const ENGINE = process.env.HB_ENGINE || 'C:/Users/kirby/HBEngine/Versions/88db6de5ffe7c1bf';
const tool = name => import(pathToFileURL(path.join(ENGINE, 'tools', name)).href);
const {readProjectManifest} = await tool('project-manifest.mjs');
const {readBuildProfiles, buildGame} = await tool('build-game.mjs');

const [id = 'windows', target] = process.argv.slice(2);
const dest = target || path.join(os.homedir(), 'OneDrive', '바탕 화면', 'AuricLoop_데모');

const project = path.join(path.dirname(fileURLToPath(import.meta.url)), '../AuricLoop/AuricLoop.hbproject');
const record = await readProjectManifest(project);
const profile = (await readBuildProfiles(record)).profiles.find(p => p.id === id);
if (!profile) throw Error(`빌드 프로필 없음: ${id}`);
const build = await buildGame(record, profile, {onProgress: s => console.log(s)});

// 플레이어는 시작할 때 game.hbpack.json의 크기·sha256으로 파일을 검사하므로 고친 파일의 값도 바꾼다
const packFile = path.join(build.output, 'game.hbpack.json'), pack = JSON.parse(await fs.readFile(packFile, 'utf8'));
async function patch(name, from, to) {
  const file = path.join(build.output, name), text = await fs.readFile(file, 'utf8');
  if (!text.includes(from)) throw Error(`엔진이 바뀌어 패치 위치를 못 찾음: ${name} — docs/엔진_요청_UI입력.md 확인`);
  const bytes = Buffer.from(text.replace(from, to)), entry = pack.files.find(f => f.path === name);
  if (!entry) throw Error(`패키지 목록에 없음: ${name}`);
  await fs.writeFile(file, bytes);
  Object.assign(entry, {bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex')});
}
await patch('prototype/ui-runtime.css', '.hb-ui-Spacer{pointer-events:none}', '.hb-ui-Spacer,.hb-ui-Image,.hb-ui-Text{pointer-events:none}');
await patch('prototype/ui-runtime.js',
  "control.addEventListener('keydown',e=>{e.stopPropagation();if(e.key==='Enter'&&node.type==='TextInput')signal('submit');});",
  "control.addEventListener('keydown',e=>{if(node.type!=='TextInput')return;e.stopPropagation();if(e.key==='Enter')signal('submit');});");
// 3) Esc를 플레이어가 가로채 엔진 기본 일시정지 창(계속·전체 화면·종료)을 띄움 → 게임이 Esc를 못 받음. 게임의 메뉴가 받게 넘긴다
await patch('prototype/player.js',
  "if(e.key==='Escape'&&kiosk.enabled&&!operatorMenu){e.preventDefault();return;}if(e.key==='Escape'){e.preventDefault();releaseKeys();if(menu.open)menu.close();else{menu.showModal();services?.pauseAudio(true)?.catch(fail);}return;}",
  "if(e.key==='Escape'&&menu.open){e.preventDefault();menu.close();return;}");
// 4) 키를 누를 때·뗄 때 e.key로 짝을 맞춤 → Shift를 같이 누르거나 한글 입력 상태면 이름이 달라져 뗀 키가 계속 눌린 채로 남음(혼자 걸어감).
//    물리 키(e.code)로 짝을 맞추고, 글자·숫자 키는 입력기 상태와 상관없이 같은 이름(w, 1 …)으로 보냄
await patch('prototype/player.js', "held=new Set()", "held=new Set(),heldName=new Map()");
await patch('prototype/player.js',
  "if(!e.repeat&&!held.has(e.key)){held.add(e.key);vm?.input(e.key,1).catch(fail);}",
  "{const k=/^Key[A-Z]$/.test(e.code)?e.code.slice(3).toLowerCase():/^Digit[0-9]$/.test(e.code)?e.code.slice(5):e.code==='Space'?' ':(e.key&&e.key!=='Unidentified'?e.key:e.code),c=e.code||e.key;if(!k||!c)return;if(!e.repeat&&!held.has(c)){held.add(c);heldName.set(c,k);vm?.input(k,1).catch(fail);}}");
await patch('prototype/player.js',
  "document.addEventListener('keyup',e=>{if(held.delete(e.key)){e.preventDefault();vm?.input(e.key,0).catch(fail);}});",
  "document.addEventListener('keyup',e=>{const c=e.code||e.key;if(held.delete(c)){e.preventDefault();vm?.input(heldName.get(c)??e.key,0).catch(fail);heldName.delete(c);}});");
// 5) 장면을 넘을 때 눌린 키를 그대로 넘김 → 로딩 중에 뗀 키는 해제가 사라져 새 장면에서 혼자 걸어감. 장면마다 입력을 비우고 시작
await patch('prototype/player.js', "const carriedInput=vm?.active?vm.inputState:undefined;", "const carriedInput=undefined;held.clear();heldName.clear();");
//    엔진 기본 일시정지 버튼(화면 구석)도 숨김. 운영자 메뉴(Ctrl+Alt+Shift+Q)는 그대로
await patch('prototype/player.js',
  "if(kiosk.enabled){$('#quit').hidden=true;$('#fullscreen').hidden=true;$('#pause-toggle').hidden=true;}",
  "$('#pause-toggle').hidden=true;if(kiosk.enabled){$('#quit').hidden=true;$('#fullscreen').hidden=true;}");

await fs.writeFile(packFile, JSON.stringify(pack, null, 2) + '\n');
await fs.rm(dest, {recursive: true, force: true});  // 이전 패키지 교체 (게임이 켜져 있으면 여기서 실패)
await fs.cp(build.output, dest, {recursive: true});
console.log('패키지:', path.join(dest, 'Game.exe'));
