// 걸어 다니며 끼임 찾기: 던전 모든 방·모든 문을 실제 키 입력으로 오가고, 방마다 네 벽에 붙었다 떨어져 본다.
//   - 문 통과: 문 축에 맞춘 뒤 복도를 지나 옆 방 가운데까지. 0.7초 동안 거의 못 나가면 "끼임"
//   - 벽: 벽까지 간 뒤 벽을 따라 미끄러지기 / 반대로 떨어지기. 떨어지지 못하면 "벽에 붙음"
//   - 발이 방·복도 밖(벽 속)에 있으면 "벽 밖"
// 적이 나오면 문이 잠겨 돌아다닐 수 없으므로 웨이브를 비운 프로젝트 사본(임시 폴더, 끝나면 지움)에서 돌린다.
// 실행: <HBEngine 사용자용 폴더>/runtime/node.exe tools/check_walk.mjs [씨앗...=7 11 23]
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {ENGINE} from './engine.mjs';

const {runProject} = await import(pathToFileURL(path.join(ENGINE, 'tools/run-project.mjs')).href);
const here = path.dirname(fileURLToPath(import.meta.url)), source = path.join(here, '../AuricLoop');
const seeds = process.argv.slice(2).map(Number).filter(Number.isFinite);
if (!seeds.length) seeds.push(7, 11, 23);

const copy = await fs.mkdtemp(path.join(os.tmpdir(), 'auric-walk-'));
const issues = [];
try {
  await fs.cp(source, copy, {recursive: true, filter: f => !/[\\/](Builds|Saved)([\\/]|$)/.test(f)});
  const table = path.join(copy, 'Assets/Data/DT_Rooms.hbdata.json'), rooms = JSON.parse(await fs.readFile(table, 'utf8'));
  for (const row of Object.values(rooms.rows)) row.waves = '';
  await fs.writeFile(table, JSON.stringify(rooms));
  for (const seed of seeds) issues.push(...await walkDungeon(path.join(copy, 'AuricLoop.hbproject'), seed));
} finally {
  await fs.rm(copy, {recursive: true, force: true});
}
for (const i of issues) console.log(`[씨앗 ${i.seed}] ${i.kind}: ${i.where} 발 (${i.feet.map(v => v.toFixed(2)).join(', ')})${i.note ? ' — ' + i.note : ''}`);
assert.equal(issues.length, 0, `걷기 검사 문제 ${issues.length}건`);
console.log('걷기 검사 통과', seeds.map(s => '씨앗 ' + s).join(', '));

