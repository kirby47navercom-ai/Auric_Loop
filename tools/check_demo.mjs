// 화면 없이 데모 장면을 돌려 핵심 규칙을 확인한다.
// 실행: <HBEngine 사용자용 폴더>/runtime/node.exe tools/check_demo.mjs
// 던전은 들어갈 때마다 무작위(시작 방에서 가지를 뻗은 나무 모양 + 고리)지만 검사용 BP(BP_Test_*)는 씨앗 7로 고정.
// 방 이동: F9(시작→보스 경로의 다음 방 가운데로, 귀환 중엔 앞 방으로), 또는 Director.StartRoom(그 종류의 방에서 시작).
import assert from 'node:assert/strict';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const ENGINE = process.env.HB_ENGINE || 'C:/Users/kirby/HBEngine/Versions/d03c655dc25a2bb6';
const {runProject} = await import(pathToFileURL(path.join(ENGINE, 'tools/run-project.mjs')).href);
const project = path.join(path.dirname(fileURLToPath(import.meta.url)), '../AuricLoop/AuricLoop.hbproject');
const scene = name => `Assets/Scenes/${name}.hbscene.json`;
const director = r => r.objects.find(o => o.id === 'Director').nativeProperties;
const press = (frame, key, extra = {}) => [{frame, key, value: 1, ...extra}, {frame: frame + 2, key, value: 0, ...extra}];
const warps = (from, count) => Array.from({length: count}, (_, i) => press(from + i * 6, 'F9')).flat();
// 셰리용: hold 프레임 누르고 gap 프레임 떼기를 반복 (떼는 순간 발사)
const touchBursts = (from, to, hold = 70, gap = 4) => {
  const out = [];
  for (let f = from; f + hold < to; f += hold + gap) out.push(...touchHold(f, f + hold));
  return out;
};
const touchHold = (from, to) => [{frame: from, key: 'LeftMouseButton', value: 1, device: 'touch', source: 'ui'}, {frame: to, key: 'LeftMouseButton', value: 0, device: 'touch', source: 'ui'}];
const gatesLocked = vm => vm.objects.filter(o => (o.tags || []).some(t => t === 'Dungeon.Gate' || t === 'Dungeon.GateSide') && o.position[1] > -150).length;
const startIn = room => ({Director: {StartRoom: room}});

// 층 생성: 방 11개, 막다른 방에 보스·상점·채집, 보스는 시작에서 4방 이상, 방끼리 겹치지 않음
const layout = JSON.parse(director(await runProject(project, {scene: scene('Test_Valen'), frames: 3, delta: 1 / 60})).Layout);
const rooms = layout.filter(r => r.kind !== 'Shortage');
{
  const count = kind => rooms.filter(r => r.kind === kind).length;
  const links = r => r.links.filter(l => l >= 0).length;
  assert.equal(rooms.length, 11, '방 11개');
  assert.deepEqual([count('Start'), count('Boss'), count('Shop'), count('Gather'), count('Combat')], [1, 1, 1, 1, 7], '방 종류');
  for (const kind of ['Boss', 'Shop', 'Gather']) assert.equal(links(rooms.find(r => r.kind === kind)), 1, `${kind}은 막다른 방`);
  assert.ok(rooms.some(r => links(r) >= 3), '갈림길(3갈래 이상) 방이 있음');
  assert.ok(rooms.find(r => r.kind === 'Boss').path >= 4, '보스까지 방 4개 이상');
  for (const a of rooms) for (const b of rooms) if (a !== b) assert.ok(Math.abs(a.x - b.x) >= a.hw + b.hw + 2 || Math.abs(a.y - b.y) >= a.hh + b.hh + 2, '방끼리 겹치지 않음');
  // 바닥·벽·장식 조각(장면 풀)이 어떤 배치·어느 방에서도 모자라지 않음 (내 주변 방만 깔기)
  for (const seed of [7, 1, 2, 3, 11, 23, 99, 1234]) {
    const short = JSON.parse(director(await runProject(project, {scene: scene('Test_Valen'), frames: 70, delta: 1 / 60, nativeDefaults: {Director: {Seed: seed}}, inputs: warps(5, 8)})).Layout).find(r => r.kind === 'Shortage');  // 경로 방을 차례로 지나며 주변을 다시 깖
    assert.ok(!short, `씨앗 ${seed}: 바닥·벽 조각 ${short?.count}개 모자람`);
  }
  console.log('층 생성 검사 통과', rooms.map(r => `${r.row}${r.path >= 0 ? '#' + r.path : ''}(${r.x / 36},${r.y / 36})`).join(' '));
}

