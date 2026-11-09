/* 화면 그리기. G를 읽기만 한다. */

var FONT_HEAVY = '"Malgun Gothic","Apple SD Gothic Neo","Noto Sans KR",system-ui,sans-serif';

var SURFACE_STYLE = {
  tee: { tex: 'turf', strength: 0.5, key: 'fair' },
  fairway: { tex: 'turf', strength: 0.5, key: 'fair' },
  rough: { tex: 'grass', strength: 0.62, key: 'rough' },
  green: { tex: 'turf', strength: 0.24, fixed: '#a2ee6c' },
  bunker: { tex: 'sand', strength: 0.5, fixed: '#f3dca2' },
};

function surfaceColor(theme, type) {
  const st = SURFACE_STYLE[type];
  return st.fixed || THEMES[theme][st.key];
}

function renderGame(x, G) {
  const W = G.view.W, H = G.view.H;
  const hole = G.hole || HOLES[0];
  const cam = { x: G.cam.x, y: G.cam.y, z: G.cam.z, cy: G.view.cy };
  if (G.shake > 0) {
    cam.x += Math.sin(G.time * 91) * G.shake * 0.6 / cam.z;
    cam.y += Math.cos(G.time * 77) * G.shake * 0.6 / cam.z;
  }
  const ctx = { x, G, W, H, cam, hole, theme: THEMES[hole.theme], themeId: hole.theme,
    sx: (wx) => (wx - cam.x) * cam.z + W / 2,
    sy: (wy) => cam.cy - (wy - cam.y) * cam.z };
  drawBackdrop(ctx);
  drawDecor(ctx, 'back');
  drawTerrain(ctx);
  drawCupAndFlag(ctx);
  if (G.hole) {
    drawMarkers(ctx);
    drawGolferLayer(ctx);
  }
  drawDecor(ctx, 'front');
  if (G.hole) {
    drawTrail(ctx);
    drawBall(ctx);
  }
  drawParticles(ctx);
  drawLight(ctx);
  if (G.hole) drawMinimap(ctx);
  drawPopups(ctx);
}

function drawTiled(x, im, ox, y, W, scale) {
  const w = im.width * scale, h = im.height * scale;
  let px = -(((ox % w) + w) % w);
  for (; px < W; px += w) x.drawImage(im, px, y, w + 1, h);
}

function drawBackdrop(c) {
  const { x, W, H, G, cam } = c;
  x.drawImage(skyCanvas(c.themeId, W, H), 0, 0);
  const groundLine = c.sy(heightAt(c.hole, cam.x));
  const n = ART.cloud.length;
  for (let i = 0; i < 14; i++) {
    const im = ART.cloud[i % n];
    const depth = 0.03 + (i % 5) * 0.022;
    const k = 0.4 + (i % 4) * 0.28;
    const span = W + 700;
    const raw = i * 317 + G.time * (2 + (i % 3) * 3) - cam.x * cam.z * depth;
    const px = (((raw % span) + span) % span) - 340;
    const py = 40 + ((i * 83) % Math.max(180, H * 0.34));
    x.globalAlpha = 0.72 + (i % 3) * 0.13;
    x.drawImage(im, px, py, im.width * k, im.height * k);
  }
  x.globalAlpha = 1;
  const far = ridgeCanvas(c.themeId, 0);
  const mid = ridgeCanvas(c.themeId, 1);
  const horizon = Math.min(groundLine, H * 0.92);
  const farScale = clamp(H / 780, 0.72, 1.2);
  drawTiled(x, far, cam.x * cam.z * 0.05 + cam.x * 2, horizon - far.height * farScale + 66, W, farScale);
  x.fillStyle = THEMES[c.themeId].far[1];
  x.fillRect(0, horizon + 65, W, H);
  const midScale = farScale * 1.08;
  drawTiled(x, mid, cam.x * cam.z * 0.14 + cam.x * 7, horizon - mid.height * midScale + 86, W, midScale);
  x.fillStyle = THEMES[c.themeId].mid[1];
  x.fillRect(0, horizon + 85, W, H);
}

