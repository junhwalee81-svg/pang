/* 게임 진행과 상태. 화면은 render.js, 버튼은 ui.js가 맡는다. */

var GAME = {
  gaugeSpeed: 0.82,     // 파워 게이지 속도(초당 비율)
  impactSpeed: 1.2,     // 임팩트 복귀 속도
  impactFloor: -0.15,   // 임팩트 마커가 사라지는 지점
  backswing: 205,       // 백스윙 각도(도)
  puttBackswing: 42,
  swingDown: 0.17,      // 다운스윙 시간(초)
  swingFollow: 0.55,
  autoNext: 1.15,       // 공이 멈춘 뒤 다음 샷 준비까지(초)
  holeOutDelay: 1.9,
  introTime: 2.1,
  maxStrokesOverPar: 5,
  obMargin: 26,
  coinsPerfect: 5,
  coinsByDiff: { '-3': 300, '-2': 180, '-1': 90, 0: 50, 1: 25 },
  coinsDefault: 10,
  coinsHoleInOne: 400,
  saveKey: 'pangpang.save.v1',
  // 샷을 고르는 기준 거리(m)
  clubAt: { '1W': 172, '5I': 96 },
};

var SCORE_NAMES = { '-3': '알바트로스', '-2': '이글', '-1': '버디', 0: '파', 1: '보기', 2: '더블 보기', 3: '트리플 보기' };

var G = {
  phase: 'title', time: 0, flash: 0, shake: 0, pop: null,
  view: { W: 380, H: 800, cy: 400, miniY: 58, playTop: 100, playH: 520 },
  cam: { x: 0, y: 8, z: 26 },
  hole: null, holeIndex: 0, scores: [], strokes: 0, wind: 0,
  ball: null, lastX: 0, trail: [], trailFade: 1, fx: [],
  golfer: { x: 0, phi: 0, expr: 'head', pose: null, bob: 0 },
  club: '1W', swingClub: null, angle: 0, spin: 0, markerX: null,
  gauge: { pos: 0, dir: 1, power: 0 },
  shot: null, shotStyle: null, stopT: 0, swingT: 0, launched: false, phiTop: 0,
  perfects: 0, introT: 0, holedT: 0, resultShown: false, penaltyMsg: null, accum: 0,
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
  if (G.ball) recomputeMarker();
}

/* ───────── 라운드 ───────── */

function startRound() {
  G.scores = [];
  loadHole(0);
}

function loadHole(i) {
  G.holeIndex = i;
  G.hole = HOLES[i];
  prepareHole(G.hole);
  G.strokes = 0;
  G.perfects = 0;
  G.resultShown = false;
  const w = G.hole.wind;
  G.wind = Math.round((Math.random() * 2 - 1) * w * 10) / 10;
  G.ball = makeBall(0, heightAt(G.hole, 0));
  G.lastX = 0;
  G.trail = [];
  G.fx = [];
  G.pop = null;
  G.golfer.pose = null;
  G.introT = GAME.introTime;
  G.phase = 'intro';
  G.cam.x = G.hole.cup;
  G.cam.z = 12;
  G.cam.y = heightAt(G.hole, G.hole.cup) + 8;
  pickClub();
  G.golfer.x = golferSpot();
  G.golfer.phi = clubRig(G.club).tilt;
  recomputeMarker();
}

function golferSpot() { return G.ball.x - clubRig(G.club).reach * RIG.spriteToWorld; }

function pickClub() {
  const hole = G.hole, b = G.ball;
  const d = hole.cup - b.x;
  if (surfaceAt(hole, b.x) === 'green') { G.club = 'PT'; return; }
  if (d >= GAME.clubAt['1W'] && surfaceAt(hole, b.x) !== 'bunker') G.club = '1W';
  else if (d >= GAME.clubAt['5I'] && surfaceAt(hole, b.x) !== 'bunker') G.club = '5I';
  else G.club = 'SW';
}

function lieMul(x, club) {
  const type = surfaceAt(G.hole, x);
  const t = TERRAIN_LIE[type] || 1;
  return club === 'SW' && type === 'bunker' ? TERRAIN_LIE.bunkerWedge : t;
}

function shotOptions(extra) {
  return Object.assign({
    club: G.club, power: 1, angle: G.angle, spin: G.spin, stats: G.stats, impact: 0,
    hole: G.hole, x: G.ball.x, wind: 0, lie: lieMul(G.ball.x, G.club),
  }, extra || {});
}

