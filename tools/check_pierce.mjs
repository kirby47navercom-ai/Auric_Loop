// 셰리 관통 각인: 화살 한 발이 같은 적을 여러 프레임 동안 다시 맞히지 않는지 (예전엔 겹친 매 프레임 다시 맞아 멈칫·이펙트가 쌓여 렉)
// 실행: <HBEngine 사용자용 폴더>/runtime/node.exe tools/check_pierce.mjs   (실패하면 종료 코드 1)
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {ENGINE} from './engine.mjs';

const {runProject} = await import(pathToFileURL(path.join(ENGINE, 'tools/run-project.mjs')).href);
const project = path.join(path.dirname(fileURLToPath(import.meta.url)), '../AuricLoop/AuricLoop.hbproject');
const inputs = [{frame: 80, key: 'e', value: 1}, {frame: 82, key: 'e', value: 0}];
for (let f = 200; f < 2300; f += 45) inputs.push({frame: f, key: 'LeftMouseButton', value: 1, device: 'touch', source: 'ui'}, {frame: f + 30, key: 'LeftMouseButton', value: 0, device: 'touch', source: 'ui'});  // 반쯤 당긴 느린 화살 (자동 조준)
let s = {}, maxPerShot = 0, prev = {Hits: 0, Swings: 0};
await runProject(project, {scene: 'Assets/Scenes/Test_Sherry.hbscene.json', frames: 2400, delta: 1 / 60,
  nativeDefaults: {Director: {StartRoom: 'Combat', Enchant: 3, MaxHp: 99}}, inputs,
  onFrame: (frame, vm) => {
    s = vm.objects.find(o => o.id === 'Director')?.nativeProperties || {};
    if (s.Swings === prev.Swings) maxPerShot = Math.max(maxPerShot, s.Hits - prev.Hits); else prev = {Hits: s.Hits, Swings: s.Swings};
  }});
const enemiesHitPerShot = s.Hits / Math.max(1, s.Swings);
console.log(`화살 ${s.Swings}발, 맞힘 ${s.Hits}번, 처치 ${s.Kills}, 한 발당 ${enemiesHitPerShot.toFixed(2)}번, 한 발이 낸 최대 맞힘 ${maxPerShot}`);
if (maxPerShot > 8) { console.log('FAIL: 화살 한 발이 같은 적을 반복해서 맞힘'); process.exitCode = 1; } else console.log('OK');
