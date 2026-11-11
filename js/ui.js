/* DOM 화면, 입력(터치·스페이스·제스처 커맨드), 상점, 게임 루프. */

var UI = { padKey: '', ink: [], inkFade: 0, dots: [] };
var shopSlot = 'char';
var canvas;

// 화살표 순서 → 특수샷. 회오리는 마지막 방향으로 휘는 쪽을 정한다
var KEY_COMMANDS = (() => {
  const list = [];
  for (const id of SPECIAL_ORDER) for (const k of SPECIAL_SHOTS[id].keys) list.push({ id, keys: k, dir: k === 'RUL' ? -1 : 1 });
  return list;
})();
var GESTURE = { tapMax: 14, swipeMin: 60, circleTurn: 4.6, dotCount: 3, dotWindow: 1.4 };

function $(id) { return document.getElementById(id); }

function setText(el, v) { if (el.textContent !== String(v)) el.textContent = v; }

function resize() {
  const W = window.innerWidth, H = window.innerHeight;
  const hudBox = $('hud').getBoundingClientRect();
  const panelH = $('panel').offsetHeight || 190;
  const top = hudBox.height ? hudBox.bottom : 54;
  const wide = W >= 900;
  G.view.W = W;
  G.view.H = H;
  // 조작판을 뺀 영역의 가운데가 화면 중심이 되도록 카메라를 민다
  G.view.offsetY = !G.hole ? 0 : wide ? Math.round(H * 0.05) : Math.round(panelH * 0.62 - top * 0.5);
  if (VIEW.R) resizeView(W, H, G.view.offsetY);
  const mini = $('mini');
  const portrait = W < 700;
  const mw = portrait ? 66 : 96, mh = portrait ? 170 : 250;
  mini.style.width = mw + 'px';
  mini.style.height = mh + 'px';
  mini.width = mw * 2;
  mini.height = mh * 2;
  mini.style.top = top + 6 + 'px';
  $('slopeBox').style.top = top + 8 + 'px';
  $('greenBtn').style.top = top + 6 + 'px';
  UI.miniW = mw;
  UI.miniH = mh;
  const ink = $('ink');
  ink.width = W;
  ink.height = H;
  const pad = $('padCanvas');
  const ps = $('ballPad').clientWidth || 92;
  pad.width = pad.height = ps * 2;
  UI.padKey = '';
}

/* ───────── 제스처 ───────── */

/** 화면에 그린 한 획을 판별한다: dot·up·down·cw·ccw 또는 null */
function recognizeGesture(points) {
  if (!points.length) return null;
  const a = points[0], z = points[points.length - 1];
  let len = 0, turn = 0, prevAng = null;
  for (let i = 1; i < points.length; i++) {
    const dx = points[i].x - points[i - 1].x, dy = points[i].y - points[i - 1].y;
    const d = Math.hypot(dx, dy);
    len += d;
    if (d < 3) continue;
    const ang = Math.atan2(dy, dx);
    if (prevAng !== null) {
      let delta = ang - prevAng;
      while (delta > Math.PI) delta -= Math.PI * 2;
      while (delta < -Math.PI) delta += Math.PI * 2;
      turn += delta;
    }
    prevAng = ang;
  }
  if (len < GESTURE.tapMax) return 'dot';
  if (Math.abs(turn) >= GESTURE.circleTurn) return turn > 0 ? 'cw' : 'ccw';
  const dx = z.x - a.x, dy = z.y - a.y;
  if (Math.abs(dy) >= GESTURE.swipeMin && Math.abs(dy) > Math.abs(dx) * 1.3) return dy < 0 ? 'up' : 'down';
  return null;
}

