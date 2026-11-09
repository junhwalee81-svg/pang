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
