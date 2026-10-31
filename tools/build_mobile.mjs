// 안드로이드 APK·웹 빌드. Windows 패키지와 같은 플레이어 수정(tools/player_patches.mjs)을 빌드가 엔진 파일을 읽는 순간에 끼워 넣는다
// (APK는 묶인 뒤라 결과물을 고칠 수 없고, 웹은 파일 목록 sha256을 빌드가 계산하므로 읽을 때 고쳐야 맞음. 엔진 설치본은 그대로)
// 실행: <HBEngine 사용자용 폴더>/runtime/node.exe tools/build_mobile.mjs android|web [phone]
//   web phone: 안드로이드와 같은 장면 설정 + 검사 장면까지 넣은 웹 빌드 (PC 크롬에서 휴대폰 성능을 재 보는 용도, 배포하지 않음)
//   web tests: PC와 같은 장면 설정 + 검사 장면 (소리까지 녹화하는 용도: PC 실행 파일은 소리를 화면 밖에서 내서 페이지에서 못 받음)
//   android: 앱 아이콘(Assets/UI/Kit/app_icon_*.png), 전체 화면(상태·내비게이션 바 숨김)도 넣음
//   web: 터치 기기에서 첫 터치에 전체 화면 + 가로 고정
// 웹 빌드(build-web)는 엔진 dcc7dfb부터 있어 둘 다 그 엔진으로 만든다
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {playerPatches, applyPatches} from './player_patches.mjs';
import {lightScene} from './light_scene.mjs';
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
// 안드로이드: 카메라 구멍·시스템 바 여백(inset)을 WebView 전체 안쪽 여백(padding)으로 주던 것을 빼고, 그 값을 CSS 변수(--hb-safe-*, CSS px)로
// 페이지에 넘겨 HUD 위젯(safeArea)만 안쪽에 둠. 게임 화면은 휴대폰 끝까지 채움 (예전엔 20:9 휴대폰에서 위·좌우가 회색으로 비었음)
//   onPageFinished에서도 다시 넣음: 여백 알림이 페이지보다 먼저 오면 그때 넣은 값이 사라짐
patches['native/mobile/android/HBActivity.java'].push(
  ['view.setPadding(left,top,right,bottom);return insets;', 'hbSafe();return insets;'],
  ['@Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request)',
   '@Override public void onPageFinished(WebView view,String url){hbSafe();}\n                @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request)'],
  ['private void hbImmersive(){',
   'private void hbSafe(){if(web==null)return;float d=getResources().getDisplayMetrics().density;int[] s=safeInsets;String[] n={"left","top","right","bottom"};StringBuilder js=new StringBuilder("(function(r){");for(int i=0;i<4;i++)js.append("r.setProperty(\'--hb-safe-").append(n[i]).append("\',\'").append(s[i]/d).append("px\');");js.append("})(document.documentElement.style)");web.evaluateJavascript(js.toString(),null);}\n    private void hbImmersive(){']);
patches['prototype/ui-runtime.js'] = [...(patches['prototype/ui-runtime.js'] || []), ['env(safe-area-inset-${side}, 0px)', 'var(--hb-safe-${side}, env(safe-area-inset-${side}, 0px))']];
// 웹: 휴대폰 브라우저 주소창이 화면을 가리므로 첫 터치에 전체 화면 (브라우저는 사용자 동작 없이 전체 화면을 못 켬)
patches['prototype/player.html'] = [['</body>',
  `<script>addEventListener('pointerdown',function f(e){if(e.pointerType!=='touch'||document.fullscreenElement||!document.documentElement.requestFullscreen)return;removeEventListener('pointerdown',f,true);document.documentElement.requestFullscreen({navigationUI:'hide'}).then(()=>screen.orientation?.lock?.('landscape')).catch(()=>{});},true);</script></body>`]];

const hit = new Set(), key = file => {
  const rel = path.relative(ENGINE, String(file)).split(path.sep).join('/');
  return patches[rel] ? rel : null;
};
// 저사양 장면 설정(tools/light_scene.mjs): 휴대폰은 물리 30Hz, 웹(내장 그래픽 노트북)은 60Hz
const mobileScene = text => { hit.add('mobile-scene'); return lightScene(text, phone ? 30 : 60); };
const sceneFile = file => String(file).endsWith('.hbscene.json') && path.resolve(String(file)).startsWith(path.resolve(projectDir));
const read = fs.readFile.bind(fs), write = fs.writeFile.bind(fs);
fs.readFile = async (file, ...rest) => {
  const result = await read(file, ...rest), name = key(file);
  if (sceneFile(file)) { const text = mobileScene(Buffer.isBuffer(result) ? result.toString('utf8') : result); return Buffer.isBuffer(result) ? Buffer.from(text) : text; }
  if (!name) return result;
  hit.add(name);
  const text = applyPatches(name, Buffer.isBuffer(result) ? result.toString('utf8') : result, patches);
  return Buffer.isBuffer(result) ? Buffer.from(text) : text;
};
// 엔진 dcab5bc부터 빌드가 플레이어 파일을 readFile이 아니라 realpath → stat → open으로 조금씩 읽어 복사한다 →
// 고칠 파일은 realpath가 고친 사본(임시 폴더)을 가리키게 함 (사본은 끝나면 지움)
const realpath = fs.realpath.bind(fs), patchedDir = path.join(os.tmpdir(), `auric_patched_${process.pid}`), patchedFiles = new Map();
fs.realpath = async (file, ...rest) => {
  const real = await realpath(file, ...rest), name = key(real);
  if (!name || real.startsWith(patchedDir)) return real;
  if (!patchedFiles.has(name)) {
    const out = path.join(patchedDir, name);await fs.mkdir(path.dirname(out), {recursive: true});
    await write(out, applyPatches(name, (await read(real)).toString('utf8'), patches));patchedFiles.set(name, out);
  }
  hit.add(name);return patchedFiles.get(name);
};
process.on('exit', () => { try { fsSync.rmSync(patchedDir, {recursive: true, force: true}); } catch {} });
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
// 휴대폰은 초당 30프레임: 물리가 30Hz이고 엔진은 물리 사이를 보간하지 않아 60프레임이어도 움직임은 30번만 바뀜 → 같은 그림을 두 번 그리는 비용(C++ 호출·전송·그리기)을 없앰
Object.assign(profile, {targetFrameRate: phone ? 30 : 60, framePacing: 'display'});  // 웹도 60 (엔진 기본 120은 내장 그래픽 노트북에서 못 따라감)
if (target === 'web' && (phone || process.argv.includes('tests'))) profile.scenes = [...base.scenes, ...['Valen', 'Sherry', 'Alea', 'Boss'].map(w => ({path: `Assets/Scenes/Test_${w}.hbscene.json`, enabled: true}))];  // 측정용: 검사 장면도 넣음
const result = await buildGame(record, profile, {onProgress: m => console.error(new Date().toISOString().slice(11, 19), m)});
const nativeOnly = n => n.startsWith('tools/') || n === 'prototype/native-scene-renderer.js';  // PC 네이티브 실행기 전용 수정
const want = [...Object.keys(patches).filter(n => !nativeOnly(n)).filter(n => target === 'android' ? n !== 'prototype/player.html' : !n.startsWith('native/')), ...(target === 'android' ? ['icon'] : []), 'mobile-scene'];
const missed = want.filter(n => !hit.has(n));
if (missed.length) throw Error('수정이 안 들어감: ' + missed.join(', '));
await retainBuilds(record.root, result.output).catch(error => console.warn('빌드 보관 정리 실패:', error.message));
console.log(JSON.stringify({output: result.output, artifact: result.artifact}));
