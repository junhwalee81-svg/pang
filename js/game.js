/* 게임 진행과 상태. 화면은 render.js, 버튼은 ui.js가 맡는다. */

var GAME = {
  gaugeSpeed: 0.5,      // 파워 게이지 속도(초당 비율). 오르는 동안 커맨드를 넣는다
  gaugeTopHold: 0.35,   // 게이지가 꼭대기에서 머무는 시간(초)
  puttGaugeSpeed: 0.42, // 퍼팅 게이지 속도
  impactSpeed: 0.8,     // 임팩트 복귀 속도
  impactFloor: -0.15,   // 임팩트 마커가 사라지는 지점
  backswing: 135,       // 백스윙 각도(도)
  puttBackswing: 22,
  follow: 150,          // 팔로스루 각도(도)
  puttFollow: 24,
  swingDown: 0.2,       // 다운스윙 시간(초)
  swingFollow: 0.55,
  autoNext: 1.15,       // 공이 멈춘 뒤 다음 샷 준비까지(초)
  holeOutDelay: 2.4,
  introTime: 3,
  maxStrokesOverPar: 5,
  obMargin: 26,         // 코스 끝에서 OB까지(m)
  obSide: 140,          // 좌우 OB(m)
  yawRange: 75,         // 조준 범위(도)
  coinsPerfect: 5,
  coinsByDiff: { '-3': 300, '-2': 180, '-1': 90, 0: 50, 1: 25 },
  coinsDefault: 10,
  coinsHoleInOne: 400,
  saveKey: 'pangpang.save.v1',
  clubAt: { '1W': 172, '5I': 96 },  // 샷을 고르는 기준 거리(m)
};

var SCORE_NAMES = { '-3': '알바트로스', '-2': '이글', '-1': '버디', 0: '파', 1: '보기', 2: '더블 보기', 3: '트리플 보기' };

var G = {
  phase: 'title', time: 0, flash: 0, shake: 0, pop: null, treeShake: null,
  view: { W: 380, H: 800, offsetY: 0 },
  cam: { px: 0, py: 20, pz: 0, lx: 40, ly: 5, lz: 0 },
  hole: null, titleHole: null, holeIndex: 0, scores: [], strokes: 0, wind: 0, windZ: 0,
  ball: null, lastX: 0, lastZ: 0, trail: [], trailFade: 1, fx: [],
  golfer: { x: 0, z: 0, yaw: 0, phi: 0, pose: null },
  club: '1W', swingClub: null, angle: 0, spin: 0, yaw: 0, special: null, curve: 0, impactPt: { x: 0, y: 0 }, command: null, markerX: null, markerZ: null, preview: [],
  gauge: { pos: 0, dir: 1, power: 0, hold: 0 }, viewGreen: false,
  shot: null, shotStyle: null, stopT: 0, swingT: 0, launched: false, phiTop: 0, followT: null,
  perfects: 0, introT: 0, holedT: 0, resultShown: false, accum: 0,
  coins: 0, owned: {}, equip: Object.assign({}, DEFAULT_EQUIP), best: null, stats: null, test: false,
};

/* ───────── 저장 ───────── */

function saveGame() {
  try {
    localStorage.setItem(GAME.saveKey, JSON.stringify({ coins: G.coins, owned: G.owned, equip: G.equip, best: G.best }));
  } catch (e) { /* 저장을 막은 브라우저에서도 게임은 돌아간다 */ }
}

function loadGame() {
  G.owned = {};
  for (const slot of SLOT_ORDER) G.owned[DEFAULT_EQUIP[slot]] = true;
  try {
    const raw = localStorage.getItem(GAME.saveKey);
    if (raw) {
      const s = JSON.parse(raw);
      G.coins = s.coins || 0;
      Object.assign(G.owned, s.owned || {});
      for (const slot of SLOT_ORDER) {
        if (s.equip && ITEMS[slot].some((it) => it.id === s.equip[slot])) G.equip[slot] = s.equip[slot];
      }
      G.best = s.best == null ? null : s.best;
    }
  } catch (e) { /* 깨진 저장은 무시 */ }
  refreshStats();
}

function refreshStats() {
  G.stats = sumStats(G.equip, ITEMS);
  if (G.ball && G.hole) recomputeMarker();
}

/* ───────── 라운드 ───────── */

function startRound() {
  G.scores = [];
  loadHole(0);
}

