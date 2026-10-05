// 화면 없이 데모 장면을 돌려 핵심 규칙을 확인한다.
// 실행: <HBEngine 사용자용 폴더>/runtime/node.exe tools/check_demo.mjs
import assert from 'node:assert/strict';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

process.env.AURIC_MUTE = '1';  // 화면 없는 검사기는 소리 노드를 실행하지 못함 (C++ Muted)
const ENGINE = process.env.HB_ENGINE || 'C:/Users/kirby/HBEngine/Versions/d4de30b46c28bab7';
const {runProject} = await import(pathToFileURL(path.join(ENGINE, 'tools/run-project.mjs')).href);
const project = path.join(path.dirname(fileURLToPath(import.meta.url)), '../AuricLoop/AuricLoop.hbproject');
const aimUp = {position: [640, 250], size: [1280, 720]};

const r = await runProject(project, {scene: 'Assets/Scenes/Dungeon_0.hbscene.json', frames: 900, delta: 1 / 60, inputs: [
  {frame: 5, key: 'w', value: 1}, {frame: 30, key: 'w', value: 0},
  {frame: 31, key: 'LeftMouseButton', value: 1, pointer: aimUp}, {frame: 400, key: 'LeftMouseButton', value: 0},
  {frame: 410, key: 'w', value: 1}, {frame: 700, key: 'w', value: 0},  // 열린 문으로 전투방2까지 걸어감 → Dungeon_1 장면
  {frame: 720, key: 'w', value: 1}, {frame: 780, key: 'w', value: 0},  // 검사 실행기는 장면이 바뀌면 입력이 풀려서 다시 누름
]});
const player = r.objects.find(o => o.id === 'Player');
const stats = r.objects.find(o => o.id === 'Director').nativeProperties;
const doorsLocked = r.objects.filter(o => /^Door/.test(o.id) && o.poolActive).map(o => o.id);
assert.ok(stats.Swings >= 8, '검 공격 간격 0.35초');
assert.ok(stats.Kills >= 3, '전투방1 해골 3마리는 검 4대씩에 쓰러짐');
assert.ok(stats.RoomClears >= 1, '전투방1 클리어');
assert.equal(stats.RoomIndex, 1, '열린 문을 지나 전투방2에 들어감');
assert.equal(r.sceneHistory.at(-1).scene, 'Assets/Scenes/Dungeon_1.hbscene.json', '방을 넘어가면 다음 방 장면을 엶');
assert.ok(stats.Kills >= 3 && stats.RoomClears >= 1, '장면을 넘어가도 기록이 이어짐');
assert.deepEqual(doorsLocked, ['Door0', 'Door1'], '전투방2에 들어가면 앞뒤 문이 잠김');
assert.ok(player.position[1] > 13, '플레이어가 전투방2 안에 있음');
assert.equal(stats.FatigueMax, 20, '데모 피로도 한계 기본값 20');
console.log('전투·문 검사 통과', JSON.stringify(stats), 'y', player.position[1].toFixed(1));

// 채집방 광물 앞에서 시작: E로 광물 채집 → 오른쪽으로 걸어가 E로 약초 채집
const g = await runProject(project, {scene: 'Assets/Scenes/Test_Gather.hbscene.json', frames: 240, delta: 1 / 60, inputs: [
  {frame: 10, key: 'e', value: 1}, {frame: 12, key: 'e', value: 0},
  {frame: 14, key: 'e', value: 1}, {frame: 15, key: 'e', value: 0}, {frame: 17, key: 'e', value: 1}, {frame: 18, key: 'e', value: 0},  // 첫 채집 안내 대사 닫기
  {frame: 20, key: 'd', value: 1}, {frame: 80, key: 'd', value: 0},
  {frame: 120, key: 'e', value: 1}, {frame: 122, key: 'e', value: 0},
]});
const gs = g.objects.find(o => o.id === 'Director').nativeProperties;
assert.equal(gs.Ore, 1, 'E로 광물 채집');
assert.equal(gs.Herb, 3, 'E로 약초 3개 채집');
assert.equal(gs.Fatigue, 2, '채집마다 피로도 +1');
console.log('채집 검사 통과', 'ore', gs.Ore, 'herb', gs.Herb, 'fatigue', gs.Fatigue);

// 채집 뒤 Q로 제작 창 → 2(섬광탄) → Enter
const k = await runProject(project, {scene: 'Assets/Scenes/Test_Gather.hbscene.json', frames: 120, delta: 1 / 60, inputs: [
  {frame: 10, key: 'e', value: 1}, {frame: 12, key: 'e', value: 0},
  {frame: 14, key: 'e', value: 1}, {frame: 15, key: 'e', value: 0}, {frame: 17, key: 'e', value: 1}, {frame: 18, key: 'e', value: 0},  // 첫 채집 안내 대사 닫기
  {frame: 20, key: 'q', value: 1}, {frame: 22, key: 'q', value: 0},
  {frame: 30, key: '2', value: 1}, {frame: 32, key: '2', value: 0},
  {frame: 40, key: 'enter', value: 1}, {frame: 42, key: 'enter', value: 0},
]});
const ks = k.objects.find(o => o.id === 'Director').nativeProperties;
assert.equal(ks.Ore, 0, '광물 1개를 써서');
assert.equal(ks.Flashbangs, 1, '섬광탄 1개 제작');
console.log('제작 검사 통과', 'flashbangs', ks.Flashbangs);

