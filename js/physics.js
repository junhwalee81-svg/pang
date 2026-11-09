/* 물리 계산. DOM·그림과 무관하며 Node에서도 돌아간다. */

var PHYS = {
  dt: 1 / 120,
  g: 9.81,
  drag: 0.0041,        // 공기 저항 계수
  lift: 0.0036,        // 백스핀 양력 계수
  spinDecay: 0.14,     // 초당 스핀 감소율
  windGain: 1.0,       // 풍속 반영 배율
  windFullHeight: 14,  // 이 높이(m) 이상에서 바람을 100% 받음
  powerExp: 0.5,       // 게이지 → 속도 곡선
  backGrip: 8.5,       // 착지 때 백스핀이 수평 속도를 깎는 양(m/s)
  topRun: 0.35,        // 톱스핀이 구름 저항을 줄이는 비율
  bounceStop: 1.1,     // 이 수직 속도 아래면 구르기로 전환
  stopSpeed: 0.06,
  captureSpeed: 1.75,  // 컵에 들어가는 최대 굴림 속도
  dunkSpeed: 7.5,      // 날아와서 바로 들어가는 최대 속도
  cupRadius: 0.16,
  maxBallTime: 28,
  // 스탯 공식 (10이 기준)
  powerPerStat: 0.0065,   // 속도 = v0 × (1 + (파워-10)×값)
  controlPerStat: 0.035,  // 오차 ÷ (1 + (컨트롤-10)×값)
  impactBase: 0.022,      // 완벽 판정 절반 폭(게이지 비율)
  impactPerStat: 0.0016,  // 임팩트 1당 판정 폭 증가
  spinPerStat: 0.03,      // 스핀 효과 × (1 + (스핀-10)×값)
  perfectBoost: 1.035,    // 완벽 임팩트 속도 배율
  errSpeed: 0.75,         // 오차 → 속도 손실
  errAngle: 26,           // 오차 → 각도 오차(도)
  errSpin: 1.2,           // 오차 → 스핀 손실
  puttErr: 0.55,          // 오차 → 퍼팅 속도 오차
  distToSpeed: 0.76,      // 비거리 배율 → 속도 배율 지수
};

// 홀을 시작할 때마다 새로 정해지는 코스 변수
var HAZARD = {
  bump: { fairway: 0.07, rough: 0.2, hard: 0.1, soft: 0.05 }, // 잔요철 높이(m)
  bumpSmooth: 8,          // 요철 높이 전환을 고르게 하는 표 칸 수(칸당 0.25m)
  greenMargin: 4,         // 그린 둘레 이 거리(m)까지는 요철 없음
  patchCount: [2, 4],     // 페어웨이의 단단한 땅·질퍽한 땅 수
  patchLen: [8, 20],      // 그 길이(m)
  rockCount: { 3: [2, 3], 4: [3, 5], 5: [5, 8] }, // 파별 돌 개수
  rockR: [0.45, 1.05],    // 돌 반지름(m)
  rockHeight: 1.35,       // 반지름의 이 배 높이까지 공이 부딪힘
  rockForward: 0.55,      // 앞으로 튈 확률(나머지는 뒤로)
  rockForwardKeep: [0.45, 0.85], // 앞으로 튈 때 속도 유지율
  rockBackKeep: [0.15, 0.45],    // 뒤로 튈 때 속도 유지율
  rockLift: [0.2, 0.55],  // 속도 대비 위로 튀는 비율
  rockCooldown: 0.22,     // 연속 충돌 방지(초)
  rockMinSpeed: 2.5,      // 이보다 느리면 그냥 멈칫한다
  treeCount: { 3: [1, 2], 4: [2, 4], 5: [3, 6] }, // 파별 코스 안 나무 수
  treeH: [7.5, 12.5],     // 나무 높이(m)
  treeHalfWidth: 0.24,    // 잎 부분 절반 폭 = 높이 × 값
  canopyBase: 0.34,       // 잎이 시작하는 높이 비율
  canopyPass: 0.22,       // 잎 사이로 그냥 빠져나갈 확률
  canopySlow: [0.22, 0.55], // 잎에 걸렸을 때 수평 속도 유지율
  trunkHalf: 0.3,         // 줄기 절반 폭(m)
  trunkChance: 0.4,       // 잎 아래로 지나는 공이 줄기에 맞을 확률
  trunkBack: [0.2, 0.5],  // 줄기에 맞고 되튀는 속도 비율
  treeClearGreen: 8,      // 그린 앞 이 거리(m) 안에는 나무 없음
  placeGap: 9,            // 장애물끼리의 최소 간격(m)
  placeClear: 4,          // 해저드·그린·티에서 떨어질 거리(m)
  graceTime: 0.12,        // 친 직후 충돌을 무시하는 시간(초)
};