/** 제스처 → 커맨드 */
function applyGesture(kind) {
  if (G.phase !== 'power' || G.club === 'PT' || !kind) return;
  if (kind === 'dot') {
    const now = G.time;
    UI.dots = UI.dots.filter((t) => now - t < GESTURE.dotWindow);
    UI.dots.push(now);
    if (UI.dots.length >= GESTURE.dotCount) { UI.dots = []; commandDone(inputCommand('dot', 1)); }
    else toast('점 ' + UI.dots.length + '/' + GESTURE.dotCount);
    return;
  }
  UI.dots = [];
  if (kind === 'up') commandDone(inputCommand('tomahawk', 1));
  else if (kind === 'down') commandDone(inputCommand('spike', 1));
  else if (kind === 'cw') commandDone(inputCommand('tornado', 1));
  else if (kind === 'ccw') commandDone(inputCommand('tornado', -1));
}

function commandDone(ok) {
  if (!ok || !G.command) return;
  const sp = SPECIAL_SHOTS[G.command.id];
  toast(sp.icon + ' ' + sp.name + (G.command.id === 'tornado' ? (G.command.dir > 0 ? ' (오른쪽)' : ' (왼쪽)') : '') + ' 입력 — 정확히 맞혀야 나가요');
}

function toast(text) {
  const el = $('cmdToast');
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(UI.toastT);
  UI.toastT = setTimeout(() => el.classList.remove('show'), 1300);
}

function drawInk() {
  const c = $('ink');
  const x = c.getContext('2d');
  x.clearRect(0, 0, c.width, c.height);
  if (!UI.ink.length) return;
  x.globalAlpha = UI.inkFade;
  x.lineCap = x.lineJoin = 'round';
  x.strokeStyle = 'rgba(255,240,140,.9)';
  x.shadowColor = 'rgba(255,200,60,.9)';
  x.shadowBlur = 14;
  x.lineWidth = 7;
  x.beginPath();
  UI.ink.forEach((p, i) => (i ? x.lineTo(p.x, p.y) : x.moveTo(p.x, p.y)));
  x.stroke();
  x.globalAlpha = 1;
}

/* ───────── 타점 공 ───────── */

function drawPad() {
  const c = $('padCanvas');
  const p = G.impactPt;
  const key = c.width + ':' + p.x.toFixed(3) + ':' + p.y.toFixed(3) + G.club + G.phase;
  if (key === UI.padKey) return;
  UI.padKey = key;
  const x = c.getContext('2d');
  const S = c.width, R = S * 0.43, cx = S / 2, cy = S / 2;
  x.clearRect(0, 0, S, S);
  const g = x.createRadialGradient(cx - R * 0.35, cy - R * 0.4, R * 0.1, cx, cy, R);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.7, '#e8eef3');
  g.addColorStop(1, '#a9b8c6');
  x.fillStyle = g;
  x.beginPath();
  x.arc(cx, cy, R, 0, Math.PI * 2);
  x.fill();
  x.fillStyle = 'rgba(95,120,150,.18)';
  for (let i = 0; i < 46; i++) {
    const a = i * 2.39996, r = Math.sqrt(i / 46) * R * 0.92;
    x.beginPath();
    x.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r, R * 0.045, 0, Math.PI * 2);
    x.fill();
  }
  x.strokeStyle = 'rgba(30,60,110,.35)';
  x.lineWidth = S * 0.012;
  x.beginPath();
  x.moveTo(cx - R, cy); x.lineTo(cx + R, cy);
  x.moveTo(cx, cy - R); x.lineTo(cx, cy + R);
  x.stroke();
  const putt = G.club === 'PT';
  const dx = cx + p.x * R * 0.82, dy = cy + p.y * R * 0.82;
  x.fillStyle = putt ? 'rgba(120,130,140,.6)' : '#ec3f3f';
  x.strokeStyle = '#ffffff';
  x.lineWidth = S * 0.025;
  x.beginPath();
  x.arc(dx, dy, R * 0.17, 0, Math.PI * 2);
  x.fill();
  x.stroke();
  x.font = '800 ' + Math.round(S * 0.095) + 'px "Malgun Gothic", sans-serif';
  x.textAlign = 'center';
  x.fillStyle = 'rgba(25,45,85,.72)';
  x.fillText('톱', cx, cy - R * 0.62);
  x.fillText('백', cx, cy + R * 0.78);
}