async function walkDungeon(project, seed) {
  const found = [], C = 4 / 3, DIRS = [[0, 1], [1, 0], [0, -1], [-1, 0]], NAME = ['북', '동', '남', '서'];
  let layout = null, bossAt = -1, plan = [], step = 0, held = new Set(), best = Infinity, still = 0, done = false, frame0 = 0, aborted = false;
  const director = vm => vm.objects.find(o => o.id === 'Director')?.nativeProperties;
  const feetOf = vm => { const p = vm.objects.find(o => o.id === 'Player').position; return [p[0], p[1] - 0.95]; };
  const inRoom = (r, f, m = 0.35) => Math.abs(f[0] - r.x) <= r.hw + m && Math.abs(f[1] - r.y) <= r.hh + m;
  const inCorridor = (a, d, f, m = 0.35) => { const b = layout[a.links[d]];
    // 폭(옆)만 m만큼 줄이고 길이는 방과 겹치게 (길찾기 지도에서 방과 복도 사이가 끊기지 않게)
    if (d === 0) return Math.abs(f[0] - a.x) <= C + m && f[1] >= a.y + a.hh - 1 && f[1] <= b.y - b.hh + 1;
    if (d === 1) return Math.abs(f[1] - a.y) <= C + m && f[0] >= a.x + a.hw - 1 && f[0] <= b.x - b.hw + 1;
    return false; };
  const inside = (f, m = 0.35) => layout.some(r => inRoom(r, f, m)) || layout.some(r => [0, 1].some(d => r.links[d] >= 0 && inCorridor(r, d, f, m)));
  const issue = (kind, where, f, note) => { if (!found.some(x => x.kind === kind && x.where === where)) found.push({seed, kind, where, feet: f, note}); };

  const build = () => {
    // 깊이 우선으로 모든 문을 오가는 경로: 문 축 맞추기 → 옆 방 문 안쪽 → 옆 방 가운데, 처음 들른 방에선 네 벽 검사
    const seen = new Set(), used = new Set();
    const visit = i => {
      seen.add(i); const r = layout[i];
      for (let d = 0; d < 4; d++) plan.push({kind: 'go', to: DIRS[d][0] ? [r.x, r.y + 2.5] : [r.x + 2.5, r.y], where: `방${i} 벽 검사 자리`}, {kind: 'wall', room: i, dir: d});  // 문 축(가운데)을 피해 벽으로
      plan.push({kind: 'go', to: [r.x, r.y], where: `방${i}(${r.kind}) 가운데`});
      for (let d = 0; d < 4; d++) {
        const j = r.links[d]; if (j < 0) continue;
        const key = [Math.min(i, j), Math.max(i, j)].join('-'); if (used.has(key)) continue; used.add(key);
        door(i, d); if (!seen.has(j)) visit(j); else plan.push({kind: 'go', to: [layout[j].x, layout[j].y], where: `방${j} 가운데`});
        door(j, (d + 2) % 4); plan.push({kind: 'go', to: [r.x, r.y], where: `방${i} 가운데`});
      }
    };
    const door = (i, d) => {
      const a = layout[i], b = layout[a.links[d]], [dx, dy] = DIRS[d], where = `방${i}→방${a.links[d]} ${NAME[d]}문`;
      const near = dx ? [a.x + dx * (a.hw - 2), a.y] : [a.x, a.y + dy * (a.hh - 2)];
      const far = dx ? [b.x - dx * (b.hw - 2), b.y] : [b.x, b.y - dy * (b.hh - 2)];
      plan.push({kind: 'go', to: near, where: where + ' 앞'}, {kind: 'go', to: far, where}, {kind: 'go', to: [b.x, b.y], where: where + ' 지나 가운데'});
    };
    visit(layout.findIndex(r => r.kind === 'Start'));
  };

  const keys = want => { const out = []; for (const k of held) if (!want.has(k)) { out.push({key: k, value: 0}); held.delete(k); } for (const k of want) if (!held.has(k)) { out.push({key: k, value: 1}); held.add(k); } return out; };
  const toward = (f, t) => {
    const dx = t[0] - f[0], dy = t[1] - f[1], want = new Set(), tol = 0.12;
    if (Math.abs(dx) > tol) want.add(dx > 0 ? 'd' : 'a');
    if (Math.abs(dy) > tol) want.add(dy > 0 ? 'w' : 's');
    return want;
  };

  // 길찾기: 장면의 충돌체(벽·기둥·상자 등)로 0.25m 격자를 만들고 A*로 경로를 찾음. 경로를 따라가다 막히면 진짜 끼임
  const CELL = 0.25, R = 0.4;
  let grid = null;
  const buildGrid = vm => {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const r of layout) { x0 = Math.min(x0, r.x - r.hw - 3); x1 = Math.max(x1, r.x + r.hw + 3); y0 = Math.min(y0, r.y - r.hh - 3); y1 = Math.max(y1, r.y + r.hh + 3); }
    const w = Math.ceil((x1 - x0) / CELL), h = Math.ceil((y1 - y0) / CELL), block = new Uint8Array(w * h);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if (!inside([x0 + (i + .5) * CELL, y0 + (j + .5) * CELL], -R)) block[j * w + i] = 1;
    for (const o of vm.objects) {
      if (o.id === 'Player' || o.collisionEnabled === false || !o.position || o.position[1] < -150 || o.poolActive === false) continue;
      for (const c of o.components || []) {
        const q = c.properties || {}; if (q.enabled === false || q.trigger || !/Collider2D$/.test(c.type)) continue;
        const sc = o.scale || [1, 1, 1], cx = o.position[0] + (q.center?.[0] || 0) * sc[0], cy = o.position[1] + (q.center?.[1] || 0) * sc[1];
        const hx = (c.type === 'CircleCollider2D' ? q.radius : q.extent?.[0] ?? .5) * Math.abs(sc[0]) + R, hy = (c.type === 'CircleCollider2D' ? q.radius : q.extent?.[1] ?? .5) * Math.abs(sc[1]) + R;
        for (let j = Math.max(0, Math.floor((cy - hy - y0) / CELL)); j <= Math.min(h - 1, Math.floor((cy + hy - y0) / CELL)); j++)
          for (let i = Math.max(0, Math.floor((cx - hx - x0) / CELL)); i <= Math.min(w - 1, Math.floor((cx + hx - x0) / CELL)); i++) block[j * w + i] = 1;
      }
    }
    grid = {x0, y0, w, h, block};
    if (process.env.WALK_DEBUG && !grid.logged) { grid.logged = true; let inn = 0, bl = 0; for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if (inside([x0 + (i + .5) * CELL, y0 + (j + .5) * CELL], -R)) { inn++; if (block[j * w + i]) bl++; }
      const names = {}; for (const o of vm.objects) if (o.position && o.position[1] > -150 && (o.components || []).some(c => /Collider2D$/.test(c.type) && !c.properties?.trigger && c.properties?.enabled !== false)) { const t = (o.tags || [o.id])[0]; names[t] = (names[t] || 0) + 1; }
      const line = []; for (let y = -8; y <= 40; y += 2) { const [ci, cj] = [Math.floor((0 - x0) / CELL), Math.floor((y - y0) / CELL)]; line.push(y + ':' + (block[cj * w + ci] ? 'X' : (inside([0, y], -R) ? '.' : 'o'))); } console.log('axis x=0', line.join(' '));
      console.log('grid', w, h, 'inside', inn, 'blocked', bl, JSON.stringify(names), JSON.stringify(layout.map(r => [r.kind, r.x, r.y, r.hw, r.hh]))); }
  };
  const cellOf = p => [Math.floor((p[0] - grid.x0) / CELL), Math.floor((p[1] - grid.y0) / CELL)];
  const free = (i, j) => i >= 0 && j >= 0 && i < grid.w && j < grid.h && !grid.block[j * grid.w + i];
  const nearestFree = ([i, j]) => { for (let r = 0; r < 40; r++) for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) if ((Math.abs(di) === r || Math.abs(dj) === r) && free(i + di, j + dj)) return [i + di, j + dj]; return null; };
  const findPath = (from, to) => {
    const s = nearestFree(cellOf(from)), g = nearestFree(cellOf(to)); if (!s || !g) return null;
    const W = grid.w, key = (i, j) => j * W + i, open = [[0, s[0], s[1]]], came = new Map([[key(...s), -1]]), cost = new Map([[key(...s), 0]]);
    const hfn = (i, j) => { const dx = Math.abs(i - g[0]), dy = Math.abs(j - g[1]); return Math.max(dx, dy) + .414 * Math.min(dx, dy); };
    let n = 0;
    while (open.length && n++ < 300000) {
      let bi = 0; for (let k = 1; k < open.length; k++) if (open[k][0] < open[bi][0]) bi = k;
      const [, i, j] = open[bi]; open[bi] = open[open.length - 1]; open.pop();
      if (i === g[0] && j === g[1]) { const out = []; for (let k = key(i, j); k !== -1; k = came.get(k)) out.push([grid.x0 + ((k % W) + .5) * CELL, grid.y0 + (Math.floor(k / W) + .5) * CELL]); return out.reverse(); }
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const ni = i + di, nj = j + dj; if (!free(ni, nj) || (di && dj && (!free(i + di, j) || !free(i, j + dj)))) continue;
        const nc = cost.get(key(i, j)) + (di && dj ? 1.414 : 1), k = key(ni, nj);
        if (nc < (cost.get(k) ?? Infinity)) { cost.set(k, nc); came.set(k, key(i, j)); open.push([nc + hfn(ni, nj), ni, nj]); }
      }
    }
    return null;
  };

  await runProject(project, {scene: 'Assets/Scenes/Test_Valen.hbscene.json', frames: +(process.env.WALK_FRAMES || 36000), delta: 1 / 30, nativeDefaults: {Director: {Seed: seed, MaxHp: 99}},
    onFrame: async (frame, vm) => {
      if (done) return;
      const d = director(vm); if (!d || frame < 3) return;
      if (!layout) { const all = JSON.parse(d.Layout); layout = (Array.isArray(all) ? all : all.rooms).filter(r => Array.isArray(r.links)); build(); frame0 = frame; }
      const f = feetOf(vm);
      if (bossAt < 0 && layout.some(r => r.kind === 'Boss' && inRoom(r, f, -0.5))) bossAt = frame;  // 보스방 첫 입장: 등장 컷신 3.2초 동안 조작이 막힘 (끼임 아님)
      if (bossAt >= 0 && frame - bossAt < 120) { best = Infinity; still = 0; }
      if (!inside(f)) issue('벽 밖', plan[step]?.where || '?', f, '발이 방·복도 밖');
      const s = plan[step];
      if (!s || frame - frame0 > 34000) { done = true; for (const p of keys(new Set())) await vm.dispatchInput(p); return; }
      let want;
      if (s.kind === 'go') {
        if (!s.path) { buildGrid(vm); s.path = findPath(f, s.to); s.replans = s.replans || 0; best = Infinity; still = 0;
          if (!s.path) { issue('길 없음', s.where, f, '충돌체 지도에서 경로를 못 찾음 (문·통로가 막힘)'); step++; want = new Set(); for (const p of keys(want)) await vm.dispatchInput(p); return; } }
        const end = s.path[s.path.length - 1], dist = Math.hypot(end[0] - f[0], end[1] - f[1]);
        if (dist < 0.3) { step++; want = new Set(); }
        else {
          if (dist < best - 0.05) { best = dist; still = 0; } else still++;
          if (still > 24) {  // 경로를 따라가는데 0.8초 동안 못 나감: 한 번 다시 길을 찾고, 그래도 막히면 끼임
            if (s.replans++ < 1) { s.path = null; want = new Set(); }
            else { issue('끼임', s.where, f, `남은 거리 ${dist.toFixed(1)}m`); step++; want = new Set();
              if (found.filter(x => x.kind === '끼임').length >= 8) { aborted = true; done = true; } }
          } else {
            while (s.path.length > 1 && Math.hypot(s.path[0][0] - f[0], s.path[0][1] - f[1]) < 0.45) s.path.shift();
            want = toward(f, s.path[0]);
          }
        }
      } else {  // 벽: 벽까지 → 벽 따라 0.5초 → 벽에서 떨어지기 0.5초
        s.phase ??= 'reach'; s.t ??= 0; s.t++;
        const [dx, dy] = DIRS[s.dir], k = dx > 0 ? 'd' : dx < 0 ? 'a' : dy > 0 ? 'w' : 's', away = {d: 'a', a: 'd', w: 's', s: 'w'}[k], side = dx ? 'w' : 'd';
        if (s.phase === 'reach') {
          want = new Set([k]); s.last ??= f; s.still = Math.hypot(f[0] - s.last[0], f[1] - s.last[1]) < 0.01 ? (s.still || 0) + 1 : 0; s.last = f;
          if (s.still > 4 || s.t > 300) { s.phase = 'slide'; s.t = 0; s.from = f; }
        } else if (s.phase === 'slide') {
          want = new Set([k, side]);
          if (s.t > 15) { s.phase = 'leave'; s.t = 0; s.from = f; }
        } else {
          want = new Set([away]);
          if (s.t > 15) {
            const moved = Math.hypot(f[0] - s.from[0], f[1] - s.from[1]);
            if (moved < 0.8) issue('벽에 붙음', `방${s.room}(${layout[s.room].kind}) ${NAME[s.dir]}쪽 벽`, f, `떨어지려 했는데 ${moved.toFixed(2)}m만 움직임`);
            step++;
          }
        }
      }
      for (const p of keys(want)) await vm.dispatchInput(p);
    }});
  if (aborted) found.push({seed, kind: '중단', where: '끼임이 많아 이 씨앗 검사 중단', feet: [0, 0]});
  if (step < plan.length && !aborted) found.push({seed, kind: '시간 초과', where: `${plan.length}단계 중 ${step}단계까지`, feet: [0, 0]});
  console.log(`씨앗 ${seed}: 방 ${layout?.length}개, ${plan.length}단계 중 ${step}단계, 문제 ${found.length}건`);
  return found;
}
