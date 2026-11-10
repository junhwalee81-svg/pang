/* DOM 화면, 입력, 상점, 게임 루프. */

var UI = {};
var shopSlot = 'char';
var canvas;

function $(id) { return document.getElementById(id); }

function setText(el, v) { if (el.textContent !== String(v)) el.textContent = v; }

function resize() {
  const W = window.innerWidth, H = window.innerHeight;
  const hudBox = $('hud').getBoundingClientRect();
  const panelH = $('panel').offsetHeight || 190;
  const top = hudBox.height ? hudBox.bottom : 54;
  G.view.W = W;
  G.view.H = H;
  // 조작판을 뺀 영역의 가운데가 화면 중심이 되도록 카메라를 민다
  const wide = W >= 900;
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
  UI.miniW = mw;
  UI.miniH = mh;
}

/* ───────── HUD ───────── */

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
  const row = $('specials');
  SPECIAL_ORDER.forEach((id) => {
    const b = document.createElement('button');
    b.className = 'special';
    b.dataset.special = id;
    b.innerHTML = '<b>' + SPECIAL_SHOTS[id].name + '</b><small>' + SPECIAL_SHOTS[id].desc + '</small>';
    b.addEventListener('pointerdown', (e) => { e.preventDefault(); SFX.unlock(); setSpecial(id); });
    row.appendChild(b);
  });
  const bind = (id, fn) => $(id).addEventListener('pointerdown', (e) => { e.preventDefault(); SFX.unlock(); fn(); });
  const hold = (id, fn) => {
    const el = $(id);
    let timer = null;
    const stop = () => { clearInterval(timer); timer = null; };
    el.addEventListener('pointerdown', (e) => { e.preventDefault(); SFX.unlock(); fn(); timer = setInterval(fn, 70); });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach((n) => el.addEventListener(n, stop));
  };
  hold('yawLeft', () => setYaw(G.club === 'PT' ? -0.5 : -1));
  hold('yawRight', () => setYaw(G.club === 'PT' ? 0.5 : 1));
  bind('angleDown', () => setAngle(-1));
  bind('angleUp', () => setAngle(1));
  bind('spinTop', () => setSpin(-0.25));
  bind('spinBack', () => setSpin(0.25));
  bind('shot', () => pressShot());
  bind('shopBtn', () => openShop());
  // 화면을 좌우로 끌어 조준한다
  let drag = null;
  canvas.addEventListener('pointerdown', (e) => {
    SFX.unlock();
    if (G.phase === 'power' || G.phase === 'impact' || G.phase === 'intro') { pressShot(); return; }
    if (G.phase === 'aim') drag = { x: e.clientX };
  });
  window.addEventListener('pointermove', (e) => {
    if (!drag || G.phase !== 'aim') return;
    const dx = e.clientX - drag.x;
    drag.x = e.clientX;
    setYaw(dx * (G.club === 'PT' ? 0.05 : 0.14));
  });
  window.addEventListener('pointerup', () => { drag = null; });
  window.addEventListener('keydown', (e) => {
    if ($('modal').classList.contains('show') || $('title').classList.contains('show')) return;
    SFX.unlock();
    if (e.code === 'KeyQ') setSpecial('tomahawk');
    if (e.code === 'KeyE') setSpecial('spike');
    if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); if (!e.repeat) pressShot(); }
    else if (e.code === 'ArrowLeft') setYaw(-1);
    else if (e.code === 'ArrowRight') setYaw(1);
    else if (e.code === 'ArrowUp') setAngle(1);
    else if (e.code === 'ArrowDown') setAngle(-1);
    else if (e.code === 'KeyZ') setSpin(-0.25);
    else if (e.code === 'KeyX') setSpin(0.25);
    else if (/^Digit[1-4]$/.test(e.code)) setClub(CLUB_ORDER[+e.code.slice(5) - 1]);
  });
}

