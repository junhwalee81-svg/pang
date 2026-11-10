// 코스 변수와 3D 샷 검사: node tests/hazards.js
require('../js/data.js');
require('../js/physics.js');

let bad = 0;
function check(name, ok, detail) {
  if (!ok) bad++;
  console.log((ok ? 'OK   ' : 'FAIL ') + name + (detail ? ' — ' + detail : ''));
}
const seeds = Array.from({ length: 60 }, (_, i) => Math.imul(i + 1, 2654435761) | 1);
const avg = (list) => list.reduce((a, b) => a + b, 0) / list.length;

// 같은 시드는 같은 코스, 다른 시드는 다른 코스
const h0 = HOLES[0];
const layoutJson = (seed) => { rollHoleLayout(h0, seed); return JSON.stringify(h0.layout); };
check('시드 재현', layoutJson(7) === layoutJson(7));
check('시드마다 다른 코스', layoutJson(7) !== layoutJson(8));

// 그린·컵은 변수의 영향을 받지 않는다
for (const h of HOLES) {
  h.layout = null; h.table = null;
  const z = holeShapes(h).cupZ;
  const xs = [h.green.from + 3, h.cup, h.green.to - 3];
  const before = xs.map((x) => heightAt(h, x, z));
  rollHoleLayout(h, 99);
  const after = xs.map((x) => heightAt(h, x, z));
  check(h.name + ' 그린 높이 유지', before.every((v, i) => Math.abs(v - after[i]) < 1e-3));
}

// 평지 비거리는 변하지 않고, 임팩트 오차는 좌우로 휜다
check('평지 비거리 불변', Math.abs(simulateShot({ club: '1W' }).carry - simulateShot({ club: '1W', seed: 555 }).carry) < 1e-6);
const slice = simulateShot({ club: '1W', impact: 0.1 }).lateral;
const hook = simulateShot({ club: '1W', impact: -0.1 }).lateral;
check('늦으면 슬라이스, 빠르면 훅', slice > 5 && hook < -5, slice.toFixed(1) + 'm / ' + hook.toFixed(1) + 'm');
const aimed = simulateShot({ club: '5I', yaw: 10 });
check('조준 방향으로 날아감', Math.abs(Math.atan2(aimed.lateral, aimed.endX) * 180 / Math.PI - 10) < 0.5, aimed.lateral.toFixed(1) + 'm');
const cross = simulateShot({ club: '1W', windZ: 6 }).lateral;
check('옆바람에 밀림', cross > 3, cross.toFixed(1) + 'm');

// 불규칙성: 같은 샷도 공 시드에 따라 결과가 갈린다
rollHoleLayout(h0, 3);
h0.layout.patches = [];
h0.layout.rocks = [];
h0.layout.trees = [];
h0.table = null;
prepareHole(h0);
const ends = seeds.map((s) => simulateShot({ club: '5I', hole: h0, x: 60, z: 0, seed: s }).endX);
const spread = Math.max(...ends) - Math.min(...ends);
check('착지 분산', spread > 1.5 && spread < 45, spread.toFixed(1) + 'm');

// 많은 무작위 샷이 끝까지 정상 종료되는지
let finished = 0, total = 0;
for (let i = 0; i < 360; i++) {
  const h = HOLES[i % 6];
  if (i % 60 === 0) rollHoleLayout(h, 1000 + i);
  const r = simulateShot({ club: ['1W', '5I', 'SW'][i % 3], power: 0.3 + (i % 8) * 0.1, hole: h, x: 5 + (i * 37) % 120, yaw: (i % 21) - 10, impact: (i % 7) * 0.02 - 0.06, seed: i + 1, wind: (i % 9) - 4, windZ: (i % 5) - 2 });
  total++;
  if (Number.isFinite(r.endX) && Number.isFinite(r.endZ) && r.time < PHYS.maxBallTime + 0.1) finished++;
}
check('무작위 샷 정상 종료', finished === total, finished + '/' + total);

// 장애물 배치
for (const h of HOLES) {
  rollHoleLayout(h, 4242);
  const L = h.layout;
  const banned = ['water', 'bunker', 'green', 'tee'];
  const rockOk = L.rocks.every((r) => !banned.includes(surfaceAt(h, r.x, r.z)));
  const S = holeShapes(h);
  const treeOk = L.trees.every((t) => Math.hypot(t.x - S.green.cx, t.z - S.green.cz) > Math.min(S.green.rx, S.green.rz) && surfaceAt(h, t.x, t.z) !== 'water');
  check(h.name + ' 배치', L.rocks.length >= 2 && L.trees.length >= 10 && rockOk && treeOk, '돌 ' + L.rocks.length + ' · 나무 ' + L.trees.length);
}
let noPlay = 0;
for (const h of HOLES) for (let s = 1; s <= 80; s++) { rollHoleLayout(h, s * 131); if (!h.layout.spots.length) noPlay++; }
check('코스 안 장애물이 항상 있음', noPlay === 0, '없는 코스 ' + noPlay + '건/480');