function padText() {
  if (G.club === 'PT') return '퍼터는 타점 없음';
  const p = G.impactPt;
  const parts = [];
  if (Math.abs(p.y) >= 0.08) parts.push((p.y > 0 ? '백스핀 ' : '톱스핀 ') + Math.round(Math.abs(p.y) * 100) + '%');
  const loft = CLUB_TYPES[G.club].loft + G.angle;
  parts.push('각도 ' + Math.round(loft) + '°');
  if (Math.abs(p.x) >= 0.08) parts.push((p.x > 0 ? '오른쪽' : '왼쪽') + ' 휨');
  return parts.join(' · ');
}

/* ───────── 입력 ───────── */

function buildControls() {
  const box = $('clubs');
  CLUB_ORDER.forEach((id) => {
    const b = document.createElement('button');
    b.className = 'club';
    b.dataset.club = id;
    b.innerHTML = '<b>' + id + '</b><small></small>';
    b.addEventListener('pointerdown', (e) => { e.preventDefault(); SFX.unlock(); setClub(id); });
    box.appendChild(b);
  });
  $('cmdHelp').innerHTML = SPECIAL_ORDER.map((id) => {
    const s = SPECIAL_SHOTS[id];
    const keys = s.keys[0].split('').map((k) => ({ U: '↑', D: '↓', L: '←', R: '→' })[k]).join('');
    return '<span><i>' + s.icon + '</i><b>' + s.name + '</b><em>' + s.gesture + ' · ' + keys + '</em></span>';
  }).join('');
  const hold = (id, fn) => {
    const el = $(id);
    let timer = null;
    const stop = () => { clearInterval(timer); timer = null; };
    el.addEventListener('pointerdown', (e) => { e.preventDefault(); SFX.unlock(); fn(); timer = setInterval(fn, 70); });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach((n) => el.addEventListener(n, stop));
  };
  hold('yawLeft', () => setYaw(G.club === 'PT' ? -0.5 : -1));
  hold('yawRight', () => setYaw(G.club === 'PT' ? 0.5 : 1));
  const press = (e) => { e.preventDefault(); SFX.unlock(); pressShot(); };
  $('shot').addEventListener('pointerdown', press);
  $('gauge').addEventListener('pointerdown', press);
  $('shopBtn').addEventListener('pointerdown', (e) => { e.preventDefault(); openShop(); });
  $('greenBtn').addEventListener('pointerdown', (e) => { e.preventDefault(); SFX.unlock(); toggleGreenView(); });
  $('mini').addEventListener('pointerdown', (e) => { e.preventDefault(); SFX.unlock(); toggleGreenView(); });

  // 타점 공: 끌어서 맞힐 점을 정한다
  const pad = $('ballPad');
  const setFrom = (e) => {
    const r = pad.getBoundingClientRect();
    const R = r.width * 0.43 * 0.82;
    setImpactPoint((e.clientX - r.left - r.width / 2) / R, (e.clientY - r.top - r.height / 2) / R);
  };
  let padDrag = false;
  pad.addEventListener('pointerdown', (e) => { e.preventDefault(); SFX.unlock(); padDrag = true; pad.setPointerCapture(e.pointerId); setFrom(e); });
  pad.addEventListener('pointermove', (e) => { if (padDrag) setFrom(e); });
  pad.addEventListener('pointerup', () => { padDrag = false; });
  pad.addEventListener('dblclick', () => setImpactPoint(0, 0));

  // 게임 화면: 조준 중에는 끌어 방향, 톡 치면 샷 시작. 게이지가 오르는 동안은 커맨드를 그린다
  let touch = null;
  canvas.addEventListener('pointerdown', (e) => {
    SFX.unlock();
    if (G.phase === 'intro') { pressShot(); return; }
    if (G.phase === 'impact') { pressShot(); return; }
    touch = { x: e.clientX, y: e.clientY, moved: 0, phase: G.phase, pts: [{ x: e.clientX, y: e.clientY }] };
    if (G.phase === 'power') { UI.ink = touch.pts; UI.inkFade = 1; }
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!touch) return;
    const dx = e.clientX - touch.x;
    touch.moved += Math.abs(dx) + Math.abs(e.clientY - touch.y);
    touch.pts.push({ x: e.clientX, y: e.clientY });
    if (touch.phase === 'aim' && G.phase === 'aim' && touch.moved > 8) setYaw(dx * (G.club === 'PT' ? 0.05 : 0.14));
    touch.x = e.clientX;
    touch.y = e.clientY;
  });
  canvas.addEventListener('pointerup', () => {
    if (!touch) return;
    const t = touch;
    touch = null;
    if (t.phase === 'aim' && G.phase === 'aim' && t.moved <= 8) pressShot();
    else if (t.phase === 'power' && G.phase === 'power') applyGesture(recognizeGesture(t.pts));
  });

  window.addEventListener('keydown', (e) => {
    if ($('modal').classList.contains('show') || $('title').classList.contains('show')) return;
    SFX.unlock();
    if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); if (!e.repeat) pressShot(); return; }
    const arrow = { ArrowUp: 'U', ArrowDown: 'D', ArrowLeft: 'L', ArrowRight: 'R' }[e.code];
    if ((G.phase === 'power' || G.phase === 'impact') && arrow) {
      e.preventDefault();
      UI.keys = ((UI.keys || '') + arrow).slice(-3);
      const hit = KEY_COMMANDS.find((c) => UI.keys.endsWith(c.keys));
      if (hit) { UI.keys = ''; commandDone(inputCommand(hit.id, hit.dir)); }
      return;
    }
    if (G.phase !== 'aim') return;
    if (e.code === 'KeyG' || e.code === 'KeyV') { toggleGreenView(); return; }
    if (e.code === 'ArrowLeft') setYaw(-1);
    else if (e.code === 'ArrowRight') setYaw(1);
    else if (e.code === 'KeyW') moveImpactPoint(0, -0.2);
    else if (e.code === 'KeyS') moveImpactPoint(0, 0.2);
    else if (e.code === 'KeyA') moveImpactPoint(-0.2, 0);
    else if (e.code === 'KeyD') moveImpactPoint(0.2, 0);
    else if (/^Digit[1-4]$/.test(e.code)) setClub(CLUB_ORDER[+e.code.slice(5) - 1]);
  });
}