function clubReachText(id) {
  if (id === 'PT') return Math.round(CLUB_TYPES.PT.v0 * CLUB_TYPES.PT.v0 / (2 * TERRAIN.green.mu * PHYS.g)) + 'm';
  UI.reach = UI.reach || {};
  const key = id + JSON.stringify(G.stats);
  if (UI.reach[key] == null) UI.reach[key] = Math.round(simulateShot({ club: id, stats: G.stats }).carry);
  return UI.reach[key] + 'm';
}

function shotLabel() {
  if (G.phase === 'aim') return '샷 시작';
  if (G.phase === 'power') return '파워!';
  if (G.phase === 'impact') return '임팩트!';
  if (G.phase === 'intro') return '건너뛰기';
  return '···';
}

function gaugePercent(pos) { return ((pos - GAME.impactFloor) / (1 - GAME.impactFloor)) * 100; }

function syncHud() {
  syncPop();
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
  const unlocked = specialUnlocked();
  $('specialLock').classList.toggle('hide', unlocked);
  setText($('specialLock'), '🔒 이번 홀 팡 ' + Math.min(G.perfects, SPECIAL_UNLOCK) + '/' + SPECIAL_UNLOCK + ' — 2회면 특수샷 해금');
  document.querySelectorAll('.special').forEach((b) => {
    b.classList.toggle('hide', !unlocked);
    b.classList.toggle('on', G.special === b.dataset.special);
    b.classList.toggle('tomahawk', b.dataset.special === 'tomahawk');
    b.disabled = !canAdjust || G.club === 'PT';
  });
  const club = CLUB_TYPES[G.club];
  setText($('angleV'), G.club === 'PT' ? '–' : Math.round(club.loft + G.angle + (G.special ? SPECIAL_SHOTS[G.special].loftAdd : 0)) + '°');
  setText($('spinV'), G.club === 'PT' ? '–' : spinLabel());
  $('spinDot').style.transform = 'translateY(' + G.spin * 9 + 'px)';
  const pinYaw = (Math.atan2(c.z - G.ball.z, c.x - G.ball.x) * 180) / Math.PI;
  const off = G.yaw - pinYaw;
  setText($('yawV'), Math.abs(off) < 0.25 ? '핀' : (off < 0 ? '좌 ' : '우 ') + Math.abs(off).toFixed(off > -10 && off < 10 ? 1 : 0) + '°');
  $('shot').disabled = !(canAdjust || G.phase === 'power' || G.phase === 'impact' || G.phase === 'intro');
  setText($('shot'), shotLabel());
  $('shot').dataset.step = G.phase;
  const zoneHalf = statFactors(G.stats).perfectHalf;
  const scale = 100 / (1 - GAME.impactFloor);
  $('gZone').style.left = gaugePercent(-zoneHalf) + '%';
  $('gZone').style.width = zoneHalf * 2 * scale + '%';
  const showPower = G.phase === 'power' || G.phase === 'impact' || G.phase === 'swing' || G.phase === 'ball';
  const fillTo = G.phase === 'power' ? G.gauge.pos : showPower ? G.gauge.power : 0;
  $('gFill').style.left = gaugePercent(0) + '%';
  $('gFill').style.width = fillTo * scale + '%';
  $('gMark').style.left = gaugePercent(G.phase === 'aim' ? 0 : G.gauge.pos) + '%';
  $('gMark').classList.toggle('hot', G.phase === 'impact');
  setText($('gPct'), Math.round((G.phase === 'power' ? G.gauge.pos : showPower ? G.gauge.power : 0) * 100) + '%');
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

function spinLabel() {
  if (G.spin === 0) return '없음';
  return (G.spin > 0 ? '백 ' : '톱 ') + Math.round(Math.abs(G.spin) * 100) + '%';
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
  openModal('<h2>크레딧</h2><p class="credit">3D 캐릭터: <b>Quaternius</b> (CC0)<br>하늘·나무·물 질감: <b>Poly Haven</b> (CC0), three.js (MIT)<br>입자: <b>Kenney</b> (CC0) · 잔디·흙·모래: <b>ambientCG</b> (CC0)<br>렌더링: <b>three.js</b> (MIT)<br>효과음: WebAudio 직접 합성</p><div class="row"><button class="primary" id="mDone">닫기</button></div>');
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
