// 싸우며 버그 찾기: 실제 웨이브가 나오는 던전에서 F9로 경로 방을 차례로 들어가 자동으로 싸운다 (보스까지)
//   - 플레이어·적의 발이 방·복도 밖(벽 속)에 있으면 "벽 밖" / "적 벽 밖"
//   - 문이 잠긴 채 60초가 지나도 방이 안 끝나면 "싸움 안 끝남" (진행 막힘)
//   - 대시(스페이스)를 섞어 써서 벽·물체를 뚫는지도 위 검사로 잡음
// 실행: <HBEngine 사용자용 폴더>/runtime/node.exe tools/check_fight.mjs [씨앗...=7 11]
import assert from 'node:assert/strict';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {ENGINE} from './engine.mjs';
import {buildGrid, findPath, toward, keyPackets} from './walk_lib.mjs';

const {runProject} = await import(pathToFileURL(path.join(ENGINE, 'tools/run-project.mjs')).href);
const project = path.join(path.dirname(fileURLToPath(import.meta.url)), '../AuricLoop/AuricLoop.hbproject');
const seeds = process.argv.slice(2).map(Number).filter(Number.isFinite);
if (!seeds.length) seeds.push(7, 11);
const issues = [];
for (const seed of seeds) issues.push(...await fight(seed));
for (const i of issues) console.log(`[씨앗 ${i.seed}] ${i.kind}: ${i.where}${i.f ? ` (${i.f.map(v => v.toFixed(2)).join(', ')})` : ''}${i.note ? ' — ' + i.note : ''}`);
assert.equal(issues.length, 0, `전투 검사 문제 ${issues.length}건`);
console.log('전투 검사 통과', seeds.map(s => '씨앗 ' + s).join(', '));

async function fight(seed) {
  const found = [], C = 4 / 3, held = new Set();
  let layout = null, grid = null, gridAt = -999, path = null, lastAttack = 0, lastDash = 0, warps = 0, lockedSince = -1, clears = 0, done = false, bossSeen = false, bossDead = false;
  const issue = (kind, where, f, note) => { if (!found.some(x => x.kind === kind && x.where === where)) found.push({seed, kind, where, f, note}); };
  const inRoom = (r, f, m) => Math.abs(f[0] - r.x) <= r.hw + m && Math.abs(f[1] - r.y) <= r.hh + m;
  const inside = (f, m = 0.4) => layout.some(r => inRoom(r, f, m)) || layout.some(a => [0, 1].some(d => { const j = a.links[d]; if (j < 0) return false; const b = layout[j];
    return d === 0 ? Math.abs(f[0] - a.x) <= C + m && f[1] >= a.y + a.hh - 1 && f[1] <= b.y - b.hh + 1 : Math.abs(f[1] - a.y) <= C + m && f[0] >= a.x + a.hw - 1 && f[0] <= b.x - b.hw + 1; }));
  const bounds = () => { let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const r of layout) { x0 = Math.min(x0, r.x - r.hw - 3); x1 = Math.max(x1, r.x + r.hw + 3); y0 = Math.min(y0, r.y - r.hh - 3); y1 = Math.max(y1, r.y + r.hh + 3); } return [x0, y0, x1, y1]; };
  await runProject(project, {scene: 'Assets/Scenes/Test_Valen.hbscene.json', frames: 30000, delta: 1 / 30, nativeDefaults: {Director: {Seed: seed, MaxHp: 999}},
    onFrame: async (frame, vm) => {
      if (done || frame < 3) return;
      const d = vm.objects.find(o => o.id === 'Director')?.nativeProperties; if (!d) return;
      if (!layout) { const all = JSON.parse(d.Layout); layout = (Array.isArray(all) ? all : all.rooms).filter(r => Array.isArray(r.links)); }
      const p = vm.objects.find(o => o.id === 'Player').position, f = [p[0], p[1] - 0.95];
      if (!inside(f)) issue('벽 밖', `플레이어 (방 클리어 ${d.RoomClears})`, f);
      const enemies = vm.objects.filter(o => (o.tags || []).some(t => t.startsWith('Enemy.')) && o.position[1] > -150 && o.poolActive !== false);
      for (const e of enemies) { const ef = [e.position[0], e.position[1] - 0.8]; if (!inside(ef, 0.8)) issue('적 벽 밖', `${e.id} (방 클리어 ${d.RoomClears})`, ef); }
      const locked = vm.objects.some(o => (o.tags || []).some(t => t === 'Dungeon.Gate' || t === 'Dungeon.GateSide') && o.position[1] > -150);
      if (locked) { if (lockedSince < 0) lockedSince = frame; else if (frame - lockedSince > 1800) { issue('싸움 안 끝남', `방 클리어 ${d.RoomClears} 뒤`, f, `문이 잠긴 채 60초, 남은 적 ${enemies.length}`); done = true; } }
      else lockedSince = -1;
      if (d.RoomClears !== clears) clears = d.RoomClears;
      const boss = enemies.find(e => e.id.startsWith('SkeletonCaptain'));
      if (boss) bossSeen = true; else if (bossSeen && !locked) bossDead = true;  // 보스가 나왔다가 사라지고 문이 열림
      let want = new Set();
      if (!enemies.length && !locked) {  // 싸울 게 없으면 다음 경로 방으로 (F9)
        if (bossDead || warps > 8) { done = true; for (const k of keyPackets(held, want)) await vm.dispatchInput(k); return; }
        if (frame % 45 === 0) { await vm.dispatchInput({key: 'F9', value: 1}); warps++; path = null; }
        else if (frame % 45 === 2) await vm.dispatchInput({key: 'F9', value: 0});
      } else if (enemies.length) {  // 가장 가까운 적에게 길찾기로 다가가 베기, 가끔 대시
        let best = null, bd = Infinity; for (const e of enemies) { const dd = Math.hypot(e.position[0] - p[0], e.position[1] - p[1]); if (dd < bd) { bd = dd; best = e; } }
        if (bd > 1.8) {
          if (!grid || frame - gridAt > 30) { grid = buildGrid(vm, bounds(), inside); gridAt = frame; path = null; }
          if (!path || frame % 15 === 0) path = findPath(grid, f, [best.position[0], best.position[1] - 0.8]);
          if (path) { while (path.length > 1 && Math.hypot(path[0][0] - f[0], path[0][1] - f[1]) < 0.45) path.shift(); want = toward(f, path[0]); }
        } else want = toward(p, best.position, 0.3);
        if (bd < 2.6 && frame - lastAttack > 8) { lastAttack = frame; await vm.dispatchInput({key: 'LeftMouseButton', value: 1}); }
        else if (frame - lastAttack === 2) await vm.dispatchInput({key: 'LeftMouseButton', value: 0});
        if (frame - lastDash > 75 && Math.random() < 0.05) { lastDash = frame; await vm.dispatchInput({key: 'space', value: 1}); }
        else if (frame - lastDash === 2) await vm.dispatchInput({key: 'space', value: 0});
      }
      for (const k of keyPackets(held, want)) await vm.dispatchInput(k);
    }});
  if (!done) issue('시간 초과', `경로 방 이동 ${warps}번, 방 클리어 ${clears}`, null);
  if (!bossDead && !found.length) issue('보스 못 잡음', `경로 방 이동 ${warps}번, 방 클리어 ${clears}`, null);
  console.log(`씨앗 ${seed}: 방 클리어 ${clears}, 경로 이동 ${warps}, 보스 처치 ${bossDead}, 문제 ${found.length}건`);
  return found;
}
