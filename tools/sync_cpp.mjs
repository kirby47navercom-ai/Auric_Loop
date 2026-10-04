// BP가 들고 있는 C++ 사본과 선언을 Source 파일에 맞춘다. 편집기의 "C++ 빌드" 전 단계와 같다.
// 실행: <HBEngine 사용자용 폴더>/runtime/node.exe tools/sync_cpp.mjs
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const ENGINE = process.env.HB_ENGINE || 'C:/Users/kirby/HBEngine/Versions/d4de30b46c28bab7';
const {parseNativeHeader} = await import(pathToFileURL(path.join(ENGINE, 'prototype/native-model.js')).href);
const project = path.join(path.dirname(fileURLToPath(import.meta.url)), '../AuricLoop');
const bpPath = path.join(project, 'Assets/Blueprints/BP_TopDownShooter.hbblueprint.json');
const bp = JSON.parse(await fs.readFile(bpPath, 'utf8'));
const n = bp.native;
const header = await fs.readFile(path.join(project, n.headerPath), 'utf8');
const source = await fs.readFile(path.join(project, n.sourcePath), 'utf8');
bp.native = {...n, ...parseNativeHeader(header), header, source};
await fs.writeFile(bpPath, JSON.stringify(bp, null, 2) + '\n');
console.log('C++ 동기화:', bp.native.classes.map(c => `${c.name}(속성 ${c.properties.length}, 함수 ${c.functions.length})`).join(', '));
