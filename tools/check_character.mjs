// 고른 캐릭터가 쓰러짐·귀환 뒤 거점에서도 그대로인지 (세 캐릭터 × 쓰러짐/귀환). 창 없이 headless
// 실행: <HBEngine 사용자용 폴더>/runtime/node.exe tools/check_character.mjs   (실패하면 종료 코드 1)
//   귀환은 자동 검사(AutoTest.inl, AURIC_AUTOTEST)가 보스방을 정리하고 [귀환]을 씀
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {ENGINE} from './engine.mjs';

const {runProject} = await import(pathToFileURL(path.join(ENGINE, 'tools/run-project.mjs')).href);
const project = path.join(path.dirname(fileURLToPath(import.meta.url)), '../AuricLoop/AuricLoop.hbproject');
const scenes = {0: 'Test_Valen', 1: 'Test_Sherry', 2: 'Test_Alea'};
let failed = false;
for (const mode of ['die', 'return']) for (const [want, scene] of Object.entries(scenes)) {
  if (mode === 'return') process.env.AURIC_AUTOTEST = '1'; else delete process.env.AURIC_AUTOTEST;
  let arrived = null, sprite = '', frames = 0;
  await runProject(project, {scene: `Assets/Scenes/${scene}.hbscene.json`, frames: 2400, delta: 1 / 60,
    nativeDefaults: {Director: {StartRoom: 'Boss', MaxHp: mode === 'die' ? 1 : 30}},
    onFrame: (frame, vm) => {
      const s = vm.objects.find(o => o.id === 'Director')?.nativeProperties || {};
      if (arrived === null && s.RoomIndex < 0 && s.ReturnSuccess) arrived = frame;
      if (arrived !== null && frame === arrived + 120) {
        frames = s.Character;
        const p = vm.objects.find(o => (o.tags || []).includes('Player') || o.id === 'Player');
        sprite = JSON.stringify(p?.components?.find(c => c.type === 'SpriteRenderer')?.properties?.sprite ?? p?.components?.find(c => c.type === 'SpriteRenderer')?.properties?.texture ?? '');
        return {stop: true};
      }
    }});
  const ok = arrived !== null && String(frames) === want && sprite.includes(['ValenSocket', 'SherryMotion', 'AleaMotion'][want]);  // 그림도 그 캐릭터 것
  if (!ok) failed = true;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${mode.padEnd(6)} ${scene.padEnd(11)} 거점 도착 ${arrived ?? '없음'} 캐릭터 ${frames} 그림 ${sprite}`);
}
if (failed) process.exitCode = 1;