// rest: 반발, tang: 튈 때 수평 유지율, mu: 구름 저항, grip: 백스핀 적용 비율, hold: 정지 경사 한계
// kick: 튈 때 지면 기울기가 임의로 흔들리는 폭
var TERRAIN = {
  tee: { rest: 0.3, tang: 0.7, mu: 0.3, grip: 0.6, hold: 0.09, kick: 0.03 },
  fairway: { rest: 0.3, tang: 0.62, mu: 0.4, grip: 0.65, hold: 0.09, kick: 0.07 },
  rough: { rest: 0.2, tang: 0.46, mu: 0.75, grip: 0.3, hold: 0.25, kick: 0.22 },
  bunker: { rest: 0.04, tang: 0.18, mu: 2.8, grip: 0.1, hold: 1, kick: 0.03 },
  green: { rest: 0.28, tang: 0.8, mu: 0.088, grip: 1, hold: 0.06, kick: 0 },
  water: { rest: 0, tang: 0, mu: 9, grip: 0, hold: 1, kick: 0 },
  hard: { rest: 0.42, tang: 0.8, mu: 0.22, grip: 0.4, hold: 0.09, kick: 0.13 },
  soft: { rest: 0.1, tang: 0.3, mu: 1.15, grip: 0.8, hold: 0.25, kick: 0.04 },
};
// 공이 놓인 지형에 따른 샷 속도 배율
var TERRAIN_LIE = { rough: 0.88, bunker: 0.5, bunkerWedge: 0.86, soft: 0.94 };
var TERRAIN_IDS = ['rough', 'tee', 'fairway', 'bunker', 'green', 'water', 'hard', 'soft'];

var HOLE_MIN_X = -70;
var HOLE_STEP = 0.25;

function lerp(a, b, t) { return a + (b - a) * t; }
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function smooth(t) { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); }

function makeRng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function rangeOf(rng, pair) { return pair[0] + (pair[1] - pair[0]) * rng(); }

/** 이번 플레이의 코스 변수를 정한다. 같은 시드면 항상 같은 코스가 된다 */
function rollHoleLayout(hole, seed) {
  const rng = makeRng(seed);
  const bumps = [[0.2, 0.5], [0.55, 0.3], [1.3, 0.2]].map(([k, a]) => ({ k: k * (0.8 + rng() * 0.4), a, p: rng() * 6.28 }));
  const patches = [];
  const count = Math.round(rangeOf(rng, HAZARD.patchCount));
  for (let i = 0; i < count; i++) {
    const len = rangeOf(rng, HAZARD.patchLen);
    const from = hole.fair[0] + rng() * Math.max(1, hole.fair[1] - hole.fair[0] - len);
    patches.push({ from, to: from + len, type: rng() < 0.5 ? 'hard' : 'soft' });
  }
  hole.table = null;
  hole.layout = { seed, bumps, patches, rocks: [], trees: [] };
  prepareHole(hole);
  // 나무는 놓을 수 있는 구간이 좁아 돌보다 먼저 자리를 잡는다
  hole.layout.used = [];
  placeTrees(hole, rng);
  placeRocks(hole, rng);
  return hole.layout;
}

