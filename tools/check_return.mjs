// 귀환 끝까지: 보스방에서 해골 대장 처치 → [귀환] → 지나온 방을 F9로 거꾸로 → 시작 방 계단 → 거점 정산
// 실행: <HBEngine 사용자용 폴더>/runtime/node.exe tools/check_return.mjs
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {ENGINE} from './engine.mjs';

const {runProject} = await import(pathToFileURL(path.join(ENGINE, 'tools/run-project.mjs')).href);
const project = path.join(path.dirname(fileURLToPath(import.meta.url)), '../AuricLoop/AuricLoop.hbproject');
const press = (frame, key, extra = {}) => [{frame, key, value: 1, ...extra}, {frame: frame + 2, key, value: 0, ...extra}];
const taps = (from, to) => { const out = []; for (let f = from; f + 4 < to; f += 23) out.push({frame: f, key: 'LeftMouseButton', value: 1, device: 'touch', source: 'ui'}, {frame: f + 4, key: 'LeftMouseButton', value: 0, device: 'touch', source: 'ui'}); return out; };
const director = vm => vm.objects.find(o => o.id === 'Director')?.nativeProperties || {};

const inputs = [...press(80, 'e'), ...press(90, 'e'), ...taps(100, 3000), ...press(3005, 'tab'), ...press(3010, 'enter'), ...press(3020, 'e'), ...press(3030, 'e')];
let f = 3100;
for (let i = 0; i < 8; i++, f += 240) inputs.push(...press(f, 'F9'));  // 귀환 중 F9 = 앞(시작 쪽) 방 가운데로
inputs.push({frame: f, key: 'a', value: 1}, {frame: f + 47, key: 'a', value: 0}, {frame: f + 60, key: 'w', value: 1}, {frame: f + 400, key: 'w', value: 0});  // 시작 방 위쪽 계단으로
const end = f + 1400;
const log = [];
let last = '';
await runProject(project, {scene: 'Assets/Scenes/Test_Valen.hbscene.json', frames: end, delta: 1 / 60,
  nativeDefaults: {Director: {StartRoom: 'Boss'}}, inputs,
  onFrame: (frame, vm) => {
    const s = director(vm);
    const line = `scene=${vm.scenePath ?? ''} room=${s.RoomIndex} ret=${s.Returning} ok=${s.ReturnSuccess} ko=${s.KnockedOut} hp=${s.Hp} fat=${s.Fatigue}/${s.FatigueMax} doors=${s.DoorHits} item=${s.HasReturnItem}`;
    if (line !== last) { log.push(`${frame}: ${line}`); last = line; }
    if (frame % 200 === 0 && frame > 3800) { const pl = vm.objects.find(o => o.id === 'Player' || o.name === 'Player'), st = vm.objects.find(o => (o.tags || []).includes('Dungeon.Stairs')); log.push(`  ${frame} player ${pl?.position?.map(v => v.toFixed(1))} stairs ${st?.position?.map(v => v.toFixed(1))}`); }
  }});
console.log(log.join('\n'));
