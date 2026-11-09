// 코스 변수 검사: node tests/hazards.js
require('../js/data.js');
require('../js/physics.js');

let bad = 0;
function check(name, ok, detail) {
  if (!ok) bad++;
  console.log((ok ? 'OK   ' : 'FAIL ') + name + (detail ? ' — ' + detail : ''));
}

// 같은 시드는 같은 코스, 다른 시드는 다른 코스
const h0 = HOLES[0];
const layoutJson = (seed) => { rollHoleLayout(h0, seed); return JSON.stringify(h0.layout); };
check('시드 재현', layoutJson(7) === layoutJson(7));
check('시드마다 다른 코스', layoutJson(7) !== layoutJson(8));

// 그린·컵은 변수의 영향을 받지 않는다
for (const h of HOLES) {
  h.layout = null; h.table = null;
  const before = [h.green.from + 1, h.cup, h.green.to - 1].map((x) => heightAt(h, x));
  rollHoleLayout(h, 99);
  const after = [h.green.from + 1, h.cup, h.green.to - 1].map((x) => heightAt(h, x));
  check(h.name + ' 그린 높이 유지', before.every((v, i) => Math.abs(v - after[i]) < 1e-4));
}

// 불규칙성: 같은 샷도 공 시드에 따라 결과가 갈린다. 평지 기준 비거리는 변하지 않는다
rollHoleLayout(h0, 3);
h0.layout.patches = [];
h0.table = null;
prepareHole(h0);
const spread = (x, club) => {
  const ends = [];
  for (let s = 1; s <= 40; s++) ends.push(simulateShot({ club, hole: h0, x, seed: Math.imul(s, 2654435761) | 1 }).endX);
  return Math.max(...ends) - Math.min(...ends);
};
const fairSpread = spread(60, '5I');
check('페어웨이 착지 분산', fairSpread > 2 && fairSpread < 45, fairSpread.toFixed(1) + 'm');
check('평지 비거리 불변', Math.abs(simulateShot({ club: '1W' }).carry - simulateShot({ club: '1W', seed: 555 }).carry) < 1e-6);

// 많은 무작위 샷이 끝까지 정상 종료되는지
let finished = 0, total = 0;
for (let i = 0; i < 6 * 60; i++) {
  const h = HOLES[i % 6];
  if (i % 60 === 0) rollHoleLayout(h, 1000 + i);
  const r = simulateShot({ club: ['1W', '5I', 'SW'][i % 3], power: 0.3 + (i % 8) * 0.1, hole: h, x: 5 + (i * 37) % 120, seed: i + 1, wind: (i % 9) - 4 });
  total++;
  if (Number.isFinite(r.endX) && r.time < PHYS.maxBallTime + 0.1) finished++;
}
check('무작위 샷 정상 종료', finished === total, finished + '/' + total);

// 돌: 금지 구역 밖에만 놓이고, 맞으면 앞뒤로 갈린다. 마커는 무시한다
for (const h of HOLES) {
  rollHoleLayout(h, 4242);
  const R = h.layout.rocks;
  const okPlace = R.every((r) => !['water', 'bunker', 'green', 'tee'].includes(surfaceAt(h, r.x)));
  check(h.name + ' 돌 배치', R.length >= 2 && okPlace, R.length + '개');
}
const hr = HOLES[0];
rollHoleLayout(hr, 11);
hr.layout.rocks = [{ x: 150, r: 1, kind: 'rock1' }];
let back = 0, fwd = 0, inside = 0;
for (let s = 1; s <= 60; s++) {
  const b = makeBall(140, heightAt(hr, 140));
  b.seed = Math.imul(s, 2654435761) | 1;
  launchBall(b, { v: 18, ang: 0, spin: 0, perfect: false, miss: 0, putt: true });
  const env = shotEnv({});
  let g = 0;
  while (b.mode !== 'stop' && g++ < 5000) stepBall(b, hr, env, PHYS.dt);
  if (b.x < 150) back++; else fwd++;
  if (Math.abs(b.x - 150) < 1) inside++;
}
check('돌에 맞으면 앞뒤로 갈림', back > 5 && fwd > 5, '뒤 ' + back + ' / 앞 ' + fwd);
check('돌 위에 멈추지 않음', inside === 0);
const noHz = simulateShot({ club: 'SW', hole: hr, x: 148, seed: 3, ignoreHazards: true });
hr.layout.rocks = [];
const clear = simulateShot({ club: 'SW', hole: hr, x: 148, seed: 3 });
check('마커는 장애물 무시', Math.abs(noHz.carry - clear.carry) < 1e-6);

// 나무: 그린 앞 안전거리를 지키고, 잎·줄기가 공을 막는다
for (const h of HOLES) {
  rollHoleLayout(h, 777);
  const T = h.layout.trees;
  const okPlace = T.every((t) => t.x < h.green.from - HAZARD.treeClearGreen + 1e-6 && !['water', 'bunker', 'green', 'tee'].includes(surfaceAt(h, t.x)));
  check(h.name + ' 나무 배치', T.length >= 1 && okPlace, T.length + '그루');
}
const ht = HOLES[0];
rollHoleLayout(ht, 21);
ht.layout.rocks = [];
ht.layout.trees = [];
const seeds = Array.from({ length: 60 }, (_, i) => Math.imul(i + 1, 2654435761) | 1);
const avg = (list) => list.reduce((a, b) => a + b, 0) / list.length;
const free = avg(seeds.map((s) => simulateShot({ club: '5I', hole: ht, x: 40, seed: s }).endX));
ht.layout.trees = [{ x: 130, h: 40, r: 10, kind: 'tree' }];
const blocked = avg(seeds.map((s) => simulateShot({ club: '5I', hole: ht, x: 40, seed: s }).endX));
check('잎이 공을 막음', blocked < free - 15, '평균 ' + free.toFixed(0) + 'm → ' + blocked.toFixed(0) + 'm');
const passed = seeds.filter((s) => simulateShot({ club: '5I', hole: ht, x: 40, seed: s }).endX > free - 12).length;
check('일부는 잎을 통과', passed > 3 && passed < 35, passed + '/60');
ht.layout.trees = [{ x: 150, h: 10, r: 2.4, kind: 'tree' }];
let hitBack = 0;
for (const s of seeds) {
  const b = makeBall(140, heightAt(ht, 140));
  b.seed = s;
  launchBall(b, { v: 18, ang: 0, spin: 0, perfect: false, miss: 0, putt: true });
  const env = shotEnv({});
  let g = 0;
  while (b.mode !== 'stop' && g++ < 5000) stepBall(b, ht, env, PHYS.dt);
  if (b.x < 150) hitBack++;
}
check('줄기에 일부만 맞음', hitBack > 10 && hitBack < 40, hitBack + '/60');
// 실제 코스에서 만난 비율(밸런스 참고)
let met = 0, n = 0;
for (let i = 0; i < 300; i++) {
  const h = HOLES[i % 6];
  rollHoleLayout(h, 5000 + i);
  const clean = simulateShot({ club: '1W', hole: h, x: 0, seed: i + 1, ignoreHazards: true }).endX;
  const real = simulateShot({ club: '1W', hole: h, x: 0, seed: i + 1 }).endX;
  n++;
  if (Math.abs(clean - real) > 3) met++;
}
console.log('참고: 티샷 1W가 장애물로 3m 넘게 달라진 비율 ' + Math.round((met / n) * 100) + '%');

report();

function report() {
  console.log(bad ? '실패 ' + bad + '건' : '통과');
  process.exitCode = bad ? 1 : 0;
}