/** x 주변이 장애물을 놓아도 되는 땅인지 */
function canPlaceAt(hole, x, used) {
  if (x < 24 || x > hole.end - 6) return false;
  if (used.some((u) => Math.abs(u - x) < HAZARD.placeGap)) return false;
  for (let d = -HAZARD.placeClear; d <= HAZARD.placeClear; d += 1) {
    const s = surfaceAt(hole, x + d);
    if (s === 'water' || s === 'bunker' || s === 'green' || s === 'tee') return false;
  }
  return true;
}

function pickSpots(hole, rng, count, used, from, to) {
  const spots = [];
  for (let tries = 0; tries < count * 40 && spots.length < count; tries++) {
    const x = from + rng() * (to - from);
    if (!canPlaceAt(hole, x, used)) continue;
    used.push(x);
    spots.push(x);
  }
  return spots;
}

function placeTrees(hole, rng) {
  const L = hole.layout;
  const kinds = THEMES[hole.theme].trees;
  const count = Math.round(rangeOf(rng, HAZARD.treeCount[hole.par]));
  L.trees = pickSpots(hole, rng, count, L.used, 34, hole.green.from - HAZARD.treeClearGreen).map((x) => {
    const h = rangeOf(rng, HAZARD.treeH);
    return { x, h, r: h * HAZARD.treeHalfWidth, kind: kinds[(rng() * kinds.length) | 0] };
  });
}

function placeRocks(hole, rng) {
  const L = hole.layout;
  const count = Math.round(rangeOf(rng, HAZARD.rockCount[hole.par]));
  L.rocks = pickSpots(hole, rng, count, L.used, 24, hole.end - 6).map((x) => ({
    x, r: rangeOf(rng, HAZARD.rockR), kind: 'rock' + (1 + ((rng() * 3) | 0)),
  }));
}

function applyBumps(hole, h, type, n) {
  const g = hole.green;
  const bumps = hole.layout.bumps;
  const amp = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = HOLE_MIN_X + i * HOLE_STEP;
    const near = x >= g.from - HAZARD.greenMargin && x <= g.to + HAZARD.greenMargin;
    amp[i] = near ? 0 : HAZARD.bump[TERRAIN_IDS[type[i]]] || 0;
  }
  const R = HAZARD.bumpSmooth;
  for (let i = 0; i < n; i++) {
    let sum = 0, c = 0;
    for (let j = Math.max(0, i - R); j <= Math.min(n - 1, i + R); j++) { sum += amp[j]; c++; }
    const x = HOLE_MIN_X + i * HOLE_STEP;
    let wave = 0;
    for (const b of bumps) wave += b.a * Math.sin(x * b.k + b.p);
    const a = sum / c;
    const blocked = x >= g.from - 2 && x <= g.to + 2;
    if (!blocked) h[i] += a * wave;
  }
}

function basePointHeight(pts, x) {
  if (x <= pts[0][0]) return pts[0][1];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    if (x <= b[0]) {
      const p0 = pts[Math.max(0, i - 1)], p3 = pts[Math.min(pts.length - 1, i + 2)];
      const t = (x - a[0]) / (b[0] - a[0]);
      const m1 = (b[1] - p0[1]) / 2 * clamp((b[0] - a[0]) / Math.max(1, (b[0] - p0[0]) / 2), 0, 1);
      const m2 = (p3[1] - a[1]) / 2 * clamp((b[0] - a[0]) / Math.max(1, (p3[0] - a[0]) / 2), 0, 1);
      const t2 = t * t, t3 = t2 * t;
      return (2 * t3 - 3 * t2 + 1) * a[1] + (t3 - 2 * t2 + t) * m1 + (-2 * t3 + 3 * t2) * b[1] + (t3 - t2) * m2;
    }
  }
  return pts[pts.length - 1][1];
}

