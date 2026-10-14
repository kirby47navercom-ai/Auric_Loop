// 거점·집·던전 출입 걷기 검사: 실제 키 입력으로
//   거점 곳곳 걷기 → 집 들어가기(E) → 집 안 걷기 → 집 나오기 → 거점 계단으로 던전 → 시작 방 계단으로 거점
// 장면에 들어설 때마다 네 방향으로 움직여 봐서 벽·물체에 끼어 못 움직이면 "못 움직임", 길을 따라가다 막히면 "끼임"
// 실행: <HBEngine 사용자용 폴더>/runtime/node.exe tools/check_walk_town.mjs
import assert from 'node:assert/strict';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {ENGINE} from './engine.mjs';
import {buildGrid, findPath, toward, keyPackets, freeAt} from './walk_lib.mjs';

const {runProject} = await import(pathToFileURL(path.join(ENGINE, 'tools/run-project.mjs')).href);
const project = path.join(path.dirname(fileURLToPath(import.meta.url)), '../AuricLoop/AuricLoop.hbproject');
const issues = [], held = new Set();
let rng = 7; const random = () => (rng = (rng * 16807) % 2147483647) / 2147483647;

const sceneOf = vm => vm.objects.some(o => o.id === 'HomeEnter') ? 'hub' : vm.objects.some(o => o.id === 'Sofa') ? 'home' : vm.objects.some(o => (o.tags || []).includes('Dungeon.Cap')) ? 'dungeon' : '?';
const feetOf = vm => { const p = vm.objects.find(o => o.id === 'Player')?.position; return p ? [p[0], p[1] - 0.95] : null; };
const BOUNDS = {hub: [-35, -13, 57.5, 25], home: null, dungeon: null};
const area = vm => {
  const s = sceneOf(vm);
  if (s === 'home') { const sofa = vm.objects.find(o => o.id === 'Sofa'); const big = sofa.position[0] < -3; return big ? [-7, -5, 7, 7] : [-5, -4, 5, 6]; }
  if (s === 'dungeon') { const d = vm.objects.find(o => o.id === 'Director').nativeProperties; const r = JSON.parse(d.Layout).find(x => x.kind === 'Start'); return [r.x - r.hw, r.y - r.hh, r.x + r.hw, r.y + r.hh]; }
  return BOUNDS.hub;
};
const issue = (kind, where, f, note) => { if (!issues.some(x => x.kind === kind && x.where === where)) issues.push({kind, where, f: f || [0, 0], note}); };

// 할 일 목록 (장면이 바뀌어도 이어 감)
const plan = [{kind: 'press', key: 'e', times: 10, where: '거점 첫 대화 넘기기'}, {kind: 'escape', where: '거점 시작'}];
for (let k = 0; k < 10; k++) plan.push({kind: 'roam', where: `거점 돌아다니기 ${k + 1}`});
plan.push({kind: 'go', to: [-24, 0.3], where: '집 문 앞'}, {kind: 'press', key: 'e', times: 1, where: '집 들어가기'}, {kind: 'wait', scene: 'home', where: '집 들어가기'},
  {kind: 'escape', where: '집 안 도착'});
for (let k = 0; k < 4; k++) plan.push({kind: 'roam', where: `집 안 돌아다니기 ${k + 1}`});
plan.push({kind: 'go', to: [0, -2.4], where: '집 문 쪽'}, {kind: 'hold', key: 's', scene: 'hub', where: '집 나오기'}, {kind: 'escape', where: '집에서 나와 거점 도착'},
  {kind: 'go', to: [0, 15], where: '거점 계단 아래'}, {kind: 'hold', key: 'w', scene: 'dungeon', where: '거점 계단으로 던전'}, {kind: 'escape', where: '던전 시작 방 도착'},
  {kind: 'stairs', where: '시작 방 계단 앞'}, {kind: 'hold', key: 'w', scene: 'hub', where: '시작 방 계단으로 거점'}, {kind: 'escape', where: '던전에서 거점 도착'});