// 돌: 앞뒤로 갈리고 돌 위에 멈추지 않는다
const clearHole = (seed) => {
  rollHoleLayout(h0, seed);
  h0.layout.patches = []; h0.layout.rocks = []; h0.layout.trees = [];
  h0.table = null;
  prepareHole(h0);
  return h0;
};
function rollInto(hole, x, z, seed, v) {
  const b = makeBall(x, heightAt(hole, x, z), z);
  b.seed = seed;
  launchBall(b, { v, ang: 0, yaw: 0, spin: 0, side: 0, perfect: false, miss: 0, putt: true });
  const env = shotEnv({});
  let g = 0;
  while (b.mode !== 'stop' && g++ < 5000) stepBall(b, hole, env, PHYS.dt);
  return b;
}
const hr = clearHole(11);
const rz = centerZ(hr, 150);
hr.layout.rocks = [{ x: 150, z: rz, r: 1, turn: 0 }];
let back = 0, fwd = 0, inside = 0;
for (const s of seeds) {
  const b = rollInto(hr, 140, rz, s, 18);
  if (b.x < 150) back++; else fwd++;
  if (Math.hypot(b.x - 150, b.z - rz) < 1) inside++;
}
check('돌에 맞으면 앞뒤로 갈림', back > 5 && fwd > 5, '뒤 ' + back + ' / 앞 ' + fwd);
check('돌 위에 멈추지 않음', inside === 0);
const noHz = simulateShot({ club: 'SW', hole: hr, x: 148, z: rz, seed: 3, ignoreHazards: true });
hr.layout.rocks = [];
const clear = simulateShot({ club: 'SW', hole: hr, x: 148, z: rz, seed: 3 });
check('마커는 장애물 무시', Math.abs(noHz.carry - clear.carry) < 1e-6);

// 나무: 잎이 공을 막고, 일부는 통과하며, 줄기는 굴러온 공을 되튀긴다
const ht = clearHole(21);
const free = avg(seeds.map((s) => simulateShot({ club: '5I', hole: ht, x: 40, z: 0, seed: s }).endX));
ht.layout.trees = [{ x: 130, z: 0, h: 40, r: 12, base: 8, kind: 'oak', variant: 0, turn: 0, tint: 0 }];
const blockedEnds = seeds.map((s) => simulateShot({ club: '5I', hole: ht, x: 40, z: 0, seed: s }).endX);
check('잎이 공을 막음', avg(blockedEnds) < free - 15, '평균 ' + free.toFixed(0) + 'm → ' + avg(blockedEnds).toFixed(0) + 'm');
const passed = blockedEnds.filter((x) => x > free - 12).length;
check('일부는 잎을 통과', passed > 3 && passed < 35, passed + '/60');
const tz = centerZ(ht, 150);
ht.layout.trees = [{ x: 150, z: tz, h: 10, r: 2.4, base: 3, kind: 'oak', variant: 0, turn: 0, tint: 0 }];
const bounced = seeds.filter((s) => rollInto(ht, 140, tz, s, 18).x < 150).length;
check('줄기가 공을 되튀김', bounced > 50, bounced + '/60');

let met = 0, n = 0;
for (let i = 0; i < 300; i++) {
  const h = HOLES[i % 6];
  rollHoleLayout(h, 5000 + i);
  const yaw = Math.atan2(centerZ(h, 200), 200) * 180 / Math.PI;
  const a = simulateShot({ club: '1W', hole: h, x: 0, z: 0, yaw, seed: i + 1, ignoreHazards: true });
  const b = simulateShot({ club: '1W', hole: h, x: 0, z: 0, yaw, seed: i + 1 });
  n++;
  if (Math.hypot(a.endX - b.endX, a.endZ - b.endZ) > 3) met++;
}
console.log('참고: 페어웨이로 친 티샷이 장애물로 3m 넘게 달라진 비율 ' + Math.round((met / n) * 100) + '%');

console.log(bad ? '실패 ' + bad + '건' : '통과');
process.exitCode = bad ? 1 : 0;
