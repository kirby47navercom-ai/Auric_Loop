import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {retainBuilds} from './build-retention.mjs';

const id = 'c56d1b68-6576-4a57-8773-0469147f0d1c';
const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'auric-retention-test-'));
const project = path.join(temp, 'AuricLoop');
const write = async (name, value) => {
  const file = path.join(project, name);
  await fs.mkdir(path.dirname(file), {recursive: true});
  await fs.writeFile(file, JSON.stringify(value));
};
const build = async (day, kind = 'success', profile = 'windows') => {
  const name = `2026-10-${String(day).padStart(2, '0')}T10-00-00-000Z-1234abcd`;
  const relative = path.join('Builds', profile, name), output = path.join(project, relative);
  await fs.mkdir(output, {recursive: true});
  if (kind === 'failed') await write(path.join(relative, 'build-failed.json'), {error: 'fixture'});
  if (kind === 'success' || kind === 'foreign') {
    await write(path.join(relative, 'build-report.json'), {id: name, output, profile: {id: profile}, target: profile === 'android' ? 'android' : 'windows-x64'});
    await write(path.join(relative, profile === 'android' ? 'Assets/game.hbpack.json' : 'game.hbpack.json'), {id: kind === 'foreign' ? 'other-project' : id});
  }
  return output;
};
try {
  await write('AuricLoop.hbproject', {id});
  const good = [];
  for (let day = 1; day <= 5; day++) good.push(await build(day));
  const failures = [];
  for (let day = 6; day <= 8; day++) failures.push(await build(day, 'failed'));
  const active = await build(9, 'active'), foreign = await build(10, 'foreign');
  const unknown = path.join(project, 'Builds/windows/manual-backup');
  await fs.mkdir(unknown);
  const android = [];
  for (let day = 1; day <= 3; day++) android.push(await build(day, 'success', 'android'));
  const outside = path.join(temp, 'outside');
  await fs.mkdir(outside); await fs.writeFile(path.join(outside, 'sentinel.txt'), 'preserve');
  await fs.symlink(outside, path.join(project, 'Builds/windows/2026-10-11T10-00-00-000Z-1234abcd'), process.platform === 'win32' ? 'junction' : 'dir');
  await fs.symlink(outside, path.join(project, 'Builds/linked-profile'), process.platform === 'win32' ? 'junction' : 'dir');
  const plan = await retainBuilds(project, good[4], {dryRun: true});
  assert.equal(plan.removed.length, 6);
  const clockSkew = await retainBuilds(project, good[0], {dryRun: true});
  assert.equal(clockSkew.removed.length, 6);
  assert.ok(!clockSkew.removed.includes(good[0]) && !clockSkew.removed.includes(good[4]));
  await fs.access(good[0]);
  const result = await retainBuilds(project, good[4]);
  assert.deepEqual(result.removed, plan.removed); assert.deepEqual(result.skipped, []);
  for (const file of [...good.slice(0, 3), ...failures.slice(0, 2), android[0]]) await assert.rejects(fs.access(file), {code: 'ENOENT'});
  for (const file of [...good.slice(3), failures[2], ...android.slice(1), active, foreign, unknown, path.join(outside, 'sentinel.txt')]) await fs.access(file);
  assert.equal((await retainBuilds(project, good[4])).removed.length, 0);
  await assert.rejects(retainBuilds(project, outside), /경로 오류/);
  await assert.rejects(retainBuilds(project, foreign), /프로젝트 불일치/);
  await write('AuricLoop.hbproject', {id: 'wrong-project'});
  await assert.rejects(retainBuilds(project, good[4]), /프로젝트 불일치/);
  console.log('PASS: 성공 2개·실패 1개, 플랫폼 분리, 미완료·수동·외부 에셋·연결 폴더 보존, 경로 차단, 시계 오차, dry-run, 재실행');
} finally {
  await fs.rm(temp, {recursive: true, force: true});
}