// 경로 첫 전투방: F9로 들어가면 문이 잠기고 웨이브(해골 2+3)가 마법진 예고 뒤 나옴. 모바일 공격(터치)은 가까운 해골 자동 조준
{
  let maxGates = 0;
  const r = await runProject(project, {scene: scene('Test_Valen'), frames: 1500, delta: 1 / 60, inputs: [...warps(5, 1), ...touchHold(20, 1490)],
    onFrame: (frame, vm) => { maxGates = Math.max(maxGates, gatesLocked(vm)); }});
  const s = director(r);
  assert.ok(s.Swings >= 8, '검 공격 간격 0.35초');
  assert.ok(s.Kills >= 5, '웨이브 2번의 해골 5마리를 모두 쓰러뜨림');
  assert.ok(s.RoomClears >= 1, '전투방 클리어');
  assert.ok(maxGates >= 1, '싸우는 동안 문이 잠김');
  assert.equal(gatesLocked({objects: r.objects}), 0, '클리어하면 문이 열림');
  assert.ok(s.Hp > 0, '맞은 뒤 무적 시간 동안 연달아 맞지 않아 살아남음');
  console.log('전투·웨이브·문 검사 통과', 'kills', s.Kills, 'swings', s.Swings, 'gates', maxGates, 'hp', s.Hp);
}

// 채집방에서 시작: 가운데에서 E로 광물 → 안내 대사 닫기 → E로 약초 3개. 그 뒤 Q → 2(섬광탄) → Enter로 제작
{
  const r = await runProject(project, {scene: scene('Test_Valen'), frames: 140, delta: 1 / 60, nativeDefaults: startIn('Gather'), inputs: [
    ...press(20, 'e'), ...press(26, 'e'), ...press(32, 'e'), ...press(40, 'e'),
    ...press(60, 'q'), ...press(70, '2'), ...press(80, 'enter'),
  ]});
  const s = director(r);
  assert.equal(s.Herb, 3, 'E로 약초 3개 채집');
  assert.equal(s.Flashbangs, 1, '광물 1개로 섬광탄 1개 제작');
  assert.equal(s.Ore, 0, '광물은 제작에 씀');
  assert.equal(s.Fatigue, 2, '채집마다 피로도 +1');
  console.log('채집·제작 검사 통과', 'herb', s.Herb, 'flashbangs', s.Flashbangs, 'fatigue', s.Fatigue);
}