// 보스방 입구에서 시작: 해골 대장 처치 → Tab으로 [귀환] 사용 → 아래로 걸으며 잠긴 문 때리기
const down = {position: [640, 600], size: [1280, 720]};
const b = await runProject(project, {scene: 'Assets/Scenes/Dungeon_4.hbscene.json', frames: 4200, delta: 1 / 60, inputs: [
  {frame: 2, key: 'w', value: 1}, {frame: 40, key: 'w', value: 0},
  {frame: 20, key: 'e', value: 1}, {frame: 22, key: 'e', value: 0},  // 해골 대장 대사: 다 보이기
  {frame: 30, key: 'e', value: 1}, {frame: 32, key: 'e', value: 0},  // 대사 닫기
  {frame: 41, key: 'LeftMouseButton', value: 1, pointer: aimUp}, {frame: 2400, key: 'LeftMouseButton', value: 0},
  {frame: 2410, key: 'tab', value: 1}, {frame: 2415, key: 'tab', value: 0},
  {frame: 2416, key: 'e', value: 1}, {frame: 2417, key: 'e', value: 0}, {frame: 2418, key: 'e', value: 1}, {frame: 2419, key: 'e', value: 0},  // 귀환 안내 대사 닫기
  {frame: 2420, key: 's', value: 1}, {frame: 2421, key: 'LeftMouseButton', value: 1, pointer: down}, {frame: 4190, key: 's', value: 0},
]});
const boss = b.objects.find(o => o.id === 'Director').nativeProperties;
const by = b.objects.find(o => o.id === 'Player').position[1];
assert.ok(boss.Shots >= 12, '해골 대장이 원형 탄막을 쏨');
assert.ok(boss.BossHp <= 0, '해골 대장 처치');
assert.ok(boss.Returning || boss.ReturnSuccess, 'Tab으로 [귀환] 사용 → 귀환 페이즈');
assert.ok(by < 80, '잠긴 문을 10번 때려 열고 보스방 아래로 내려감');
console.log('보스·귀환 검사 통과', JSON.stringify(boss), 'y', by.toFixed(1));

// 셰리(활: 1초 장전 단발)·알레아(마탄 연사·폭발)로 전투방1에서 위를 향해 공격
for (const [scene, name, minHits] of [['Test_Sherry', '셰리', 1], ['Test_Alea', '알레아', 5]]) {
  const c = await runProject(project, {scene: `Assets/Scenes/${scene}.hbscene.json`, frames: 600, delta: 1 / 60, inputs: [
    {frame: 5, key: 'w', value: 1}, {frame: 30, key: 'w', value: 0},
    {frame: 31, key: 'LeftMouseButton', value: 1, pointer: aimUp}, {frame: 590, key: 'LeftMouseButton', value: 0},
  ]});
  const cs = c.objects.find(o => o.id === 'Director').nativeProperties;
  assert.ok(cs.Swings >= (name === '셰리' ? 4 : 20), `${name} 발사 간격`);
  assert.ok(cs.Hits >= minHits && cs.Kills >= 1, `${name} 탄이 해골을 맞혀 쓰러뜨림`);
  console.log(`${name} 검사 통과`, 'shots', cs.Swings, 'hits', cs.Hits, 'kills', cs.Kills);
}

// 부스 운영: F12를 누르면 거점 장면을 처음부터 다시 엶 (60초 무입력·엔딩 카드도 같은 ResetToTitle)
const f = await runProject(project, {scene: 'Assets/Scenes/Dungeon_3.hbscene.json', frames: 60, delta: 1 / 60, inputs: [{frame: 20, key: 'F12', value: 1}]});
assert.equal(f.sceneHistory.at(-1).scene, 'Assets/Scenes/Hub.hbscene.json', 'F12로 처음으로');
assert.equal(f.objects.find(o => o.id === 'Director').nativeProperties.Phase, 0, '처음으로 가면 로딩부터');
console.log('F12 검사 통과');

// 모바일: 공격 버튼(K)은 터치 위치 대신 가장 가까운 해골을 자동 조준
const m = await runProject(project, {scene: 'Assets/Scenes/Test_Alea.hbscene.json', frames: 600, delta: 1 / 60, inputs: [
  {frame: 5, key: 'w', value: 1}, {frame: 30, key: 'w', value: 0}, {frame: 31, key: 'k', value: 1}, {frame: 590, key: 'k', value: 0},
]});
const ms = m.objects.find(o => o.id === 'Director').nativeProperties;
assert.ok(ms.Kills >= 3, '자동 조준으로 전투방1 해골 3마리를 모두 맞힘');
console.log('모바일 자동 조준 검사 통과', 'kills', ms.Kills, 'hits', ms.Hits);
