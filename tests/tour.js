// 6홀을 끝까지 돌며 테마별 화면, 라운드 종료, 좁은 화면 넘침을 확인한다.
// 사용: NODE_PATH=<playwright-core 폴더> node tests/tour.js <출력 폴더>
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright-core');

const OUT = process.argv[2] || path.join(__dirname, 'out');
fs.mkdirSync(OUT, { recursive: true });
const URL = 'file:///' + path.resolve(__dirname, '..', 'index.html').replace(/\\/g, '/') + '?test&manual';
const ARGS = ['--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'];
const HOLE_COUNT = 6;

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ARGS });
  const page = await browser.newPage({ viewport: { width: 380, height: 700 } });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(URL);
  await page.waitForFunction(() => VIEW.ready && document.getElementById('title').classList.contains('show'), null, { timeout: 120000 });
  await page.evaluate(() => beginGame());
  const overflow = () => page.evaluate(() => {
    const W = window.innerWidth;
    return [...document.querySelectorAll('#hud, #hud *, #panel, #panel *')].filter((e) => {
      const r = e.getBoundingClientRect();
      return r.width > 0 && (r.left < -1 || r.right > W + 1);
    }).map((e) => e.id || e.className);
  });
  const widths = [];
  for (let i = 0; i < HOLE_COUNT; i++) {
    await page.evaluate(() => { readyNextShot(); placeBall(G.hole.green.from - 70); window.__step(0.3); });
    await page.screenshot({ path: path.join(OUT, `tour_${i + 1}.png`), timeout: 120000 });
    widths.push(...await overflow());
    // 멀리서 쳐 보고, 그린에 올려 컵 근처에서 넣는다
    await page.evaluate(() => {
      pressShot(); G.gauge.pos = 0.6; pressShot(); G.gauge.pos = 0; pressShot();
      for (let t = 0; t < 40 && !['stopped', 'holed'].includes(G.phase); t += 1 / 60) updateGame(1 / 60);
    });
    await page.evaluate(() => {
      let guard = 0;
      while (guard++ < 12 && G.phase === 'stopped') {
        readyNextShot();
        const c = cupPos();
        placeBall(c.x - 2.5, c.z);
        let found = null;
        const base = (Math.atan2(c.z - G.ball.z, c.x - G.ball.x) * 180) / Math.PI;
        for (let d = 0; d <= 10 && !found; d += 0.25) {
          for (const sign of [1, -1]) {
            const yaw = base + sign * d;
            for (let p = 0.02; p < 1 && !found; p += 0.004) {
              if (simulateShot(shotOptions({ power: p, yaw, ignoreHazards: true })).holed) found = { p: p + 0.008, yaw };
            }
            if (found) break;
          }
        }
        setYaw(found.yaw - G.yaw);
        pressShot(); G.gauge.pos = found.p; pressShot(); G.gauge.pos = 0; pressShot();
        for (let t = 0; t < 30 && !['stopped', 'holed'].includes(G.phase); t += 1 / 60) updateGame(1 / 60);
      }
    });
    const holed = await page.evaluate(() => G.ball.holed);
    if (!holed) errors.push('hole ' + (i + 1) + ' not holed');
    await page.evaluate(() => {
      for (let t = 0; t < 8 && G.phase !== 'score'; t += 1 / 60) updateGame(1 / 60);
      closeModal(); nextHole(); resize();
      window.__step(0.02);
    });
  }
  const end = await page.evaluate(() => ({ phase: G.phase, scores: G.scores.length, title: document.getElementById('title').classList.contains('show') }));
  await page.screenshot({ path: path.join(OUT, 'tour_end.png'), timeout: 120000 });
  const titleBad = await page.evaluate(() => { closeModal(); return document.documentElement.scrollWidth > window.innerWidth; });
  await browser.close();
  console.log(JSON.stringify({ end, overflow: [...new Set(widths)], titleBad, errors }));
  const ok = !errors.length && end.scores === HOLE_COUNT && end.title && !widths.length && !titleBad;
  console.log(ok ? '통과' : '실패');
  process.exit(ok ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