function puttReach() { return CLUB_TYPES.PT.v0 * CLUB_TYPES.PT.v0 / (2 * TERRAIN.green.mu * PHYS.g); }

function clubReachText(id) {
  if (id === 'PT') return Math.round(puttReach()) + 'm';
  UI.reach = UI.reach || {};
  const key = id + JSON.stringify(G.stats);
  if (UI.reach[key] == null) UI.reach[key] = Math.round(simulateShot({ club: id, stats: G.stats, impact: PHYS.impactBase + 1e-6 }).carry);
  return UI.reach[key] + 'm';
}

function shotLabel() {
  if (G.phase === 'aim') return '샷';
  if (G.phase === 'power') return G.club === 'PT' ? '퍼팅' : '파워';
  if (G.phase === 'impact') return '임팩트';
  if (G.phase === 'intro') return '건너뛰기';
  return '···';
}

function gaugePercent(pos) { return ((pos - GAME.impactFloor) / (1 - GAME.impactFloor)) * 100; }

function syncHud() {
  syncPop();
  if (UI.inkFade > 0) { UI.inkFade = Math.max(0, UI.inkFade - 0.04); drawInk(); if (!UI.inkFade) UI.ink = []; }
  const hole = G.hole;
  if (!hole) return;
  setText($('holeNo'), 'H' + (G.holeIndex + 1));
  setText($('holePar'), 'PAR ' + hole.par);
  setText($('holeName'), hole.name);
  setText($('strokes'), G.strokes + '타');
  setText($('coins'), G.coins);
  const c = cupPos();
  setText($('pin'), Math.round(distToCup()) + 'm');
  const dh = heightAt(hole, c.x, c.z) - G.ball.y;
  setText($('pinUp'), Math.abs(dh) < 0.5 ? '평지' : (dh > 0 ? '▲' : '▼') + Math.abs(dh).toFixed(0) + 'm');
  const speed = Math.hypot(G.wind, G.windZ);
  setText($('windV'), speed.toFixed(1));
  // 화면에서 위쪽이 지금 조준 방향이다
  const windAng = (Math.atan2(G.windZ, G.wind) * 180) / Math.PI - G.yaw - 90;
  $('windArrow').style.transform = 'rotate(' + windAng + 'deg)';
  $('windBox').classList.toggle('strong', speed >= 4);
  const a = aimVector();
  const along = G.wind * a.x + G.windZ * a.z;
  setText($('windType'), speed < 0.4 ? '무풍' : Math.abs(along) < speed * 0.5 ? '옆바람' : along > 0 ? '뒷바람' : '맞바람');
  const canAdjust = G.phase === 'aim';
  document.querySelectorAll('.club').forEach((b) => {
    const id = b.dataset.club;
    b.classList.toggle('on', G.club === id);
    b.disabled = !canAdjust;
    setText(b.querySelector('small'), clubReachText(id));
  });
  syncSlope();
  drawPad();
  $('ballPad').classList.toggle('off', !canAdjust || G.club === 'PT');
  setText($('padInfo'), padText());
  $('cmdHelp').classList.toggle('live', G.phase === 'power' && G.club !== 'PT');
  $('cmdHelp').classList.toggle('hide', G.club === 'PT');
  const pinYaw = (Math.atan2(c.z - G.ball.z, c.x - G.ball.x) * 180) / Math.PI;
  const off = G.yaw - pinYaw;
  setText($('yawV'), Math.abs(off) < 0.25 ? '핀 방향' : (off < 0 ? '좌 ' : '우 ') + Math.abs(off).toFixed(off > -10 && off < 10 ? 1 : 0) + '°');
  $('shot').disabled = !(canAdjust || G.phase === 'power' || G.phase === 'impact' || G.phase === 'intro');
  setText($('shot'), shotLabel());
  $('shot').dataset.step = G.phase;
  $('gauge').dataset.step = G.phase;
  const putt = G.club === 'PT';
  $('gauge').classList.toggle('putt', putt);
  const gb = $('greenBtn');
  gb.classList.toggle('hide', G.phase !== 'aim');
  gb.classList.toggle('on', G.viewGreen);
  setText(gb, G.viewGreen ? '⛳ 공으로' : '⛳ 그린 보기');
  const zoneHalf = putt ? 0 : statFactors(G.stats).perfectHalf;
  const scale = 100 / (1 - GAME.impactFloor);
  $('gZone').style.left = gaugePercent(-zoneHalf) + '%';
  $('gZone').style.width = zoneHalf * 2 * scale + '%';
  const showPower = G.phase === 'power' || G.phase === 'impact' || G.phase === 'swing' || G.phase === 'ball';
  const fillTo = G.phase === 'power' ? G.gauge.pos : showPower ? G.gauge.power : 0;
  $('gFill').style.left = gaugePercent(0) + '%';
  $('gFill').style.width = fillTo * scale + '%';
  $('gMark').style.left = gaugePercent(G.phase === 'aim' ? 0 : G.gauge.pos) + '%';
  $('gMark').classList.toggle('hot', G.phase === 'impact');
  const shown = G.phase === 'power' ? G.gauge.pos : showPower ? G.gauge.power : 0;
  // 퍼팅은 평지에서 굴러갈 거리(게이지에 비례)로 보여 준다
  const gText = putt ? (shown * puttReach()).toFixed(1) + 'm / ' + puttReach().toFixed(0) + 'm' : Math.round(shown * 100) + '%';
  setText($('gPct'), G.command && G.phase !== 'aim' ? SPECIAL_SHOTS[G.command.id].icon + ' ' + SPECIAL_SHOTS[G.command.id].name : gText);
  const mini = $('mini');
  const x = mini.getContext('2d');
  x.setTransform(2, 0, 0, 2, 0, 0);
  drawMinimap(G, x, UI.miniW, UI.miniH);
}

