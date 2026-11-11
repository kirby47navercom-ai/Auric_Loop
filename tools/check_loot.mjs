// 방 클리어 보상 자동 획득 (행사 피드백 15): 바닥 골드·소재가 클리어 뒤 플레이어에게 들어오고, 정산에 정확히 들어가는지
//   1) 전투방 클리어 → 1.5초 안에 바닥 골드·소재 0 (걸어가 줍지 않아도), 골드가 늚
//   2) 보스방 클리어 직후 [귀환] → 거점 정산 합계 = 떠나기 직전 (골드 + 바닥 골드 + 소재 값)
//   3) 전투방 클리어 직후 쓰러짐 → 거점 정산 합계 = 골드 + 바닥 골드 (소재는 잃음)
// 실행: <HBEngine 사용자용 폴더>/runtime/node.exe tools/check_loot.mjs   (실패하면 종료 코드 1). 창 없이, 자동 검사(AutoTest.inl)가 싸움
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {ENGINE} from './engine.mjs';

const {runProject} = await import(pathToFileURL(path.join(ENGINE, 'tools/run-project.mjs')).href);
const project = path.join(path.dirname(fileURLToPath(import.meta.url)), '../AuricLoop/AuricLoop.hbproject');
let failed = false;
const pick = s => s && Object.fromEntries(['Gold', 'FloorGold', 'FloorDrops', 'Ore', 'Herb', 'Monster', 'Debt', 'LastRepaid', 'RoomIndex', 'Hp', 'Returning', 'KnockedOut'].map(k => [k, s[k]]));
const say = (ok, text) => { if (!ok) failed = true; console.log(`${ok ? 'OK  ' : 'FAIL'} ${text}`); };

for (const mode of ['return', 'die']) {
  process.env.AURIC_AUTOTEST = '1';
  if (mode === 'die') process.env.AURIC_AUTOTEST_DIE = '1'; else delete process.env.AURIC_AUTOTEST_DIE;
  let clearedAt = null, floorAfter = null, goldAtClear = 0, goldAfter = 0, last = null, hub = null, rules = {};
  await runProject(project, {scene: 'Assets/Scenes/Test_Valen.hbscene.json', frames: 4000, delta: 1 / 60, nativeDefaults: {Director: {MaxHp: 30}},
    onFrame: (frame, vm) => {
      const d = vm.objects.find(o => o.id === 'Director')?.nativeProperties || {};
      const r = vm.objects.find(o => o.id === 'Rules')?.nativeProperties; if (r) rules = r;
      if (d.RoomIndex >= 0) {
        if (clearedAt === null && d.RoomClears >= 1) { clearedAt = frame; goldAtClear = d.Gold; }  // 첫 전투방 클리어
        if (clearedAt !== null && frame === clearedAt + 90) { floorAfter = d.FloorGold + d.FloorDrops; goldAfter = d.Gold; }
        if (!d.Returning && !d.KnockedOut) last = {...d};  // 정산 직전 값 (정산하는 프레임엔 이미 골드가 바뀜)
      } else if (last && !hub && d.ReturnSuccess) { hub = {...d}; return {stop: true}; }
    }});
  if (mode === 'return') say(clearedAt !== null && floorAfter === 0 && goldAfter >= goldAtClear, `전투방 클리어 1.5초 뒤 바닥 골드·소재 ${floorAfter} (0이어야), 골드 ${goldAtClear} → ${goldAfter}`);
  // 떠나는 순간 값(LeaveValue: 골드+바닥 골드+소재 값, 쓰러지면 골드+바닥 골드)이 그대로 정산 합계가 되고, 거점의 골드+상환액과 같아야 함
  say(hub && hub.LeaveValue === hub.SettleTotal && hub.Gold + hub.LastRepaid === hub.SettleTotal && hub.LeaveValue > 0,
    `${mode === 'return' ? '보스 클리어 직후 귀환' : '전투방 클리어 직후 쓰러짐'}: 떠날 때 값 ${hub?.LeaveValue} (바로 전 바닥 골드 ${last?.FloorGold}, 바닥 소재 ${last?.FloorDrops}) = 정산 합계 ${hub?.SettleTotal} = 거점 골드 ${hub?.Gold} + 상환 ${hub?.LastRepaid}`);
}
if (failed) process.exitCode = 1;