/** 홀의 높이·지형 표를 만든다(0.25m 간격). 같은 홀은 한 번만 계산한다. */
function prepareHole(hole) {
  if (hole.table) return hole.table;
  const last = hole.pts[hole.pts.length - 1][0];
  const n = Math.ceil((last - HOLE_MIN_X) / HOLE_STEP) + 1;
  const h = new Float32Array(n), type = new Uint8Array(n);
  const ID = {};
  TERRAIN_IDS.forEach((k, i) => { ID[k] = i; });
  const g = hole.green;
  const cupBase = g.base;
  for (let i = 0; i < n; i++) {
    const x = HOLE_MIN_X + i * HOLE_STEP;
    let y = basePointHeight(hole.pts, x);
    let t = ID.rough;
    if (x >= hole.tee[0] && x <= hole.tee[1]) t = ID.tee;
    if (x >= hole.fair[0] && x <= hole.fair[1]) {
      t = ID.fairway;
      if (hole.layout) for (const p of hole.layout.patches) if (x >= p.from && x <= p.to) t = ID[p.type];
    }
    if (x >= g.from - 6 && x <= g.to + 6) {
      const blend = smooth((x - (g.from - 6)) / 6) * (1 - smooth((x - g.to) / 6));
      const wave = 0.02 * Math.sin((x - hole.cup) * 0.31) * smooth(Math.abs(x - hole.cup) / 4);
      y = lerp(y, cupBase + (g.slope / 100) * (x - hole.cup) + wave, blend);
    }
    if (x >= g.from && x <= g.to) t = ID.green;
    for (const b of hole.bunkers) {
      if (x >= b[0] && x <= b[1]) {
        const u = (x - b[0]) / (b[1] - b[0]);
        y -= 1.25 * Math.pow(Math.sin(Math.PI * u), 0.7);
        t = ID.bunker;
      }
    }
    h[i] = y;
    type[i] = t;
  }
  if (hole.layout) applyBumps(hole, h, type, n);
  const level = [];
  for (const p of hole.ponds) {
    const i0 = Math.floor((p[0] - HOLE_MIN_X) / HOLE_STEP), i1 = Math.floor((p[1] - HOLE_MIN_X) / HOLE_STEP);
    const water = Math.min(h[i0], h[i1]) - 0.5;
    level.push({ from: p[0], to: p[1], y: water });
    for (let i = i0; i <= i1; i++) {
      const u = (i - i0) / (i1 - i0);
      h[i] = Math.min(h[i], water - 2.4 * Math.pow(Math.sin(Math.PI * u), 0.5));
      if (h[i] < water) type[i] = ID.water;
    }
  }
  hole.table = { h, type, n, level };
  return hole.table;
}

var FLAT_HOLE = { flat: true, cup: 1e9 };

function heightAt(hole, x) {
  if (hole.flat) return 0;
  const t = prepareHole(hole);
  const f = clamp((x - HOLE_MIN_X) / HOLE_STEP, 0, t.n - 1.001);
  const i = f | 0;
  return t.h[i] + (t.h[i + 1] - t.h[i]) * (f - i);
}

function slopeAt(hole, x) {
  return (heightAt(hole, x + 0.25) - heightAt(hole, x - 0.25)) / 0.5;
}

/** x1→x2 구간의 평균 경사(소수, +는 x가 커질수록 높아짐). 구간이 짧으면 x1의 경사 */
function slopeBetween(hole, x1, x2) {
  if (Math.abs(x2 - x1) < 1.5) return slopeAt(hole, x1);
  return (heightAt(hole, x2) - heightAt(hole, x1)) / (x2 - x1);
}

function surfaceAt(hole, x) {
  if (hole.flat) return 'fairway';
  const t = prepareHole(hole);
  const i = clamp(Math.round((x - HOLE_MIN_X) / HOLE_STEP), 0, t.n - 1);
  return TERRAIN_IDS[t.type[i]];
}

/** 장비 스탯 합산 */
function sumStats(equip, items) {
  const out = { power: 0, control: 0, impact: 0, spin: 0 };
  for (const slot in equip) {
    const item = items[slot].find((it) => it.id === equip[slot]);
    if (!item) continue;
    for (const k in item.stats) out[k] += item.stats[k];
  }
  return out;
}