function drawDecor(c, layer) {
  const { x, W, cam, hole, sx, sy } = c;
  const list = holeDecor(hole)[layer];
  const margin = 260;
  const band = bandPx(cam.z);
  for (const d of list) {
    const px = sx(d.x);
    if (px < -margin || px > W + margin) continue;
    const im = ART.scene[d.kind];
    const h = d.h * cam.z, w = (h * im.width) / im.height;
    const base = sy(heightAt(hole, d.x));
    const y = layer === 'back' ? base - band.far + 5 : base + band.near * 0.72;
    if (layer === 'back') {
      x.fillStyle = 'rgba(16,48,28,.2)';
      x.beginPath();
      x.ellipse(px, y, w * 0.42, Math.max(2, h * 0.04), 0, 0, Math.PI * 2);
      x.fill();
    }
    x.drawImage(im, px - w / 2, y - h, w, h);
  }
}

function bandPx(z) { return { far: clamp(z * 0.72, 7, 26), near: clamp(z * 0.5, 7, 18) }; }

function patternFor(c, type, band) {
  const st = SURFACE_STYLE[type];
  const tile = surfaceTile(st.tex, surfaceColor(c.hole.theme, type), st.strength);
  const pat = c.x.createPattern(tile, 'repeat');
  const scale = clamp(c.cam.z / 26, 0.34, 1.1);
  pat.setTransform(new DOMMatrix().translate(c.sx(0) % (256 * scale), band ? 0 : 0).scale(scale));
  return pat;
}

function polyBand(x, xs, top, bottom, a, b) {
  x.beginPath();
  x.moveTo(xs[a], top[a]);
  for (let i = a + 1; i <= b; i++) x.lineTo(xs[i], top[i]);
  for (let i = b; i >= a; i--) x.lineTo(xs[i], bottom[i]);
  x.closePath();
}

function drawTerrain(c) {
  const { x, W, H, cam, hole, sx, sy } = c;
  const step = 4;
  const n = Math.ceil(W / step) + 2;
  const xs = new Float32Array(n), ys = new Float32Array(n), far = new Float32Array(n), near = new Float32Array(n);
  const types = new Array(n);
  const band = bandPx(cam.z);
  const left = cam.x - W / 2 / cam.z;
  const dx = step / cam.z;
  for (let i = 0; i < n; i++) {
    const wx = left + i * dx;
    xs[i] = i * step;
    ys[i] = sy(heightAt(hole, wx));
    far[i] = ys[i] - band.far;
    near[i] = ys[i] + band.near;
    types[i] = surfaceAt(hole, wx);
  }
  // 흙 단면
  x.beginPath();
  x.moveTo(0, H);
  for (let i = 0; i < n; i++) x.lineTo(xs[i], near[i]);
  x.lineTo(W, H);
  x.closePath();
  const soil = x.createPattern(surfaceTile('soil', '#a0683c', 0.55), 'repeat');
  soil.setTransform(new DOMMatrix().translate(sx(0) % 200, 0).scale(0.8));
  x.fillStyle = soil;
  x.fill();
  let minNear = H;
  for (let i = 0; i < n; i++) if (near[i] < minNear) minNear = near[i];
  const depth = x.createLinearGradient(0, minNear, 0, H);
  depth.addColorStop(0, 'rgba(70,30,10,.08)');
  depth.addColorStop(0.5, 'rgba(50,20,10,.5)');
  depth.addColorStop(1, 'rgba(25,10,10,.82)');
  x.fillStyle = depth;
  x.fill();
  drawStrata(x, xs, near, n, H, left);
  // 지형 띠
  let a = 0;
  while (a < n) {
    let b = a;
    while (b + 1 < n && types[b + 1] === types[a]) b++;
    const t = types[a];
    const end = Math.min(b + 1, n - 1);
    if (t !== 'water') {
      polyBand(x, xs, far, near, a, end);
      x.fillStyle = patternFor(c, t);
      x.fill();
      if (t === 'fairway' || t === 'green' || t === 'tee') drawStripes(c, xs, far, near, a, end, t);
      if (t === 'bunker') {
        polyBand(x, xs, far, near, a, end);
        x.fillStyle = 'rgba(160,110,40,.13)';
        x.fill();
      }
    }
    a = b + 1;
  }
  // 앞면 그늘과 윗면 빛
  x.beginPath();
  x.moveTo(xs[0], near[0] - band.near * 0.34);
  for (let i = 1; i < n; i++) x.lineTo(xs[i], near[i] - band.near * 0.34);
  for (let i = n - 1; i >= 0; i--) x.lineTo(xs[i], near[i]);
  x.closePath();
  x.fillStyle = 'rgba(15,60,30,.3)';
  x.fill();
  x.lineJoin = 'round';
  x.strokeStyle = 'rgba(255,255,220,.5)';
  x.lineWidth = 2.2;
  x.beginPath();
  for (let i = 0; i < n; i++) {
    if (types[i] === 'water') { x.moveTo(xs[i], far[i]); continue; }
    if (i === 0) x.moveTo(xs[i], far[i]); else x.lineTo(xs[i], far[i]);
  }
  x.stroke();
  drawFringe(c, xs, near, types, n, left, dx);
  drawWater(c);
}

