// 네이티브 PC 패키지를 숨긴 창으로 실행해 자동 검사(AutoTest.inl)를 돌리고 구간별 프레임 간격을 잰다. 창에 키·클릭을 보내지 않음
// 실행: node tools/measure_native.mjs <패키지 폴더> [프레임 수=5400] [결과 이름=measure]
//   perf 프로필(Test_Boss로 시작)로 만든 패키지를 쓴다: node tools/package.mjs perf <임시 폴더>
// 결과: <패키지>/../<이름>.log (프레임마다 "간격ms 구간"), 엔진 보고서 <이름>.json, 화면에 구간별 중앙값·상위 5%·최대
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const [dir, frames = '5400', name = 'measure'] = process.argv.slice(2);
if (!dir) throw Error('패키지 폴더를 주세요');
const exe = fs.readdirSync(dir).find(n => /^(HBGame_.+|Game)\.exe$/i.test(n));
const out = path.resolve(dir, '..'), log = path.join(out, name + '.log'), report = path.join(out, name + '.json'), state = path.join(out, name + '_state');
fs.rmSync(log, {force: true}); fs.rmSync(state, {recursive: true, force: true});
const started = Date.now();
const run = spawnSync(path.join(dir, exe), ['--hidden', '--silent', '--frames', frames, '--report', report],
  {env: {...process.env, AURIC_AUTOTEST: '1', AURIC_AUTOTEST_LOG: log, HB_NATIVE_TEST_STATE: state}, encoding: 'utf8', timeout: 20 * 60 * 1000, windowsHide: true});
console.log(`종료 코드 ${run.status} (${((Date.now() - started) / 1000).toFixed(0)}초)`, run.error?.message || '');
if (run.status) console.log((run.stderr || '').split('\n').slice(-30).join('\n'));
const crash = path.join(dir, '오류로그.txt');
if (fs.existsSync(crash)) { const t = fs.readFileSync(crash, 'utf8'); if (/Error|오류|종료 코드/.test(t.split('\n').slice(1).join('\n'))) console.log('오류로그:\n' + t.slice(-3000)); }

const pct = (a, p) => a.length ? a[Math.min(a.length - 1, Math.floor(a.length * p))] : NaN;
const phases = {}, events = [];
for (const line of fs.existsSync(log) ? fs.readFileSync(log, 'utf8').split('\n') : []) {
  if (line.startsWith('# ')) { events.push(line.slice(2)); continue; }
  const [ms, phase] = line.split(' ');
  if (phase) (phases[phase] ||= []).push(Number(ms));
}
console.log('사건:', events.join(' → ') || '(없음)');
console.log('구간      프레임  중앙값  상위5%  최대  33ms초과  (프레임 간격 ms, 60fps 고정 = 16.7)');
for (const [phase, list] of Object.entries(phases)) {
  const s = list.slice(1).sort((a, b) => a - b);  // 첫 칸은 장면 전환 직후라 뺌
  console.log(`${phase.padEnd(8)} ${String(s.length).padStart(6)}  ${pct(s, .5).toFixed(1).padStart(6)}  ${pct(s, .95).toFixed(1).padStart(6)}  ${s.at(-1)?.toFixed(0).padStart(5)}  ${String(s.filter(v => v > 33).length).padStart(7)}`);
}
if (fs.existsSync(report)) {
  const r = JSON.parse(fs.readFileSync(report, 'utf8')), ms = (r.ms || []).slice().sort((a, b) => a - b);
  if (ms.length) console.log(`엔진 보고서: ${ms.length}프레임, 프레임 작업 시간 중앙값 ${pct(ms, .5).toFixed(1)}ms 상위5% ${pct(ms, .95).toFixed(1)}ms 최대 ${ms.at(-1).toFixed(0)}ms, 메모리 ${(r.memory?.rss / 2 ** 20).toFixed(0)}MB`);
}