function syncPop() {
  const el = $('pop');
  const p = G.pop;
  $('flash').style.opacity = G.flash.toFixed(3);
  if (!p) { el.classList.remove('show', 'big'); return; }
  el.classList.add('show');
  el.classList.toggle('big', !!p.big);
  setText($('popText'), p.text);
  setText($('popSub'), p.sub || '');
  $('popText').style.color = p.fill || '#ffe25a';
  const u = 1 - p.t / p.max;
  const inT = clamp(u / 0.14, 0, 1);
  const k = p.big ? 1 + (1 - inT) * 0.55 : 0.75 + inT * 0.25;
  el.style.opacity = clamp(p.t / 0.32, 0, 1);
  $('popText').style.transform = 'scale(' + k.toFixed(3) + ')';
}

function syncSlope() {
  const box = $('slopeBox');
  const show = G.club === 'PT' && (G.phase === 'aim' || G.phase === 'power' || G.phase === 'impact');
  box.classList.toggle('hide', !show);
  if (!show) return;
  const hole = G.hole, b = G.ball, c = cupPos();
  const dx = c.x - b.x, dz = c.z - b.z, d = Math.hypot(dx, dz) || 1;
  const g = gradAt(hole, (b.x + c.x) / 2, (b.z + c.z) / 2);
  const ux = dx / d, uz = dz / d;
  const along = (g[0] * ux + g[1] * uz) * 100;   // +면 오르막
  const cross = (-g[0] * uz + g[1] * ux) * 100;  // +면 오른쪽이 높음(공은 왼쪽으로 흐름)
  const pct = Math.hypot(along, cross);
  setText($('slopePct'), pct.toFixed(1) + '%');
  const parts = [];
  if (Math.abs(along) >= 0.3) parts.push((along > 0 ? '오르막 ' : '내리막 ') + Math.abs(along).toFixed(1));
  if (Math.abs(cross) >= 0.3) parts.push((cross > 0 ? '왼쪽으로 ' : '오른쪽으로 ') + Math.abs(cross).toFixed(1));
  setText($('slopeType'), parts.join(' · ') || '평지');
  box.dataset.level = pct < 1 ? 'low' : pct < 2.2 ? 'mid' : 'high';
  // 화살표는 조준 방향 기준으로 공이 흐르는 쪽을 가리킨다
  const down = (Math.atan2(-g[1], -g[0]) * 180) / Math.PI - G.yaw - 90;
  $('slopeArrow').style.transform = 'rotate(' + down + 'deg)';
  $('slopeArrow').style.opacity = pct < 0.3 ? 0.25 : 1;
}

