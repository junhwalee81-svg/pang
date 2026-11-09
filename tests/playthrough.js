// 실제 브라우저로 한 홀 이상 끝까지 쳐 보고 화면을 찍는다.
// 사용: NODE_PATH=<playwright-core 폴더> node tests/playthrough.js <출력 폴더>
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright-core');

const OUT = process.argv[2] || path.join(__dirname, 'out');
fs.mkdirSync(OUT, { recursive: true });
const URL = 'file:///' + path.resolve(__dirname, '..', 'index.html').replace(/\\/g, '/') + '?test';

async function waitPhase(page, names, ms) {
  await page.waitForFunction((n) => n.includes(G.phase), names, { timeout: ms || 40000 });
}

async function shoot(page, power, impact) {
  await page.evaluate(() => pressShot());
  await page.evaluate((p) => { G.gauge.pos = p; pressShot(); G.gauge.pos = 0; }, power);
  await page.evaluate((e) => { G.gauge.pos = e; pressShot(); }, impact);
}

async function run(width, height, name) {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(URL);
  await page.waitForFunction(() => ART.ready && document.getElementById('title').classList.contains('show'));
  await page.screenshot({ path: path.join(OUT, name + '_1title.png') });
  await page.evaluate(() => { window.__speed = 1; beginGame(); readyNextShot(); });
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(OUT, name + '_2aim.png') });

  await page.evaluate(() => pressShot());
  await page.evaluate(() => { G.gauge.pos = 0.75; });
  await page.waitForTimeout(120);
  await page.screenshot({ path: path.join(OUT, name + '_3gauge.png') });
  await page.evaluate(() => { G.gauge.pos = 0.95; pressShot(); G.gauge.pos = 0; pressShot(); });
  await page.waitForTimeout(650);
  await page.screenshot({ path: path.join(OUT, name + '_4perfect.png') });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: path.join(OUT, name + '_5flight.png') });
  await page.evaluate(() => { window.__speed = 6; });
  await waitPhase(page, ['stopped', 'holed', 'aim']);
  const first = await page.evaluate(() => ({ x: G.ball.x, strokes: G.strokes, perfects: G.perfects, surface: surfaceAt(G.hole, G.ball.x) }));
  await page.evaluate(() => readyNextShot());

  await page.evaluate(() => placeBall(G.hole.cup - 40));
  await page.evaluate(() => { window.__speed = 1; });
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(OUT, name + '_6approach.png') });
  await page.evaluate(() => placeBall(G.hole.cup - 6));
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(OUT, name + '_7putt.png') });
  const club = await page.evaluate(() => G.club);
  await page.evaluate(() => { window.__speed = 4; });
  await shoot(page, 0.34, 0);
  await waitPhase(page, ['holed', 'stopped', 'score']);
  let guard = 0;
  while (guard++ < 6 && await page.evaluate(() => G.phase === 'stopped')) {
    await page.evaluate(() => { readyNextShot(); placeBall(G.hole.cup - 3); });
    await shoot(page, 0.13, 0);
    await waitPhase(page, ['holed', 'stopped', 'score']);
  }
  const holed = await page.evaluate(() => ({ phase: G.phase, holed: G.ball.holed, strokes: G.strokes }));
  await page.screenshot({ path: path.join(OUT, name + '_8holed.png') });
  await waitPhase(page, ['score']);
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(OUT, name + '_9score.png') });
  await page.evaluate(() => { closeModal(); readyNextShot(); });
  const next = await page.evaluate(() => ({ hole: G.holeIndex, phase: G.phase }));
  await page.evaluate(() => { window.__speed = 1; readyNextShot(); });
  await page.evaluate(() => placeBall(G.hole.cup - 150));
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(OUT, name + '_10hole2.png') });
  // 특수샷: 해금 전 잠김, 2회 후 선택 가능, 샷이 끝까지 진행
  const special = await page.evaluate(() => {
    G.perfects = 1; setSpecial('tomahawk');
    const locked = G.special === null;
    G.perfects = 2; setClub('5I'); setSpecial('tomahawk');
    const hi = simulateShot(shotOptions()); setSpecial('spike');
    const lo = simulateShot(shotOptions());
    return { locked, pick: G.special, hiApex: hi.apex, loApex: lo.apex, hiRun: hi.total - hi.carry, loRun: lo.total - lo.carry };
  });
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(OUT, name + '_12special.png') });
  await page.evaluate(() => { window.__speed = 6; });
  await shoot(page, 0.7, 0);
  await waitPhase(page, ['stopped', 'holed']);
  console.log('special', JSON.stringify(special));
  if (!special.locked || special.pick !== 'spike' || !(special.hiApex > special.loApex) || !(special.loRun > special.hiRun)) errors.push('special check failed');
  await page.evaluate(() => { readyNextShot(); window.__speed = 1; });
  // 장애물: 돌·나무가 화면에 보이고, 게임 안에서 충돌 이벤트가 처리되는지
  await page.evaluate(() => {
    if (!['aim', 'stopped', 'intro', 'ball'].includes(G.phase)) readyNextShot();
    const L = G.hole.layout;
    placeBall(L.rocks[0].x - 9);
    L.trees.push({ x: G.ball.x + 34, h: 30, r: 14, kind: L.trees[0].kind });
    window.__ev = [];
    const orig = window.handleBallEvent;
    window.handleBallEvent = (e) => { window.__ev.push(e.kind); orig(e); };
    setClub('5I');
    window.__speed = 1;
  });
  await page.waitForTimeout(350);
  await page.screenshot({ path: path.join(OUT, name + '_14hazard.png') });
  await shoot(page, 1, 0.1);
  await page.waitForFunction(() => window.__ev.includes('tree') || G.phase === 'stopped', null, { timeout: 15000 });
  await page.waitForTimeout(160);
  await page.screenshot({ path: path.join(OUT, name + '_15treehit.png') });
  await page.evaluate(() => { window.__speed = 6; });
  await waitPhase(page, ['stopped', 'holed']);
  const hazardEvents = await page.evaluate(() => { const list = window.__ev.slice(); G.hole.layout.trees.pop(); readyNextShot(); window.__speed = 1; return list; });
  console.log('hazard events', JSON.stringify(hazardEvents));
  if (!hazardEvents.includes('tree')) errors.push('tree event missing');
  // 합성음: 오프라인으로 렌더해 무음·찢어짐이 없는지 측정
  const audio = await page.evaluate(async () => {
    const list = [['whoosh'], ['hit', '1W'], ['hit', '5I'], ['hit', 'SW'], ['hit', 'PT'], ['hitPerfect', '1W'], ['bounce', 'fairway'], ['bounce', 'green'], ['bounce', 'bunker'], ['splash'], ['cup'], ['lip'], ['rock'], ['leaves', true], ['trunk'], ['coin'], ['fanfare']];
    const out = {};
    for (const [name, arg] of list) {
      const ctx = new OfflineAudioContext(1, 44100 * 1.8, 44100);
      SFX.compose(ctx, SFX.makeBus(ctx), name, 0.01, arg);
      const d = (await ctx.startRendering()).getChannelData(0);
      let peak = 0, sum = 0, last = 0;
      for (let i = 0; i < d.length; i++) { const a = Math.abs(d[i]); if (a > peak) peak = a; sum += a * a; if (a > 0.003) last = i; }
      out[name + (arg ? ':' + arg : '')] = [+peak.toFixed(2), +Math.sqrt(sum / d.length).toFixed(3), +(last / 44100).toFixed(2)];
    }
    return out;
  });
  console.log('audio [최대, RMS, 길이초]', JSON.stringify(audio));
  for (const k in audio) if (audio[k][0] < 0.05 || audio[k][0] >= 1 || audio[k][2] <= 0) errors.push('audio ' + k);
  if (audio.cup[2] < 0.6) errors.push('cup too short');
  // 그린 경사: 퍼터일 때만 표시, 수치·방향이 데이터와 맞는지
  const slope = await page.evaluate(() => {
    const g = G.hole.green;
    placeBall(g.from + 2);
    const pt = { club: G.club, shown: !document.getElementById('slopeBox').classList.contains('hide') };
    return { pt, slopeData: g.slope, expected: slopeBetween(G.hole, G.ball.x, G.hole.cup) * 100 };
  });
  await page.waitForTimeout(350);
  const shownSlope = await page.evaluate(() => ({ pct: document.getElementById('slopePct').textContent, type: document.getElementById('slopeType').textContent, visible: !document.getElementById('slopeBox').classList.contains('hide') }));
  await page.screenshot({ path: path.join(OUT, name + '_13slope.png') });
  const hidden = await page.evaluate(async () => { placeBall(G.hole.cup - 120); await new Promise((r) => setTimeout(r, 120)); return document.getElementById('slopeBox').classList.contains('hide'); });
  console.log('slope', JSON.stringify({ slope, shownSlope, hidden }));
  if (slope.pt.club !== 'PT' || !shownSlope.visible || !hidden || Math.abs(parseFloat(shownSlope.pct) - Math.abs(slope.expected)) > 0.11) errors.push('slope check failed');
  // 패시브: 캐릭터별 효과가 실제 수치에 반영되는지
  const passive = await page.evaluate(() => {
    placeBall(G.hole.cup - 150);
    const out = {};
    const wear = (id) => { G.equip.char = id; G.stats = Object.assign({}, BASE_STATS); recomputeMarker(); };
    G.wind = 6;
    wear('kai'); G.club = '1W';
    const kai = launchFrom(shotOptions()).v;
    out.kaiCarry = simulateShot(shotOptions({ hole: undefined, x: 0, lie: 1 })).carry;
    wear('leo'); G.club = '1W';
    out.baseCarry = simulateShot(shotOptions({ hole: undefined, x: 0, lie: 1 })).carry;
    out.leoWind = shotEnv(shotOptions({ wind: 6 })).windMul;
    out.driverFaster = kai > launchFrom(shotOptions()).v;
    wear('mina'); G.club = 'PT';
    out.minaPutt = Math.abs(launchFrom(shotOptions({ power: 0.5, impact: 0.12 })).v - launchFrom(shotOptions({ power: 0.5, impact: 0.022 })).v);
    wear('leo'); G.club = 'PT';
    out.leoPutt = Math.abs(launchFrom(shotOptions({ power: 0.5, impact: 0.12 })).v - launchFrom(shotOptions({ power: 0.5, impact: 0.022 })).v);
    wear('sora'); G.club = 'SW';
    out.soraBack = shotEnv(shotOptions()).backMul;
    wear('gbot'); G.club = '1W'; recomputeMarker(); const windy = G.markerX;
    wear('leo'); G.club = '1W'; recomputeMarker(); out.markerDiff = windy - G.markerX;
    wear('zombie'); const c0 = G.coins; onPerfect(); out.zombieCoins = G.coins - c0;
    wear('leo'); const c1 = G.coins; onPerfect(); out.leoCoins = G.coins - c1;
    G.perfects = 0; G.pop = null; G.flash = 0; G.wind = 0; recomputeMarker();
    return out;
  });
  console.log('passive', JSON.stringify(passive));
  const ratio = passive.kaiCarry / passive.baseCarry;
  if (passive.leoWind !== 0.9 || !(ratio > 1.04 && ratio < 1.06) || !(passive.minaPutt < passive.leoPutt) || passive.soraBack !== 1.3 || Math.abs(passive.markerDiff) < 1 || passive.zombieCoins !== passive.leoCoins * 2) errors.push('passive check failed');
  await page.evaluate(() => openShop());
  await page.waitForTimeout(150);
  await page.screenshot({ path: path.join(OUT, name + '_11shop.png') });
  await browser.close();
  console.log(name, JSON.stringify({ first, putter: club, holed, next, errors }));
  return errors.length === 0 && first.perfects === 1 && club === 'PT' && holed.holed && next.hole === 1;
}

(async () => {
  const a = await run(400, 800, 'w400');
  const b = await run(1200, 800, 'w1200');
  console.log(a && b ? '통과' : '실패');
  process.exit(a && b ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