// 보스방에서 시작: 해골 대장 처치 → Tab으로 [귀환] → F9로 보스 앞 방: 무적 해골이 나오고 시작 방 쪽 문이 잠김
// → 그 문 앞으로 걸어가 10번 베어 열고 다음(시작 쪽) 방으로
{
  const boss = rooms.find(r => r.kind === 'Boss');
  const before = rooms.findIndex(r => r.path === boss.path - 1), prev = rooms.findIndex(r => r.path === boss.path - 2);
  const dir = rooms[before].links.indexOf(prev);  // 0 북 1 동 2 남 3 서
  const key = ['w', 'd', 's', 'a'][dir], walk = Math.ceil(((dir % 2 ? rooms[before].hw : rooms[before].hh) - 1) / 6 * 60);
  let returnGates = 0;
  const r = await runProject(project, {scene: scene('Test_Valen'), frames: 3600, delta: 1 / 60, nativeDefaults: startIn('Boss'), inputs: [
    ...press(80, 'e'), ...press(90, 'e'),  // 해골 대장 대사
    ...touchHold(100, 2400), ...press(2405, 'tab'), ...press(2410, 'enter'), ...press(2420, 'e'), ...press(2430, 'e'),  // 가방(Tab) 열고 Enter로 [귀환]
    ...press(2440, 'F9'), {frame: 2460, key, value: 1}, {frame: 2460 + walk, key, value: 0},
    {frame: 2465 + walk, key: 'LeftMouseButton', value: 1}, {frame: 2900 + walk, key: 'LeftMouseButton', value: 0},
    {frame: 2910 + walk, key, value: 1}, {frame: 2910 + walk + Math.ceil((36 - walk / 10) / 6 * 60), key, value: 0},  // 복도를 지나 앞 방 가운데쯤까지
  ], onFrame: (frame, vm) => { if (frame === 2455) returnGates = gatesLocked(vm); }});
  const s = director(r);
  assert.ok(s.Shots >= 12, '해골 대장이 원형 탄막을 쏨');
  assert.ok(s.BossHp <= 0 && s.Kills >= 1, '해골 대장 처치');
  assert.ok(s.Returning, '가방에서 [귀환] 사용 → 귀환 페이즈');
  assert.ok(returnGates >= 1, '귀환 중 들어선 방은 시작 방 쪽 문이 잠김');
  assert.equal(s.RoomIndex, prev, '잠긴 문을 10번 때려 열고 시작 쪽 방으로 되돌아감');
  console.log('보스·귀환 검사 통과', 'shots', s.Shots, 'room', s.RoomIndex, 'fatigue', s.Fatigue);
}