/* ───────── 화면 전환 ───────── */

function showTitle(flag) {
  $('title').classList.toggle('show', flag);
  $('hud').classList.toggle('hide', flag);
  $('panel').classList.toggle('hide', flag);
  $('mini').classList.toggle('hide', flag);
}

function beginGame() {
  SFX.unlock();
  showTitle(false);
  closeModal();
  startRound();
  resize();
}

function openModal(html, cls) {
  const m = $('modalBody');
  m.className = 'sheet ' + (cls || '');
  m.innerHTML = html;
  $('modal').classList.add('show');
}

function closeModal() { $('modal').classList.remove('show'); }

function totalDiffText(n) { return n === 0 ? 'E' : n > 0 ? '+' + n : String(n); }

function scoreTable() {
  let head = '', par = '', mine = '';
  let t = 0;
  HOLES.forEach((h, i) => {
    const s = G.scores[i];
    head += '<th>' + (i + 1) + '</th>';
    par += '<td>' + h.par + '</td>';
    let cls = '';
    if (s) {
      const d = s.strokes - s.par;
      t += d;
      cls = d < 0 ? 'under' : d > 0 ? 'over' : 'even';
    }
    mine += '<td class="' + cls + '">' + (s ? s.strokes : '·') + '</td>';
  });
  return '<table class="score"><tr><th>홀</th>' + head + '<th>합</th></tr><tr><th>파</th>' + par + '<td>' + HOLES.reduce((a, h) => a + h.par, 0) + '</td></tr><tr><th>나</th>' + mine + '<td class="sum">' + totalDiffText(t) + '</td></tr></table>';
}

