// BP가 들고 있는 C++ 사본과 선언을 Source 파일에 맞춘다. 편집기의 "C++ 빌드" 전 단계와 같다.
// 실행: <HBEngine 사용자용 폴더>/runtime/node.exe tools/sync_cpp.mjs
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const ENGINE = process.env.HB_ENGINE || 'C:/Users/kirby/HBEngine/Versions/d4de30b46c28bab7';
const {parseNativeHeader} = await import(pathToFileURL(path.join(ENGINE, 'prototype/native-model.js')).href);
const project = path.join(path.dirname(fileURLToPath(import.meta.url)), '../AuricLoop');
// 거점 장면엔 적·탄 풀이 없어서, 같은 C++에 빈 배열을 넘기는 BP_Hub를 따로 만든다 (엔진이 없는 오브젝트 참조를 막음)
const bpPath = path.join(project, 'Assets/Blueprints/BP_TopDownShooter.hbblueprint.json');
const bp = JSON.parse(await fs.readFile(bpPath, 'utf8'));
const n = bp.native;
const header = await fs.readFile(path.join(project, n.headerPath), 'utf8');
const source = await fs.readFile(path.join(project, n.sourcePath), 'utf8');
bp.native = {...n, ...parseNativeHeader(header), header, source};
await fs.writeFile(bpPath, JSON.stringify(bp, null, 2) + '\n');
const hub = {...bp, name: 'BP_Hub', variables: bp.variables.map(v => ({...v, value: v.id === 'effects' ? ['SlashFX', 'Camera'] : []}))};
await fs.writeFile(path.join(project, 'Assets/Blueprints/BP_Hub.hbblueprint.json'), JSON.stringify(hub, null, 2) + '\n');
// 검사용: 셰리·알레아로 바로 시작하는 BP (tools/check_demo.mjs의 Test_Sherry·Test_Alea 장면)
for (const [name, character] of [['BP_Test_Sherry', 1], ['BP_Test_Alea', 2]]) {
  const test = {...bp, name, settings: {...bp.settings, nativeDefaults: {...bp.settings?.nativeDefaults, 'TopDownShooter.Character': character}}};
  await fs.writeFile(path.join(project, `Assets/Blueprints/${name}.hbblueprint.json`), JSON.stringify(test, null, 2) + '\n');
}
console.log('C++ 동기화:', bp.native.classes.map(c => `${c.name}(속성 ${c.properties.length}, 함수 ${c.functions.length})`).join(', '));

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