function drawStrata(x, xs, near, n, H, left) {
  [[46, 'rgba(60,28,12,.2)'], [112, 'rgba(38,18,12,.26)']].forEach(([off, color], layer) => {
    x.beginPath();
    x.moveTo(0, H);
    for (let i = 0; i < n; i += 2) {
      x.lineTo(xs[i], near[i] + off + Math.sin(xs[i] * 0.021 + left * 0.8 + layer) * 8 + Math.sin(xs[i] * 0.067 + layer * 2) * 4);
    }
    x.lineTo(xs[n - 1], H);
    x.closePath();
    x.fillStyle = color;
    x.fill();
  });
}

function drawStripes(c, xs, far, near, a, b, type) {
  const { x, cam } = c;
  const width = type === 'green' ? 2.4 : 7;
  const wl = (i) => c.cam.x - c.W / 2 / cam.z + (xs[i] / cam.z);
  let i = a;
  while (i < b) {
    const k = Math.floor(wl(i) / width);
    let j = i;
    while (j + 1 <= b && Math.floor(wl(j + 1) / width) === k) j++;
    const stop = Math.min(j + 1, b);
    if (k % 2 === 0) {
      polyBand(x, xs, far, near, i, stop);
      x.fillStyle = type === 'green' ? 'rgba(255,255,255,.1)' : 'rgba(255,255,210,.09)';
      x.fill();
    }
    i = j + 1;
  }
}

function drawFringe(c, xs, near, types, n, left, dx) {
  const { x } = c;
  x.fillStyle = 'rgba(34,110,44,.95)';
  x.beginPath();
  for (let i = 0; i < n; i++) {
    if (types[i] === 'water' || types[i] === 'bunker') continue;
    const wx = left + i * dx;
    const seed = Math.abs(Math.sin(Math.floor(wx * 4) * 12.9898)) * 43758.5;
    const f = seed - Math.floor(seed);
    const h = 3 + f * 6;
    x.moveTo(xs[i] - 2.3, near[i] - 1);
    x.lineTo(xs[i] + (f - 0.5) * 3, near[i] + h);
    x.lineTo(xs[i] + 2.3, near[i] - 1);
  }
  x.fill();
}

