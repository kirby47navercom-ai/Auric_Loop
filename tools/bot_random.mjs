// 무작위 입력 봇: 타이틀부터 실제 키 입력(창 없이 headless)을 무작위로 넣어 오래 돌리며 크래시·멈춤·끼임·이상한 값을 찾는다
// 실행: <HBEngine 사용자용 폴더>/runtime/node.exe tools/bot_random.mjs [캐릭터 1~3=1] [프레임=12000] [씨앗=1]
//   캐릭터 선택 화면에선 숫자 키로 고르고, 이후엔 이동·공격·대시·E·Tab·Enter·Q·1~5·M·Esc·F9(운영자 다음 방)를 섞어 누름
//   잡는 것: 예외(크래시), 값 이상(NaN 위치, 체력 음수, 피로도 넘침), 이동 키를 누르는데 오래 못 움직임, 일시정지 안 풀림, 메모리 증가
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {ENGINE} from './engine.mjs';

const {runProject} = await import(pathToFileURL(path.join(ENGINE, 'tools/run-project.mjs')).href);
const project = path.join(path.dirname(fileURLToPath(import.meta.url)), '../AuricLoop/AuricLoop.hbproject');
const [pick = '1', frameArg = '12000', seedArg = '1'] = process.argv.slice(2);
const frames = Number(frameArg);
let seed = Number(seedArg) * 7919 + Number(pick);
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);

// 입력 계획: 처음 20초는 타이틀 넘기기 + 캐릭터 고르기, 그다음 무작위
const inputs = [], press = (f, key, len = 3, extra = {}) => { inputs.push({frame: f, key, value: 1, ...extra}, {frame: f + len, key, value: 0, ...extra}); };
for (let f = 60; f < 1200; f += 40) press(f, 'enter');
press(400, pick); press(700, pick); press(1000, pick); press(1100, 'enter');
const moves = ['w', 'a', 's', 'd'];
const others = [['LeftMouseButton', 25], ['space', 3], ['e', 3], ['tab', 3], ['enter', 3], ['q', 3], ['1', 3], ['3', 3], ['5', 3], ['m', 3], ['escape', 3], ['F9', 3], ['RightMouseButton', 3]];
for (let f = 1300; f < frames - 30; ) {
  const r = rand();
  if (r < 0.55) { const k = moves[Math.floor(rand() * 4)], len = 20 + Math.floor(rand() * 90); press(f, k, len); if (rand() < 0.4) press(f + 5, moves[Math.floor(rand() * 4)], len - 5); f += Math.floor(len * 0.7); }
  else { const [k, len] = others[Math.floor(rand() * others.length)]; if (k === 'escape' && rand() < 0.6) { f += 5; continue; } press(f, k, len); if (k === 'escape') press(f + 30, 'escape'); f += len + 4; }
  if (k_warp(f)) press(f, 'F9');
}
function k_warp(f) { return f % 2400 < 3; }  // 40초마다 한 번은 다음 방으로 (진행이 너무 느리지 않게)

const problems = [], seen = new Set(), report = (frame, text) => { const key = text.replace(/[\d.-]+/g, '#'); if (seen.has(key)) return; seen.add(key); problems.push(`${frame}: ${text}`); };
let last = null, stillMoving = 0, pausedFor = 0, scenes = [], lastScene = '', mem0 = 0, memMax = 0;
const held = new Set();
for (let i = inputs.length - 1; i >= 0; i--) if (inputs[i].frame >= frames - 1) inputs.splice(i, 1);  // 엔진은 끝 프레임 뒤 입력을 거부
if (inputs.length > 10000) inputs.length = 10000;
const byFrame = new Map(); for (const i of inputs) (byFrame.get(i.frame) || byFrame.set(i.frame, []).get(i.frame)).push(i);
const started = Date.now();
try {
  const result = await runProject(project, {scene: 'Assets/Scenes/Hub.hbscene.json', frames, delta: 1 / 60, inputs,
    onFrame: (frame, vm) => {
      for (const i of byFrame.get(frame) || []) i.value ? held.add(i.key) : held.delete(i.key);
      const d = vm.objects.find(o => o.id === 'Director')?.nativeProperties || {};
      const p = vm.objects.find(o => o.id === 'Player') || vm.objects.find(o => (o.tags || []).includes('Player'));
      const scene = vm.scenePath || '';
      if (scene !== lastScene) { scenes.push(`${frame}:${path.basename(scene, '.hbscene.json')}`); lastScene = scene; last = null; stillMoving = 0; }
      const at = p?.position;
      if (at && at.some(v => !Number.isFinite(v))) report(frame, `플레이어 위치 NaN ${at}`);
      if (d.Hp < 0) report(frame, `체력 음수 ${d.Hp}`);
      if (d.Fatigue > d.FatigueMax + 3) report(frame, `피로도 넘침 ${d.Fatigue}/${d.FatigueMax}`);
      if (d.Gold < 0 || d.Debt < 0 || d.Ore < 0 || d.Herb < 0 || d.Monster < 0 || d.Bottle < 0 || d.Flashbangs < 0) report(frame, `음수 값 gold=${d.Gold} debt=${d.Debt} ore=${d.Ore} herb=${d.Herb} mon=${d.Monster} bottle=${d.Bottle} flash=${d.Flashbangs}`);
      // 이동 키를 누르는데 5초 넘게 거의 안 움직임 (대화·정산·일시정지·컷신 중일 수 있어 후보로만)
      const moving = d.Phase >= 2 && !d.Paused && moves.some(k => held.has(k)) && !(held.has('a') && held.has('d')) && !(held.has('w') && held.has('s'));  // 반대 키를 같이 누르면 안 움직이는 게 맞음
      if (at && last && moving) { const dist = Math.hypot(at[0] - last[0], at[1] - last[1]); stillMoving = dist < 0.002 ? stillMoving + 1 : 0; if (stillMoving === 300) { const near = vm.objects.filter(o => o.position && o.id !== 'Player' && Math.hypot(o.position[0] - at[0], o.position[1] - at[1]) < 1.6).map(o => o.id).slice(0, 8); report(frame, `이동 키를 5초 눌러도 못 움직임 (방 ${d.RoomIndex} 위치 ${at.slice(0, 2).map(v => v.toFixed(1))}, 키 ${[...held].join('+')}, 근처 ${near.join(',')})`); } }
      last = at ? [...at] : null;
      pausedFor = d.Paused ? pausedFor + 1 : 0; if (pausedFor === 1800) report(frame, '일시정지가 30초 넘게 안 풀림');
      if (frame % 600 === 0) { const m = process.memoryUsage().rss / 2 ** 20; if (!mem0 && frame >= 3000) mem0 = m; memMax = Math.max(memMax, m); }
    }});
  scenes = (result.sceneHistory || []).map(h => path.basename(h.scene, '.hbscene.json'));
} catch (error) { problems.push(`크래시: ${error.stack?.split('\n').slice(0, 6).join(' | ')}`); }
console.log(`캐릭터 ${pick}, ${frames}프레임, ${((Date.now() - started) / 1000).toFixed(0)}초, 장면: ${scenes.join(' ')}`);
console.log(`메모리 ${mem0.toFixed(0)}MB → 최대 ${memMax.toFixed(0)}MB`);
console.log(problems.length ? '문제:\n' + problems.join('\n') : '문제 없음');
if (problems.some(p => p.includes('크래시') || p.includes('NaN') || p.includes('음수'))) process.exitCode = 1;
