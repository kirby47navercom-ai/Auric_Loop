// 화면 없이 데모 장면을 돌려 핵심 규칙을 확인한다.
// 실행: <HBEngine 사용자용 폴더>/runtime/node.exe tools/check_demo.mjs
// 던전은 들어갈 때마다 무작위지만 검사용 BP(BP_Test_*)는 씨앗 7로 고정. 씨앗 7의 주 경로:
//   0 시작(0,0) → 1 전투1(0,36) → 2 전투2(0,72) → 3 채집(-36,72) → 4 전투3(-36,108) → 5 상점(0,108) → 6 보스(36,108), 곁가지 전투(-72,108)
// 방 이동은 부스 운영자 키 F9(주 경로 다음 방 가운데로, 귀환 중엔 앞 방으로)를 쓴다.
import assert from 'node:assert/strict';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const ENGINE = process.env.HB_ENGINE || 'C:/Users/kirby/HBEngine/Versions/42bcd763ffa422e3';
const {runProject} = await import(pathToFileURL(path.join(ENGINE, 'tools/run-project.mjs')).href);
const project = path.join(path.dirname(fileURLToPath(import.meta.url)), '../AuricLoop/AuricLoop.hbproject');
const scene = name => `Assets/Scenes/${name}.hbscene.json`;
const director = r => r.objects.find(o => o.id === 'Director').nativeProperties;
const press = (frame, key, extra = {}) => [{frame, key, value: 1, ...extra}, {frame: frame + 2, key, value: 0, ...extra}];
const warps = (from, count) => Array.from({length: count}, (_, i) => press(from + i * 6, 'F9')).flat();
const touchHold = (from, to) => [{frame: from, key: 'LeftMouseButton', value: 1, device: 'touch', source: 'ui'}, {frame: to, key: 'LeftMouseButton', value: 0, device: 'touch', source: 'ui'}];
const gatesLocked = vm => vm.objects.filter(o => (o.tags || []).some(t => t === 'Dungeon.Gate' || t === 'Dungeon.GateSide') && o.position[1] > -150).length;

// 층 생성: 주 경로 7방 + 곁가지 1방, 방마다 크기·종류가 데이터 표대로
{
  const r = await runProject(project, {scene: scene('Test_Valen'), frames: 5, delta: 1 / 60});
  const rooms = JSON.parse(director(r).Layout);
  assert.deepEqual(rooms.filter(x => x.path >= 0).sort((a, b) => a.path - b.path).map(x => x.kind), ['Start', 'Combat', 'Combat', 'Gather', 'Combat', 'Shop', 'Boss'], '주 경로 순서');
  assert.equal(rooms.filter(x => x.path < 0).length, 1, '곁가지 방 1개');
  for (const a of rooms) for (const b of rooms) if (a !== b) assert.ok(Math.abs(a.x - b.x) >= a.hw + b.hw + 2 || Math.abs(a.y - b.y) >= a.hh + b.hh + 2, '방끼리 겹치지 않음');
  console.log('층 생성 검사 통과', rooms.map(x => `${x.row}(${x.x},${x.y})`).join(' '));
}

// 전투방1: F9로 들어가면 문이 잠기고 웨이브 2번(해골 3+3)이 마법진 예고 뒤 나옴. 모바일 공격(터치)은 가까운 해골 자동 조준
{
  let maxGates = 0;
  const r = await runProject(project, {scene: scene('Test_Valen'), frames: 1500, delta: 1 / 60, inputs: [...warps(5, 1), ...touchHold(20, 1490)],
    onFrame: (frame, vm) => { maxGates = Math.max(maxGates, gatesLocked(vm)); }});
  const s = director(r);
  assert.ok(s.Swings >= 8, '검 공격 간격 0.35초');
  assert.ok(s.Kills >= 6, '웨이브 2번의 해골 6마리를 모두 쓰러뜨림');
  assert.ok(s.RoomClears >= 1, '전투방1 클리어');
  assert.ok(maxGates >= 2, '싸우는 동안 앞뒤 문이 잠김');
  assert.equal(gatesLocked({objects: r.objects}), 0, '클리어하면 문이 열림');
  assert.equal(s.FatigueMax, 20, '데모 피로도 한계 기본값 20');
  console.log('전투·웨이브·문 검사 통과', 'kills', s.Kills, 'swings', s.Swings, 'gates', maxGates);
}

// 채집방(F9 세 번): 가운데에서 E로 광물 → 안내 대사 닫기 → E로 약초 3개. 그 뒤 Q → 2(섬광탄) → Enter로 제작
{
  const r = await runProject(project, {scene: scene('Test_Valen'), frames: 160, delta: 1 / 60, inputs: [
    ...warps(5, 3), ...press(40, 'e'), ...press(46, 'e'), ...press(52, 'e'), ...press(60, 'e'),
    ...press(80, 'q'), ...press(90, '2'), ...press(100, 'enter'),
  ]});
  const s = director(r);
  assert.equal(s.Herb, 3, 'E로 약초 3개 채집');
  assert.equal(s.Flashbangs, 1, '광물 1개로 섬광탄 1개 제작');
  assert.equal(s.Ore, 0, '광물은 제작에 씀');
  assert.equal(s.Fatigue, 2 + s.RoomClears, '채집마다 피로도 +1');
  console.log('채집·제작 검사 통과', 'herb', s.Herb, 'flashbangs', s.Flashbangs, 'fatigue', s.Fatigue);
}