function drawWater(c) {
  const { x, G, hole, cam, sx, sy } = c;
  const t = prepareHole(hole);
  const band = bandPx(cam.z);
  for (const p of t.level) {
    const x0 = sx(p.from), x1 = sx(p.to);
    if (x1 < -20 || x0 > c.W + 20) continue;
    const yTop = sy(p.y);
    const bottom = sy(p.y - 3.4) + band.near;
    x.beginPath();
    x.moveTo(x0, yTop - band.far);
    const seg = Math.max(8, cam.z * 0.8);
    for (let px = x0; px <= x1; px += seg) x.lineTo(px, yTop - band.far + Math.sin(px * 0.05 + G.time * 2.2) * 1.5);
    x.lineTo(x1, yTop - band.far);
    x.lineTo(x1, bottom);
    x.lineTo(x0, bottom);
    x.closePath();
    const g = x.createLinearGradient(0, yTop - band.far, 0, bottom);
    g.addColorStop(0, '#6fdcf0');
    g.addColorStop(0.45, '#2c9fd8');
    g.addColorStop(1, '#165f9e');
    x.fillStyle = g;
    x.fill();
    x.strokeStyle = 'rgba(255,255,255,.55)';
    x.lineWidth = 1.6;
    for (let k = 0; k < 7; k++) {
      const u = (k * 0.141 + G.time * 0.05 * (1 + (k % 3))) % 1;
      const wx = x0 + u * (x1 - x0);
      const wy = yTop - band.far * (0.9 - k * 0.09) + k * 3;
      const len = 12 + (k % 3) * 11;
      x.beginPath();
      x.moveTo(wx, wy);
      x.quadraticCurveTo(wx + len / 2, wy - 2 + Math.sin(G.time * 3 + k), wx + len, wy);
      x.stroke();
    }
  }
}

function drawCupAndFlag(c) {
  const { x, G, hole, cam, sx, sy } = c;
  const px = sx(hole.cup), py = sy(heightAt(hole, hole.cup));
  if (px < -200 || px > c.W + 200) return;
  const z = cam.z;
  const rw = clamp(z * 0.42, 5, 16), rh = rw * 0.36;
  x.fillStyle = '#20261f';
  x.beginPath();
  x.ellipse(px, py, rw, rh, 0, 0, Math.PI * 2);
  x.fill();
  x.strokeStyle = 'rgba(255,255,255,.75)';
  x.lineWidth = 1.5;
  x.beginPath();
  x.ellipse(px, py, rw, rh, 0, 0, Math.PI);
  x.stroke();
  const poleH = clamp(z * 5.4, 62, 150);
  x.fillStyle = 'rgba(10,40,20,.25)';
  x.beginPath();
  x.ellipse(px + poleH * 0.22, py + 1, poleH * 0.22, 2.4, 0, 0, Math.PI * 2);
  x.fill();
  const pg = x.createLinearGradient(px - 2, 0, px + 2, 0);
  pg.addColorStop(0, '#c9ced4');
  pg.addColorStop(1, '#ffffff');
  x.fillStyle = pg;
  x.fillRect(px - 1.6, py - poleH, 3.2, poleH);
  const dir = G.wind >= 0 ? 1 : -1;
  const fw = poleH * 0.46, fh = poleH * 0.27;
  x.beginPath();
  x.moveTo(px, py - poleH);
  const N = 12;
  const wave = (u) => Math.sin(u * 5.5 - G.time * (5 + Math.abs(G.wind))) * 3.4 * u;
  for (let i = 1; i <= N; i++) {
    const u = i / N;
    x.lineTo(px + dir * fw * u, py - poleH + (fh / 2) * u + wave(u));
  }
  for (let i = N; i >= 0; i--) {
    const u = i / N;
    x.lineTo(px + dir * fw * u, py - poleH + fh - (fh / 2) * u + wave(u));
  }
  x.closePath();
  const fg = x.createLinearGradient(px, 0, px + dir * fw, 0);
  fg.addColorStop(0, '#ff5a4d');
  fg.addColorStop(1, '#d92f3f');
  x.fillStyle = fg;
  x.fill();
  x.fillStyle = '#ffd34d';
  x.beginPath();
  x.arc(px, py - poleH, 3.6, 0, Math.PI * 2);
  x.fill();
}

