// 귀환 규칙 (2026-11-11): 보스방에서 [귀환]은 보스를 쓰러뜨리기 전엔 안 써짐 → 해골 대장 처치·방 정리 → Tab·Enter로 [귀환] → 거점 정산
// 실행: <HBEngine 사용자용 폴더>/runtime/node.exe tools/check_return.mjs   (실패하면 종료 코드 1)
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {ENGINE} from './engine.mjs';

const {runProject} = await import(pathToFileURL(path.join(ENGINE, 'tools/run-project.mjs')).href);
const project = path.join(path.dirname(fileURLToPath(import.meta.url)), '../AuricLoop/AuricLoop.hbproject');
const press = (frame, key, extra = {}) => [{frame, key, value: 1, ...extra}, {frame: frame + 2, key, value: 0, ...extra}];
const taps = (from, to) => { const out = []; for (let f = from; f + 4 < to; f += 23) out.push({frame: f, key: 'LeftMouseButton', value: 1, device: 'touch', source: 'ui'}, {frame: f + 4, key: 'LeftMouseButton', value: 0, device: 'touch', source: 'ui'}); return out; };
const director = vm => vm.objects.find(o => o.id === 'Director')?.nativeProperties || {};

// 300: 싸우는 중 귀환 시도 (막혀야 함) / 320~3000 공격 / 3005·3010 귀환
const inputs = [...press(80, 'e'), ...press(90, 'e'), ...press(300, 'tab'), ...press(306, 'enter'), ...press(312, 'tab'), ...taps(320, 3000),
  ...press(3005, 'tab'), ...press(3010, 'enter')];
const end = 3400, log = [];
let last = '', earlyReturn = false, arrived = false;
await runProject(project, {scene: 'Assets/Scenes/Test_Valen.hbscene.json', frames: end, delta: 1 / 60,
  nativeDefaults: {Director: {StartRoom: 'Boss'}}, inputs,
  onFrame: (frame, vm) => {
    const s = director(vm);
    if (frame > 306 && frame < 340 && (s.Returning || s.RoomIndex < 0)) earlyReturn = true;
    if (s.ReturnSuccess && s.RoomIndex < 0) arrived = true;
    const line = `room=${s.RoomIndex} ret=${s.Returning} ok=${s.ReturnSuccess} hp=${s.Hp} item=${s.HasReturnItem} gold=${s.Gold} debt=${s.Debt}`;
    if (line !== last) { log.push(`${frame}: ${line}`); last = line; }
  }});
console.log(log.join('\n'));
console.log(earlyReturn ? 'FAIL: 보스 전에 귀환됨' : 'OK: 보스 전 귀환 막힘');
console.log(arrived ? 'OK: 귀환 → 거점 정산' : 'FAIL: 거점에 도착하지 못함');
if (earlyReturn || !arrived) process.exitCode = 1;
