// 저사양(내장 그래픽 노트북·휴대폰)용 장면 설정: 빌드가 장면 파일을 읽을 때 바꿔 넣는다 (프로젝트 장면 파일은 그대로)
// CPU를 4배 느리게 한 측정에서 물리 단계가 프레임의 3할, 블룸이 렌더의 1할
//   - 물리 단계 한 프레임 최대 2번: 엔진은 물리 단계마다 장면 전체(500여 개)를 동기화하고, 느린 기기일수록 단계가 늘어 더 느려지는 악순환
//   - 후처리(블룸 빛 번짐) 끔: 화면 전체를 여러 번 다시 그림. 처치 임팩트 프레임(Combat.cpp ImpactGrade)이 잠깐 볼륨을 켜도 블룸은 안 켜지게
//   - 거점 풀·덤불·가장자리 나무 흔들림(Animator 300여 개)은 멈춘 그림으로: 그림이 바뀔 때마다 물체마다 애니메이션 계산·그림 교체·C++ 전송
//   - 거점 가장자리 숲(Edge숫자 93그루) 충돌은 걸을 수 있는 범위 밖이라 마을 경계 벽이 이미 막음 → 빼서 물리 동기화 대상을 줄임
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';

export function lightScene(text, physicsHz, {effects = false} = {}) {  // effects: PC는 빛 번짐·장식 흔들림을 그대로 (끄면 어제 행사판과 화면이 달라 보였음, 2026-10-31)
  const scene = JSON.parse(text);
  Object.assign(scene.runtime ??= {}, {fixedDeltaTime: 1 / physicsHz, maxSubsteps: 2});
  if (!effects) for (const o of scene.objects || []) for (const c of o.components || []) if (c.type === 'PostProcessVolume') Object.assign(c.properties, {enabled: false, bloomEnabled: false, bloomStrength: 0});
  if (!effects) for (const o of scene.objects || []) if (/^(Decor|Edge|EdgeBush)\d/.test(o.id)) for (const c of o.components || []) if (c.type === 'Animator') c.properties.enabled = false;
  for (const o of scene.objects || []) if (/^Edge\d/.test(o.id)) o.components = (o.components || []).filter(c => c.type !== 'BoxCollider2D');
  return JSON.stringify(scene);
}

// fs.readFile을 가로채 프로젝트의 *.hbscene.json을 가볍게 바꿈. 바꾼 장면 수를 돌려주는 함수를 반환
// PC 네이티브 실행기는 터치 전용(deviceVisibility "touch") 그림까지 그려 PC에 조이스틱·버튼 그림이 보였음 → PC 빌드에선 숨김
// (지우지 않고 투명·숨김: C++가 이름으로 그림·표시를 바꾸므로)
export function hideTouchWidgets(text, projectDir) {
  const widget = JSON.parse(text);
  const walk = n => { if (Array.isArray(n)) return n.forEach(walk); if (!n || typeof n !== 'object') return;
    if (n.properties?.deviceVisibility === 'touch') Object.assign(n.properties, {visible: false, opacity: 0});
    // 9분할 그림: 네이티브 UI가 9분할을 몰라 통째로 늘림 → 미리 늘린 그림(tools/bake_nine_slice.py)으로
    const p = n.properties, size = n.slot?.offset, baked = p?.texture && size && p.nineSlice?.some(Boolean) && `Assets/UI/Baked9/${path.basename(p.texture, path.extname(p.texture))}_${size[2]}x${size[3]}.png`;
    if (baked && fsSync.existsSync(path.join(projectDir, baked))) Object.assign(p, {texture: baked, nineSlice: [0, 0, 0, 0]});
    Object.values(n).forEach(walk); };
  walk(widget);return JSON.stringify(widget);
}

export function hookLightScenes(projectDir, physicsHz, {pc = false} = {}) {
  const read = fs.readFile.bind(fs), root = path.resolve(projectDir);let count = 0;
  fs.readFile = async (file, ...rest) => {
    const result = await read(file, ...rest), name = String(file);
    const scene = name.endsWith('.hbscene.json'), widget = pc && name.endsWith('.hbwidget.json');
    if (!(scene || widget) || !path.resolve(name).startsWith(root)) return result;
    if (scene) count++;
    const source = Buffer.isBuffer(result) ? result.toString('utf8') : result, text = scene ? lightScene(source, physicsHz) : hideTouchWidgets(source, projectDir);
    return Buffer.isBuffer(result) ? Buffer.from(text) : text;
  };
  return () => count;
}
