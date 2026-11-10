// 실제 브라우저(WebGL)로 샷→퍼팅→홀아웃→다음 홀과 전 기능을 확인하고 화면을 찍는다.
// 사용: NODE_PATH=<playwright-core 폴더> node tests/playthrough.js <출력 폴더>
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright-core');

const OUT = process.argv[2] || path.join(__dirname, 'out');
fs.mkdirSync(OUT, { recursive: true });
const URL = 'file:///' + path.resolve(__dirname, '..', 'index.html').replace(/\\/g, '/') + '?test&manual';
const ARGS = ['--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'];

const step = (page, sec) => page.evaluate((s) => window.__step(s), sec);
const until = (page, names, max) => page.evaluate(([n, m]) => {
  for (let t = 0; t < m && !n.includes(G.phase); t += 1 / 60) updateGame(1 / 60);
  renderGame(G);
  syncHud();
  return G.phase;
}, [names, max || 40]);

async function shoot(page, power, impact, yaw) {
  await page.evaluate(([p, e, y]) => {
    if (y !== undefined) setYaw(y - G.yaw);
    pressShot();
    G.gauge.pos = p; pressShot();
    G.gauge.pos = e; pressShot();
  }, [power, impact, yaw]);
}

/** 그린의 경사를 읽어 들어가는 세기·방향을 찾는다 */
const findPutt = (page) => page.evaluate(() => {
  const c = cupPos();
  const base = (Math.atan2(c.z - G.ball.z, c.x - G.ball.x) * 180) / Math.PI;
  for (let d = 0; d <= 8; d += 0.25) {
    for (const sign of [1, -1]) {
      const yaw = base + sign * d;
      for (let p = 0.02; p < 1; p += 0.006) {
        if (simulateShot(shotOptions({ power: p, yaw, ignoreHazards: true })).holed) return { power: p + 0.012, yaw };
      }
    }
  }
  return null;
});