/** 스탯 → 계산용 배율 */
function statFactors(s) {
  return {
    powerMul: 1 + (s.power - 10) * PHYS.powerPerStat,
    controlDiv: Math.max(0.3, 1 + (s.control - 10) * PHYS.controlPerStat),
    perfectHalf: Math.max(0.008, PHYS.impactBase + (s.impact - 10) * PHYS.impactPerStat),
    spinMul: Math.max(0.2, 1 + (s.spin - 10) * PHYS.spinPerStat),
  };
}

var BASE_STATS = { power: 10, control: 10, impact: 10, spin: 10 };

/**
 * 샷 입력 → 발사값.
 * o: { club, power(0~1), angle(도), spin(-1 톱~1 백), stats, impact(게이지 오차, +는 늦음) }
 */
function launchFrom(o) {
  const c = CLUB_TYPES[o.club];
  const f = statFactors(o.stats || BASE_STATS);
  const err = o.impact || 0;
  const abs = Math.abs(err);
  const perfect = abs <= f.perfectHalf;
  const miss = perfect ? 0 : (abs - f.perfectHalf) / f.controlDiv;
  if (o.club === 'PT') {
    const v = c.v0 * Math.sqrt(clamp(o.power, 0, 1));
    return { v: v * (1 + Math.sign(err) * miss * PHYS.puttErr * (o.puttErrMul || 1)), ang: 0, spin: 0, perfect, miss, putt: true };
  }
  const sp = SPECIAL_SHOTS[o.special] || null;
  let v = c.v0 * Math.pow(clamp(o.power, 0.02, 1), PHYS.powerExp) * f.powerMul * (sp ? sp.speedMul : 1);
  if (perfect) v *= PHYS.perfectBoost;
  if (o.club === '1W' && o.driverDist) v *= Math.pow(o.driverDist, PHYS.distToSpeed);
  v *= (o.lie || 1) * (1 - clamp(miss * PHYS.errSpeed, 0, 0.6));
  const ang = c.loft + (o.angle || 0) + (sp ? sp.loftAdd : 0) + Math.sign(err) * miss * PHYS.errAngle;
  const spin = (c.spin + (sp ? sp.spinAdd : 0) + (o.spin || 0) * c.spinCtl * f.spinMul) * (1 - clamp(miss * PHYS.errSpin, 0, 0.8));
  return { v, ang, spin, perfect, miss, putt: false };
}

function makeBall(x, y) {
  return { x, y, vx: 0, vy: 0, spin: 0, t: 0, mode: 'stop', rot: 0, startX: x, carryX: null, apex: y, bounces: 0, rollMu: 1, lipUntil: 0, rockUntil: 0, seed: 1, hitTrees: [], events: [], holed: false };
}

function launchBall(b, lp) {
  const rad = lp.ang * Math.PI / 180;
  b.vx = lp.v * Math.cos(rad);
  b.vy = lp.v * Math.sin(rad);
  b.spin = lp.spin;
  b.t = 0;
  b.startX = b.x;
  b.apex = b.y;
  b.carryX = null;
  b.bounces = 0;
  b.events.length = 0;
  b.holed = false;
  b.lipUntil = 0;
  b.rockUntil = 0;
  b.hitTrees = [];
  b.mode = lp.putt ? 'roll' : 'air';
  b.rollMu = 1;
}

/** 공마다 다른 임의값(0~1). 시드가 같으면 결과가 같다 */
function ballRand(b) {
  b.seed = (Math.imul(b.seed, 1664525) + 1013904223) | 0;
  return ((b.seed >>> 8) & 0xffff) / 65536;
}

function emit(b, kind, surface, speed, treeX) { b.events.push({ kind, surface, speed, x: b.x, y: b.y, treeX }); }

