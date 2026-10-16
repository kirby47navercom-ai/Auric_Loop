// 안드로이드 APK·웹 빌드. Windows 패키지와 같은 플레이어 수정(tools/player_patches.mjs)을 빌드가 엔진 파일을 읽는 순간에 끼워 넣는다
// (APK는 묶인 뒤라 결과물을 고칠 수 없고, 웹은 파일 목록 sha256을 빌드가 계산하므로 읽을 때 고쳐야 맞음. 엔진 설치본은 그대로)
// 실행: <HBEngine 사용자용 폴더>/runtime/node.exe tools/build_mobile.mjs android|web [phone]
//   web phone: 안드로이드와 같은 장면 설정 + 검사 장면까지 넣은 웹 빌드 (PC 크롬에서 휴대폰 성능을 재 보는 용도, 배포하지 않음)
//   android: 앱 아이콘(Assets/UI/Kit/app_icon_*.png), 전체 화면(상태·내비게이션 바 숨김)도 넣음
//   web: 터치 기기에서 첫 터치에 전체 화면 + 가로 고정
// 웹 빌드(build-web)는 엔진 dcc7dfb부터 있어 둘 다 그 엔진으로 만든다
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {playerPatches, applyPatches} from './player_patches.mjs';
import {retainBuilds} from './build-retention.mjs';
import {ENGINE} from './engine.mjs';

const target = process.argv[2], phone = target === 'android' || process.argv[3] === 'phone';
if (!['android', 'web'].includes(target)) throw Error('대상: android | web');
const projectDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../AuricLoop');
const patches = await playerPatches(projectDir);

// 안드로이드: 시스템 바를 숨기는 몰입 모드 (엔진 액티비티엔 없어 상태 바가 보이고, 엔진 일시정지 창의 "전체 화면"은 WebView에서 아무 일도 안 했음)
patches['native/mobile/android/HBActivity.java'] = [[
  '@Override public void onCreate(Bundle state) {\n        super.onCreate(state);',
  'private void hbImmersive(){getWindow().getDecorView().setSystemUiVisibility(0x1706);if(android.os.Build.VERSION.SDK_INT>=28){android.view.WindowManager.LayoutParams p=getWindow().getAttributes();p.layoutInDisplayCutoutMode=1;getWindow().setAttributes(p);}}\n'
  + '    @Override public void onWindowFocusChanged(boolean focus){super.onWindowFocusChanged(focus);if(focus)hbImmersive();}\n'
  + '    @Override public void onCreate(Bundle state) {\n        super.onCreate(state);hbImmersive();']];
// 웹: 휴대폰 브라우저 주소창이 화면을 가리므로 첫 터치에 전체 화면 (브라우저는 사용자 동작 없이 전체 화면을 못 켬)
patches['prototype/player.html'] = [['</body>',
  `<script>addEventListener('pointerdown',function f(e){if(e.pointerType!=='touch'||document.fullscreenElement||!document.documentElement.requestFullscreen)return;removeEventListener('pointerdown',f,true);document.documentElement.requestFullscreen({navigationUI:'hide'}).then(()=>screen.orientation?.lock?.('landscape')).catch(()=>{});},true);</script></body>`]];