function recomputeMarker() {
  if (!G.hole || !G.ball) return;
  if (G.club === 'PT') { G.markerX = null; return; }
  const r = simulateShot(shotOptions());
  G.markerX = G.ball.x + r.carry;
}

function readyShot() {
  G.phase = 'aim';
  G.angle = 0;
  G.spin = 0;
  G.gauge.pos = 0;
  G.gauge.dir = 1;
  G.gauge.power = 0;
  G.shotStyle = null;
  G.swingClub = null;
  G.golfer.pose = null;
  G.golfer.expr = 'head';
  pickClub();
  G.golfer.x = golferSpot();
  G.golfer.phi = clubRig(G.club).tilt;
  recomputeMarker();
}

/** 공 위치를 옮기고 샷을 준비한다(개발·테스트용) */
function placeBall(x) {
  G.ball = makeBall(x, heightAt(G.hole, x));
  G.lastX = x;
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
  if (G.phase === 'ball' || G.phase === 'stopped') readyShot();
}

function nextHole() {
  if (G.phase === 'holed') finishHole();
  if (G.holeIndex + 1 < HOLES.length) loadHole(G.holeIndex + 1);
  else finishRound();
}

function setClub(id) {
  if (G.phase !== 'aim') return;
  G.club = id;
  G.angle = 0;
  G.spin = 0;
  G.golfer.x = golferSpot();
  G.golfer.phi = clubRig(id).tilt;
  recomputeMarker();
  SFX.play('ui');
}

function setAngle(delta) {
  if (G.phase !== 'aim') return;
  const range = CLUB_TYPES[G.club].angleRange;
  G.angle = clamp(G.angle + delta, -range, range);
  recomputeMarker();
  SFX.play('ui');
}

function setSpin(delta) {
  if (G.phase !== 'aim' || G.club === 'PT') return;
  G.spin = clamp(Math.round((G.spin + delta) * 4) / 4, -1, 1);
  recomputeMarker();
  SFX.play('ui');
}

