// 미니맵이 던전 배치와 같은지: 방을 하나씩 지나가며 (F9) 지도에 그린 방 칸(Director.MapCells)을 실제 방(Director.Layout)과 비교
//   - 방이 늘어도 1m당 칸 크기가 같음 (예전엔 아는 방이 늘수록 지도가 작아짐)
//   - 두 방 칸 사이 거리 = 실제 방 사이 거리 × 같은 배율 (위치·방향이 실제와 같음)
// 실행: <HBEngine 사용자용 폴더>/runtime/node.exe tools/check_map.mjs [씨앗...=7 11 23]   (실패하면 종료 코드 1)
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {ENGINE} from './engine.mjs';

const {runProject} = await import(pathToFileURL(path.join(ENGINE, 'tools/run-project.mjs')).href);
const project = path.join(path.dirname(fileURLToPath(import.meta.url)), '../AuricLoop/AuricLoop.hbproject');
const seeds = process.argv.slice(2).map(Number); if (!seeds.length) seeds.push(7, 11, 23);
let failed = false;
for (const seed of seeds) {
  const inputs = [];
  for (let f = 120; f < 120 + 14 * 90; f += 90) inputs.push({frame: f, key: 'F9', value: 1}, {frame: f + 3, key: 'F9', value: 0});
  const scales = new Set(), errors = [];let rooms = 0, maxShown = 0;
  await runProject(project, {scene: 'Assets/Scenes/Test_Valen.hbscene.json', frames: 120 + 14 * 90 + 30, delta: 1 / 60, inputs,
    nativeDefaults: {Director: {Seed: seed, MaxHp: 99}},
    onFrame: (frame, vm) => {
      if (frame % 30) return;
      const d = vm.objects.find(o => o.id === 'Director')?.nativeProperties || {};
      if (!d.MapCells || !d.Layout) return;
      const layout = JSON.parse(d.Layout).filter(r => r.kind !== 'Shortage'); rooms = layout.length;
      const cells = d.MapCells.split(';').filter(Boolean).map(c => { const [i, v] = c.split(':'); const [x, y, w, h] = v.split(',').map(Number); return {i: +i, x, y, w, h}; });
      maxShown = Math.max(maxShown, cells.length);
      for (const c of cells) { const r = layout[c.i]; scales.add((c.w / (2 * r.hw)).toFixed(2)); scales.add((c.h / (2 * r.hh)).toFixed(2)); }
      const s = cells.length ? cells[0].w / (2 * layout[cells[0].i].hw) : 0;
      for (const a of cells) for (const b of cells) {
        const ra = layout[a.i], rb = layout[b.i];
        const dx = (b.x - a.x) - ((rb.x - rb.hw) - (ra.x - ra.hw)) * s, dy = (b.y - a.y) + ((rb.y + rb.hh) - (ra.y + ra.hh)) * s;  // 화면 y는 아래로
        if (Math.abs(dx) > 0.3 || Math.abs(dy) > 0.3) errors.push(`프레임 ${frame} 방 ${a.i}-${b.i} 어긋남 ${dx.toFixed(1)},${dy.toFixed(1)}`);
      }
    }});
  const ok = scales.size === 1 && !errors.length && maxShown > 1;
  if (!ok) failed = true;
  console.log(`${ok ? 'OK  ' : 'FAIL'} 씨앗 ${seed}: 방 ${rooms}개, 지도에 그린 방 최대 ${maxShown}개, 1m당 칸 크기 ${[...scales].join('/')}px${errors.length ? ', ' + errors.slice(0, 3).join(' / ') : ''}`);
}
if (failed) process.exitCode = 1;
