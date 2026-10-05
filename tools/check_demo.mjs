// 화면 없이 데모 장면을 돌려 핵심 규칙을 확인한다.
// 실행: <HBEngine 사용자용 폴더>/runtime/node.exe tools/check_demo.mjs
import assert from 'node:assert/strict';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const ENGINE = process.env.HB_ENGINE || 'C:/Users/kirby/HBEngine/Versions/d4de30b46c28bab7';
const {runProject} = await import(pathToFileURL(path.join(ENGINE, 'tools/run-project.mjs')).href);
const project = path.join(path.dirname(fileURLToPath(import.meta.url)), '../AuricLoop/AuricLoop.hbproject');
const aimUp = {position: [640, 250], size: [1280, 720]};

const r = await runProject(project, {frames: 900, delta: 1 / 60, inputs: [
  {frame: 5, key: 'w', value: 1}, {frame: 30, key: 'w', value: 0},
  {frame: 31, key: 'LeftMouseButton', value: 1, pointer: aimUp}, {frame: 400, key: 'LeftMouseButton', value: 0},
  {frame: 410, key: 'w', value: 1}, {frame: 700, key: 'w', value: 0},  // 열린 문으로 전투방2까지 걸어감
]});
const player = r.objects.find(o => o.id === 'Player');
const stats = r.objects.find(o => o.id === 'Director').nativeProperties;
const doorsLocked = r.objects.filter(o => /^Door/.test(o.id) && o.poolActive).map(o => o.id);
assert.ok(stats.Swings >= 8, '검 공격 간격 0.35초');
assert.ok(stats.Kills >= 3, '전투방1 해골 3마리는 검 4대씩에 쓰러짐');
assert.ok(stats.RoomClears >= 1, '전투방1 클리어');
assert.equal(stats.RoomIndex, 1, '열린 문을 지나 전투방2에 들어감');
assert.deepEqual(doorsLocked, ['Door0', 'Door1'], '전투방2에 들어가면 앞뒤 문이 잠김');
assert.ok(player.position[1] > 13, '플레이어가 전투방2 안에 있음');
assert.equal(stats.FatigueMax, 20, '데모 피로도 한계 기본값 20');
console.log('전투·문 검사 통과', JSON.stringify(stats), 'y', player.position[1].toFixed(1));

// 보스방 입구에서 시작해 위를 보고 계속 베기
const b = await runProject(project, {scene: 'Assets/Scenes/Test_Boss.hbscene.json', frames: 1500, delta: 1 / 60, inputs: [
  {frame: 2, key: 'w', value: 1}, {frame: 40, key: 'w', value: 0},
  {frame: 41, key: 'LeftMouseButton', value: 1, pointer: aimUp}, {frame: 1490, key: 'LeftMouseButton', value: 0},
]});
const boss = b.objects.find(o => o.id === 'Director').nativeProperties;
assert.equal(boss.RoomIndex, 4, '보스방');
assert.ok(boss.Shots >= 12, '해골 대장이 원형 탄막을 쏨');
assert.ok(boss.BossHp < 40, '해골 대장이 검에 맞음');
console.log('보스 검사 통과', JSON.stringify(boss));