// 보스방(F9 여섯 번): 해골 대장 처치 → Tab으로 [귀환] → F9로 상점(귀환 경로 앞 방): 무적 해골이 나오고 전투방3 쪽 문이 잠김
// → 서쪽 문 앞에서 10번 베어 열고 복도를 지나 전투방3으로
{
  let returnGates = 0;
  const r = await runProject(project, {scene: scene('Test_Valen'), frames: 3500, delta: 1 / 60, inputs: [
    ...warps(5, 6), ...press(130, 'e'), ...press(140, 'e'),  // 해골 대장 대사
    ...touchHold(150, 2500), ...press(2510, 'tab'), ...press(2520, 'e'), ...press(2530, 'e'),
    ...press(2540, 'F9'), {frame: 2560, key: 'a', value: 1}, {frame: 2640, key: 'a', value: 0},
    {frame: 2645, key: 'LeftMouseButton', value: 1}, {frame: 3100, key: 'LeftMouseButton', value: 0},
    {frame: 3110, key: 'a', value: 1}, {frame: 3400, key: 'a', value: 0},  // 복도 18m를 지나 전투방3 안까지 (더 가면 곁가지 방)
  ], onFrame: (frame, vm) => { if (frame === 2600) returnGates = gatesLocked(vm); }});
  const s = director(r);
  assert.ok(s.Shots >= 12, '해골 대장이 원형 탄막을 쏨');
  assert.ok(s.BossHp <= 0 && s.Kills >= 1, '해골 대장 처치');
  assert.ok(s.Returning, 'Tab으로 [귀환] 사용 → 귀환 페이즈');
  assert.ok(returnGates >= 1, '귀환 중 들어선 방은 시작 방 쪽 문이 잠김');
  assert.equal(s.RoomIndex, 4, '잠긴 문을 10번 때려 열고 전투방3까지 되돌아감');
  console.log('보스·귀환 검사 통과', 'shots', s.Shots, 'doorHits', s.DoorHits, 'room', s.RoomIndex, 'fatigue', s.Fatigue);
}

// 셰리(활: 1초 장전 단발)·알레아(마탄 연사·폭발): 전투방1에서 터치 자동 조준
for (const [name, label, minSwings] of [['Test_Sherry', '셰리', 4], ['Test_Alea', '알레아', 20]]) {
  const r = await runProject(project, {scene: scene(name), frames: 700, delta: 1 / 60, inputs: [...warps(5, 1), ...touchHold(20, 690)]});
  const s = director(r);
  assert.ok(s.Swings >= minSwings, `${label} 발사 간격`);
  assert.ok(s.Hits >= 1 && s.Kills >= 1, `${label} 탄이 해골을 맞혀 쓰러뜨림`);
  console.log(`${label} 검사 통과`, 'shots', s.Swings, 'hits', s.Hits, 'kills', s.Kills);
}

// 부스 운영: F12를 누르면 거점 장면을 처음부터 다시 엶 (60초 무입력·엔딩 카드도 같은 ResetToTitle)
{
  const f = await runProject(project, {scene: scene('Test_Valen'), frames: 60, delta: 1 / 60, inputs: [{frame: 20, key: 'F12', value: 1}]});
  assert.equal(f.sceneHistory.at(-1).scene, scene('Hub'), 'F12로 처음으로');
  assert.equal(director(f).Phase, 0, '처음으로 가면 로딩부터');
  console.log('F12 검사 통과');
}

// 거점 계단 끝 → 던전 시작 방, 시작 방 왼쪽 위 계단 → 거점
{
  const h = await runProject(project, {scene: scene('Hub'), frames: 420, delta: 1 / 60, nativeDefaults: {Director: {Phase: 2}},  // 타이틀 건너뜀
    inputs: [{frame: 2, key: 'a', value: 1}, {frame: 20, key: 'a', value: 0}, {frame: 2, key: 'w', value: 1}]});  // 부채 전광판 옆으로 돌아 계단으로
  assert.equal(h.sceneHistory.at(-1).scene, scene('Dungeon'), '거점 계단 끝 → 던전');
  const back = await runProject(project, {scene: scene('Test_Valen'), frames: 150, delta: 1 / 60, inputs: [
    {frame: 5, key: 'a', value: 1}, {frame: 59, key: 'a', value: 0}, {frame: 5, key: 'w', value: 1}, {frame: 140, key: 'w', value: 0}]});  // 거점에 도착해도 W가 눌린 채라 계단 위에 머묾
  const hp = back.objects.find(o => o.id === 'Player').position;
  assert.equal(back.sceneHistory.at(-1).scene, scene('Hub'), '시작 방 계단 → 거점');
  assert.ok(hp[1] > 15 && hp[1] < 24, '거점 계단 끝에 섬 (W를 누른 채여도 바로 던전으로 돌아가지 않음)');
  console.log('거점·던전 이동 검사 통과', 'y', hp[1].toFixed(1));
}