function drawMarkers(c) {
  const { x, G, hole, sx, sy } = c;
  if (G.phase !== 'aim' && G.phase !== 'power' && G.phase !== 'impact') return;
  if (G.markerX == null || G.club === 'PT') return;
  const px = sx(G.markerX);
  if (px < -40 || px > c.W + 40) return;
  const py = sy(heightAt(hole, G.markerX));
  const beam = x.createLinearGradient(0, py - 150, 0, py);
  beam.addColorStop(0, 'rgba(255,240,130,0)');
  beam.addColorStop(1, 'rgba(255,240,130,.58)');
  x.fillStyle = beam;
  x.fillRect(px - 9, py - 150, 18, 150);
  x.strokeStyle = '#fff0a0';
  x.lineWidth = 2.4;
  x.beginPath();
  x.ellipse(px, py, 22, 7, 0, 0, Math.PI * 2);
  x.stroke();
  x.font = '800 13px ' + FONT_HEAVY;
  x.textAlign = 'center';
  x.lineWidth = 3.5;
  x.strokeStyle = 'rgba(20,40,70,.8)';
  x.strokeText('MAX', px, py - 22);
  x.fillStyle = '#fff6c0';
  x.fillText('MAX', px, py - 22);
}

function drawGolferLayer(c) {
  const { x, G, hole, cam, sx, sy } = c;
  const gf = G.golfer;
  const s = cam.z * RIG.spriteToWorld;
  const px = sx(gf.x);
  const margin = 260 * s;
  if (px < -margin || px > c.W + margin) return;
  const py = sy(heightAt(hole, gf.x));
  x.fillStyle = 'rgba(10,40,20,.3)';
  x.beginPath();
  x.ellipse(px, py + 2, 58 * s, 11 * s, 0, 0, Math.PI * 2);
  x.fill();
  const club = ITEMS.club.find((it) => it.id === G.equip.club);
  drawGolfer(x, px, py + 3, {
    charId: G.equip.char, topId: G.equip.top, shoesId: G.equip.shoes, hatId: G.equip.hat,
    clubType: G.swingClub || G.club, clubColor: club.color, phi: gf.phi, expr: gf.expr, pose: gf.pose, scale: s, bob: gf.bob,
  });
}

function trailColor(G) {
  if (G.shotStyle === 'perfect') return ['255,214,84', '255,120,50'];
  return ['255,255,255', '180,225,255'];
}

function drawTrail(c) {
  const { x, G, sx, sy, cam } = c;
  const T = G.trail;
  if (T.length < 2) return;
  const cols = trailColor(G);
  x.lineCap = 'round';
  const width = clamp(cam.z * 0.34, 3, 9);
  for (let i = 1; i < T.length; i++) {
    const u = i / T.length;
    x.strokeStyle = 'rgba(' + (u > 0.5 ? cols[0] : cols[1]) + ',' + (u * 0.72 * G.trailFade).toFixed(3) + ')';
    x.lineWidth = width * (0.28 + u * 0.72);
    x.beginPath();
    x.moveTo(sx(T[i - 1].x), sy(T[i - 1].y));
    x.lineTo(sx(T[i].x), sy(T[i].y));
    x.stroke();
  }
  x.lineCap = 'butt';
}

function drawBall(c) {
  const { x, G, hole, cam, sx, sy } = c;
  const b = G.ball;
  if (!b || b.holed) return;
  const r = clamp(cam.z * 0.2, 4, 8);
  const px = sx(b.x), py = sy(b.y);
  const gy = sy(heightAt(hole, b.x));
  const alt = Math.max(0, gy - py);
  x.fillStyle = 'rgba(10,35,20,' + (0.34 * clamp(1 - alt / 500, 0.2, 1)).toFixed(3) + ')';
  x.beginPath();
  x.ellipse(px, gy + 1, r * (1 + alt * 0.003), r * 0.32, 0, 0, Math.PI * 2);
  x.fill();
  if (G.shotStyle === 'perfect' && b.mode !== 'stop') {
    const glow = tintedFx('light', '#ffd25a');
    x.globalCompositeOperation = 'lighter';
    x.drawImage(glow, px - r * 5, py - r - r * 4.3, r * 10, r * 10);
    x.globalCompositeOperation = 'source-over';
  }
  x.save();
  x.translate(px, py - r);
  x.rotate(b.rot);
  x.drawImage(ballSprite(), -r, -r, r * 2, r * 2);
  x.restore();
}