function showHoleResult(earned) {
  const last = G.scores[G.scores.length - 1];
  const name = scoreName(last.strokes - last.par, last.strokes);
  const more = G.holeIndex + 1 < HOLES.length;
  openModal('<h2>' + name + '</h2><p class="sub">' + G.hole.name + ' · ' + last.strokes + '타</p>' + scoreTable() +
    '<p class="reward">코인 <b>+' + earned + '</b> <span>퍼펙트 ' + G.perfects + '회</span></p>' +
    '<div class="row"><button class="ghost" id="mShop">상점</button><button class="primary" id="mNext">' + (more ? '다음 홀' : '결과 보기') + '</button></div>');
  $('mNext').onclick = () => { closeModal(); nextHole(); resize(); };
  $('mShop').onclick = () => openShop(true);
}

function showRoundResult(total) {
  showTitle(true);
  resize();
  openModal('<h2>라운드 종료</h2><p class="sub">최종 ' + totalDiffText(total) + ' · 최고 ' + totalDiffText(G.best) + '</p>' + scoreTable() +
    '<div class="row"><button class="primary" id="mDone">확인</button></div>');
  $('mDone').onclick = closeModal;
}

/* ───────── 상점 ───────── */

function statLine(stats) {
  const parts = [];
  for (const k of STAT_KEYS) if (stats[k]) parts.push(STAT_NAMES[k] + ' ' + (isFullStats(stats) ? stats[k] : '+' + stats[k]));
  return parts.join(' · ') || '능력 변화 없음';
}

function isFullStats(stats) { return stats.power != null && stats.control != null && stats.impact != null && stats.spin != null; }

function openShop(fromResult) {
  UI.shopBack = !!fromResult;
  openModal('<div class="shopHead"><h2>상점</h2><span class="purse">🪙 <b id="shopCoins"></b></span><button class="ghost close" id="shopClose">닫기</button></div>' +
    '<div class="stats" id="shopStats"></div><div class="tabs" id="shopTabs"></div><div class="grid" id="shopGrid"></div>', 'shop');
  $('shopClose').onclick = () => {
    if (UI.shopBack) showHoleResult(G.scores[G.scores.length - 1].earned); else closeModal();
  };
  const tabs = $('shopTabs');
  SLOT_ORDER.forEach((slot) => {
    const b = document.createElement('button');
    b.textContent = SLOT_NAMES[slot];
    b.dataset.slot = slot;
    b.onclick = () => { shopSlot = slot; renderShop(); SFX.play('ui'); };
    tabs.appendChild(b);
  });
  renderShop();
}