function loadHole(i) {
  G.holeIndex = i;
  G.hole = HOLES[i];
  rollHoleLayout(G.hole, (Math.random() * 2147483647) | 0);
  G.strokes = 0;
  G.perfects = 0;
  G.resultShown = false;
  const speed = Math.random() * G.hole.wind;
  const dir = Math.random() * Math.PI * 2;
  G.wind = Math.round(Math.cos(dir) * speed * 10) / 10;
  G.windZ = Math.round(Math.sin(dir) * speed * 10) / 10;
  G.ball = makeBall(0, heightAt(G.hole, 0, 0), 0);
  G.lastX = 0;
  G.lastZ = 0;
  G.trail = [];
  G.fx = [];
  G.pop = null;
  G.golfer.pose = null;
  G.followT = null;
  G.introT = GAME.introTime;
  G.phase = 'intro';
  pickClub();
  G.yaw = autoYaw();
  syncGolfer();
  recomputeMarker();
}

function aimVector() {
  const a = (G.yaw * Math.PI) / 180;
  return { x: Math.cos(a), z: Math.sin(a) };
}

function cupPos() { return { x: G.hole.cup, z: holeShapes(G.hole).cupZ }; }

function distToCup() {
  const c = cupPos();
  return Math.hypot(c.x - G.ball.x, c.z - G.ball.z);
}

function syncGolfer() {
  const a = (G.yaw * Math.PI) / 180;
  const reach = clubReach(G.club);
  // 오른손잡이: 목표가 왼쪽이므로 공 왼쪽에 서서 공을 바라본다
  G.golfer.yaw = a;
  G.golfer.x = G.ball.x + Math.sin(a) * reach;
  G.golfer.z = G.ball.z - Math.cos(a) * reach;
  G.golfer.phi = 0;
}

function currentCarry() {
  return simulateShot(shotOptions({ ignoreHazards: true, yaw: 0, hole: undefined, x: 0, z: 0, lie: lieMul(G.ball.x, G.ball.z, G.club) })).carry;
}

/** 핀이 닿는 거리면 핀을, 아니면 페어웨이 중심의 낙하 지점을 겨눈다 */
function autoYaw() {
  const b = G.ball, c = cupPos();
  const d = distToCup();
  let tx = c.x, tz = c.z;
  if (G.club !== 'PT' && d > currentCarry() + 18) {
    tx = Math.min(b.x + currentCarry(), G.hole.cup);
    tz = centerZ(G.hole, tx);
  }
  return (Math.atan2(tz - b.z, tx - b.x) * 180) / Math.PI;
}

function pickClub() {
  const hole = G.hole, b = G.ball;
  const d = distToCup();
  const s = surfaceAt(hole, b.x, b.z);
  if (s === 'green') { G.club = 'PT'; return; }
  if (d >= GAME.clubAt['1W'] && s !== 'bunker') G.club = '1W';
  else if (d >= GAME.clubAt['5I'] && s !== 'bunker') G.club = '5I';
  else G.club = 'SW';
}

function lieMul(x, z, club) {
  const type = surfaceAt(G.hole, x, z);
  const t = TERRAIN_LIE[type] || 1;
  return club === 'SW' && type === 'bunker' ? TERRAIN_LIE.bunkerWedge : t;
}

function currentPassive() { return ITEMS.char.find((c) => c.id === G.equip.char).passive; }

function passiveOptions() {
  const p = currentPassive();
  return {
    windMul: p.kind === 'windMul' ? p.value : 1,
    driverDist: p.kind === 'driverDist' ? p.value : 1,
    backMul: p.kind === 'backMul' ? p.value : 1,
  };
}

function shotOptions(extra) {
  return Object.assign(passiveOptions(), {
    club: G.club, power: 1, angle: G.angle, spin: G.spin, curve: G.club === 'PT' ? 0 : G.curve, yaw: G.yaw, stats: G.stats, impact: 0,
    hole: G.hole, x: G.ball.x, z: G.ball.z, wind: 0, windZ: 0, lie: lieMul(G.ball.x, G.ball.z, G.club), special: null,
  }, extra || {});
}