function drawParticles(c) {
  const { x, G, cam, sx, sy } = c;
  for (const p of G.fx) {
    const u = p.life / p.max;
    const size = p.size * (p.grow ? 1 + (1 - u) * p.grow : 1) * (p.screen ? 1 : cam.z / 22);
    const im = tintedFx(p.tex, p.color);
    x.globalAlpha = clamp(u * (p.alpha || 1), 0, 1);
    x.globalCompositeOperation = p.add ? 'lighter' : 'source-over';
    x.save();
    x.translate(sx(p.x), sy(p.y));
    x.rotate(p.rot);
    x.drawImage(im, -size / 2, -size / 2, size, size);
    x.restore();
  }
  x.globalAlpha = 1;
  x.globalCompositeOperation = 'source-over';
}

function drawLight(c) {
  const { x, W, H, G, theme } = c;
  const sunX = theme.sun[0] * W, sunY = theme.sun[1] * H;
  x.save();
  x.globalCompositeOperation = 'lighter';
  x.translate(sunX, sunY);
  for (let i = 0; i < 4; i++) {
    const a = 0.5 + i * 0.5 + Math.sin(G.time * 0.13 + i) * 0.05;
    x.save();
    x.rotate(a);
    const len = Math.hypot(W, H);
    const g = x.createLinearGradient(0, 0, 0, len);
    g.addColorStop(0, 'rgba(255,245,200,.042)');
    g.addColorStop(1, 'rgba(255,245,200,0)');
    x.fillStyle = g;
    x.beginPath();
    x.moveTo(0, 0);
    x.lineTo(-44 - i * 16, len);
    x.lineTo(44 + i * 16, len);
    x.closePath();
    x.fill();
    x.restore();
  }
  x.restore();
  x.globalCompositeOperation = 'soft-light';
  x.globalAlpha = 0.22;
  x.fillStyle = theme.grade;
  x.fillRect(0, 0, W, H);
  x.globalAlpha = 1;
  x.globalCompositeOperation = 'source-over';
  x.drawImage(vignetteCanvas(W, H), 0, 0);
  if (G.flash > 0) {
    x.fillStyle = 'rgba(255,250,215,' + clamp(G.flash, 0, 0.8).toFixed(3) + ')';
    x.fillRect(0, 0, W, H);
  }
}