function tryCup(b, hole, prevX, env) {
  if (hole.flat) return false;
  const c = hole.cup;
  const r = PHYS.cupRadius;
  const crossed = (prevX - c) * (b.x - c) <= 0 || Math.abs(b.x - c) < r;
  if (!crossed) return false;
  if (b.t < b.lipUntil) return false;
  const speed = Math.hypot(b.vx, b.vy);
  const limit = (b.mode === 'roll' ? PHYS.captureSpeed : PHYS.dunkSpeed) * (env.captureMul || 1);
  if (speed <= limit) {
    b.holed = true;
    b.x = c;
    b.y = heightAt(hole, c) - 0.15;
    b.vx = b.vy = 0;
    b.mode = 'stop';
    emit(b, 'cup', 'green', speed);
    return true;
  }
  if (b.mode === 'roll') {
    b.vx *= 0.82;
    b.vy = 0.9;
    b.lipUntil = b.t + 0.45;
    b.y = heightAt(hole, b.x) + 0.02;
    b.mode = 'air';
    emit(b, 'lip', 'green', speed);
  }
  return false;
}

/** 공을 dt초 진행한다. env: { wind, windMul, captureMul } */
function stepBall(b, hole, env, dt) {
  if (b.mode === 'stop') return;
  const prevX = b.x;
  b.t += dt;
  if (b.mode === 'air') {
    const gain = clamp(b.y - heightAt(hole, b.x), 0, PHYS.windFullHeight) / PHYS.windFullHeight;
    const wx = (env.wind || 0) * (env.windMul == null ? 1 : env.windMul) * PHYS.windGain * (0.3 + 0.7 * gain);
    const rx = b.vx - wx, ry = b.vy;
    const sp = Math.hypot(rx, ry);
    const lift = PHYS.lift * b.spin * sp;
    b.vx += (-PHYS.drag * sp * rx - lift * ry) * dt;
    b.vy += (-PHYS.g - PHYS.drag * sp * ry + lift * rx) * dt;
    b.spin *= 1 - PHYS.spinDecay * dt;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.rot += b.vx * dt * 2;
    if (b.y > b.apex) b.apex = b.y;
    const gy = heightAt(hole, b.x);
    if (tryCupAir(b, hole, prevX, env, gy)) return;
    if (b.y <= gy) landBall(b, hole, env, gy);
  } else {
    rollBall(b, hole, env, dt, prevX);
  }
  hazardStep(b, hole, env, prevX);
  if (b.t > PHYS.maxBallTime && b.mode !== 'stop') { b.mode = 'stop'; emit(b, 'stop', surfaceAt(hole, b.x), 0); }
}

/** 돌·나무와 부딪히는지 검사한다 */
function hazardStep(b, hole, env, prevX) {
  if (hole.flat || !hole.layout || env.ignoreHazards) return;
  if (b.mode === 'stop') {
    if (!b.holed) settleOffRock(b, hole);
    return;
  }
  if (b.t < HAZARD.graceTime) return;
  hitRocks(b, hole, prevX);
  hitTrees(b, hole, prevX);
}

function hitTrees(b, hole, prevX) {
  const trees = hole.layout.trees;
  for (let i = 0; i < trees.length; i++) {
    const t = trees[i];
    if (b.hitTrees.includes(i) || Math.abs(b.x - t.x) > t.r + 1) continue;
    const gy = heightAt(hole, t.x);
    const rel = b.y - gy;
    const base = t.h * HAZARD.canopyBase;
    if (rel < base) {
      const crossed = (prevX - t.x) * (b.x - t.x) <= 0 || Math.abs(b.x - t.x) < HAZARD.trunkHalf;
      if (!crossed) continue;
      b.hitTrees.push(i);
      if (ballRand(b) >= HAZARD.trunkChance) continue; // 옆으로 비껴 지나감
      const speed = Math.hypot(b.vx, b.vy);
      emit(b, 'trunk', surfaceAt(hole, b.x), speed, t.x);
      b.vx *= -lerp(HAZARD.trunkBack[0], HAZARD.trunkBack[1], ballRand(b));
      b.x = t.x + Math.sign(b.vx || -1) * (HAZARD.trunkHalf + 0.05);
      b.spin *= 0.2;
      if (b.carryX === null) b.carryX = b.x;
      continue;
    }
    if (b.mode !== 'air') continue;
    const ry = (t.h - base) / 2;
    const u = (b.x - t.x) / t.r, v = (rel - (base + ry)) / ry;
    if (u * u + v * v > 1) continue;
    b.hitTrees.push(i);
    if (ballRand(b) < HAZARD.canopyPass) {
      emit(b, 'tree', 'pass', Math.hypot(b.vx, b.vy), t.x);
      continue;
    }
    emit(b, 'tree', 'hit', Math.hypot(b.vx, b.vy), t.x);
    b.vx *= lerp(HAZARD.canopySlow[0], HAZARD.canopySlow[1], ballRand(b));
    b.vy = b.vy * 0.35 + (ballRand(b) - 0.6) * 4;
    b.spin *= 0.3;
  }
}