function recomputeMarker() {
  if (!G.hole || !G.ball) return;
  const windy = currentPassive().kind === 'windMarker';
  const o = shotOptions({ ignoreHazards: true, wind: windy ? G.wind : 0, windZ: windy ? G.windZ : 0 });
  G.preview = [];
  if (G.club === 'PT') {
    G.markerX = G.markerZ = null;
    const d = Math.min(distToCup() + 1.5, 26);
    const v = aimVector();
    for (let i = 1; i <= 26; i++) {
      const u = (i / 26) * d;
      const x = G.ball.x + v.x * u, z = G.ball.z + v.z * u;
      G.preview.push({ x, y: heightAt(G.hole, x, z) + 0.04, z });
    }
    return;
  }
  const lp = launchFrom(o);
  const b = makeBall(G.ball.x, G.ball.y, G.ball.z);
  b.seed = 7;
  launchBall(b, lp);
  const env = shotEnv(o);
  let guard = 0;
  while (b.mode === 'air' && guard++ < 4000) {
    stepBall(b, G.hole, env, PHYS.dt);
  }
  G.markerX = b.x;
  G.markerZ = b.z;
}

/** 큰 공에서 맞힐 점. x: -1 왼쪽 ~ 1 오른쪽(휘는 방향), y: -1 위(톱스핀·낮은 탄도) ~ 1 아래(백스핀·높은 탄도) */
function setImpactPoint(x, y) {
  if (G.phase !== 'aim') return;
  const r = Math.hypot(x, y);
  if (r > 1) { x /= r; y /= r; }
  const putt = G.club === 'PT';
  G.impactPt = { x: putt ? 0 : x, y: putt ? 0 : y };
  G.spin = G.impactPt.y;
  G.angle = G.impactPt.y * CLUB_TYPES[G.club].angleRange;
  G.curve = G.impactPt.x;
  recomputeMarker();
}

function resetImpactPoint() {
  G.impactPt = { x: 0, y: 0 };
  G.spin = 0;
  G.angle = 0;
  G.curve = 0;
}

/** 게이지가 오르는 동안 들어온 특수샷 커맨드. dir: 회오리가 휘는 방향(+1 오른쪽) */
function inputCommand(id, dir) {
  if ((G.phase !== 'power' && G.phase !== 'impact') || G.club === 'PT' || !SPECIAL_SHOTS[id]) return false;
  G.command = { id, dir: dir || 1 };
  SFX.play('lock');
  return true;
}

/** 임팩트를 놓치거나 게이지가 내려오면 타수 없이 처음으로 */
function cancelShot() {
  G.phase = 'aim';
  G.gauge.pos = 0;
  G.gauge.dir = 1;
  G.gauge.power = 0;
  G.golfer.phi = 0;
  G.command = null;
  G.pop = { text: '다시!', sub: '타수 없이 다시 칩니다', t: 0.8, max: 0.8, fill: '#ffffff' };
  SFX.play('ui');
}

/** 샷 전에 그린 쪽을 내려다본다(다시 누르면 공으로) */
function toggleGreenView(on) {
  if (G.phase !== 'aim') return;
  G.viewGreen = on === undefined ? !G.viewGreen : !!on;
  SFX.play('ui');
}

function readyShot() {
  G.phase = 'aim';
  G.viewGreen = false;
  resetImpactPoint();
  G.special = null;
  G.command = null;
  G.gauge.pos = 0;
  G.gauge.dir = 1;
  G.gauge.power = 0;
  G.shotStyle = null;
  G.swingClub = null;
  G.golfer.pose = null;
  G.followT = null;
  pickClub();
  G.yaw = autoYaw();
  syncGolfer();
  recomputeMarker();
}

/** 공 위치를 옮기고 샷을 준비한다(개발·테스트용). z를 안 주면 코스 중심선 */
function placeBall(x, z) {
  const zz = z === undefined ? centerZ(G.hole, x) : z;
  G.ball = makeBall(x, heightAt(G.hole, x, zz), zz);
  G.lastX = x;
  G.lastZ = zz;
  G.trail = [];
  G.stopT = 0;
  readyShot();
  updateCamera(5);
}

/** 공이 멈췄거나 홀아웃했을 때 다음 단계로 넘어간다 */
function readyNextShot() {
  if (G.phase === 'holed' || G.phase === 'score') { nextHole(); return; }
  if (G.phase === 'intro') { readyShot(); updateCamera(5); return; }
  if (G.phase === 'ball') { G.ball.mode = 'stop'; G.ball.events.length = 0; }
  if (G.phase === 'ball' || G.phase === 'stopped') { readyShot(); updateCamera(5); }
}

