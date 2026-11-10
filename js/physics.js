/* 3D 물리. x: 홀 진행 방향, y: 위, z: 오른쪽. DOM·그림과 무관하며 Node에서도 돌아간다. */

var PHYS = {
  dt: 1 / 120,
  g: 9.81,
  drag: 0.0041,        // 공기 저항 계수
  lift: 0.0036,        // 백스핀 양력 계수
  sideLift: 0.0026,    // 사이드스핀(훅·슬라이스) 힘
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
  cupRadius: 0.17,     // 판정용 컵 반지름(m)
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
  errSide: 2.4,           // 오차 → 사이드스핀(늦으면 슬라이스, 빠르면 훅)
  errYaw: 12,             // 오차 → 좌우 방향 오차(도)
  puttErr: 0.55,          // 오차 → 퍼팅 속도 오차
  puttYaw: 9,             // 오차 → 퍼팅 방향 오차(도)
  distToSpeed: 0.76,      // 비거리 배율 → 속도 배율 지수
};

// 홀을 시작할 때마다 새로 정해지는 코스 변수
var HAZARD = {
  bump: { fairway: 0.07, rough: 0.2 }, // 잔요철 높이(m)
  patchCount: [2, 4],     // 페어웨이의 단단한 땅·질퍽한 땅 수
  patchR: [6, 11],        // 그 반지름(m)
  rockCount: { 3: [3, 5], 4: [5, 8], 5: [8, 12] }, // 파별 돌 개수
  rockR: [0.35, 0.9],     // 돌 반지름(m)
  rockHeight: 1.35,       // 반지름의 이 배 높이까지 공이 부딪힘
  rockForward: 0.55,      // 앞으로 튈 확률(나머지는 뒤로)
  rockForwardKeep: [0.45, 0.85], // 앞으로 튈 때 속도 유지율
  rockBackKeep: [0.15, 0.45],    // 뒤로 튈 때 속도 유지율
  rockLift: [0.2, 0.55],  // 속도 대비 위로 튀는 비율
  rockScatter: 0.7,       // 튀는 방향 좌우 흔들림(라디안)
  rockCooldown: 0.22,     // 연속 충돌 방지(초)
  rockMinSpeed: 2.5,      // 이보다 느리면 그냥 멈칫한다
  treeInPlay: { 3: [1, 2], 4: [2, 4], 5: [3, 6] }, // 페어웨이 가장자리 나무 수
  treeSideStep: [8, 15],  // 페어웨이 양옆 나무 간격(m)
  treeSideDepth: [5, 42], // 페어웨이 끝에서 나무까지(m)
  treeH: [8, 15],         // 나무 높이(m)
  canopyPass: 0.22,       // 잎 사이로 그냥 빠져나갈 확률
  canopySlow: [0.22, 0.55], // 잎에 걸렸을 때 수평 속도 유지율
  canopyScatter: 5,       // 잎에 걸렸을 때 좌우로 흩어지는 속도(m/s)
  trunkR: 0.38,           // 줄기 반지름(m)
  trunkBack: [0.2, 0.5],  // 줄기에 맞고 되튀는 속도 비율
  clearOfGreen: 16,       // 그린 가장자리에서 장애물을 비울 거리(m)
  placeGap: 7,            // 코스 안 장애물끼리의 최소 간격(m)
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

// 코스 모양 기본값(m)
var COURSE = { minX: -70, halfZ: 170, step: 1, fairwayHalf: 19, sideRise: 7, sideStart: 8, sideLen: 55 };

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

/** 홀 중심선의 좌우 위치 */
function centerZ(hole, x) {
  const c = hole.curve;
  if (!c || !c.length) return 0;
  if (x <= c[0][0]) return c[0][1];
  for (let i = 0; i < c.length - 1; i++) {
    if (x <= c[i + 1][0]) return lerp(c[i][1], c[i + 1][1], smooth((x - c[i][0]) / (c[i + 1][0] - c[i][0])));
  }
  return c[c.length - 1][1];
}

function fairwayHalf(hole, x) {
  return (hole.fw || COURSE.fairwayHalf) * (0.86 + 0.14 * Math.sin(x * 0.043 + hole.cup * 0.1));
}

/** 그린·벙커·연못처럼 타원으로 된 지형의 치수 */
function holeShapes(hole) {
  if (hole.shapes) return hole.shapes;
  const g = hole.green;
  const gx = (g.from + g.to) / 2;
  const gz = centerZ(hole, gx);
  const rx = (g.to - g.from) / 2;
  const ellipse = (e) => {
    const cx = (e[0] + e[1]) / 2;
    return { cx, cz: centerZ(hole, cx) + (e[2] || 0), rx: (e[1] - e[0]) / 2, rz: e[3] || Math.max(6, ((e[1] - e[0]) / 2) * 0.75) };
  };
  hole.shapes = {
    green: { cx: gx, cz: gz, rx, rz: g.rz || rx * 0.8 },
    cupZ: gz + (hole.cupOff || 0),
    bunkers: hole.bunkers.map(ellipse),
    ponds: hole.ponds.map((p) => {
      const e = ellipse(p);
      e.rz = p[3] || 75;
      return e;
    }),
  };
  return hole.shapes;
}

function ellipseR(e, x, z) {
  const a = (x - e.cx) / e.rx, b = (z - e.cz) / e.rz;
  return Math.sqrt(a * a + b * b);
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

function inFairway(hole, x, z) {
  if (x < hole.fair[0] || x > hole.fair[1]) return false;
  const u = (x - (hole.fair[0] + hole.fair[1]) / 2) / ((hole.fair[1] - hole.fair[0]) / 2);
  const end = Math.sqrt(Math.max(0, 1 - Math.pow(Math.abs(u), 10)));
  return Math.abs(z - centerZ(hole, x)) <= fairwayHalf(hole, x) * end;
}

/** 홀의 높이·지형 표를 만든다(1m 간격). rollHoleLayout이 부르면 다시 계산한다 */
function prepareHole(hole) {
  if (hole.table) return hole.table;
  const last = hole.pts[hole.pts.length - 1][0];
  const nx = Math.ceil((last - COURSE.minX) / COURSE.step) + 1;
  const nz = Math.ceil((COURSE.halfZ * 2) / COURSE.step) + 1;
  const h = new Float32Array(nx * nz), type = new Uint8Array(nx * nz);
  const ID = {};
  TERRAIN_IDS.forEach((k, i) => { ID[k] = i; });
  const S = holeShapes(hole);
  const g = hole.green;
  const layout = hole.layout;
  const profile = new Float32Array(nx), center = new Float32Array(nx), half = new Float32Array(nx);
  for (let i = 0; i < nx; i++) {
    const x = COURSE.minX + i * COURSE.step;
    profile[i] = basePointHeight(hole.pts, x);
    center[i] = centerZ(hole, x);
    half[i] = fairwayHalf(hole, x);
  }
  const cupZ = S.cupZ;
  const gs = g.slope / 100, gsz = (g.slopeZ || 0) / 100;
  for (let i = 0; i < nx; i++) {
    const x = COURSE.minX + i * COURSE.step;
    for (let j = 0; j < nz; j++) {
      const z = -COURSE.halfZ + j * COURSE.step;
      const d = Math.abs(z - center[i]);
      let y = profile[i] + smooth((d - half[i] - COURSE.sideStart) / COURSE.sideLen) * (hole.sideRise == null ? COURSE.sideRise : hole.sideRise);
      let t = ID.rough;
      const teeIn = x >= hole.tee[0] && x <= hole.tee[1] && Math.abs(z) <= 6;
      if (teeIn) t = ID.tee;
      if (inFairway(hole, x, z)) {
        t = ID.fairway;
        if (layout) for (const p of layout.patches) if (Math.hypot(x - p.x, z - p.z) <= p.r) t = ID[p.type];
      }
      const rg = ellipseR(S.green, x, z);
      if (layout) {
        const dryGreen = 1 - smooth((rg - 1) / 0.3);
        const amp = lerp(HAZARD.bump.fairway, HAZARD.bump.rough, smooth((d - half[i]) / 6)) * (1 - dryGreen) * smooth((Math.abs(x) - 10) / 8);
        let wave = 0;
        for (const b of layout.bumps) wave += b.a * Math.sin(x * b.k + b.p) * Math.cos(z * b.k * 0.85 + b.q);
        y += amp * wave;
      }
      if (rg < 1.45) {
        const blend = 1 - smooth((rg - 1) / 0.45);
        const dx = x - hole.cup, dz = z - cupZ;
        const wave = 0.02 * Math.sin(dx * 0.31 + dz * 0.2) * smooth(Math.hypot(dx, dz) / 4);
        y = lerp(y, g.base + gs * dx + gsz * dz + wave, blend);
      }
      if (rg <= 1) t = ID.green;
      for (const b of S.bunkers) {
        const r = ellipseR(b, x, z);
        if (r < 1) {
          y -= 1.15 * Math.pow(Math.cos((r * Math.PI) / 2), 0.7);
          t = ID.bunker;
        }
      }
      const k = i * nz + j;
      h[k] = y;
      type[k] = t;
    }
  }
  const level = [];
  for (const p of S.ponds) {
    const y0 = basePointHeight(hole.pts, p.cx - p.rx), y1 = basePointHeight(hole.pts, p.cx + p.rx);
    const water = Math.min(y0, y1) - 0.5;
    level.push({ cx: p.cx, cz: p.cz, rx: p.rx, rz: p.rz, y: water });
    for (let i = 0; i < nx; i++) {
      const x = COURSE.minX + i * COURSE.step;
      if (Math.abs(x - p.cx) > p.rx + 1) continue;
      for (let j = 0; j < nz; j++) {
        const z = -COURSE.halfZ + j * COURSE.step;
        const r = ellipseR(p, x, z);
        if (r >= 1) continue;
        const k = i * nz + j;
        h[k] = Math.min(h[k], water - 2.4 * Math.pow(Math.cos((r * Math.PI) / 2), 0.5));
        type[k] = ID.water;
      }
    }
  }
  hole.table = { h, type, nx, nz, level };
  return hole.table;
}

var FLAT_HOLE = { flat: true, cup: 1e9 };

function heightAt(hole, x, z) {
  if (hole.flat) return 0;
  if (z === undefined) z = centerZ(hole, x);
  const t = prepareHole(hole);
  const fx = clamp((x - COURSE.minX) / COURSE.step, 0, t.nx - 1.001);
  const fz = clamp((z + COURSE.halfZ) / COURSE.step, 0, t.nz - 1.001);
  const i = fx | 0, j = fz | 0, u = fx - i, v = fz - j;
  const k = i * t.nz + j;
  const a = t.h[k], b = t.h[k + 1], c = t.h[k + t.nz], d = t.h[k + t.nz + 1];
  return a + (b - a) * v + (c - a) * u + (a - b - c + d) * u * v;
}

/** 지면 기울기 [x방향, z방향] */
function gradAt(hole, x, z) {
  if (hole.flat) return [0, 0];
  if (z === undefined) z = centerZ(hole, x);
  return [(heightAt(hole, x + 0.5, z) - heightAt(hole, x - 0.5, z)), (heightAt(hole, x, z + 0.5) - heightAt(hole, x, z - 0.5))];
}

function surfaceAt(hole, x, z) {
  if (hole.flat) return 'fairway';
  if (z === undefined) z = centerZ(hole, x);
  const t = prepareHole(hole);
  const i = clamp(Math.round((x - COURSE.minX) / COURSE.step), 0, t.nx - 1);
  const j = clamp(Math.round((z + COURSE.halfZ) / COURSE.step), 0, t.nz - 1);
  return TERRAIN_IDS[t.type[i * t.nz + j]];
}

/** 이번 플레이의 코스 변수를 정한다. 같은 시드면 항상 같은 코스가 된다 */
function rollHoleLayout(hole, seed) {
  const rng = makeRng(seed);
  const bumps = [[0.2, 0.5], [0.55, 0.3], [1.3, 0.2]].map(([k, a]) => ({ k: k * (0.8 + rng() * 0.4), a, p: rng() * 6.28, q: rng() * 6.28 }));
  const patches = [];
  const count = Math.round(rangeOf(rng, HAZARD.patchCount));
  for (let i = 0; i < count; i++) {
    const x = rangeOf(rng, hole.fair);
    patches.push({ x, z: centerZ(hole, x) + (rng() * 2 - 1) * fairwayHalf(hole, x) * 0.7, r: rangeOf(rng, HAZARD.patchR), type: rng() < 0.5 ? 'hard' : 'soft' });
  }
  hole.table = null;
  hole.layout = { seed, bumps, patches, rocks: [], trees: [] };
  prepareHole(hole);
  placeTrees(hole, rng);
  placeRocks(hole, rng);
  return hole.layout;
}

function clearSpot(hole, x, z, pad) {
  const S = holeShapes(hole);
  if (x < 20) return false;
  if (ellipseR(S.green, x, z) < 1 + HAZARD.clearOfGreen / Math.max(S.green.rx, S.green.rz)) return false;
  for (const e of S.bunkers.concat(S.ponds)) {
    if (ellipseR(e, x, z) < 1 + pad / Math.max(e.rx, Math.min(e.rz, 30))) return false;
  }
  return surfaceAt(hole, x, z) !== 'water';
}

function pickTree(hole, rng, x, z) {
  const kinds = THEMES[hole.theme].trees;
  const kind = kinds[(rng() * kinds.length) | 0];
  const info = TREE_KINDS[kind];
  const h = rangeOf(rng, HAZARD.treeH) * info.scale;
  return { x, z, h, r: h * info.halfWidth, base: h * info.base, kind, variant: (rng() * info.cols) | 0, turn: rng() * 6.28, tint: rng() };
}

function placeTrees(hole, rng) {
  const L = hole.layout;
  L.spots = [];
  const last = hole.pts[hole.pts.length - 1][0];
  // 코스 양옆 숲
  for (const side of [-1, 1]) {
    for (let x = -30; x < last; x += rangeOf(rng, HAZARD.treeSideStep)) {
      const z = centerZ(hole, x) + side * (fairwayHalf(hole, x) + rangeOf(rng, HAZARD.treeSideDepth));
      if (Math.abs(z) > COURSE.halfZ - 4) continue;
      if (x > -10 && x < 14 && Math.abs(z) < 16) continue;
      if (x < 20) { L.trees.push(pickTree(hole, rng, x, z)); continue; }
      if (clearSpot(hole, x, z, 5)) L.trees.push(pickTree(hole, rng, x, z));
    }
  }
  // 공략을 바꾸는 코스 안 나무
  const want = Math.round(rangeOf(rng, HAZARD.treeInPlay[hole.par]));
  let placed = 0;
  for (let tries = 0; tries < want * 60 && placed < want; tries++) {
    const x = rangeOf(rng, [Math.max(40, hole.fair[0]), hole.green.from - HAZARD.clearOfGreen]);
    const half = fairwayHalf(hole, x);
    const z = centerZ(hole, x) + (rng() < 0.5 ? -1 : 1) * half * (0.55 + rng() * 0.65);
    if (L.spots.some((s) => Math.hypot(s.x - x, s.z - z) < HAZARD.placeGap * 3)) continue;
    if (!clearSpot(hole, x, z, 5)) continue;
    L.spots.push({ x, z });
    L.trees.push(pickTree(hole, rng, x, z));
    placed++;
  }
}

function placeRocks(hole, rng) {
  const L = hole.layout;
  const count = Math.round(rangeOf(rng, HAZARD.rockCount[hole.par]));
  let placed = 0;
  for (let tries = 0; tries < count * 50 && placed < count; tries++) {
    const x = rangeOf(rng, [24, hole.end - 6]);
    const z = centerZ(hole, x) + (rng() * 2 - 1) * (fairwayHalf(hole, x) + 12);
    if (L.spots.some((s) => Math.hypot(s.x - x, s.z - z) < HAZARD.placeGap)) continue;
    if (!clearSpot(hole, x, z, 4)) continue;
    L.spots.push({ x, z });
    L.rocks.push({ x, z, r: rangeOf(rng, HAZARD.rockR), turn: rng() * 6.28 });
    placed++;
  }
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
 * o: { club, power(0~1), angle(도), yaw(좌우 도, +는 오른쪽), spin(-1 톱~1 백), stats, impact(게이지 오차, +는 늦음) }
 */
function launchFrom(o) {
  const c = CLUB_TYPES[o.club];
  const f = statFactors(o.stats || BASE_STATS);
  const err = o.impact || 0;
  const abs = Math.abs(err);
  const perfect = abs <= f.perfectHalf;
  const miss = perfect ? 0 : (abs - f.perfectHalf) / f.controlDiv;
  const sign = Math.sign(err);
  if (o.club === 'PT') {
    const v = c.v0 * Math.sqrt(clamp(o.power, 0, 1));
    const puttMul = o.puttErrMul || 1;
    return { v: v * (1 + sign * miss * PHYS.puttErr * puttMul), ang: 0, yaw: (o.yaw || 0) + sign * miss * PHYS.puttYaw * puttMul, spin: 0, side: 0, perfect, miss, putt: true };
  }
  const sp = SPECIAL_SHOTS[o.special] || null;
  let v = c.v0 * Math.pow(clamp(o.power, 0.02, 1), PHYS.powerExp) * f.powerMul * (sp ? sp.speedMul : 1);
  if (perfect) v *= PHYS.perfectBoost;
  if (o.club === '1W' && o.driverDist) v *= Math.pow(o.driverDist, PHYS.distToSpeed);
  v *= (o.lie || 1) * (1 - clamp(miss * PHYS.errSpeed, 0, 0.6));
  const ang = c.loft + (o.angle || 0) + (sp ? sp.loftAdd : 0) + sign * miss * PHYS.errAngle;
  const spin = (c.spin + (sp ? sp.spinAdd : 0) + (o.spin || 0) * c.spinCtl * f.spinMul) * (1 - clamp(miss * PHYS.errSpin, 0, 0.8));
  return { v, ang, yaw: (o.yaw || 0) + sign * miss * PHYS.errYaw, spin, side: sign * miss * PHYS.errSide, perfect, miss, putt: false };
}

function makeBall(x, y, z) {
  return { x, y, z: z || 0, vx: 0, vy: 0, vz: 0, spin: 0, side: 0, t: 0, mode: 'stop', rot: 0, startX: x, startZ: z || 0, carry: null, apex: y, bounces: 0, rollMu: 1, lipUntil: 0, rockUntil: 0, seed: 1, hitTrees: [], events: [], holed: false };
}

function launchBall(b, lp) {
  const rad = lp.ang * Math.PI / 180, yaw = (lp.yaw || 0) * Math.PI / 180;
  const h = lp.v * Math.cos(rad);
  b.vx = h * Math.cos(yaw);
  b.vz = h * Math.sin(yaw);
  b.vy = lp.v * Math.sin(rad);
  b.spin = lp.spin;
  b.side = lp.side || 0;
  b.t = 0;
  b.startX = b.x;
  b.startZ = b.z;
  b.apex = b.y;
  b.carry = null;
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

function emit(b, kind, surface, speed, tree) { b.events.push({ kind, surface, speed, x: b.x, y: b.y, z: b.z, tree }); }

function markCarry(b) {
  if (b.carry === null) b.carry = Math.hypot(b.x - b.startX, b.z - b.startZ);
}

function cupCrossed(b, hole, px, pz) {
  const cx = hole.cup, cz = holeShapes(hole).cupZ;
  const ax = b.x - px, az = b.z - pz;
  const len2 = ax * ax + az * az;
  const u = len2 > 0 ? clamp(((cx - px) * ax + (cz - pz) * az) / len2, 0, 1) : 0;
  return Math.hypot(px + ax * u - cx, pz + az * u - cz) <= PHYS.cupRadius;
}

function tryCup(b, hole, px, pz, env) {
  if (hole.flat || b.t < b.lipUntil || !cupCrossed(b, hole, px, pz)) return false;
  const speed = Math.hypot(b.vx, b.vy, b.vz);
  const limit = (b.mode === 'roll' ? PHYS.captureSpeed : PHYS.dunkSpeed) * (env.captureMul || 1);
  const cz = holeShapes(hole).cupZ;
  if (speed <= limit) {
    b.holed = true;
    b.x = hole.cup;
    b.z = cz;
    b.y = heightAt(hole, hole.cup, cz) - 0.15;
    b.vx = b.vy = b.vz = 0;
    b.mode = 'stop';
    emit(b, 'cup', 'green', speed);
    return true;
  }
  if (b.mode === 'roll') {
    b.vx *= 0.82;
    b.vz *= 0.82;
    b.vy = 0.9;
    b.lipUntil = b.t + 0.45;
    b.y = heightAt(hole, b.x, b.z) + 0.02;
    b.mode = 'air';
    emit(b, 'lip', 'green', speed);
  }
  return false;
}

/** 공을 dt초 진행한다. env: { wind, windZ, windMul, ... } */
function stepBall(b, hole, env, dt) {
  if (b.mode === 'stop') return;
  const px = b.x, pz = b.z;
  b.t += dt;
  if (b.mode === 'air') {
    const gain = clamp(b.y - heightAt(hole, b.x, b.z), 0, PHYS.windFullHeight) / PHYS.windFullHeight;
    const k = (env.windMul == null ? 1 : env.windMul) * PHYS.windGain * (0.3 + 0.7 * gain);
    const rx = b.vx - (env.wind || 0) * k, ry = b.vy, rz = b.vz - (env.windZ || 0) * k;
    const sp = Math.hypot(rx, ry, rz);
    const h = Math.hypot(rx, rz) || 1e-6;
    const lift = PHYS.lift * b.spin * sp;
    const side = PHYS.sideLift * b.side * sp * h;
    b.vx += (-PHYS.drag * sp * rx - (lift * ry * rx) / h - (side * rz) / h) * dt;
    b.vz += (-PHYS.drag * sp * rz - (lift * ry * rz) / h + (side * rx) / h) * dt;
    b.vy += (-PHYS.g - PHYS.drag * sp * ry + lift * h) * dt;
    b.spin *= 1 - PHYS.spinDecay * dt;
    b.side *= 1 - PHYS.spinDecay * dt;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.z += b.vz * dt;
    b.rot += h * dt * 2;
    if (b.y > b.apex) b.apex = b.y;
    const gy = heightAt(hole, b.x, b.z);
    if (b.y - gy <= 0.3 && b.vy <= 0 && tryCup(b, hole, px, pz, env)) return;
    if (b.y <= gy) landBall(b, hole, env, gy);
  } else {
    rollBall(b, hole, env, dt, px, pz);
  }
  hazardStep(b, hole, env, px, pz);
  if (b.t > PHYS.maxBallTime && b.mode !== 'stop') { b.mode = 'stop'; emit(b, 'stop', surfaceAt(hole, b.x, b.z), 0); }
}

/** 돌·나무와 부딪히는지 검사한다 */
function hazardStep(b, hole, env, px, pz) {
  if (hole.flat || !hole.layout || env.ignoreHazards) return;
  if (b.mode === 'stop') {
    if (!b.holed) settleOffRock(b, hole);
    return;
  }
  if (b.t < HAZARD.graceTime) return;
  hitRocks(b, hole, px, pz);
  hitTrees(b, hole);
}

function hitRocks(b, hole) {
  if (b.t < b.rockUntil) return;
  for (const rock of hole.layout.rocks) {
    if (Math.abs(b.x - rock.x) > rock.r || Math.hypot(b.x - rock.x, b.z - rock.z) > rock.r) continue;
    const gy = heightAt(hole, rock.x, rock.z);
    if (b.y - gy > rock.r * HAZARD.rockHeight) continue;
    const speed = Math.hypot(b.vx, b.vy, b.vz);
    b.rockUntil = b.t + HAZARD.rockCooldown;
    markCarry(b);
    emit(b, 'rock', surfaceAt(hole, b.x, b.z), speed);
    if (speed < HAZARD.rockMinSpeed) {
      b.vx *= -0.25;
      b.vz *= -0.25;
      return;
    }
    const forward = ballRand(b) < HAZARD.rockForward;
    const pair = forward ? HAZARD.rockForwardKeep : HAZARD.rockBackKeep;
    const keep = lerp(pair[0], pair[1], ballRand(b)) * (forward ? 1 : -1);
    const turn = (ballRand(b) - 0.5) * 2 * HAZARD.rockScatter;
    const c = Math.cos(turn), s = Math.sin(turn);
    const vx = b.vx * keep, vz = b.vz * keep;
    b.vx = vx * c - vz * s;
    b.vz = vx * s + vz * c;
    b.vy = speed * lerp(HAZARD.rockLift[0], HAZARD.rockLift[1], ballRand(b));
    b.y = Math.max(b.y, gy + rock.r * 0.9);
    b.spin *= 0.3;
    b.mode = 'air';
    return;
  }
}

function hitTrees(b, hole) {
  const trees = hole.layout.trees;
  for (let i = 0; i < trees.length; i++) {
    const t = trees[i];
    const dx = b.x - t.x;
    if (dx > t.r + 1 || dx < -t.r - 1) continue;
    const dz = b.z - t.z;
    if (dz > t.r + 1 || dz < -t.r - 1 || b.hitTrees.includes(i)) continue;
    const gy = heightAt(hole, t.x, t.z);
    const rel = b.y - gy;
    if (rel < t.base) {
      const d = Math.hypot(dx, dz);
      if (d > HAZARD.trunkR) continue;
      b.hitTrees.push(i);
      const nx = dx / (d || 1), nz = dz / (d || 1);
      const dot = b.vx * nx + b.vz * nz;
      const keep = lerp(HAZARD.trunkBack[0], HAZARD.trunkBack[1], ballRand(b));
      emit(b, 'trunk', surfaceAt(hole, b.x, b.z), Math.hypot(b.vx, b.vz), i);
      b.vx = (b.vx - 2 * dot * nx) * keep;
      b.vz = (b.vz - 2 * dot * nz) * keep;
      b.x = t.x + nx * (HAZARD.trunkR + 0.05);
      b.z = t.z + nz * (HAZARD.trunkR + 0.05);
      b.spin *= 0.2;
      markCarry(b);
      continue;
    }
    if (b.mode !== 'air') continue;
    const ry = (t.h - t.base) / 2;
    const u = Math.hypot(dx, dz) / t.r, v = (rel - (t.base + ry)) / ry;
    if (u * u + v * v > 1) continue;
    b.hitTrees.push(i);
    if (ballRand(b) < HAZARD.canopyPass) {
      emit(b, 'tree', 'pass', Math.hypot(b.vx, b.vy, b.vz), i);
      continue;
    }
    emit(b, 'tree', 'hit', Math.hypot(b.vx, b.vy, b.vz), i);
    const slow = lerp(HAZARD.canopySlow[0], HAZARD.canopySlow[1], ballRand(b));
    b.vx = b.vx * slow + (ballRand(b) - 0.5) * HAZARD.canopyScatter;
    b.vz = b.vz * slow + (ballRand(b) - 0.5) * HAZARD.canopyScatter;
    b.vy = b.vy * 0.35 + (ballRand(b) - 0.6) * 4;
    b.spin *= 0.3;
    b.side *= 0.3;
  }
}

/** 돌 위에 멈추면 옆으로 내려 준다 */
function settleOffRock(b, hole) {
  for (const rock of hole.layout.rocks) {
    const d = Math.hypot(b.x - rock.x, b.z - rock.z);
    if (d >= rock.r) continue;
    const nx = d > 0.01 ? (b.x - rock.x) / d : 1, nz = d > 0.01 ? (b.z - rock.z) / d : 0;
    b.x = rock.x + nx * (rock.r + 0.12);
    b.z = rock.z + nz * (rock.r + 0.12);
    b.y = heightAt(hole, b.x, b.z);
    return;
  }
}

function landBall(b, hole, env, gy) {
  const type = surfaceAt(hole, b.x, b.z);
  const surf = TERRAIN[type];
  b.y = gy;
  if (type === 'water') {
    markCarry(b);
    b.vx = b.vy = b.vz = 0;
    b.mode = 'stop';
    emit(b, 'water', type, 0);
    return;
  }
  const g = gradAt(hole, b.x, b.z);
  const kick = hole.flat ? 0 : surf.kick;
  const sx = g[0] + (ballRand(b) * 2 - 1) * kick, sz = g[1] + (ballRand(b) * 2 - 1) * kick;
  const len = Math.hypot(1, sx, sz);
  const nx = -sx / len, ny = 1 / len, nz = -sz / len;
  const vn = b.vx * nx + b.vy * ny + b.vz * nz;
  let tx = b.vx - vn * nx, ty = b.vy - vn * ny, tz = b.vz - vn * nz;
  const first = b.carry === null;
  if (first) markCarry(b);
  const impact = Math.abs(vn);
  emit(b, 'bounce', type, impact);
  b.bounces++;
  const restMul = env.restMul || 1;
  const tangMul = first ? env.tangMul || 1 : 1;
  if (first) {
    const ts = Math.hypot(tx, ty, tz) || 1e-6;
    const k = (ts - Math.max(0, b.spin) * PHYS.backGrip * surf.grip * (env.backMul || 1)) / ts;
    tx *= k; ty *= k; tz *= k;
    b.rollMu = (env.muMul || 1) * (b.spin < 0 ? 1 + b.spin * PHYS.topRun : 1);
  }
  const keep = surf.tang * tangMul;
  tx *= keep; ty *= keep; tz *= keep;
  const out = impact * surf.rest * restMul;
  if (out < PHYS.bounceStop) {
    b.vx = tx; b.vy = ty; b.vz = tz;
    b.mode = 'roll';
  } else {
    b.vx = tx + out * nx;
    b.vy = ty + out * ny;
    b.vz = tz + out * nz;
    b.y = gy + 0.01;
  }
  b.spin *= 0.55;
  b.side *= 0.5;
}

function rollBall(b, hole, env, dt, px, pz) {
  const type = surfaceAt(hole, b.x, b.z);
  if (type === 'water') {
    b.vx = b.vy = b.vz = 0;
    b.mode = 'stop';
    markCarry(b);
    emit(b, 'water', type, 0);
    return;
  }
  const surf = TERRAIN[type];
  const g = gradAt(hole, b.x, b.z);
  const slope = Math.hypot(g[0], g[1]);
  const len = Math.hypot(1, g[0], g[1]);
  const fric = surf.mu * b.rollMu * PHYS.g;
  const speed = Math.hypot(b.vx, b.vz);
  if (speed <= PHYS.stopSpeed && slope <= surf.hold) {
    b.vx = b.vy = b.vz = 0;
    b.mode = 'stop';
    markCarry(b);
    emit(b, 'stop', type, 0);
    return;
  }
  const slopeAcc = (PHYS.g * slope) / len;
  let vx = b.vx - ((PHYS.g * g[0]) / len) * dt;
  let vz = b.vz - ((PHYS.g * g[1]) / len) * dt;
  const after = Math.hypot(vx, vz);
  if (after > 0) {
    const drop = fric * dt;
    if (drop >= after) {
      if (slopeAcc <= fric) { vx = 0; vz = 0; } else { vx *= 0.5; vz *= 0.5; }
    } else {
      const k = (after - drop) / after;
      vx *= k;
      vz *= k;
    }
  }
  b.vx = vx;
  b.vz = vz;
  b.vy = vx * g[0] + vz * g[1];
  b.x += vx * dt;
  b.z += vz * dt;
  b.y = heightAt(hole, b.x, b.z);
  b.rot += Math.hypot(vx, vz) * dt * 6;
  if (!hole.flat && (type === 'green' || Math.hypot(b.x - hole.cup, b.z - holeShapes(hole).cupZ) < 1)) tryCup(b, hole, px, pz, env);
}

/**
 * 샷 전체를 계산한다(그리지 않음). 마커와 밸런스 검사에 쓴다.
 * o: launchFrom 인자 + { hole, x, z, wind, windZ, windMul }
 */
function simulateShot(o) {
  const hole = o.hole || FLAT_HOLE;
  const x = o.x || 0;
  const z = o.z == null ? (hole.flat ? 0 : centerZ(hole, x)) : o.z;
  const lp = launchFrom(Object.assign({ power: 1, club: '1W', stats: BASE_STATS, impact: 0 }, o));
  const b = makeBall(x, heightAt(hole, x, z), z);
  b.seed = o.seed || 12345;
  launchBall(b, lp);
  const env = shotEnv(o);
  let guard = 0;
  while (b.mode !== 'stop' && guard++ < 6000) stepBall(b, hole, env, PHYS.dt);
  return {
    carry: b.carry === null ? Math.hypot(b.x - x, b.z - z) : b.carry,
    total: Math.hypot(b.x - x, b.z - z),
    lateral: b.z - z,
    apex: b.apex - heightAt(hole, x, z),
    time: b.t,
    holed: b.holed,
    endX: b.x,
    endZ: b.z,
    surface: surfaceAt(hole, b.x, b.z),
    perfect: lp.perfect,
  };
}

/** 샷 옵션 → 공 진행 환경 */
function shotEnv(o) {
  const sp = SPECIAL_SHOTS[o.special] || null;
  return { wind: o.wind || 0, windZ: o.windZ || 0, windMul: o.windMul == null ? 1 : o.windMul, backMul: o.backMul || 1, ignoreHazards: !!o.ignoreHazards, restMul: sp ? sp.restMul : 1, tangMul: sp ? sp.tangMul : 1, muMul: sp ? sp.muMul : 1 };
}

if (typeof module !== 'undefined') {
  Object.assign(globalThis, { HAZARD, COURSE, rollHoleLayout, PHYS, TERRAIN, TERRAIN_LIE, TERRAIN_IDS, lerp, clamp, smooth, prepareHole, holeShapes, centerZ, fairwayHalf, FLAT_HOLE, heightAt, gradAt, surfaceAt, sumStats, statFactors, BASE_STATS, launchFrom, makeBall, launchBall, stepBall, simulateShot, shotEnv, ballRand });
}
