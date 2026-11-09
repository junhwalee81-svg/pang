// 6홀을 끝까지 돌며 테마별 화면, 라운드 종료, 좁은 화면 넘침을 확인한다.
// 사용: NODE_PATH=<playwright-core 폴더> node tests/tour.js <출력 폴더>
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright-core');

const OUT = process.argv[2] || path.join(__dirname, 'out');
fs.mkdirSync(OUT, { recursive: true });
const URL = 'file:///' + path.resolve(__dirname, '..', 'index.html').replace(/\\/g, '/') + '?test';

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 380, height: 700 } });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(URL);
  await page.waitForFunction(() => ART.ready && document.getElementById('title').classList.contains('show'));
  await page.evaluate(() => beginGame());
  const overflow = () => page.evaluate(() => {
    const W = window.innerWidth;
    const bad = [...document.querySelectorAll('#hud, #hud *, #panel, #panel *')].filter((e) => {
      const r = e.getBoundingClientRect();
      return r.width > 0 && (r.left < -1 || r.right > W + 1);
    }).map((e) => e.id || e.className);
    return bad;
  });
  const widths = [];
  for (let i = 0; i < HOLES_COUNT(); i++) {
    await page.evaluate(() => { readyNextShot(); });
    await page.waitForFunction(() => G.phase === 'aim');
    await page.evaluate(() => placeBall(G.hole.green.from - 70));
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(OUT, `tour_${i + 1}.png`) });
    widths.push(...await overflow());
    // 멀리서 쳐 보고, 그린에 올려 컵 근처에서 넣는다
    await page.evaluate(() => { window.__speed = 8; pressShot(); G.gauge.pos = 0.6; pressShot(); G.gauge.pos = 0; pressShot(); });
    await page.waitForFunction(() => ['stopped', 'holed'].includes(G.phase), null, { timeout: 40000 });
    let guard = 0;
    while (guard++ < 12 && await page.evaluate(() => G.phase === 'stopped')) {
      await page.evaluate(() => {
        readyNextShot();
        placeBall(G.hole.cup - 2.5);
        const s = slopeBetween(G.hole, G.ball.x, G.hole.cup);
        pressShot();
        G.gauge.pos = clamp(2.5 * (0.04 + s * 0.2) + 0.05, 0.05, 1);
        pressShot();
        G.gauge.pos = 0;
        pressShot();
      });
      await page.waitForFunction(() => ['stopped', 'holed'].includes(G.phase), null, { timeout: 20000 });
    }
    const holed = await page.evaluate(() => G.ball.holed);
    if (!holed) errors.push('hole ' + (i + 1) + ' not holed');
    await page.waitForFunction(() => G.phase === 'score', null, { timeout: 15000 });
    await page.evaluate(() => { closeModal(); nextHole(); resize(); });
  }
  const end = await page.evaluate(() => ({ phase: G.phase, scores: G.scores.length, title: document.getElementById('title').classList.contains('show'), modal: document.getElementById('modal').classList.contains('show') }));
  await page.waitForTimeout(150);
  await page.screenshot({ path: path.join(OUT, 'tour_end.png') });
  const titleBad = await page.evaluate(() => { closeModal(); return document.documentElement.scrollWidth > window.innerWidth; });
  await browser.close();
  console.log(JSON.stringify({ end, overflow: [...new Set(widths)], titleBad, errors }));
  const ok = !errors.length && end.scores === HOLES_COUNT() && end.title && !widths.length && !titleBad;
  console.log(ok ? '통과' : '실패');
  process.exit(ok ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });

function HOLES_COUNT() { return 6; }
