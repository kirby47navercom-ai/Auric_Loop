// HBEngine 사용자용 설치 폴더: HB_ENGINE 환경 변수, 없으면 설치된 버전 중 가장 최근 것 (업데이트로 옛 버전 폴더가 지워져도 도구가 따라감)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root = path.join(os.homedir(), 'HBEngine/Versions');
export const ENGINE = process.env.HB_ENGINE || fs.readdirSync(root, {withFileTypes: true})
  .filter(d => d.isDirectory() && fs.existsSync(path.join(root, d.name, 'tools/build-game.mjs')))
  .map(d => path.join(root, d.name)).sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];
if (!ENGINE) throw Error('HBEngine 설치 폴더를 못 찾음: ' + root);
