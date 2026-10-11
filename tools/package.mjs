// 부스용 패키지를 만들어 바탕화면에 복사한다.
// 실행: <HBEngine 사용자용 폴더>/runtime/node.exe tools/package.mjs [프로필 id=windows] [대상 폴더=바탕화면\AuricLoop_데모]
// 바탕화면에는 폴더 하나만 둔다: 빌드가 끝나면 같은 이름의 이전 패키지를 지우고 바꿔 넣음 (실행 중이면 실패)
//
// 엔진 플레이어 수정(UI 입력·Esc·눌린 키·기본 정지 버튼)은 빌드 결과에만 넣는다: tools/player_patches.mjs
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {playerPatches, applyPatches} from './player_patches.mjs';

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
const patches = await playerPatches(path.dirname(project));
for (const name of Object.keys(patches)) {
  const file = path.join(build.output, name), bytes = Buffer.from(applyPatches(name, await fs.readFile(file, 'utf8'), patches));
  const entry = pack.files.find(f => f.path === name);
  if (!entry) throw Error(`패키지 목록에 없음: ${name}`);
  await fs.writeFile(file, bytes);
  Object.assign(entry, {bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex')});
}

await fs.writeFile(packFile, JSON.stringify(pack, null, 2) + '\n');
await fs.rm(dest, {recursive: true, force: true});  // 이전 패키지 교체 (게임이 켜져 있으면 여기서 실패)
await fs.cp(build.output, dest, {recursive: true});
console.log('패키지:', path.join(dest, 'Game.exe'));