// 셰리(활: 당겼다 떼면 단발)·알레아(마탄 연사·폭발): 경로 첫 전투방에서 터치 자동 조준
for (const [name, label, minSwings] of [['Test_Sherry', '셰리', 4], ['Test_Alea', '알레아', 20]]) {
  const r = await runProject(project, {scene: scene(name), frames: 700, delta: 1 / 60, inputs: [...warps(5, 1), ...(name === 'Test_Sherry' ? touchBursts(20, 690) : touchHold(20, 690))]});
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

// 게임 오버: 체력 1로 전투방에 들어가 가만히 맞음 → "빈손으로 끌려 나왔다" → 소재(광물 2)를 잃고 거점에서 정산
{
  const r = await runProject(project, {scene: scene('Test_Valen'), frames: 900, delta: 1 / 60, nativeDefaults: {Director: {MaxHp: 1, Ore: 2}}, inputs: warps(5, 1)});
  const s = director(r);
  assert.equal(r.sceneHistory.at(-1).scene, scene('Hub'), '쓰러지면 거점으로 끌려 나옴');
  assert.equal(s.Ore, 0, '들고 있던 광물을 잃음');
  assert.equal(s.LastRepaid, 0, '소재를 잃어 정산 금액 0');
  assert.ok(s.ReturnSuccess && s.Hp > 0, '하루가 끝나고 체력 회복');
  console.log('게임 오버 검사 통과', 'ore', s.Ore, 'repaid', s.LastRepaid);
}

// 거점 서쪽 내 집: 문 앞에서 E → 원룸 장면(Lv1), 아래 문으로 나가면 거점 집 앞
{
  const r = await runProject(project, {scene: scene('Hub'), frames: 520, delta: 1 / 60, nativeDefaults: {Director: {Phase: 2}}, inputs: [
    {frame: 2, key: 'w', value: 1}, {frame: 40, key: 'w', value: 0}, {frame: 42, key: 'a', value: 1}, {frame: 290, key: 'a', value: 0},
    ...press(300, 'e'), {frame: 400, key: 's', value: 1}, {frame: 500, key: 's', value: 0}]});
  const scenes = r.sceneHistory.map(h => h.scene);
  assert.ok(scenes.includes(scene('Home_1')), '집 문에서 E → 원룸 Lv1');
  assert.equal(scenes.at(-1), scene('Hub'), '원룸 아래 문 → 거점');
  const p = r.objects.find(o => o.id === 'Player').position;
  assert.ok(p[0] < -20, '거점 집 앞에서 나옴');
  console.log('원룸 검사 통과', scenes.map(s => s.split('/').at(-1)).join(' → '));
}

// 일시정지(Esc): 멈춘 동안 W를 눌러도 안 움직이고, 다시 Esc면 계속. 첫 전투방 안내 문구가 한 번 나옴
{
  const r = await runProject(project, {scene: scene('Test_Valen'), frames: 160, delta: 1 / 60, inputs: [
    ...press(20, 'escape'), {frame: 30, key: 'w', value: 1}, {frame: 90, key: 'w', value: 0}]});
  const s = director(r), y = r.objects.find(o => o.id === 'Player').position[1];
  assert.ok(s.Paused, 'Esc로 일시정지');
  assert.ok(Math.abs(y - -1) < 0.3, '멈춘 동안 움직이지 않음');
  const t = await runProject(project, {scene: scene('Test_Valen'), frames: 60, delta: 1 / 60, inputs: [...warps(5, 1)]});
  assert.ok(director(t).TipsShown & 2, '첫 전투방 안내 문구');
  console.log('일시정지·안내 문구 검사 통과', 'tips', director(t).TipsShown);
}

// 구르기(Space): 바라보는 방향으로 1초 대시(이동속도 2배·무적), 그림이 구르기로 바뀜 (기획서 4-1)
{
  let rolling = '';
  const r = await runProject(project, {scene: scene('Test_Valen'), frames: 90, delta: 1 / 60, inputs: [
    {frame: 5, key: 'd', value: 1}, {frame: 8, key: 'd', value: 0}, ...press(10, 'space')],
    onFrame: (frame, vm) => { if (frame === 25) rolling = vm.objects.find(o => o.id === 'Player').components.find(c => c.type === 'SpriteRenderer').properties.sprite; }});
  const x = r.objects.find(o => o.id === 'Player').position[0];
  assert.ok(/_Roll_/.test(rolling), `구르는 동안 구르기 그림 (${rolling})`);
  assert.ok(x > 3, '오른쪽으로 굴러 나감');
  console.log('구르기 검사 통과', rolling.split('/').at(-1), 'x', x.toFixed(1));
}

// 걸으며 공격: 움직이면서 베면 서서 베는 그림이 아니라 윗몸은 공격·다리는 걷기인 합성 그림
{
  const seen = new Set();
  await runProject(project, {scene: scene('Test_Valen'), frames: 60, delta: 1 / 60, inputs: [
    {frame: 5, key: 'd', value: 1}, {frame: 10, key: 'LeftMouseButton', value: 1}, {frame: 50, key: 'LeftMouseButton', value: 0}, {frame: 55, key: 'd', value: 0}],
    onFrame: (frame, vm) => { if (frame > 12 && frame < 50) seen.add(vm.objects.find(o => o.id === 'Player').components.find(c => c.type === 'SpriteRenderer').properties.sprite.split('/').at(-1)); }});
  const names = [...seen];
  assert.ok(names.some(n => /_WalkAttack_\d_\d/.test(n)), `걸으며 공격 그림 (${names.join(', ')})`);
  assert.ok(!names.some(n => /_Attack_\d\.hbsprite/.test(n) && !/WalkAttack/.test(n)), `움직이는 동안 서서 공격 그림 없음 (${names.join(', ')})`);
  console.log('걸으며 공격 검사 통과', names.filter(n => /WalkAttack/.test(n)).length, '종류');
}

// 타이틀·선택 입력: 아무 키(K)로 타이틀을 넘기고, →로 셰리를 고른 뒤 2를 한 번 더 누르면 결정
{
  const r = await runProject(project, {scene: scene('Hub'), frames: 200, delta: 1 / 60, inputs: [
    ...press(110, 'k'), ...press(140, 'arrowright'), ...press(160, '2'), ...press(175, '2')]});
  const d = director(r);
  assert.equal(d.Phase, 2, '아무 키로 타이틀 → 선택 → 결정');
  assert.equal(d.Character, 1, '→로 셰리, 다시 2로 결정');
  console.log('타이틀·선택 입력 검사 통과', 'Character', d.Character);
}
