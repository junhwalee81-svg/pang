/* DOM 화면, 입력, 상점, 게임 루프. */

var UI = {};
var shopSlot = 'char';
var canvas, ctx2d;

function $(id) { return document.getElementById(id); }

function setText(el, v) { if (el.textContent !== String(v)) el.textContent = v; }

function resize() {
  const W = window.innerWidth, H = window.innerHeight;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  canvas.style.width = W + 'px';
  canvas.style.height = H + 'px';
  ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
  const hudBox = $('hud').getBoundingClientRect();
  const top = (hudBox.height ? hudBox.bottom : 54) + 4;
  const panelH = $('panel').offsetHeight;
  const miniH = 50;
  G.view.W = W;
  G.view.H = H;
  G.view.miniY = top;
  G.view.playTop = top + miniH;
  G.view.playH = Math.max(160, H - (panelH || 180) - G.view.playTop);
  G.view.cy = G.view.playTop + G.view.playH * 0.5;
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
  const bind = (id, fn) => $(id).addEventListener('pointerdown', (e) => { e.preventDefault(); SFX.unlock(); fn(); });
  bind('angleDown', () => setAngle(-1));
  bind('angleUp', () => setAngle(1));
  bind('spinTop', () => setSpin(-0.25));
  bind('spinBack', () => setSpin(0.25));
  bind('shot', () => pressShot());
  bind('shopBtn', () => openShop());
  canvas.addEventListener('pointerdown', () => {
    SFX.unlock();
    if (G.phase === 'power' || G.phase === 'impact' || G.phase === 'intro') pressShot();
  });
  window.addEventListener('keydown', (e) => {
    if ($('modal').classList.contains('show') || $('title').classList.contains('show')) return;
    SFX.unlock();
    if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); if (!e.repeat) pressShot(); }
    else if (e.code === 'ArrowUp') setAngle(1);
    else if (e.code === 'ArrowDown') setAngle(-1);
    else if (e.code === 'ArrowLeft') setSpin(-0.25);
    else if (e.code === 'ArrowRight') setSpin(0.25);
    else if (/^Digit[1-4]$/.test(e.code)) setClub(CLUB_ORDER[+e.code.slice(5) - 1]);
  });
}

function clubReach(id) {
  if (id === 'PT') return Math.round(CLUB_TYPES.PT.v0 * CLUB_TYPES.PT.v0 / (2 * TERRAIN.green.mu * PHYS.g)) + 'm';
  return Math.round(simulateShot({ club: id, stats: G.stats }).carry) + 'm';
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
  const hole = G.hole;
  if (!hole) return;
  setText($('holeNo'), 'H' + (G.holeIndex + 1));
  setText($('holePar'), 'PAR ' + hole.par);
  setText($('holeName'), hole.name);
  setText($('strokes'), G.strokes + '타');
  setText($('coins'), G.coins);
  setText($('pin'), Math.abs(Math.round(hole.cup - G.ball.x)) + 'm');
  setText($('windV'), Math.abs(G.wind).toFixed(1));
  $('windArrow').style.transform = 'rotate(' + (G.wind >= 0 ? 0 : 180) + 'deg)';
  $('windBox').classList.toggle('strong', Math.abs(G.wind) >= 4);
  setText($('windType'), G.wind === 0 ? '무풍' : G.wind > 0 ? '뒷바람' : '맞바람');
  const canAdjust = G.phase === 'aim';
  document.querySelectorAll('.club').forEach((b) => {
    const id = b.dataset.club;
    b.classList.toggle('on', G.club === id);
    b.disabled = !canAdjust;
    setText(b.querySelector('small'), clubReach(id));
  });
  const c = CLUB_TYPES[G.club];
  setText($('angleV'), G.club === 'PT' ? '–' : Math.round(c.loft + G.angle) + '°');
  setText($('spinV'), G.club === 'PT' ? '–' : spinLabel());
  $('spinDot').style.transform = 'translateY(' + (-G.spin * -11) + 'px)';
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
  openModal('<h2>라운드 종료</h2><p class="sub">최종 ' + totalDiffText(total) + ' · 최고 ' + totalDiffText(G.best) + '</p>' + scoreTable() +
    '<div class="row"><button class="primary" id="mDone">확인</button></div>');
  $('mDone').onclick = closeModal;
}

/* ───────── 상점 ───────── */

function statLine(stats) {
  const parts = [];
  for (const k of STAT_KEYS) if (stats[k]) parts.push(STAT_NAMES[k] + ' ' + (G_isChar(stats) ? stats[k] : '+' + stats[k]));
  return parts.join(' · ') || '능력 변화 없음';
}

function G_isChar(stats) { return stats.power != null && stats.control != null && stats.impact != null && stats.spin != null; }

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
  openModal('<h2>크레딧</h2><p class="credit">캐릭터·나무·구름·입자·글꼴: <b>Kenney</b> (CC0)<br>잔디·흙·모래 질감: <b>ambientCG</b> (CC0)<br>효과음: WebAudio 직접 합성</p><div class="row"><button class="primary" id="mDone">닫기</button></div>');
  $('mDone').onclick = closeModal;
}

function buildTitle() {
  const row = $('lineup');
  ITEMS.char.forEach((c, i) => {
    const im = new Image();
    im.src = ASSETS.char[c.id].cheer0;
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
  syncHud();
  renderGame(ctx2d, G);
}

function rafLoop(now) {
  frame(now);
  requestAnimationFrame(rafLoop);
}

async function boot() {
  canvas = $('c');
  ctx2d = canvas.getContext('2d');
  G.test = /[?&]test/.test(location.search);
  if (G.test) SFX.muted = true;
  loadGame();
  await ART.load();
  buildControls();
  buildTitle();
  resize();
  window.addEventListener('resize', resize);
  $('loading').remove();
  showTitle(true);
  resize();
  if (G.test) setInterval(() => frame(performance.now()), 16);
  else requestAnimationFrame(rafLoop);
}

window.addEventListener('DOMContentLoaded', () => {
  boot().catch((e) => {
    console.error(e);
    $('loading').textContent = '불러오기에 실패했습니다. 새로고침해 주세요.';
  });
});