/** 3단 입력: 시작 → 파워 고정 → 임팩트 */
function pressShot() {
  if (G.phase === 'intro') { readyShot(); updateCamera(5); return; }
  if (G.phase === 'aim') {
    G.phase = 'power';
    G.gauge.pos = 0;
    G.gauge.dir = 1;
    G.golfer.expr = 'headFocus';
    SFX.play('gauge');
  } else if (G.phase === 'power') {
    G.gauge.power = Math.max(0.02, G.gauge.pos);
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
}

function launchNow() {
  const s = G.shot;
  const o = shotOptions({ power: s.power, impact: s.impact });
  const lp = launchFrom(o);
  G.lastX = G.ball.x;
  G.ball = makeBall(G.ball.x, G.ball.y);
  launchBall(G.ball, lp);
  G.env = shotEnv(Object.assign({}, o, { wind: G.wind }));
  G.strokes++;
  G.shotStyle = lp.perfect ? 'perfect' : null;
  G.trail = [];
  G.trailFade = 1;
  G.launched = true;
  G.accum = 0;
  if (lp.perfect) onPerfect();
  else {
    G.golfer.expr = lp.miss > 0.14 ? 'headShock' : 'head';
    SFX.play('hit');
    spawn('smoke', G.ball.x, G.ball.y + 0.2, 4, { color: '#f4f0d0', size: 34, speed: 3, life: 0.5, up: 1 });
  }
}

function onPerfect() {
  G.perfects++;
  G.coins += GAME.coinsPerfect;
  G.golfer.expr = 'head';
  G.flash = 0.62;
  G.shake = 9;
  G.pop = { text: '팡!', sub: '퍼펙트 임팩트', t: 0.95, max: 0.95, big: true, color: 'rgba(255,214,90,.5)' };
  SFX.play('hitPerfect');
  spawn('star', G.ball.x, G.ball.y + 0.3, 16, { color: '#ffe066', size: 26, speed: 11, life: 0.75, add: true });
  spawn('ring', G.ball.x, G.ball.y + 0.3, 1, { color: '#ffffff', size: 60, speed: 0, life: 0.42, add: true, grow: 5 });
}

/* ───────── 매 프레임 ───────── */

function updateGame(dt) {
  G.time += dt;
  G.flash = Math.max(0, G.flash - dt * 2.6);
  G.shake = Math.max(0, G.shake - dt * 22);
  if (G.pop) { G.pop.t -= dt; if (G.pop.t <= 0) G.pop = null; }
  updateFx(dt);
  if (!G.hole) {
    G.cam.z = 15;
    G.cam.x = 74 + Math.sin(G.time * 0.09) * 42;
    G.cam.y = heightAt(HOLES[0], G.cam.x) + (G.view.H * 0.3) / G.cam.z;
    return;
  }
  const p = G.phase;
  if (p === 'intro') {
    G.introT -= dt;
    if (G.introT <= 0) readyShot();
  } else if (p === 'aim') {
    G.golfer.bob = Math.sin(G.time * 2.3) * 0.8;
  } else if (p === 'power') {
    const g = G.gauge;
    g.pos += g.dir * GAME.gaugeSpeed * dt;
    if (g.pos >= 1) { g.pos = 1; g.dir = -1; }
    if (g.pos <= 0 && g.dir < 0) { g.pos = 0; G.phase = 'aim'; G.golfer.expr = 'head'; }
    G.golfer.phi = backswingAngle(g.pos);
  } else if (p === 'impact') {
    const g = G.gauge;
    g.pos -= GAME.impactSpeed * dt;
    if (g.pos <= GAME.impactFloor) { g.pos = GAME.impactFloor; hitBall(GAME.impactFloor); }
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
    G.golfer.pose = Math.sin(G.time * 7) > 0 ? 'cheer0' : 'cheer1';
    if (G.holedT <= 0) finishHole();
  }
  updateCamera(dt);
}

function backswingAngle(pos) {
  const tilt = clubRig(G.club).tilt;
  return tilt - pos * (G.club === 'PT' ? GAME.puttBackswing : GAME.backswing);
}

function updateSwing(dt) {
  G.swingT += dt;
  const tilt = clubRig(G.swingClub).tilt;
  const u = clamp(G.swingT / GAME.swingDown, 0, 1);
  G.golfer.phi = lerp(G.phiTop, tilt, u * u);
  if (u >= 1 && !G.launched) {
    launchNow();
    G.followT = 0;
    G.phase = 'ball';
  }
}

function updateFollow(dt) {
  if (G.followT == null) return;
  G.followT += dt;
  const tilt = clubRig(G.swingClub || G.club).tilt;
  const end = G.swingClub === 'PT' ? tilt + 42 : tilt + 215;
  const u = clamp(G.followT / GAME.swingFollow, 0, 1);
  G.golfer.phi = lerp(tilt, end, 1 - (1 - u) * (1 - u));
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
  if (b.mode === 'air' || Math.hypot(b.vx, b.vy) > 1) {
    G.trail.push({ x: b.x, y: b.y + 0.25 });
    if (G.trail.length > 64) G.trail.shift();
  } else if (G.trail.length) {
    G.trail.shift();
  }
  if (b.x > G.hole.end + GAME.obMargin || b.x < -GAME.obMargin) { penalty('OB', '#ff8a5a'); return; }
  if (b.mode === 'stop') resolveBall();
}

function handleBallEvent(ev) {
  if (ev.kind === 'bounce') {
    SFX.play('bounce');
    const c = ev.surface === 'bunker' ? '#f5dfa6' : ev.surface === 'green' ? '#d8ffae' : '#c9e88a';
    spawn('smoke', ev.x, ev.y + 0.1, Math.min(9, 3 + (ev.speed | 0)), { color: c, size: 34, speed: 3.6, life: 0.62, up: 2.4 });
  } else if (ev.kind === 'water') {
    SFX.play('splash');
    const t = prepareHole(G.hole);
    const lv = t.level.find((p) => ev.x >= p.from && ev.x <= p.to);
    const y = lv ? lv.y : ev.y;
    spawn('smoke', ev.x, y + 0.4, 18, { color: '#d8f4ff', size: 28, speed: 7.4, life: 0.8, up: 8, grav: 16 });
    spawn('ring', ev.x, y + 0.1, 2, { color: '#ffffff', size: 40, speed: 0, life: 0.7, grow: 3, add: true });
  } else if (ev.kind === 'cup') {
    SFX.play('cup');
  } else if (ev.kind === 'lip') {
    SFX.play('bounce');
  }
}

function resolveBall() {
  const b = G.ball;
  if (b.holed) { holeOut(); return; }
  const type = surfaceAt(G.hole, b.x);
  if (type === 'water') { penalty('워터 해저드', '#7fd6ff'); return; }
  if (G.strokes >= G.hole.par + GAME.maxStrokesOverPar) { giveUp(); return; }
  G.phase = 'stopped';
  G.stopT = GAME.autoNext;
}

function penalty(text, color) {
  G.strokes++;
  G.pop = { text, sub: '1벌타 · 원위치', t: 1.1, max: 1.1, fill: color, stroke: 'rgba(10,30,60,.92)' };
  const back = G.lastX;
  G.ball = makeBall(back, heightAt(G.hole, back));
  G.trail = [];
  if (G.strokes >= G.hole.par + GAME.maxStrokesOverPar) { giveUp(); return; }
  G.phase = 'stopped';
  G.stopT = 1.2;
}

function giveUp() {
  G.golfer.expr = 'headShock';
  G.pop = { text: '다음 기회에', t: 1.2, max: 1.2, fill: '#ffffff', stroke: 'rgba(10,30,60,.9)' };
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
  G.pop = { text: name, sub: G.strokes + '타로 홀아웃', t: 1.7, max: 1.7, big: diff < 0, color: 'rgba(120,235,255,.42)', fill: diff < 0 ? '#ffe25a' : '#ffffff', stroke: 'rgba(16,48,110,.95)' };
  spawn('star', G.hole.cup, heightAt(G.hole, G.hole.cup) + 1, 26, { color: '#ffe680', size: 24, speed: 9, life: 1.1, up: 7, add: true, grav: 9 });
  spawn('magic', G.hole.cup, heightAt(G.hole, G.hole.cup) + 1, 12, { color: '#9df0ff', size: 40, speed: 4, life: 0.9, up: 6, add: true });
  G.phase = 'holed';
  G.holedT = GAME.holeOutDelay;
  SFX.play('fanfare');
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

function spawn(tex, x, y, n, o) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const s = (o.speed || 0) * (0.35 + Math.random() * 0.75);
    const life = (o.life || 0.6) * (0.75 + Math.random() * 0.45);
    G.fx.push({ tex, x, y, vx: Math.cos(a) * s, vy: Math.abs(Math.sin(a)) * s + (o.up || 0), life, max: life,
      size: (o.size || 20) * (0.7 + Math.random() * 0.6), rot: Math.random() * 6.28, spin: (Math.random() - 0.5) * 5,
      color: o.color || '#ffffff', add: !!o.add, grow: o.grow || 0.9, grav: o.grav == null ? 2.5 : o.grav, alpha: o.alpha || 1 });
  }
  if (G.fx.length > 260) G.fx.splice(0, G.fx.length - 260);
}