function hitRocks(b, hole, prevX) {
  if (b.t < b.rockUntil) return;
  for (const rock of hole.layout.rocks) {
    if (Math.min(prevX, b.x) > rock.x + rock.r || Math.max(prevX, b.x) < rock.x - rock.r) continue;
    const gy = heightAt(hole, rock.x);
    if (b.y - gy > rock.r * HAZARD.rockHeight) continue;
    const speed = Math.hypot(b.vx, b.vy);
    b.rockUntil = b.t + HAZARD.rockCooldown;
    if (b.carryX === null) b.carryX = b.x;
    emit(b, 'rock', surfaceAt(hole, b.x), speed);
    if (speed < HAZARD.rockMinSpeed) {
      b.vx *= -0.25;
      return;
    }
    const forward = ballRand(b) < HAZARD.rockForward;
    const keep = lerp.apply(null, (forward ? HAZARD.rockForwardKeep : HAZARD.rockBackKeep).concat(ballRand(b)));
    b.vx *= forward ? keep : -keep;
    b.vy = speed * lerp(HAZARD.rockLift[0], HAZARD.rockLift[1], ballRand(b));
    b.y = Math.max(b.y, gy + rock.r * 0.9);
    b.spin *= 0.3;
    b.mode = 'air';
    return;
  }
}

/** 돌 위에 멈추면 옆으로 내려 준다 */
function settleOffRock(b, hole) {
  for (const rock of hole.layout.rocks) {
    if (Math.abs(b.x - rock.x) >= rock.r) continue;
    b.x = rock.x + (b.x >= rock.x ? 1 : -1) * (rock.r + 0.12);
    b.y = heightAt(hole, b.x);
    return;
  }
}

function tryCupAir(b, hole, prevX, env, gy) {
  if (b.y - gy > 0.3 || b.vy > 0) return false;
  return tryCup(b, hole, prevX, env);
}

function landBall(b, hole, env, gy) {
  const type = surfaceAt(hole, b.x);
  const surf = TERRAIN[type];
  b.y = gy;
  if (type === 'water') {
    if (b.carryX === null) b.carryX = b.x;
    b.vx = b.vy = 0;
    b.mode = 'stop';
    emit(b, 'water', type, 0);
    return;
  }
  const s = slopeAt(hole, b.x) + (hole.flat ? 0 : (ballRand(b) * 2 - 1) * surf.kick);
  const len = Math.hypot(1, s);
  const nx = -s / len, ny = 1 / len, tx = 1 / len, ty = s / len;
  const vn = b.vx * nx + b.vy * ny;
  let vt = b.vx * tx + b.vy * ty;
  const first = b.carryX === null;
  if (first) b.carryX = b.x;
  const impact = Math.abs(vn);
  emit(b, 'bounce', type, impact);
  b.bounces++;
  const restMul = env.restMul || 1;
  const tangMul = first ? env.tangMul || 1 : 1;
  if (first) {
    vt -= Math.max(0, b.spin) * PHYS.backGrip * surf.grip * (env.backMul || 1);
    b.rollMu = (env.muMul || 1) * (b.spin < 0 ? 1 + b.spin * PHYS.topRun : 1);
  }
  vt *= surf.tang * tangMul;
  const out = impact * surf.rest * restMul;
  if (out < PHYS.bounceStop) {
    b.vx = vt * tx;
    b.vy = vt * ty;
    b.mode = 'roll';
  } else {
    b.vx = vt * tx + out * nx;
    b.vy = vt * ty + out * ny;
    b.y = gy + 0.01;
  }
  b.spin *= 0.55;
}