function renderShop() {
  setText($('shopCoins'), G.coins);
  const st = $('shopStats');
  st.innerHTML = STAT_KEYS.map((k) => {
    const v = G.stats[k];
    return '<div class="stat"><label>' + STAT_NAMES[k] + '</label><i><u style="width:' + clamp(v * 3.2, 4, 100) + '%"></u></i><b>' + v + '</b></div>';
  }).join('');
  document.querySelectorAll('#shopTabs button').forEach((b) => b.classList.toggle('on', b.dataset.slot === shopSlot));
  const grid = $('shopGrid');
  grid.innerHTML = '';
  ITEMS[shopSlot].forEach((item) => {
    const owned = !!G.owned[item.id];
    const worn = G.equip[shopSlot] === item.id;
    const card = document.createElement('div');
    card.className = 'card' + (worn ? ' worn' : '');
    const icon = itemIcon(shopSlot, item, 112);
    icon.className = 'icon';
    card.appendChild(icon);
    const info = document.createElement('div');
    info.className = 'info';
    info.innerHTML = '<b></b><small></small>';
    info.querySelector('b').textContent = item.name;
    info.querySelector('small').textContent = statLine(item.stats);
    if (item.passive) {
      const tag = document.createElement('span');
      tag.className = 'passive';
      tag.textContent = item.passive.text;
      info.appendChild(tag);
    }
    card.appendChild(info);
    const btn = document.createElement('button');
    btn.textContent = worn ? '장착 중' : owned ? '장착' : '🪙 ' + item.price;
    btn.disabled = worn || (!owned && G.coins < item.price);
    btn.className = owned ? 'ghost' : 'primary';
    btn.onclick = () => buyOrEquip(shopSlot, item);
    card.appendChild(btn);
    grid.appendChild(card);
  });
}

function buyOrEquip(slot, item) {
  if (!G.owned[item.id]) {
    if (G.coins < item.price) return;
    G.coins -= item.price;
    G.owned[item.id] = true;
    SFX.play('coin');
  }
  G.equip[slot] = item.id;
  refreshStats();
  saveGame();
  renderShop();
}

function openCredits() {
  openModal('<h2>크레딧</h2><p class="credit">3D 캐릭터: <b>VRoid 프로젝트</b> 샘플 모델 (CC0)<br>하늘·나무: <b>Poly Haven</b> (CC0)<br>입자: <b>Kenney</b> (CC0) · 잔디·흙·모래: <b>ambientCG</b> (CC0)<br>렌더링·물 질감: <b>three.js</b> (MIT)<br>효과음: WebAudio 직접 합성</p><div class="row"><button class="primary" id="mDone">닫기</button></div>');
  $('mDone').onclick = closeModal;
}

function buildTitle() {
  const row = $('lineup');
  ITEMS.char.forEach((c, i) => {
    const im = new Image();
    im.src = MODELS.icons['char:' + c.id];
    im.alt = c.name;
    im.style.setProperty('--d', i * 0.12 + 's');
    row.appendChild(im);
  });
  $('playBtn').onclick = beginGame;
  $('titleShop').onclick = () => { SFX.unlock(); openShop(); };
  $('creditBtn').onclick = openCredits;
}

/* ───────── 시작 ───────── */

var lastFrame = 0;
var GAME_SPEED_KEY = '__speed';

function frame(now) {
  const dt = Math.min(0.05, (now - lastFrame) / 1000 || 0.016) * (window[GAME_SPEED_KEY] || 1);
  lastFrame = now;
  updateGame(dt);
  renderGame(G);
  syncHud();
}

function rafLoop(now) {
  frame(now);
  requestAnimationFrame(rafLoop);
}

async function boot() {
  canvas = $('c');
  G.test = /[?&]test/.test(location.search);
  if (G.test) SFX.muted = true;
  loadGame();
  await initView(canvas);
  G.titleHole = HOLES[0];
  rollHoleLayout(G.titleHole, 1234);
  buildControls();
  buildTitle();
  resize();
  window.addEventListener('resize', resize);
  $('loading').remove();
  showTitle(true);
  resize();
  // ?test&manual: 자동 시험용. 시간을 직접 진행하고 한 번만 그린다
  if (/manual/.test(location.search)) {
    window.__step = (sec) => {
      for (let t = 0; t < sec; t += 1 / 60) updateGame(1 / 60);
      renderGame(G);
      syncHud();
    };
  } else if (G.test) setInterval(() => frame(performance.now()), 16);
  else requestAnimationFrame(rafLoop);
}

window.addEventListener('DOMContentLoaded', () => {
  boot().catch((e) => {
    console.error(e);
    $('loading').textContent = '3D 화면을 시작하지 못했습니다. WebGL을 켠 브라우저에서 다시 열어 주세요.';
  });
});
