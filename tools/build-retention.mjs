import fs from 'node:fs/promises';
import path from 'node:path';

const PROJECT_ID = 'c56d1b68-6576-4a57-8773-0469147f0d1c';
const BUILD_NAME = /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z-[a-f0-9]{8}$/;
const json = async file => JSON.parse(await fs.readFile(file, 'utf8'));
const plainDirectory = async file => {
  const info = await fs.lstat(file);
  return info.isDirectory() && !info.isSymbolicLink() && path.resolve(await fs.realpath(file)).toLowerCase() === path.resolve(file).toLowerCase();
};

// Only completed, identified build outputs may be removed; unknown/in-flight folders stay.
export async function retainBuilds(projectRoot, currentOutput, {dryRun = false} = {}) {
  const project = path.resolve(projectRoot);
  if (!await plainDirectory(project) || (await json(path.join(project, 'AuricLoop.hbproject'))).id !== PROJECT_ID) throw Error('빌드 정리 프로젝트 불일치');
  const root = path.join(project, 'Builds');
  if (!await plainDirectory(root)) throw Error('빌드 폴더 연결/경로 오류');
  const current = path.resolve(currentOutput);
  if (path.dirname(path.dirname(current)) !== root || !BUILD_NAME.test(path.basename(current)) || !await plainDirectory(current)) throw Error('현재 빌드 경로 오류');
  const currentReport = await json(path.join(current, 'build-report.json'));
  if (currentReport.id !== path.basename(current) || path.resolve(currentReport.output) !== current || currentReport.profile?.id !== path.basename(path.dirname(current))) throw Error('현재 빌드 완료 기록 오류');
  const currentPack = await json(path.join(current, currentReport.target === 'android' || currentReport.target === 'ios' ? 'Assets/game.hbpack.json' : 'game.hbpack.json'));
  if (currentPack.id !== PROJECT_ID) throw Error('현재 빌드 프로젝트 불일치');
  const removed = [], skipped = [];
  for (const profile of await fs.readdir(root, {withFileTypes: true})) {
    if (!profile.isDirectory() || !/^[a-zA-Z0-9_-]+$/.test(profile.name)) continue;
    const profileRoot = path.join(root, profile.name);
    if (!await plainDirectory(profileRoot)) continue;
    const successes = [], failures = [];
    for (const entry of await fs.readdir(profileRoot, {withFileTypes: true})) {
      if (!entry.isDirectory() || !BUILD_NAME.test(entry.name)) continue;
      const dir = path.join(profileRoot, entry.name);
      if (!await plainDirectory(dir)) continue;
      try {
        const report = await json(path.join(dir, 'build-report.json'));
        if (report.id !== entry.name || path.resolve(report.output) !== dir || report.profile?.id !== profile.name) continue;
        const pack = await json(path.join(dir, report.target === 'android' || report.target === 'ios' ? 'Assets/game.hbpack.json' : 'game.hbpack.json'));
        if (pack.id !== PROJECT_ID) continue;
        successes.push(dir);
      } catch (error) {
        if (error.code !== 'ENOENT') continue;
        try { if (typeof (await json(path.join(dir, 'build-failed.json'))).error === 'string') failures.push(dir); } catch { /* No terminal marker: preserve. */ }
      }
    }
    successes.sort().reverse(); failures.sort().reverse();
    const latest = successes.includes(current) ? [current, ...successes.filter(dir => dir !== current).slice(0, 1)] : successes.slice(0, 2);
    const keep = new Set([...latest, ...failures.slice(0, 1), current]);
    for (const dir of [...successes, ...failures]) {
      if (keep.has(dir)) continue;
      // Recheck immediately before removal. Node removes nested links, not their targets.
      if (path.dirname(dir) !== profileRoot || !await plainDirectory(profileRoot) || !await plainDirectory(dir)) throw Error('빌드 삭제 경로 재검증 실패');
      if (dryRun) { removed.push(dir); continue; }
      try { await fs.rm(dir, {recursive: true, force: false}); removed.push(dir); }
      catch (error) { skipped.push({dir, error: error.code || error.message}); }
    }
  }
  if (skipped.length) console.warn('사용 중이거나 정리하지 못한 빌드:', skipped);
  return {removed, skipped};
}
