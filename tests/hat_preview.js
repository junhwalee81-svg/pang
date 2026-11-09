// 캐릭터 6종 × 모자 5종을 한 장으로 찍는다.
// 사용: NODE_PATH=<playwright-core 폴더> node tests/hat_preview.js <출력.png>
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright-core');

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 400, height: 400 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('file:///' + path.resolve(__dirname, '..', 'index.html').replace(/\\/g, '/') + '?test');
  await page.waitForFunction(() => ART.ready);
  const url = await page.evaluate(() => {
    const cell = 190, hats = ITEMS.hat, chars = ITEMS.char;
    const c = mkCanvas(chars.length * cell, hats.length * cell);
    const x = c.getContext('2d');
    x.fillStyle = '#7fc4ee';
    x.fillRect(0, 0, c.width, c.height);
    hats.forEach((hat, row) => chars.forEach((ch, col) => {
      drawGolfer(x, col * cell + cell * 0.46, row * cell + cell - 8, { charId: ch.id, topId: 'top_basic', shoesId: 'shoes_basic', hatId: hat.id, clubType: '5I', clubColor: '#9aa7b4', phi: clubRig('5I').tilt, expr: 'head', scale: 0.72, bob: 0 });
    }));
    return c.toDataURL('image/png');
  });
  fs.writeFileSync(process.argv[2], Buffer.from(url.split(',')[1], 'base64'));
  await browser.close();
  console.log(errors.length ? errors : 'ok');
  process.exit(errors.length ? 1 : 0);
})();
