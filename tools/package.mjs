// 부스용 패키지를 만들어 바탕화면에 복사한다.
// 실행: <HBEngine 사용자용 폴더>/runtime/node.exe tools/package.mjs [프로필 id=windows] [대상 폴더=바탕화면\AuricLoop_데모_MMDD]
//
// 엔진 플레이어 UI 문제를 빌드 결과에서만 고친다 (엔진 설치본은 건드리지 않음, docs/엔진_요청_UI입력.md):
//   1) 그림·글자(Image·Text) 위젯이 마우스 클릭을 받아 게임 화면(canvas)까지 안 감 → 타이틀 그림을 눌러도 시작 안 됨
//   2) 클릭으로 포커스를 가진 위젯이 모든 키를 삼킴 (keydown stopPropagation) → 그 뒤로 키보드가 안 먹음
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
const now = new Date(), mmdd = String(now.getMonth() + 1).padStart(2, '0') + String(now.getDate()).padStart(2, '0');
const dest = target || path.join(os.homedir(), 'OneDrive', '바탕 화면', `AuricLoop_데모_${mmdd}`);
await fs.access(dest).then(() => { throw Error(`이미 있음: ${dest} (지우거나 다른 이름을 주세요)`); }, () => {});

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

await fs.writeFile(packFile, JSON.stringify(pack, null, 2) + '\n');
await fs.cp(build.output, dest, {recursive: true});
console.log('패키지:', path.join(dest, 'Game.exe'));
