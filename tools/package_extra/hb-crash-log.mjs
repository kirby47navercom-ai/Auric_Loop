// PC 패키지 전용: 게임 스크립트가 쓰는 오류 출력을 실행 파일 옆 "오류로그.txt"에도 남기고,
// 오류로 꺼지면 오류 문구를 창으로 보여 준다 (엔진의 빨간 창은 로그 위치만 알려 줘서 다른 PC에서 원인을 볼 수 없었음)
// tools/native-game-runner.mjs 맨 앞에서 불러 다른 모듈(소리·그림 모듈)이 읽히다 실패해도 기록됨
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const file = path.join(path.dirname(path.dirname(fileURLToPath(import.meta.url))), '오류로그.txt');
let tail = '', shown = false;
try { fs.writeFileSync(file, `시작 ${new Date().toISOString()}\n`); } catch {}
const write = process.stderr.write.bind(process.stderr);
process.stderr.write = (chunk, ...rest) => {
  const text = String(chunk);
  tail = (tail + text).slice(-4000);
  try { fs.appendFileSync(file, text); } catch {}
  return write(chunk, ...rest);
};
const show = message => {
  if (shown) return; shown = true;
  try { fs.appendFileSync(file, message + '\n'); } catch {}
  const lines = (tail + '\n' + message).split('\n').filter(l => l.trim() && !/^\s+at /.test(l)).slice(-8).join('\n');
  const body = `게임 실행 중 오류\n\n${lines}\n\n전체 기록: ${file}`.replace(/'/g, "''");
  try { spawnSync('powershell', ['-NoProfile', '-Command', `Add-Type -AssemblyName PresentationFramework;[System.Windows.MessageBox]::Show('${body}','Auric Loop 오류')|Out-Null`], {windowsHide: true}); } catch {}
};
process.on('uncaughtExceptionMonitor', error => show(String(error?.stack || error)));
process.on('exit', code => { if (code) show(`종료 코드 ${code}`); });
