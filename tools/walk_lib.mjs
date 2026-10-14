// 걷기 검사 공용: 장면 충돌체로 길찾기 지도(0.25m 격자) 만들기, A*, 키 입력 맞추기
export const CELL = 0.25, R = 0.4;

// inside(feet, margin): 걸을 수 있는 구역인지 (던전은 방·복도, 거점·집은 카메라 범위). 충돌체는 플레이어 반지름만큼 부풀림
export function buildGrid(vm, bounds, inside) {
  const [x0, y0, x1, y1] = bounds, w = Math.ceil((x1 - x0) / CELL), h = Math.ceil((y1 - y0) / CELL), block = new Uint8Array(w * h);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if (!inside([x0 + (i + .5) * CELL, y0 + (j + .5) * CELL], -R)) block[j * w + i] = 1;
  for (const o of vm.objects) {
    if (o.id === 'Player' || (o.tags || []).includes('Player.Hittable') || o.collisionEnabled === false || !o.position || o.position[1] < -150 || o.poolActive === false) continue;
    for (const c of o.components || []) {
      const q = c.properties || {}; if (q.enabled === false || q.trigger || !/Collider2D$/.test(c.type)) continue;
      const sc = o.scale || [1, 1, 1], cx = o.position[0] + (q.center?.[0] || 0) * sc[0], cy = o.position[1] + (q.center?.[1] || 0) * sc[1];
      const round = c.type === 'CircleCollider2D', hx = (round ? q.radius : q.extent?.[0] ?? .5) * Math.abs(sc[0]) + R, hy = (round ? q.radius : q.extent?.[1] ?? .5) * Math.abs(sc[1]) + R;
      for (let j = Math.max(0, Math.floor((cy - hy - y0) / CELL)); j <= Math.min(h - 1, Math.floor((cy + hy - y0) / CELL)); j++)
        for (let i = Math.max(0, Math.floor((cx - hx - x0) / CELL)); i <= Math.min(w - 1, Math.floor((cx + hx - x0) / CELL)); i++) block[j * w + i] = 1;
    }
  }
  return {x0, y0, w, h, block};
}
const cellOf = (g, p) => [Math.floor((p[0] - g.x0) / CELL), Math.floor((p[1] - g.y0) / CELL)];
export const free = (g, i, j) => i >= 0 && j >= 0 && i < g.w && j < g.h && !g.block[j * g.w + i];
export const freeAt = (g, p) => free(g, ...cellOf(g, p));
function nearestFree(g, [i, j]) {
  for (let r = 0; r < 40; r++) for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++)
    if ((Math.abs(di) === r || Math.abs(dj) === r) && free(g, i + di, j + dj)) return [i + di, j + dj];
  return null;
}
export function findPath(g, from, to) {
  const s = nearestFree(g, cellOf(g, from)), t = nearestFree(g, cellOf(g, to)); if (!s || !t) return null;
  const W = g.w, key = (i, j) => j * W + i, open = [[0, s[0], s[1]]], came = new Map([[key(...s), -1]]), cost = new Map([[key(...s), 0]]);
  const h = (i, j) => { const dx = Math.abs(i - t[0]), dy = Math.abs(j - t[1]); return Math.max(dx, dy) + .414 * Math.min(dx, dy); };
  for (let n = 0; open.length && n < 300000; n++) {
    let bi = 0; for (let k = 1; k < open.length; k++) if (open[k][0] < open[bi][0]) bi = k;
    const [, i, j] = open[bi]; open[bi] = open[open.length - 1]; open.pop();
    if (i === t[0] && j === t[1]) { const out = []; for (let k = key(i, j); k !== -1; k = came.get(k)) out.push([g.x0 + ((k % W) + .5) * CELL, g.y0 + (Math.floor(k / W) + .5) * CELL]); return out.reverse(); }
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const ni = i + di, nj = j + dj; if (!free(g, ni, nj) || (di && dj && (!free(g, i + di, j) || !free(g, i, j + dj)))) continue;
      const nc = cost.get(key(i, j)) + (di && dj ? 1.414 : 1), k = key(ni, nj);
      if (nc < (cost.get(k) ?? Infinity)) { cost.set(k, nc); came.set(k, key(i, j)); open.push([nc + h(ni, nj), ni, nj]); }
    }
  }
  return null;
}
// 목표 쪽 8방향 키
export function toward(f, t, tol = 0.12) {
  const dx = t[0] - f[0], dy = t[1] - f[1], want = new Set();
  if (Math.abs(dx) > tol) want.add(dx > 0 ? 'd' : 'a');
  if (Math.abs(dy) > tol) want.add(dy > 0 ? 'w' : 's');
  return want;
}
// 지금 누른 키를 want로 맞추는 입력 패킷들
export function keyPackets(held, want) {
  const out = [];
  for (const k of [...held]) if (!want.has(k)) { out.push({key: k, value: 0}); held.delete(k); }
  for (const k of want) if (!held.has(k)) { out.push({key: k, value: 1}); held.add(k); }
  return out;
}
