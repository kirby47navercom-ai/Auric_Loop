// 저사양(내장 그래픽 노트북·휴대폰)용 장면 설정: 빌드가 장면 파일을 읽을 때 바꿔 넣는다 (프로젝트 장면 파일은 그대로)
// CPU를 4배 느리게 한 측정에서 물리 단계가 프레임의 3할, 블룸이 렌더의 1할
//   - 물리 단계 한 프레임 최대 2번: 엔진은 물리 단계마다 장면 전체(500여 개)를 동기화하고, 느린 기기일수록 단계가 늘어 더 느려지는 악순환
//   - 후처리(블룸 빛 번짐) 끔: 화면 전체를 여러 번 다시 그림. 처치 임팩트 프레임(Combat.cpp ImpactGrade)이 잠깐 볼륨을 켜도 블룸은 안 켜지게
//   - 거점 풀·덤불·가장자리 나무 흔들림(Animator 300여 개)은 멈춘 그림으로: 그림이 바뀔 때마다 물체마다 애니메이션 계산·그림 교체·C++ 전송
//   - 거점 가장자리 숲(Edge숫자 93그루) 충돌은 걸을 수 있는 범위 밖이라 마을 경계 벽이 이미 막음 → 빼서 물리 동기화 대상을 줄임
import fs from 'node:fs/promises';
import path from 'node:path';

export function lightScene(text, physicsHz) {
  const scene = JSON.parse(text);
  Object.assign(scene.runtime ??= {}, {fixedDeltaTime: 1 / physicsHz, maxSubsteps: 2});
  for (const o of scene.objects || []) for (const c of o.components || []) if (c.type === 'PostProcessVolume') Object.assign(c.properties, {enabled: false, bloomEnabled: false, bloomStrength: 0});
  for (const o of scene.objects || []) if (/^(Decor|Edge|EdgeBush)\d/.test(o.id)) for (const c of o.components || []) if (c.type === 'Animator') c.properties.enabled = false;
  for (const o of scene.objects || []) if (/^Edge\d/.test(o.id)) o.components = (o.components || []).filter(c => c.type !== 'BoxCollider2D');
  return JSON.stringify(scene);
}

// fs.readFile을 가로채 프로젝트의 *.hbscene.json을 가볍게 바꿈. 바꾼 장면 수를 돌려주는 함수를 반환
export function hookLightScenes(projectDir, physicsHz) {
  const read = fs.readFile.bind(fs), root = path.resolve(projectDir);let count = 0;
  fs.readFile = async (file, ...rest) => {
    const result = await read(file, ...rest);
    if (!String(file).endsWith('.hbscene.json') || !path.resolve(String(file)).startsWith(root)) return result;
    count++;const text = lightScene(Buffer.isBuffer(result) ? result.toString('utf8') : result, physicsHz);
    return Buffer.isBuffer(result) ? Buffer.from(text) : text;
  };
  return () => count;
}
