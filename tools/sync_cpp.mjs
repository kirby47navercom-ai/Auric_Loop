// C++를 소유한 BP(기반 BP)들의 C++ 사본과 선언을 Source 파일에 맞춘다. 편집기의 "C++ 빌드" 전 단계와 같다.
// 실행: <HBEngine 사용자용 폴더>/runtime/node.exe tools/sync_cpp.mjs
// BP 자식(BP_Skeleton 등)은 C++ 사본을 들지 않으므로 건드리지 않는다.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const ENGINE = process.env.HB_ENGINE || 'C:/Users/kirby/HBEngine/Versions/88db6de5ffe7c1bf';
const {parseNativeHeader} = await import(pathToFileURL(path.join(ENGINE, 'prototype/native-model.js')).href);
const project = path.join(path.dirname(fileURLToPath(import.meta.url)), '../AuricLoop');

async function blueprints(dir) {
  const out = [];
  for (const entry of await fs.readdir(dir, {withFileTypes: true})) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await blueprints(full));
    else if (entry.name.endsWith('.hbblueprint.json')) out.push(full);
  }
  return out;
}

const synced = [];
for (const file of await blueprints(path.join(project, 'Assets/Blueprints'))) {
  const bp = JSON.parse(await fs.readFile(file, 'utf8'));
  if (!bp.native?.headerPath) continue;
  const header = await fs.readFile(path.join(project, bp.native.headerPath), 'utf8');
  const source = await fs.readFile(path.join(project, bp.native.sourcePath), 'utf8');
  bp.native = {...bp.native, ...parseNativeHeader(header), header, source};
  await fs.writeFile(file, JSON.stringify(bp, null, 2) + '\n');
  synced.push(bp.name);
}
console.log('C++ 동기화:', synced.join(', '));

// 편집기는 Saved/Editor/storage.json에 열린 문서 사본을 두고 다음 실행 때 디스크보다 먼저 복원한다.
// 밖에서 파일을 바꿨으면 이 사본을 지워야 편집기가 새 내용을 읽는다. (편집기를 닫은 뒤 실행)
const storage = path.join(project, 'Saved/Editor/storage.json');
try {
  const data = JSON.parse(await fs.readFile(storage, 'utf8'));
  const stale = Object.keys(data.items).filter(k => k.startsWith('hbengine.documents.'));
  stale.forEach(k => delete data.items[k]);
  await fs.writeFile(storage, JSON.stringify(data));
  if (stale.length) console.log('편집기 문서 사본 정리:', stale.length);
} catch (error) { if (error.code !== 'ENOENT') throw error; }