const hit = new Set(), key = file => {
  const rel = path.relative(ENGINE, String(file)).split(path.sep).join('/');
  return patches[rel] ? rel : null;
};
// 안드로이드: 휴대폰 CPU·GPU에 맞춘 장면 설정 (PC·웹은 그대로). CPU를 4배 느리게 한 측정에서 물리 단계가 프레임의 3할, 블룸이 렌더의 1할
//   - 물리 30Hz·한 프레임 최대 2단계: 엔진은 물리 단계마다 장면 전체(500여 개)를 동기화하고, 느린 기기일수록 단계가 늘어 더 느려지는 악순환
//   - 후처리(블룸 빛 번짐) 끔: 화면 전체를 여러 번 다시 그림
const mobileScene = text => {
  const scene = JSON.parse(text);
  Object.assign(scene.runtime ??= {}, {fixedDeltaTime: 1 / 30, maxSubsteps: 2});
  for (const o of scene.objects || []) for (const c of o.components || []) if (c.type === 'PostProcessVolume') c.properties.enabled = false;  // 볼륨이 켜져 있으면 블룸이 없어도 화면을 여러 번 다시 그림 (반정밀 렌더 타깃→후처리→출력→AA)
  // 거점 풀·덤불·가장자리 나무 흔들림(Animator 300여 개)은 멈춘 그림으로: 그림이 바뀔 때마다 엔진이 물체마다 애니메이션 계산·그림 교체·C++ 전송을 함
  for (const o of scene.objects || []) if (/^(Decor|Edge|EdgeBush)\d/.test(o.id)) for (const c of o.components || []) if (c.type === 'Animator') c.properties.enabled = false;
  hit.add('mobile-scene');
  return JSON.stringify(scene);
};
const sceneFile = file => phone && String(file).endsWith('.hbscene.json') && path.resolve(String(file)).startsWith(path.resolve(projectDir));
const read = fs.readFile.bind(fs), write = fs.writeFile.bind(fs);
fs.readFile = async (file, ...rest) => {
  const result = await read(file, ...rest), name = key(file);
  if (sceneFile(file)) { const text = mobileScene(Buffer.isBuffer(result) ? result.toString('utf8') : result); return Buffer.isBuffer(result) ? Buffer.from(text) : text; }
  if (!name) return result;
  hit.add(name);
  const text = applyPatches(name, Buffer.isBuffer(result) ? result.toString('utf8') : result, patches);
  return Buffer.isBuffer(result) ? Buffer.from(text) : text;
};
// HBActivity.java는 읽지 않고 복사하므로 복사도 가로챈다
const copy = fs.copyFile.bind(fs);
fs.copyFile = async (from, to, ...rest) => key(from) ? write(to, await fs.readFile(from)) : copy(from, to, ...rest);
if (target === 'android') {
  fs.writeFile = async (file, data, ...rest) => {
    const name = String(file).split(path.sep).join('/');
    if (name.endsWith('/Android/AndroidManifest.xml')) { data = String(data).replace('<application android:label="@string/app_name"', '<application android:label="@string/app_name" android:icon="@mipmap/ic_launcher" android:roundIcon="@mipmap/ic_launcher"'); hit.add('icon'); }
    if (name.endsWith('/Android/res/values/strings.xml')) {
      // 밀도별 런처 아이콘 (tools/make_app_icon.py)
      for (const [density, size] of [['mdpi', 48], ['hdpi', 72], ['xhdpi', 96], ['xxhdpi', 144], ['xxxhdpi', 192]]) {
        const dir = path.join(path.dirname(path.dirname(String(file))), 'mipmap-' + density);
        await fs.mkdir(dir, {recursive: true});await write(path.join(dir, 'ic_launcher.png'), await read(path.join(projectDir, `Assets/UI/Kit/app_icon_${size}.png`)));
      }
    }
    return write(file, data, ...rest);
  };
}

const tool = name => import(pathToFileURL(path.join(ENGINE, 'tools', name)).href);
const {readProjectManifest} = await tool('project-manifest.mjs');
const {readBuildProfiles, buildGame} = await tool('build-game.mjs');
const record = await readProjectManifest(path.join(projectDir, 'AuricLoop.hbproject'));
const base = (await readBuildProfiles(record)).profiles.find(p => p.id === 'windows');
const profile = target === 'android'
  ? {...base, id: 'android', name: 'android', target: 'android', configuration: 'development', productName: 'Auric Loop',
     mobile: {applicationId: 'com.mastiff.auricloop', versionCode: 3, versionName: '1.2', orientation: 'landscape', minSdk: 26, abis: ['arm64-v8a'], format: 'apk'}}
  : {...base, id: 'web', name: 'web', target: 'web', configuration: 'development', productName: 'Auric Loop'};
if (target === 'web' && phone) profile.scenes = [...base.scenes, ...['Valen', 'Sherry', 'Alea', 'Boss'].map(w => ({path: `Assets/Scenes/Test_${w}.hbscene.json`, enabled: true}))];  // 측정용: 검사 장면도 넣음
const result = await buildGame(record, profile, {onProgress: m => console.error(new Date().toISOString().slice(11, 19), m)});
const want = [...Object.keys(patches).filter(n => target === 'android' ? n !== 'prototype/player.html' : !n.startsWith('native/')), ...(target === 'android' ? ['icon'] : []), ...(phone ? ['mobile-scene'] : [])];
const missed = want.filter(n => !hit.has(n));
if (missed.length) throw Error('수정이 안 들어감: ' + missed.join(', '));
await retainBuilds(record.root, result.output).catch(error => console.warn('빌드 보관 정리 실패:', error.message));
console.log(JSON.stringify({output: result.output, artifact: result.artifact}));