function updateFx(dt) {
  for (let i = G.fx.length - 1; i >= 0; i--) {
    const p = G.fx[i];
    p.life -= dt;
    if (p.life <= 0) { G.fx.splice(i, 1); continue; }
    p.vy -= p.grav * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.rot += p.spin * dt;
  }
}

/* ───────── 카메라 ───────── */

function aimZoom() { return clamp(Math.min(G.view.W, G.view.playH * 0.95) / 15, 24, 38); }

function updateCamera(dt) {
  const V = G.view, b = G.ball, hole = G.hole;
  let tx, ty, tz, rate = 3.4;
  const gy = heightAt(hole, b.x);
  const groundOffset = (z) => (V.playH * 0.28) / z;
  if (G.phase === 'intro') {
    const u = 1 - smooth(G.introT / GAME.introTime);
    tx = lerp(hole.cup, b.x, u);
    tz = lerp(13, aimZoom(), u * u);
    ty = heightAt(hole, tx) + groundOffset(tz);
    rate = 8;
  } else if (G.phase === 'aim' || G.phase === 'power' || G.phase === 'impact' || G.phase === 'swing') {
    if (G.club === 'PT') {
      const d = Math.abs(hole.cup - b.x);
      tz = clamp((V.W * 0.6) / (d + 4), 12, aimZoom());
      tx = lerp(b.x, hole.cup, 0.5) - 0.06 * V.W / tz;
    } else {
      tz = aimZoom();
      tx = G.golfer.x + (V.W / 2 - Math.max(V.W * 0.2, (78 * tz) / 30 + 10)) / tz;
    }
    ty = gy + groundOffset(tz);
  } else if (b.holed || G.phase === 'holed') {
    tz = 26;
    tx = b.x;
    ty = gy + groundOffset(tz);
  } else {
    const alt = b.y - gy;
    tz = clamp((V.playH * 0.56) / (alt + 8), 7, 24);
    tx = b.x + Math.sign(b.vx || 1) * (V.W * 0.11) / tz;
    ty = gy + Math.max(groundOffset(tz), alt * 0.5);
    rate = 5;
  }
  const k = 1 - Math.exp(-rate * dt);
  G.cam.x += (tx - G.cam.x) * (G.phase === 'ball' ? Math.min(1, k * 2.4) : k);
  G.cam.y += (ty - G.cam.y) * k;
  G.cam.z += (tz - G.cam.z) * k;
}