function nextHole() {
  if (G.phase === 'holed') finishHole();
  if (typeof closeModal === 'function') closeModal();
  if (G.holeIndex + 1 < HOLES.length) loadHole(G.holeIndex + 1);
  else finishRound();
}

function setClub(id) {
  if (G.phase !== 'aim') return;
  G.club = id;
  resetImpactPoint();
  syncGolfer();
  recomputeMarker();
  SFX.play('ui');
}

/** 키보드로 타점을 옮긴다 */
function moveImpactPoint(dx, dy) {
  setImpactPoint(G.impactPt.x + dx, G.impactPt.y + dy);
}

/** 좌우 조준(도, +는 오른쪽) */
function setYaw(delta) {
  if (G.phase !== 'aim') return;
  G.yaw = clamp(G.yaw + delta, -GAME.yawRange * 2, GAME.yawRange * 2);
  syncGolfer();
  recomputeMarker();
}

/** 3단 입력: 시작 → 파워 고정 → 임팩트 */
function pressShot() {
  if (G.phase === 'intro') { readyShot(); updateCamera(5); return; }
  if (G.phase === 'aim') {
    G.phase = 'power';
    G.viewGreen = false;
    G.gauge.pos = 0;
    G.gauge.dir = 1;
    G.gauge.hold = 0;
    G.command = null;
    SFX.play('gauge');
  } else if (G.phase === 'power') {
    G.gauge.power = Math.max(0.02, G.gauge.pos);
    // 퍼팅은 게이지 한 번으로 끝난다(임팩트 판정 없음)
    if (G.club === 'PT') { hitBall(0); return; }
    G.phase = 'impact';
    SFX.play('lock');
  } else if (G.phase === 'impact') {
    hitBall(G.gauge.pos);
  }
}

function hitBall(err) {
  G.shot = { power: G.gauge.power, impact: err };
  G.phase = 'swing';
  G.swingT = 0;
  G.launched = false;
  G.swingClub = G.club;
  G.phiTop = G.golfer.phi;
  if (G.club !== 'PT') SFX.play('whoosh');
}

function launchNow() {
  const s = G.shot;
  // 커맨드가 있고 임팩트가 판정 폭 안이어야 특수샷이 나간다
  const cmd = G.command;
  const exact = G.club !== 'PT' && Math.abs(s.impact) <= statFactors(G.stats).perfectHalf;
  const o = shotOptions({ power: s.power, impact: s.impact, special: exact && cmd ? cmd.id : null, curveDir: cmd ? cmd.dir : 1 });
  G.command = null;
  const lp = launchFrom(o);
  G.lastX = G.ball.x;
  G.lastZ = G.ball.z;
  G.ball = makeBall(G.ball.x, G.ball.y, G.ball.z);
  G.ball.seed = (Math.random() * 2147483647) | 0;
  launchBall(G.ball, lp);
  G.env = shotEnv(Object.assign({}, o, { wind: G.wind, windZ: G.windZ }));
  G.strokes++;
  G.shotStyle = o.special || (lp.perfect ? 'perfect' : null);
  G.trail = [];
  G.trailFade = 1;
  G.launched = true;
  G.accum = 0;
  if (lp.putt) { G.shotStyle = null; SFX.play('hit', G.swingClub); }
  else if (lp.perfect) onPerfect(o.special);
  else {
    if (cmd) G.pop = { text: '커맨드 실패', sub: '임팩트가 판정 폭을 벗어났어요', t: 1, max: 1, fill: '#ffb3a8' };
    SFX.play('hit', G.swingClub);
    spawn('smoke', G.ball.x, G.ball.y + 0.1, G.ball.z, 4, { color: '#f4f0d0', size: 0.5, speed: 1.5, life: 0.5, up: 0.6 });
  }
}