function rollBall(b, hole, env, dt, prevX) {
  const type = surfaceAt(hole, b.x);
  if (type === 'water') {
    b.vx = b.vy = 0;
    b.mode = 'stop';
    emit(b, 'water', type, 0);
    return;
  }
  const surf = TERRAIN[type];
  const s = slopeAt(hole, b.x);
  const slopeAcc = -PHYS.g * s / Math.hypot(1, s);
  const mu = surf.mu * b.rollMu;
  const fric = mu * PHYS.g;
  let v = b.vx;
  const moving = Math.abs(v) > PHYS.stopSpeed;
  if (!moving && Math.abs(s) <= surf.hold) {
    b.vx = b.vy = 0;
    b.mode = 'stop';
    if (b.carryX === null) b.carryX = b.x;
    emit(b, 'stop', type, 0);
    return;
  }
  v += slopeAcc * dt;
  const dir = v === 0 ? -Math.sign(slopeAcc) : Math.sign(v);
  const nv = v - dir * fric * dt;
  v = Math.sign(nv) !== Math.sign(v) && Math.abs(slopeAcc) <= fric ? 0 : nv;
  b.vx = v;
  b.vy = v * s;
  b.x += v * dt;
  b.y = heightAt(hole, b.x);
  b.rot += v * dt * 6;
  if (type === 'green' || Math.abs(b.x - hole.cup) < 1) tryCup(b, hole, prevX, env);
}

/**
 * 샷 전체를 계산한다(그리지 않음). 마커와 밸런스 검사에 쓴다.
 * o: launchFrom 인자 + { hole, x, wind, windMul }
 */
function simulateShot(o) {
  const hole = o.hole || FLAT_HOLE;
  const x = o.x || 0;
  const lp = launchFrom(Object.assign({ power: 1, club: '1W', stats: BASE_STATS, impact: 0 }, o));
  const b = makeBall(x, heightAt(hole, x));
  b.seed = o.seed || 12345;
  launchBall(b, lp);
  const env = shotEnv(o);
  let guard = 0;
  while (b.mode !== 'stop' && guard++ < 6000) stepBall(b, hole, env, PHYS.dt);
  return {
    carry: (b.carryX === null ? b.x : b.carryX) - x,
    total: b.x - x,
    apex: b.apex - heightAt(hole, x),
    time: b.t,
    holed: b.holed,
    endX: b.x,
    surface: surfaceAt(hole, b.x),
    perfect: lp.perfect,
  };
}

/** 샷 옵션 → 공 진행 환경 */
function shotEnv(o) {
  const sp = SPECIAL_SHOTS[o.special] || null;
  return { wind: o.wind || 0, windMul: o.windMul == null ? 1 : o.windMul, backMul: o.backMul || 1, ignoreHazards: !!o.ignoreHazards, restMul: sp ? sp.restMul : 1, tangMul: sp ? sp.tangMul : 1, muMul: sp ? sp.muMul : 1 };
}

if (typeof module !== 'undefined') {
  Object.assign(globalThis, { HAZARD, rollHoleLayout, PHYS, TERRAIN, TERRAIN_LIE, TERRAIN_IDS, HOLE_MIN_X, HOLE_STEP, lerp, clamp, smooth, prepareHole, FLAT_HOLE, heightAt, slopeAt, slopeBetween, surfaceAt, sumStats, statFactors, BASE_STATS, launchFrom, makeBall, launchBall, stepBall, simulateShot, shotEnv });
}