async function run(width, height, name) {
  const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ARGS });
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  const snap = (n) => page.screenshot({ path: path.join(OUT, name + '_' + n + '.png'), timeout: 120000 });
  await page.goto(URL);
  await page.waitForFunction(() => VIEW.ready && document.getElementById('title').classList.contains('show'), null, { timeout: 120000 });
  await step(page, 0.05);
  await snap('1title');
  await page.evaluate(() => { beginGame(); readyNextShot(); });
  await step(page, 0.6);
  await snap('2aim');

  // 퍼펙트 드라이버 샷
  await page.evaluate(() => { pressShot(); G.gauge.pos = 0.95; pressShot(); G.gauge.pos = 0; pressShot(); });
  await step(page, 0.26);
  await snap('3perfect');
  await step(page, 2);
  await snap('4flight');
  await until(page, ['stopped', 'holed']);
  const first = await page.evaluate(() => ({ x: G.ball.x, z: G.ball.z, strokes: G.strokes, perfects: G.perfects, surface: surfaceAt(G.hole, G.ball.x, G.ball.z) }));
  await page.evaluate(() => readyNextShot());

  await page.evaluate(() => placeBall(G.hole.green.from - 40));
  await step(page, 0.5);
  await snap('5approach');
  await page.evaluate(() => { const c = cupPos(); placeBall(c.x - 6, c.z + 1.5); });
  await step(page, 0.5);
  await snap('6putt');
  const club = await page.evaluate(() => G.club);
  const putt = await findPutt(page);
  if (!putt) errors.push('putt not found');
  const puttOnce = await page.evaluate(([p, y]) => { setYaw(y - G.yaw); pressShot(); G.gauge.pos = p; pressShot(); return G.phase; }, [putt.power, putt.yaw]);
  if (puttOnce !== 'swing') errors.push('putt single press failed ' + puttOnce);
  await until(page, ['holed', 'stopped', 'score']);
  const holed = await page.evaluate(() => ({ phase: G.phase, holed: G.ball.holed, strokes: G.strokes }));
  await step(page, 0.8);
  await snap('7holed');
  await until(page, ['score'], 6);
  await step(page, 0.05);
  await snap('8score');
  await page.evaluate(() => readyNextShot());
  const next = await page.evaluate(() => ({ hole: G.holeIndex, phase: G.phase, modal: document.getElementById('modal').classList.contains('show') }));
  await page.evaluate(() => { resize(); readyNextShot(); placeBall(G.hole.cup - 150); });

  // 커맨드 특수샷: 게이지가 오를 때 입력하고, 임팩트가 판정 폭 안일 때만 나간다
  const special = await page.evaluate(() => {
    setClub('5I');
    const flat = { hole: undefined, x: 0, z: 0, yaw: 0, lie: 1 };
    const hi = simulateShot(shotOptions(Object.assign({ special: 'tomahawk' }, flat)));
    const lo = simulateShot(shotOptions(Object.assign({ special: 'spike' }, flat)));
    const aimReject = inputCommand('tomahawk');
    const line = (x0, y0, x1, y1) => Array.from({ length: 12 }, (_, i) => ({ x: x0 + ((x1 - x0) * i) / 11, y: y0 + ((y1 - y0) * i) / 11 }));
    const circle = (dir) => Array.from({ length: 40 }, (_, i) => ({ x: 200 + 60 * Math.cos((dir * i * 6.6) / 39), y: 300 + 60 * Math.sin((dir * i * 6.6) / 39) }));
    const gest = [recognizeGesture(line(200, 400, 205, 250)), recognizeGesture(line(200, 250, 204, 400)), recognizeGesture(circle(1)), recognizeGesture(circle(-1)), recognizeGesture([{ x: 10, y: 10 }, { x: 12, y: 11 }])];
    return { hiApex: hi.apex, loApex: lo.apex, hiRun: hi.total - hi.carry, loRun: lo.total - lo.carry, aimReject, gest };
  });
  console.log('special', JSON.stringify(special));
  if (!(special.hiApex > special.loApex) || !(special.loRun > special.hiRun) || special.aimReject || special.gest.join() !== 'up,down,cw,ccw,dot') errors.push('special check failed');

  // 게이지는 천천히 오르고 꼭대기에서 잠깐 머문다
  const gaugeT = await page.evaluate(() => {
    pressShot(); let n = 0;
    while (G.gauge.dir > 0 && n < 1000) { updateGame(1 / 60); n++; }
    const rise = n / 60; let hold = 0;
    while (G.gauge.hold > 0 && hold < 200) { updateGame(1 / 60); hold++; }
    cancelShot(); G.pop = null;
    return { rise, hold: hold / 60 };
  });
  console.log('gauge', JSON.stringify(gaugeT));
  if (!(gaugeT.rise > 1.8 && gaugeT.hold > 0.25)) errors.push('gauge speed check failed');

  // 그린 보기: 조준 중에만, 카메라가 컵 쪽으로 간다
  const gv = await page.evaluate(() => {
    const c = cupPos();
    const d0 = Math.hypot(G.cam.lx - c.x, G.cam.lz - c.z);
    toggleGreenView(true); updateCamera(5);
    const d1 = Math.hypot(G.cam.lx - c.x, G.cam.lz - c.z);
    renderGame(G); syncHud();
    const btn = document.getElementById('greenBtn').textContent;
    return { d0, d1, btn };
  });
  await snap('9green');
  const gvOff = await page.evaluate(() => { pressShot(); const v = G.viewGreen; cancelShot(); G.pop = null; updateCamera(5); return v; });
  console.log('greenView', JSON.stringify(gv), gvOff);
  if (!(gv.d1 < 1 && gv.d0 > 50) || gvOff || gv.btn !== '⛳ 공으로') errors.push('green view check failed');

  // 임팩트를 놓치면 타수 없이 다시
  const cancel = await page.evaluate(() => {
    const s0 = G.strokes;
    pressShot(); G.gauge.pos = 0.6; pressShot();
    for (let t = 0; t < 3 && G.phase === 'impact'; t += 1 / 60) updateGame(1 / 60);
    return { phase: G.phase, same: G.strokes === s0 };
  });
  if (cancel.phase !== 'aim' || !cancel.same) errors.push('cancel failed ' + JSON.stringify(cancel));

  // 키보드 커맨드(↑↑) + 정확한 임팩트 → 토마호크
  await page.evaluate(() => { pressShot(); });
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowUp');
  const keyCmd = await page.evaluate(() => (G.command ? G.command.id : null));
  await step(page, 0.05);
  await snap('9command');
  await page.evaluate(() => { G.gauge.pos = 0.85; pressShot(); G.gauge.pos = 0; pressShot(); window.__step(0.3); });
  const fired = await page.evaluate(() => G.shotStyle);
  await until(page, ['stopped', 'holed']);
  await page.evaluate(() => readyNextShot());
  // 커맨드가 있어도 임팩트가 빗나가면 일반 샷
  const missed = await page.evaluate(() => {
    if (G.phase !== 'aim') readyNextShot();
    pressShot(); inputCommand('spike'); G.gauge.pos = 0.5; pressShot(); G.gauge.pos = 0.1; pressShot();
    for (let t = 0; t < 0.4; t += 1 / 60) updateGame(1 / 60);
    return { style: G.shotStyle, pop: G.pop && G.pop.text };
  });
  await until(page, ['stopped', 'holed']);
  await page.evaluate(() => readyNextShot());
  // 화면 제스처: 위로 긋기와 점 세 번
  const box = await page.evaluate(() => ({ w: innerWidth, h: innerHeight }));
  const cx = box.w * 0.5, cy = box.h * 0.32;
  // 앞 샷 결과(타수 초과 창 등)에 흔들리지 않게 깨끗한 조준 상태에서 시작한다
  const gPhase = await page.evaluate(() => { for (let i = 0; i < 4 && G.phase !== 'aim'; i++) readyNextShot(); closeModal(); G.strokes = 0; placeBall(G.hole.cup - 150); G.pop = null; window.__step(0.02); pressShot(); return G.phase; });
  if (gPhase !== 'power') errors.push('gesture setup ' + gPhase);
  await page.mouse.move(cx, cy + 90);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) await page.mouse.move(cx + i * 0.4, cy + 90 - i * 18);
  await page.mouse.up();
  const swipe = await page.evaluate(() => (G.command ? G.command.id : null));
  await page.evaluate(() => { G.command = null; });
  for (let i = 0; i < 3; i++) { await page.mouse.click(cx, cy); }
  const dots = await page.evaluate(() => (G.command ? G.command.id : null));
  await page.evaluate(() => { cancelShot(); G.pop = null; setClub('5I'); window.__step(0.02); });
  // 타점 공: 아래쪽을 누르면 백스핀과 높은 각도
  const padBox = await page.evaluate(() => { const r = document.getElementById('ballPad').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height * 0.85 }; });
  await page.mouse.click(padBox.x, padBox.y);
  const pad = await page.evaluate(() => ({ y: G.impactPt.y, spin: G.spin, angle: G.angle, curve: G.curve }));
  await step(page, 0.05);
  await snap('9pad');
  console.log('command', JSON.stringify({ keyCmd, fired, missed, swipe, dots, pad }));
  if (keyCmd !== 'tomahawk' || fired !== 'tomahawk' || missed.style === 'spike' || missed.pop !== '커맨드 실패' || swipe !== 'tomahawk' || dots !== 'dot' || !(pad.y > 0.5 && pad.angle > 0)) errors.push('command check failed');
  await page.evaluate(() => setImpactPoint(0, 0));

  await page.evaluate(() => readyNextShot());

  // 나무: 공의 실제 궤적 위에 시험용 나무를 놓아 충돌 이벤트를 확인한다
  const hazard = await page.evaluate(() => {
    if (!['aim', 'stopped', 'intro', 'ball'].includes(G.phase)) readyNextShot();
    placeBall(G.hole.tee[1] + 6, 0);
    setClub('5I');
    const L = G.hole.layout;
    window.__ev = [];
    const orig = window.handleBallEvent;
    window.handleBallEvent = (e) => { window.__ev.push(e.kind); orig(e); };
    const probe = makeBall(G.ball.x, G.ball.y, G.ball.z);
    launchBall(probe, launchFrom(shotOptions({ power: 1, impact: 0.1 })));
    const env = shotEnv({ wind: G.wind, windZ: G.windZ, ignoreHazards: true });
    while (probe.t < 1 && probe.mode === 'air') stepBall(probe, G.hole, env, PHYS.dt);
    const rel = probe.y - heightAt(G.hole, probe.x, probe.z);
    L.trees.push({ x: probe.x, z: probe.z, h: rel * 1.5, r: 9, base: rel * 0.5, kind: 'oak', variant: 0, turn: 0, tint: 0 });
    return { rel };
  });
  await shoot(page, 1, 0.1);
  await until(page, ['stopped', 'holed']);
  const events = await page.evaluate(() => { const list = window.__ev.slice(); G.hole.layout.trees.pop(); readyNextShot(); return list; });
  console.log('hazard', JSON.stringify(hazard), JSON.stringify(events));
  if (!events.includes('tree')) errors.push('tree event missing');

  // 합성음: 오프라인으로 렌더해 무음·찢어짐이 없는지 측정
  const audio = await page.evaluate(async () => {
    const list = [['whoosh'], ['hit', '1W'], ['hit', 'PT'], ['hitPerfect', '1W'], ['bounce', 'green'], ['bounce', 'bunker'], ['splash'], ['cup'], ['rock'], ['leaves', true], ['trunk'], ['fanfare']];
    const out = {};
    for (const [n, arg] of list) {
      const ctx = new OfflineAudioContext(1, 44100 * 1.5, 44100);
      SFX.compose(ctx, SFX.makeBus(ctx), n, 0.01, arg);
      const d = (await ctx.startRendering()).getChannelData(0);
      let peak = 0;
      for (let i = 0; i < d.length; i++) peak = Math.max(peak, Math.abs(d[i]));
      out[n + (arg ? ':' + arg : '')] = +peak.toFixed(2);
    }
    return out;
  });
  for (const k in audio) if (audio[k] < 0.05 || audio[k] >= 1) errors.push('audio ' + k);

  // 그린 경사: 퍼터일 때만 표시
  const slope = await page.evaluate(() => {
    const c = cupPos();
    placeBall(c.x - 8, c.z + 2);
    window.__step(0.02);
    const box = document.getElementById('slopeBox');
    const shown = { visible: !box.classList.contains('hide'), pct: document.getElementById('slopePct').textContent, kind: document.getElementById('slopeType').textContent, arrows: VIEW.arrows.visible };
    placeBall(c.x - 120);
    window.__step(0.02);
    return { shown, hidden: box.classList.contains('hide') };
  });
  console.log('slope', JSON.stringify(slope));
  if (!slope.shown.visible || !slope.shown.arrows || !slope.hidden) errors.push('slope check failed');

  // 패시브
  const passive = await page.evaluate(() => {
    placeBall(G.hole.cup - 150);
    const out = {};
    const wear = (id) => { G.equip.char = id; G.stats = Object.assign({}, BASE_STATS); recomputeMarker(); };
    const flat = { hole: undefined, x: 0, z: 0, yaw: 0, lie: 1, ignoreHazards: true };
    G.wind = 0; G.windZ = 6;
    wear('kai'); G.club = '1W';
    out.kai = simulateShot(shotOptions(flat)).carry;
    wear('leo'); G.club = '1W';
    out.base = simulateShot(shotOptions(flat)).carry;
    out.leoWind = shotEnv(shotOptions({ wind: 6 })).windMul;
    const puttGap = () => { const ph = G.phase, cl = G.club; G.phase = 'power'; G.club = 'PT'; G.gauge.pos = 0; G.gauge.dir = 1; G.gauge.hold = 0; let n = 0; while (G.gauge.pos < 1 && n < 2000) { updateGame(1 / 60); n++; } G.phase = ph; G.club = cl; G.gauge.pos = 0; return n; };
    wear('mina'); out.minaPutt = -puttGap();
    wear('leo'); out.leoPutt = -puttGap();
    wear('sora'); G.club = 'SW'; out.soraBack = shotEnv(shotOptions()).backMul;
    wear('gbot'); G.club = '1W'; recomputeMarker(); const windy = G.markerZ;
    wear('leo'); G.club = '1W'; recomputeMarker(); out.markerDiff = windy - G.markerZ;
    wear('zombie'); const c0 = G.coins; onPerfect(); out.zombieCoins = G.coins - c0;
    wear('leo'); const c1 = G.coins; onPerfect(); out.leoCoins = G.coins - c1;
    G.perfects = 0; G.pop = null; G.flash = 0; G.windZ = 0; recomputeMarker();
    return out;
  });
  console.log('passive', JSON.stringify(passive));
  const ratio = passive.kai / passive.base;
  if (passive.leoWind !== 0.9 || !(ratio > 1.04 && ratio < 1.06) || !(passive.minaPutt < passive.leoPutt) || passive.soraBack !== 1.3 || Math.abs(passive.markerDiff) < 1 || passive.zombieCoins !== passive.leoCoins * 2) errors.push('passive check failed');

  await page.evaluate(() => openShop());
  await step(page, 0.05);
  await snap('10shop');
  await browser.close();
  console.log(name, JSON.stringify({ first, putter: club, holed, next, errors }));
  return errors.length === 0 && first.perfects === 1 && club === 'PT' && holed.holed && next.hole === 1 && !next.modal;
}

(async () => {
  const a = await run(400, 800, 'w400');
  const b = await run(1200, 800, 'w1200');
  console.log(a && b ? '통과' : '실패');
  process.exit(a && b ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