function onPerfect(special) {
  G.perfects++;
  const pas = currentPassive();
  G.coins += GAME.coinsPerfect * (pas.kind === 'perfectCoinMul' ? pas.value : 1);
  G.flash = 0.55;
  G.shake = 9;
  G.pop = special
    ? { text: SPECIAL_SHOTS[special].name + '!', sub: '특수샷 성공', t: 1.1, max: 1.1, big: true, fill: SPECIAL_SHOTS[special].glow }
    : { text: '팡!', sub: '퍼펙트 · 비거리 UP', t: 0.95, max: 0.95, big: true };
  SFX.play('hitPerfect', G.swingClub);
  spawn('star', G.ball.x, G.ball.y + 0.15, G.ball.z, 18, { color: '#ffe066', size: 0.32, speed: 5, life: 0.75, add: true });
  spawn('ring', G.ball.x, G.ball.y + 0.15, G.ball.z, 1, { color: '#fff3c0', size: 0.5, speed: 0, life: 0.34, add: true, grow: 4 });
}

/* ───────── 매 프레임 ───────── */

function updateGame(dt) {
  G.time += dt;
  G.flash = Math.max(0, G.flash - dt * 2.6);
  G.shake = Math.max(0, G.shake - dt * 22);
  if (G.pop) { G.pop.t -= dt; if (G.pop.t <= 0) G.pop = null; }
  if (G.treeShake) { G.treeShake.t -= dt; if (G.treeShake.t <= 0) G.treeShake = null; }
  updateFx(dt);
  if (!G.hole) { updateTitleCamera(); return; }
  const p = G.phase;
  if (p === 'intro') {
    G.introT -= dt;
    if (G.introT <= 0) { readyShot(); updateCamera(5); }
  } else if (p === 'power') {
    const g = G.gauge;
    const putt = G.club === 'PT';
    const speed = putt ? GAME.puttGaugeSpeed * (currentPassive().kind === 'puttGaugeMul' ? currentPassive().value : 1) : GAME.gaugeSpeed;
    if (g.hold > 0) g.hold -= dt;
    else g.pos += g.dir * speed * dt;
    if (g.pos >= 1 && g.dir > 0) { g.pos = 1; g.dir = -1; g.hold = GAME.gaugeTopHold; }
    if (g.pos <= 0 && g.dir < 0) { cancelShot(); return; }
    G.golfer.phi = -g.pos * (G.club === 'PT' ? GAME.puttBackswing : GAME.backswing);
  } else if (p === 'impact') {
    const g = G.gauge;
    g.pos -= GAME.impactSpeed * dt;
    if (g.pos <= GAME.impactFloor) cancelShot();
  } else if (p === 'swing') {
    updateSwing(dt);
  } else if (p === 'ball') {
    updateBall(dt);
    updateFollow(dt);
  } else if (p === 'stopped') {
    updateFollow(dt);
    G.stopT -= dt;
    if (G.stopT <= 0) readyShot();
  } else if (p === 'holed') {
    G.holedT -= dt;
    G.golfer.pose = 'dance';
    if (G.holedT <= 0) finishHole();
  }
  updateCamera(dt);
}

function updateTitleCamera() {
  const h = G.titleHole;
  if (!h) return;
  const S = holeShapes(h);
  const a = G.time * 0.09;
  const y = heightAt(h, S.green.cx, S.green.cz);
  G.cam.px = S.green.cx + Math.cos(a) * 62;
  G.cam.pz = S.green.cz + Math.sin(a) * 62;
  G.cam.py = y + 16;
  G.cam.lx = S.green.cx;
  G.cam.ly = y + 7;
  G.cam.lz = S.green.cz;
}

function updateSwing(dt) {
  G.swingT += dt;
  const u = clamp(G.swingT / GAME.swingDown, 0, 1);
  G.golfer.phi = G.phiTop * (1 - u * u);
  if (u >= 1 && !G.launched) {
    launchNow();
    G.followT = 0;
    G.phase = 'ball';
  }
}

function updateFollow(dt) {
  if (G.followT == null) return;
  G.followT += dt;
  const end = G.swingClub === 'PT' ? GAME.puttFollow : GAME.follow;
  const u = clamp(G.followT / GAME.swingFollow, 0, 1);
  G.golfer.phi = end * (1 - (1 - u) * (1 - u));
}

function updateBall(dt) {
  const b = G.ball;
  G.accum += dt;
  while (G.accum >= PHYS.dt && b.mode !== 'stop') {
    stepBall(b, G.hole, G.env, PHYS.dt);
    G.accum -= PHYS.dt;
  }
  for (const ev of b.events) handleBallEvent(ev);
  b.events.length = 0;
  if (b.mode === 'air' || Math.hypot(b.vx, b.vz) > 1) {
    G.trail.push({ x: b.x, y: b.y + 0.04, z: b.z });
    if (G.trail.length > 90) G.trail.shift();
  } else if (G.trail.length) {
    G.trail.shift();
  }
  if (b.x > G.hole.end + GAME.obMargin || b.x < -GAME.obMargin || Math.abs(b.z - centerZ(G.hole, b.x)) > GAME.obSide) { penalty('OB', '#ff8a5a'); return; }
  if (b.mode === 'stop') resolveBall();
}