function drawMinimap(c) {
  const { x, W, G, hole } = c;
  if (G.phase === 'title') return;
  const mw = Math.min(W - 24, 620), mh = 42;
  const mx = (W - mw) / 2, my = G.view.miniY;
  x.save();
  x.beginPath();
  x.roundRect(mx, my, mw, mh, 11);
  x.fillStyle = 'rgba(14,34,64,.52)';
  x.fill();
  x.strokeStyle = 'rgba(255,255,255,.3)';
  x.lineWidth = 1;
  x.stroke();
  x.clip();
  const x0 = -14, x1 = hole.end + 12;
  const t = prepareHole(hole);
  let lo = 1e9, hi = -1e9;
  for (let i = 0; i <= 120; i++) {
    const h = heightAt(hole, lerp(x0, x1, i / 120));
    if (h < lo) lo = h;
    if (h > hi) hi = h;
  }
  const px = (wx) => mx + ((wx - x0) / (x1 - x0)) * mw;
  const py = (wy) => my + mh - 7 - ((wy - lo) / Math.max(4, hi - lo)) * (mh - 20);
  const COLORS = { tee: '#c7f58c', fairway: '#8fe35e', rough: '#459a43', bunker: '#f2dc9b', green: '#c8ff8a', water: '#46b8ec' };
  for (let i = 0; i < mw; i += 2) {
    const wx = x0 + (i / mw) * (x1 - x0);
    const ty = surfaceAt(hole, wx);
    const yy = ty === 'water' ? py(t.level.length ? t.level[0].y : heightAt(hole, wx)) : py(heightAt(hole, wx));
    x.fillStyle = COLORS[ty];
    x.fillRect(mx + i, yy, 2, my + mh - yy);
  }
  if (G.markerX != null && G.club !== 'PT' && (G.phase === 'aim' || G.phase === 'power' || G.phase === 'impact')) {
    x.fillStyle = '#ffe97a';
    x.fillRect(px(G.markerX) - 1, my + 3, 2, mh - 6);
  }
  const fx = px(hole.cup), fy = py(heightAt(hole, hole.cup));
  x.strokeStyle = '#ffffff';
  x.lineWidth = 1.4;
  x.beginPath();
  x.moveTo(fx, fy);
  x.lineTo(fx, fy - 15);
  x.stroke();
  x.fillStyle = '#ff4b4b';
  x.beginPath();
  x.moveTo(fx, fy - 15);
  x.lineTo(fx + 9, fy - 11);
  x.lineTo(fx, fy - 7);
  x.fill();
  const b = G.ball;
  x.fillStyle = '#ffffff';
  x.strokeStyle = '#183058';
  x.lineWidth = 1.6;
  x.beginPath();
  x.arc(px(b.x), Math.max(my + 5, py(Math.min(b.y, hi + 8))) - 2, 3.8 + Math.sin(G.time * 6) * 0.6, 0, Math.PI * 2);
  x.fill();
  x.stroke();
  x.restore();
}

function outlineText(x, text, px, py, size, fill, stroke, weight) {
  x.font = (weight || 900) + ' ' + size + 'px ' + FONT_HEAVY;
  x.textAlign = 'center';
  x.lineJoin = 'round';
  x.lineWidth = size * 0.2;
  x.strokeStyle = stroke;
  x.strokeText(text, px, py);
  x.fillStyle = fill;
  x.fillText(text, px, py);
}

function drawPopups(c) {
  const { x, W, H, G } = c;
  if (G.pop) {
    const p = G.pop;
    const u = 1 - p.t / p.max;
    const inT = clamp(u / 0.14, 0, 1);
    const k = p.big ? 1 + (1 - inT) * 0.55 : 0.75 + inT * 0.25;
    const a = clamp(p.t / 0.32, 0, 1);
    const py = G.view.cy - H * 0.12;
    x.save();
    x.translate(W / 2, py);
    if (p.big) {
      x.save();
      x.globalAlpha = a * 0.36;
      x.globalCompositeOperation = 'lighter';
      x.rotate(G.time * 0.9);
      const rayLen = Math.max(W, H) * 0.65;
      for (let i = 0; i < 14; i++) {
        x.rotate((Math.PI * 2) / 14);
        const g = x.createLinearGradient(0, 0, 0, rayLen);
        g.addColorStop(0, p.color);
        g.addColorStop(1, 'rgba(255,255,255,0)');
        x.fillStyle = g;
        x.beginPath();
        x.moveTo(0, 0);
        x.lineTo(-30, rayLen);
        x.lineTo(30, rayLen);
        x.fill();
      }
      x.restore();
    }
    x.globalAlpha = a;
    x.scale(k, k);
    const size = Math.min(W * 0.21, p.big ? 112 : 64);
    outlineText(x, p.text, 0, 0, size, p.fill || '#ffe25a', p.stroke || '#b3261e');
    if (p.sub) outlineText(x, p.sub, 0, size * 0.72, size * 0.34, '#ffffff', 'rgba(20,40,70,.9)', 800);
    x.restore();
  }
  x.globalAlpha = 1;
}