let step = 0, t = 0, grid = null, gridScene = '', best = Infinity, still = 0, finished = false;
await runProject(project, {scene: 'Assets/Scenes/Hub.hbscene.json', frames: 20000, delta: 1 / 30, nativeDefaults: {Director: {Phase: 2}},
  onFrame: async (frame, vm) => {
    if (finished || frame < 3) return;
    const s = plan[step], f = feetOf(vm), scene = sceneOf(vm);
    if (!s) { finished = true; for (const p of keyPackets(held, new Set())) await vm.dispatchInput(p); return; }
    if (!f) return;
    if (scene !== gridScene) { grid = null; gridScene = scene; }
    const map = () => grid ??= buildGrid(vm, area(vm), (p, m) => { const b = area(vm); return p[0] >= b[0] - m && p[0] <= b[2] + m && p[1] >= b[1] - m && p[1] <= b[3] + m; });
    const next = () => { step++; t = 0; best = Infinity; still = 0; s.path = null; };
    let want = new Set(); t++;
    if (s.kind === 'press') {  // 2프레임 누르고 4프레임 뗌
      const k = t % 6; if (k < 2) want.add(s.key); if (t >= s.times * 6) next();
    } else if (s.kind === 'wait' || s.kind === 'hold') {
      if (s.kind === 'hold') want.add(s.key);
      if (scene === s.scene) { next(); want = new Set(); }
      else if (t > 240) { issue('장면 안 바뀜', s.where, f, `8초 안에 ${s.scene}로 못 감`); finished = true; }
    } else if (s.kind === 'escape') {  // 손을 0.3초 뗀 뒤 네 방향을 쉬지 않고 0.4초씩 바꿔 누름: 그쪽이 비어 있는데 못 움직이면 문제
      const dir = Math.floor((t - 11) / 12), keys = ['w', 'd', 's', 'a'], vec = [[0, 1], [1, 0], [0, -1], [-1, 0]];
      if (t <= 10) want = new Set();
      else if (dir >= 4) next();
      else {
        const phase = (t - 11) % 12; if (phase === 0) s.from = f;
        want.add(keys[dir]);
        if (phase === 11) {
          const moved = Math.hypot(f[0] - s.from[0], f[1] - s.from[1]), [vx, vy] = vec[dir];
          if (moved < 0.3 && freeAt(map(), [s.from[0] + vx * 0.8, s.from[1] + vy * 0.8])) issue('못 움직임', `${s.where} ${['위', '오른쪽', '아래', '왼쪽'][dir]}`, s.from, `빈 쪽인데 ${moved.toFixed(2)}m만 움직임`);
        }
      }
    } else {  // go · roam · stairs: 길찾기로 걸어감
      if (!s.to) {
        if (s.kind === 'roam') { const b = area(vm); for (let k = 0; k < 200 && !s.to; k++) { const p = [b[0] + random() * (b[2] - b[0]), b[1] + random() * (b[3] - b[1])]; if (freeAt(map(), p) && findPath(map(), f, p)) s.to = p; } }  // 가구 뒤처럼 막힌 곳은 고르지 않음
        if (s.kind === 'stairs') { const st = vm.objects.find(o => (o.tags || []).includes('Dungeon.Stairs')); s.to = [st.position[0], st.position[1] - 2.6]; }
        if (!s.to) { next(); return; }
      }
      if (!s.path) { s.path = findPath(map(), f, s.to); if (!s.path) { issue('길 없음', s.where, f, `(${s.to.map(v => v.toFixed(1))})로 가는 길을 못 찾음`); next(); return; } }
      const end = s.path[s.path.length - 1], dist = Math.hypot(end[0] - f[0], end[1] - f[1]);
      if (dist < 0.3) next();
      else {
        if (dist < best - 0.05) { best = dist; still = 0; } else still++;
        if (still > 24) { if ((s.replans = (s.replans || 0) + 1) < 2) { s.path = null; grid = null; still = 0; best = Infinity; } else { issue('끼임', s.where, f, `남은 거리 ${dist.toFixed(1)}m`); next(); } }
        else { while (s.path.length > 1 && Math.hypot(s.path[0][0] - f[0], s.path[0][1] - f[1]) < 0.45) s.path.shift(); want = toward(f, s.path[0]); }
      }
    }
    for (const p of keyPackets(held, want)) await vm.dispatchInput(p);
  }});
if (!finished) issue('시간 초과', `${plan.length}단계 중 ${step}단계`, null);
for (const i of issues) console.log(`${i.kind}: ${i.where} 발 (${i.f.map(v => v.toFixed(2)).join(', ')})${i.note ? ' — ' + i.note : ''}`);
assert.equal(issues.length, 0, `거점·집·출입 걷기 문제 ${issues.length}건`);
console.log('거점·집·출입 걷기 검사 통과', `${plan.length}단계`);