function handleBallEvent(ev) {
  if (ev.kind === 'bounce') {
    SFX.play('bounce', ev.surface);
    if (G.ball.bounces === 1 && SPECIAL_SHOTS[G.shotStyle]) {
      const sp = SPECIAL_SHOTS[G.shotStyle];
      spawn('ring', ev.x, ev.y + 0.1, ev.z, 1, { color: sp.glow, size: 2, speed: 0, life: 0.5, grow: 4, add: true });
      spawn('spark', ev.x, ev.y + 0.2, ev.z, 14, { color: sp.glow, size: 0.5, speed: 7, life: 0.55, up: 3, add: true });
    }
    const c = ev.surface === 'bunker' ? '#f5dfa6' : ev.surface === 'green' ? '#d8ffae' : '#c9e88a';
    spawn('smoke', ev.x, ev.y + 0.1, ev.z, Math.min(9, 3 + (ev.speed | 0)), { color: c, size: 0.8, speed: 2.4, life: 0.62, up: 1.6 });
  } else if (ev.kind === 'water') {
    SFX.play('splash');
    const t = prepareHole(G.hole);
    let y = ev.y;
    for (const p of t.level) if (Math.hypot((ev.x - p.cx) / p.rx, (ev.z - p.cz) / p.rz) < 1) y = p.y;
    spawn('smoke', ev.x, y + 0.3, ev.z, 18, { color: '#d8f4ff', size: 0.7, speed: 4.5, life: 0.8, up: 6, grav: 14 });
    spawn('ring', ev.x, y + 0.1, ev.z, 2, { color: '#ffffff', size: 1.2, speed: 0, life: 0.7, grow: 3, add: true });
  } else if (ev.kind === 'cup') {
    SFX.play('cup');
  } else if (ev.kind === 'tree') {
    const hit = ev.surface === 'hit';
    SFX.play('leaves', hit);
    G.treeShake = { index: ev.tree, t: hit ? 0.6 : 0.3, max: 0.6 };
    const leaf = G.hole.theme === 'autumn' ? '#f2a03d' : '#5fcf72';
    spawn('smoke', ev.x, ev.y, ev.z, hit ? 16 : 6, { color: leaf, size: 0.45, speed: 5, life: 1.1, up: 1, grav: 5 });
    if (hit && !G.pop) G.pop = { text: '부스럭!', t: 0.6, max: 0.6, fill: '#c9ffb0' };
  } else if (ev.kind === 'trunk') {
    SFX.play('trunk');
    G.treeShake = { index: ev.tree, t: 0.4, max: 0.6 };
    spawn('smoke', ev.x, ev.y + 0.3, ev.z, 6, { color: '#b98a5a', size: 0.5, speed: 3, life: 0.5, up: 1.5 });
    if (!G.pop) G.pop = { text: '쿵!', t: 0.6, max: 0.6, fill: '#ffe2b0' };
  } else if (ev.kind === 'rock') {
    SFX.play('rock');
    spawn('spark', ev.x, ev.y + 0.2, ev.z, 10, { color: '#fff1c2', size: 0.35, speed: 6, life: 0.4, up: 2, add: true });
    spawn('smoke', ev.x, ev.y + 0.2, ev.z, 4, { color: '#cfd4da', size: 0.6, speed: 2, life: 0.5, up: 1 });
    if (!G.pop && ev.speed >= HAZARD.rockMinSpeed) G.pop = { text: '딱!', t: 0.6, max: 0.6, fill: '#ffffff' };
  } else if (ev.kind === 'lip') {
    SFX.play('lip');
  }
}

function resolveBall() {
  const b = G.ball;
  if (b.holed) { holeOut(); return; }
  if (surfaceAt(G.hole, b.x, b.z) === 'water') { penalty('워터 해저드', '#7fd6ff'); return; }
  if (G.strokes >= G.hole.par + GAME.maxStrokesOverPar) { giveUp(); return; }
  G.phase = 'stopped';
  G.stopT = GAME.autoNext;
}

