// 화면 없이 데모 장면을 돌려 핵심 규칙을 확인한다.
// 실행: <HBEngine 사용자용 폴더>/runtime/node.exe tools/check_demo.mjs
import assert from 'node:assert/strict';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const ENGINE = process.env.HB_ENGINE || 'C:/Users/kirby/HBEngine/Versions/d4de30b46c28bab7';
const {runProject} = await import(pathToFileURL(path.join(ENGINE, 'tools/run-project.mjs')).href);
const project = path.join(path.dirname(fileURLToPath(import.meta.url)), '../AuricLoop/AuricLoop.hbproject');
const aimUp = {position: [640, 250], size: [1280, 720]};

const r = await runProject(project, {frames: 420, delta: 1 / 60, inputs: [
  {frame: 5, key: 'w', value: 1}, {frame: 30, key: 'w', value: 0},
  {frame: 31, key: 'LeftMouseButton', value: 1, pointer: aimUp}, {frame: 400, key: 'LeftMouseButton', value: 0},
]});
const player = r.objects.find(o => o.id === 'Player');
const stats = r.objects.find(o => o.id === 'Director').nativeProperties;
assert.ok(Math.abs(player.position[1] - (-5.5)) < 0.1, 'PlayerStart(-8)에서 W 25프레임 = 이동속도 6으로 2.5m');
assert.ok(stats.Swings >= 8, '검 공격 간격 0.35초');
assert.ok(stats.Kills >= 3, '해골은 검 4대에 쓰러짐');
assert.ok(stats.Hp > 0, '체력이 남아 있음');
console.log('데모 검사 통과', JSON.stringify(stats));
