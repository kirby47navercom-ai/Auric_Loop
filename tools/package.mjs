// 부스용 패키지를 만들어 바탕화면에 복사한다.
// 실행: <HBEngine 사용자용 폴더>/runtime/node.exe tools/package.mjs [프로필 id=windows] [대상 폴더=바탕화면\AuricLoop_데모]
// 바탕화면에는 폴더 하나만 둔다: 빌드가 끝나면 같은 이름의 이전 패키지를 지우고 바꿔 넣음 (실행 중이면 실패)
//
// 엔진 플레이어 수정(UI 입력·Esc·눌린 키·기본 정지 버튼)은 빌드 결과에만 넣는다: tools/player_patches.mjs
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {playerPatches, applyPatches} from './player_patches.mjs';
import {retainBuilds} from './build-retention.mjs';
import {ENGINE} from './engine.mjs';
import {hookLightScenes} from './light_scene.mjs';

const tool = name => import(pathToFileURL(path.join(ENGINE, 'tools', name)).href);
const {readProjectManifest} = await tool('project-manifest.mjs');
const {readBuildProfiles, buildGame} = await tool('build-game.mjs');

const [id = 'windows', target] = process.argv.slice(2);
const dest = target || path.join(os.homedir(), 'OneDrive', '바탕 화면', 'AuricLoop_데모');

const project = path.join(path.dirname(fileURLToPath(import.meta.url)), '../AuricLoop/AuricLoop.hbproject');
const record = await readProjectManifest(project);
const profile = (await readBuildProfiles(record)).profiles.find(p => p.id === id);
if (!profile) throw Error(`빌드 프로필 없음: ${id}`);
// 내장 그래픽(Intel UHD 620)·램 8GB 노트북에서도 돌게: 초당 60프레임(엔진 기본 120), 저사양 장면 설정(tools/light_scene.mjs, 물리는 60Hz 유지)
const lightScenes = id === 'windows' ? hookLightScenes(path.dirname(project), 60) : null;
if (id === 'windows') Object.assign(profile, {targetFrameRate: 60, framePacing: 'display'});
const build = await buildGame(record, profile, {onProgress: s => console.log(s)});
if (lightScenes && !lightScenes()) throw Error('저사양 장면 설정이 안 들어감 (엔진이 장면 읽는 방식이 바뀜)');

// 플레이어는 시작할 때 game.hbpack.json의 크기·sha256으로 파일을 검사하므로 고친 파일의 값도 바꾼다
const packFile = path.join(build.output, 'game.hbpack.json'), pack = JSON.parse(await fs.readFile(packFile, 'utf8'));
const patches = await playerPatches(path.dirname(project));
for (const name of Object.keys(patches)) {
  const entry = pack.files.find(f => f.path === name);
  if (!entry) { if (name === 'prototype/game-renderer.js') continue; throw Error(`패키지 목록에 없음: ${name}`); }  // 렌더러 파일은 엔진 dcc7dfb부터 있음
  const file = path.join(build.output, name), bytes = Buffer.from(applyPatches(name, await fs.readFile(file, 'utf8'), patches));
  await fs.writeFile(file, bytes);
  Object.assign(entry, {bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex')});
}

// 실행 파일 아이콘: 엔진 플레이어엔 게임 아이콘을 넣는 기능이 없어 리소스를 직접 바꾼다 (tools/make_app_icon.py → Kit/app_icon.ico)
// 실행 파일 이름: 엔진 fc0a71a부터 HBGame_<프로젝트 UUID>.exe (게임별 윈도우 볼륨 믹서 항목), 그 전엔 Game.exe
const exeName = (await fs.readdir(build.output)).find(n => /^(HBGame_.+|Game)\.exe$/i.test(n));
{const exe = path.join(build.output, exeName);
 execFileSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(path.dirname(fileURLToPath(import.meta.url)), 'set_exe_icon.ps1'), exe, path.join(path.dirname(project), 'Assets/UI/Kit/app_icon.ico')], {stdio: 'inherit'});
 const bytes = await fs.readFile(exe), entry = pack.files.find(f => f.path === exeName);
 if (entry) Object.assign(entry, {bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex')});}

await fs.writeFile(packFile, JSON.stringify(pack, null, 2) + '\n');
await retainBuilds(record.root, build.output).catch(error => console.warn('빌드 보관 정리 실패:', error.message));
await fs.rm(dest, {recursive: true, force: true});  // 이전 패키지 교체 (게임이 켜져 있으면 여기서 실패)
// 복사하지 않고 옮김: 빌드 폴더와 패키지가 같은 내용을 두 벌 차지하지 않게 (디스크 절약). 다른 드라이브면 복사 후 지움
await fs.rename(build.output, dest).catch(async () => { await fs.cp(build.output, dest, {recursive: true}); await fs.rm(build.output, {recursive: true, force: true}); });
console.log('패키지:', path.join(dest, exeName));