function penalty(text, color) {
  G.strokes++;
  G.pop = { text, sub: '1벌타 · 원위치', t: 1.1, max: 1.1, fill: color };
  G.ball = makeBall(G.lastX, heightAt(G.hole, G.lastX, G.lastZ), G.lastZ);
  G.trail = [];
  if (G.strokes >= G.hole.par + GAME.maxStrokesOverPar) { giveUp(); return; }
  G.phase = 'stopped';
  G.stopT = 1.2;
}

function giveUp() {
  G.pop = { text: '다음 기회에', t: 1.2, max: 1.2, fill: '#ffffff' };
  G.phase = 'holed';
  G.holedT = 1.3;
}

function scoreName(diff, strokes) {
  if (strokes === 1) return '홀인원';
  return SCORE_NAMES[diff] || '+' + diff;
}

function holeOut() {
  const diff = G.strokes - G.hole.par;
  const name = scoreName(diff, G.strokes);
  G.pop = { text: name, sub: G.strokes + '타로 홀아웃', t: 1.9, max: 1.9, big: diff < 0, fill: diff < 0 ? '#ffe25a' : '#ffffff' };
  const c = cupPos();
  const y = heightAt(G.hole, c.x, c.z);
  spawn('star', c.x, y + 0.6, c.z, 26, { color: '#ffe680', size: 0.5, speed: 5, life: 1.1, up: 4, add: true, grav: 6 });
  spawn('magic', c.x, y + 0.6, c.z, 12, { color: '#9df0ff', size: 0.9, speed: 2.5, life: 0.9, up: 3, add: true });
  G.phase = 'holed';
  G.holedT = GAME.holeOutDelay;
  if (diff < 0) setTimeout(() => SFX.play('fanfare'), 700);
}

function coinsFor(strokes, par) {
  if (strokes === 1) return GAME.coinsHoleInOne;
  const c = GAME.coinsByDiff[strokes - par];
  return c == null ? GAME.coinsDefault : c;
}

function finishHole() {
  if (G.resultShown) return;
  G.resultShown = true;
  const earned = coinsFor(G.strokes, G.hole.par);
  G.coins += earned;
  G.scores.push({ par: G.hole.par, strokes: G.strokes, earned });
  G.phase = 'score';
  saveGame();
  SFX.play('coin');
  if (typeof showHoleResult === 'function') showHoleResult(earned);
}

function finishRound() {
  const total = G.scores.reduce((a, s) => a + s.strokes - s.par, 0);
  if (G.best == null || total < G.best) G.best = total;
  saveGame();
  G.phase = 'title';
  G.hole = null;
  if (typeof showRoundResult === 'function') showRoundResult(total);
}

/* ───────── 입자 ───────── */

function spawn(tex, x, y, z, n, o) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, b = Math.random() * Math.PI * 2;
    const s = (o.speed || 0) * (0.35 + Math.random() * 0.75);
    const life = (o.life || 0.6) * (0.75 + Math.random() * 0.45);
    G.fx.push({ tex, x, y, z, vx: Math.cos(a) * s * Math.cos(b), vy: Math.abs(Math.sin(b)) * s + (o.up || 0), vz: Math.sin(a) * s * Math.cos(b), life, max: life,
      size: (o.size || 0.5) * (0.7 + Math.random() * 0.6), color: o.color || '#ffffff', add: !!o.add, grow: o.grow || 0.9, grav: o.grav == null ? 2.5 : o.grav, alpha: o.alpha || 1 });
  }
  if (G.fx.length > 180) G.fx.splice(0, G.fx.length - 180);
}

function updateFx(dt) {
  for (let i = G.fx.length - 1; i >= 0; i--) {
    const p = G.fx[i];
    p.life -= dt;
    if (p.life <= 0) { G.fx.splice(i, 1); continue; }
    p.vy -= p.grav * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.z += p.vz * dt;
  }
}

/* ───────── 카메라 ───────── */

function updateCamera(dt) {
  const b = G.ball, hole = G.hole, c = G.cam;
  const aim = aimVector();
  const gy = heightAt(hole, b.x, b.z);
  let px, py, pz, lx, ly, lz, rate = 4;
  const p = G.phase;
  if (p === 'intro') {
    const u = 1 - smooth(G.introT / GAME.introTime);
    const cup = cupPos();
    const fx = lerp(0, cup.x - 30, u);
    const fz = centerZ(hole, fx);
    px = fx - 24; pz = centerZ(hole, Math.max(fx - 24, 0));
    py = heightAt(hole, fx, fz) + lerp(26, 18, u);
    lx = fx + 80; lz = centerZ(hole, Math.min(fx + 80, cup.x));
    ly = heightAt(hole, lx, lz) + 2;
    rate = 8;
  } else if (p === 'aim' && G.viewGreen) {
    // 그린 보기: 공 쪽 앞 하늘에서 컵을 내려다보며 그린 전체를 담는다
    const S = holeShapes(hole), cup = cupPos();
    const gy2 = heightAt(hole, cup.x, cup.z);
    const dx = cup.x - b.x, dz = cup.z - b.z, d = Math.hypot(dx, dz) || 1;
    const r = Math.max(S.green.rx, S.green.rz);
    const narrow = G.view.W < G.view.H;
    const back = clamp(d, 8, 30) * 0.6 + r * (narrow ? 1.25 : 0.8);
    px = cup.x - (dx / d) * back; pz = cup.z - (dz / d) * back;
    py = gy2 + r * (narrow ? 1.5 : 1.0) + 10;
    lx = cup.x; lz = cup.z; ly = gy2;
    rate = 5;
  } else if (p === 'aim' || p === 'power' || p === 'impact' || p === 'swing') {
    if (G.club === 'PT') {
      const d = Math.min(distToCup(), 28);
      const back = 2.9 + d * 0.12;
      const up = 1.35 + d * 0.11;
      px = b.x - aim.x * back + aim.z * 0.34;
      pz = b.z - aim.z * back - aim.x * 0.34;
      py = gy + up;
      lx = b.x + aim.x * (d * 0.55 + 1);
      lz = b.z + aim.z * (d * 0.55 + 1);
      ly = heightAt(hole, lx, lz) + 0.2;
    } else {
      // 캐릭터와 공이 함께 보이도록 둘 사이 뒤쪽에 선다
      const side = clubReach(G.club) * 0.52;
      px = b.x - aim.x * 6.2 + aim.z * side;
      pz = b.z - aim.z * 6.2 - aim.x * side;
      py = gy + 2.5;
      lx = b.x + aim.x * 40 + aim.z * side;
      lz = b.z + aim.z * 40 - aim.x * side;
      ly = gy + 1.7;
    }
    rate = 7;
  } else if (p === 'holed' || p === 'score' || b.holed) {
    const cup = cupPos();
    const y = heightAt(hole, cup.x, cup.z);
    const a = G.time * 0.25;
    px = cup.x - Math.cos(a) * 7; pz = cup.z - Math.sin(a) * 7; py = y + 2.6;
    lx = cup.x; lz = cup.z; ly = y + 0.5;
    rate = 2.6;
  } else {
    const h = Math.hypot(b.vx, b.vz);
    const dir = h > 1.5 ? { x: b.vx / h, z: b.vz / h } : G.camDir || aim;
    G.camDir = dir;
    const alt = Math.max(0, b.y - gy);
    // 굴러갈 때는 낮고 가깝게 따라가 공이 잘 보이게 한다
    const back = b.mode === 'air' ? 13 + alt * 0.25 : 5.5;
    px = b.x - dir.x * back;
    pz = b.z - dir.z * back;
    py = b.mode === 'air' ? Math.max(b.y + 3.5 - alt * 0.12, gy + 3.2) : gy + 1.9;
    const ahead = b.mode === 'air' ? 8 : 3;
    lx = b.x + dir.x * ahead;
    lz = b.z + dir.z * ahead;
    ly = b.y + (b.mode === 'air' ? -1.5 : 0.2);
    rate = 6;
  }
  const k = 1 - Math.exp(-rate * dt);
  c.px += (px - c.px) * k; c.py += (py - c.py) * k; c.pz += (pz - c.pz) * k;
  c.lx += (lx - c.lx) * k; c.ly += (ly - c.ly) * k; c.lz += (lz - c.lz) * k;
  c.py = Math.max(c.py, heightAt(hole, c.px, c.pz) + 1);
  if (G.shake > 0) c.py += Math.sin(G.time * 91) * G.shake * 0.006;
}
