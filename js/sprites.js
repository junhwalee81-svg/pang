/* 그림 재료와 캐시. 게임 상태를 바꾸지 않는다(그림 캐시만 쓴다). */

var ART = { ready: false, char: {}, scene: {}, cloud: [], fx: {}, tex: {}, cache: new Map() };

function loadImg(src) {
  return new Promise((ok, no) => {
    const im = new Image();
    im.onload = () => ok(im);
    im.onerror = () => no(new Error('이미지 로드 실패'));
    im.src = src;
  });
}

function mkCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return c;
}

function seededRng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

ART.load = async function () {
  const jobs = [];
  for (const id in ASSETS.char) {
    ART.char[id] = {};
    for (const part in ASSETS.char[id]) jobs.push(loadImg(ASSETS.char[id][part]).then((im) => { ART.char[id][part] = im; }));
  }
  for (const k in ASSETS.scene) jobs.push(loadImg(ASSETS.scene[k]).then((im) => { ART.scene[k] = im; }));
  for (const k in ASSETS.fx) jobs.push(loadImg(ASSETS.fx[k]).then((im) => { ART.fx[k] = im; }));
  for (const k in ASSETS.tex) jobs.push(loadImg(ASSETS.tex[k]).then((im) => { ART.tex[k] = im; }));
  ASSETS.cloud.forEach((src, i) => jobs.push(loadImg(src).then((im) => { ART.cloud[i] = im; })));
  await Promise.all(jobs);
  ART.ready = true;
};

function cached(key, make) {
  let v = ART.cache.get(key);
  if (v === undefined) { v = make(); ART.cache.set(key, v); }
  return v;
}

/** 입자 그림에 색을 입힌다 */
function tintedFx(name, color) {
  return cached('fx:' + name + color, () => {
    const im = ART.fx[name];
    const c = mkCanvas(im.width, im.height);
    const x = c.getContext('2d');
    x.drawImage(im, 0, 0);
    x.globalCompositeOperation = 'source-in';
    x.fillStyle = color;
    x.fillRect(0, 0, c.width, c.height);
    return c;
  });
}

/** 실사 질감 + 색 = 이음매 없는 타일 */
function surfaceTile(tex, color, strength) {
  return cached('tile:' + tex + color + strength, () => {
    const im = ART.tex[tex];
    const c = mkCanvas(im.width, im.height);
    const x = c.getContext('2d');
    x.fillStyle = color;
    x.fillRect(0, 0, c.width, c.height);
    x.globalCompositeOperation = 'overlay';
    x.globalAlpha = strength;
    x.drawImage(im, 0, 0);
    return c;
  });
}

/** 하늘 배경(해의 빛무리까지 한 번에 굽는다) */
function skyCanvas(themeId, W, H) {
  return cached('sky:' + themeId + W + 'x' + H, () => {
    const t = THEMES[themeId];
    const c = mkCanvas(W, H);
    const x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, t.sky[0]);
    g.addColorStop(0.55, t.sky[1]);
    g.addColorStop(1, t.sky[2]);
    x.fillStyle = g;
    x.fillRect(0, 0, W, H);
    const sx = t.sun[0] * W, sy = t.sun[1] * H;
    x.globalCompositeOperation = 'lighter';
    [[Math.max(W, H) * 0.6, 0.14], [Math.max(W, H) * 0.24, 0.26], [62, 0.8]].forEach(([r, a]) => {
      const s = x.createRadialGradient(sx, sy, 0, sx, sy, r);
      s.addColorStop(0, t.glow);
      s.addColorStop(1, 'rgba(255,255,255,0)');
      x.globalAlpha = a;
      x.fillStyle = s;
      x.fillRect(0, 0, W, H);
    });
    x.globalAlpha = 1;
    x.fillStyle = '#ffffff';
    x.beginPath();
    x.arc(sx, sy, 24, 0, Math.PI * 2);
    x.fill();
    return c;
  });
}

function hexMix(a, b, t) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const m = (sh) => Math.round(lerp((pa >> sh) & 255, (pb >> sh) & 255, t));
  return 'rgb(' + m(16) + ',' + m(8) + ',' + m(0) + ')';
}

/** 먼 산·언덕 띠(가로로 이어지는 1400px 타일) */
function ridgeCanvas(themeId, layer) {
  return cached('ridge:' + themeId + layer, () => {
    const t = THEMES[themeId];
    const W = 1400, H = 420;
    const c = mkCanvas(W, H);
    const x = c.getContext('2d');
    const rng = seededRng(themeId.length * 97 + layer * 13 + 5);
    const harmonics = [];
    for (let i = 0; i < 5; i++) harmonics.push({ k: (i + 1) * (layer === 0 ? 2 : 3), a: (layer === 0 ? 62 : 34) / (i + 1), p: rng() * 6.28 });
    const yAt = (px) => {
      let y = layer === 0 ? 190 : 250;
      for (const h of harmonics) y += Math.sin((px / W) * Math.PI * 2 * h.k + h.p) * h.a;
      return y;
    };
    const colors = layer === 0 ? t.far : t.mid;
    x.beginPath();
    x.moveTo(0, H);
    for (let px = 0; px <= W; px += 6) x.lineTo(px, yAt(px));
    x.lineTo(W, H);
    x.closePath();
    const g = x.createLinearGradient(0, 110, 0, H);
    g.addColorStop(0, colors[0]);
    g.addColorStop(1, colors[1]);
    x.fillStyle = g;
    x.fill();
    if (layer === 1) {
      x.save();
      x.clip();
      x.globalCompositeOperation = 'overlay';
      x.globalAlpha = 0.34;
      x.fillStyle = x.createPattern(ART.tex.turf, 'repeat');
      x.fillRect(0, 0, W, H);
      x.restore();
      const names = t.trees;
      let px = 12;
      while (px < W - 12) {
        const im = ART.scene[names[(rng() * names.length) | 0]];
        const h = 70 + rng() * 62;
        const w = (h * im.width) / im.height;
        x.globalAlpha = 0.86;
        x.drawImage(im, px - w / 2, yAt(px) - h + 8, w, h);
        px += 18 + rng() * 54;
      }
      x.globalAlpha = 1;
      const homes = ['house1', 'house2', 'house3', 'tower'];
      for (let i = 0; i < 3; i++) {
        const hx = 140 + i * 450 + rng() * 90;
        const im = ART.scene[homes[(rng() * homes.length) | 0]];
        const h = 64 + rng() * 26;
        x.drawImage(im, hx, yAt(hx + 30) - h + 12, (h * im.width) / im.height, h);
      }
    } else {
      x.save();
      x.globalCompositeOperation = 'source-atop';
      const haze = x.createLinearGradient(0, 120, 0, 380);
      haze.addColorStop(0, 'rgba(255,255,255,0.05)');
      haze.addColorStop(1, 'rgba(255,255,255,0.5)');
      x.fillStyle = haze;
      x.fillRect(0, 0, W, H);
      x.restore();
    }
    return c;
  });
}

/** 홀마다 고정된 나무·수풀·꽃 배치 */
function holeDecor(hole) {
  return cached('decor:' + hole.name, () => {
    const t = THEMES[hole.theme];
    const rng = seededRng(hole.cup * 31 + hole.par);
    const back = [], front = [];
    const last = hole.pts[hole.pts.length - 1][0];
    for (let x = -60; x < last; x += 13 + rng() * 22) {
      if (surfaceAt(hole, x) === 'water') continue;
      if (Math.abs(x - hole.cup) < 7 || Math.abs(x) < 7) continue;
      const near = surfaceAt(hole, x) === 'rough';
      back.push({ x, kind: t.trees[(rng() * t.trees.length) | 0], h: (near ? 6.4 : 5) + rng() * 4.6, shade: rng() });
    }
    for (let x = -60; x < last; x += 5 + rng() * 11) {
      const s = surfaceAt(hole, x);
      if (s === 'water' || s === 'bunker' || s === 'green' || s === 'tee') continue;
      const r = rng();
      const kind = r < 0.34 ? t.bushes[(rng() * t.bushes.length) | 0] : r < 0.6 ? 'tuft' + (1 + ((rng() * 3) | 0)) : r < 0.86 ? ['flowerBlue', 'flowerPurple', 'flowerRed'][(rng() * 3) | 0] : 'rock' + (1 + ((rng() * 3) | 0));
      const big = kind.startsWith('bush') ? 1.7 : kind.startsWith('rock') ? 1.2 : 0.8;
      front.push({ x, kind, h: big + rng() * big * 0.6 });
    }
    return { back, front };
  });
}

/* ───────── 캐릭터 리그 ───────── */

var RIG = { chestY: -105, armR: 50, swingArmRatio: 0.72, spriteToWorld: 1 / 30 };

function rigGrip(phi) {
  const a = phi * RIG.swingArmRatio * Math.PI / 180;
  return { x: Math.sin(a) * RIG.armR, y: RIG.chestY + Math.cos(a) * RIG.armR };
}

/** 어드레스 때 클럽 끝이 땅에 닿는 각도와 공까지의 거리 */
function clubRig(type) {
  return cached('rig:' + type, () => {
    const len = CLUB_TYPES[type].len;
    let lo = 0, hi = 88;
    for (let i = 0; i < 30; i++) {
      const mid = (lo + hi) / 2;
      const g = rigGrip(mid);
      if (g.y + Math.cos(mid * Math.PI / 180) * len > 0) lo = mid; else hi = mid;
    }
    const tilt = (lo + hi) / 2;
    const g = rigGrip(tilt);
    return { tilt, reach: g.x + Math.sin(tilt * Math.PI / 180) * len };
  });
}

function bodySprite(charId, topId) {
  return cached('body:' + charId + topId, () => {
    const im = ART.char[charId].body;
    const item = ITEMS.top.find((t) => t.id === topId);
    if (!item || !item.color) return im;
    const c = mkCanvas(im.width, im.height);
    const x = c.getContext('2d');
    x.drawImage(im, 0, 0);
    x.globalCompositeOperation = 'color';
    x.fillStyle = item.color;
    x.fillRect(0, 12, c.width, c.height);
    x.globalCompositeOperation = 'destination-in';
    x.drawImage(im, 0, 0);
    return c;
  });
}

function legSprite(charId, shoesId, part) {
  return cached('leg:' + charId + shoesId + part, () => {
    const im = ART.char[charId][part];
    const item = ITEMS.shoes.find((t) => t.id === shoesId);
    if (!item || !item.color) return im;
    const c = mkCanvas(im.width, im.height);
    const x = c.getContext('2d');
    x.drawImage(im, 0, 0);
    x.globalCompositeOperation = 'source-atop';
    x.globalAlpha = 0.86;
    x.fillStyle = item.color;
    x.fillRect(0, im.height - 18, c.width, 18);
    return c;
  });
}

function drawHat(x, id) {
  const it = ITEMS.hat.find((h) => h.id === id);
  if (!it || !it.color) return;
  x.fillStyle = it.color;
  x.beginPath();
  if (id === 'hat_cap') {
    x.ellipse(50, 22, 45, 30, 0, Math.PI, 0);
    x.fill();
    x.fillRect(5, 20, 90, 7);
    x.beginPath();
    x.ellipse(82, 25, 28, 7, 0.08, 0, Math.PI * 2);
    x.fill();
  } else if (id === 'hat_visor') {
    x.roundRect(4, 15, 94, 11, 5);
    x.fill();
    x.beginPath();
    x.ellipse(82, 26, 30, 7, 0.08, 0, Math.PI * 2);
    x.fill();
  } else if (id === 'hat_bucket') {
    x.ellipse(52, 21, 39, 25, 0, Math.PI, 0);
    x.fill();
    x.beginPath();
    x.moveTo(13, 18);
    x.lineTo(91, 18);
    x.lineTo(108, 34);
    x.lineTo(-4, 34);
    x.closePath();
    x.fill();
  } else if (id === 'hat_crown') {
    x.moveTo(20, 24);
    x.lineTo(16, -14);
    x.lineTo(36, 4);
    x.lineTo(53, -22);
    x.lineTo(70, 4);
    x.lineTo(90, -14);
    x.lineTo(86, 24);
    x.closePath();
    x.fill();
  }
}

function drawClub(x, type, color) {
  const c = CLUB_TYPES[type];
  const L = c.len;
  const g = x.createLinearGradient(-3, 0, 3, 0);
  g.addColorStop(0, '#6d7884');
  g.addColorStop(0.5, '#f2f6fa');
  g.addColorStop(1, '#7f8a96');
  x.fillStyle = g;
  x.fillRect(-1.7, 0, 3.4, L);
  x.fillStyle = '#23272e';
  x.fillRect(-2.7, -7, 5.4, 25);
  x.save();
  x.translate(0, L);
  x.fillStyle = color;
  x.strokeStyle = 'rgba(20,25,35,.55)';
  x.lineWidth = 1.4;
  x.beginPath();
  if (c.head === 'wood') {
    x.ellipse(11, -3, 15, 9, 0.05, 0, Math.PI * 2);
  } else if (c.head === 'iron') {
    x.moveTo(-3, -9); x.lineTo(19, -6); x.lineTo(21, 3); x.lineTo(-3, 3); x.closePath();
  } else if (c.head === 'wedge') {
    x.moveTo(-3, -10); x.lineTo(16, -11); x.lineTo(20, 3); x.lineTo(-3, 3); x.closePath();
  } else {
    x.roundRect(-4, -5, 26, 8, 3);
  }
  x.fill();
  x.stroke();
  x.restore();
}

/**
 * 스윙하는 캐릭터. (fx, fy)는 발 중심 화면 좌표, 오른쪽이 목표 방향.
 * o: { charId, topId, shoesId, hatId, clubType, clubColor, phi, expr, pose, scale, bob, flip }
 */
function drawGolfer(x, fx, fy, o) {
  const a = ART.char[o.charId];
  const s = o.scale;
  x.save();
  x.translate(fx, fy);
  x.scale(o.flip ? -s : s, s);
  if (o.pose) {
    const im = a[o.pose];
    x.drawImage(im, -im.width / 2, -im.height);
    x.restore();
    return;
  }
  const phi = o.phi;
  const sway = clamp(phi / 240, -0.6, 1) * 7;
  const leadBent = phi > 80;
  const legL = legSprite(o.charId, o.shoesId, 'leg');
  const legR = legSprite(o.charId, o.shoesId, leadBent ? 'legBend' : 'leg');
  const hipY = -52 + (o.bob || 0);
  x.save();
  x.translate(-21, hipY);
  x.rotate(0.13);
  x.drawImage(legL, -legL.width / 2, 0);
  x.restore();
  x.save();
  x.translate(21, hipY);
  x.rotate(-0.13);
  x.drawImage(legR, -legR.width / 2, 0);
  x.restore();
  x.translate(sway, o.bob || 0);
  const body = bodySprite(o.charId, o.topId);
  x.save();
  x.translate(0, -88);
  x.rotate(clamp(phi / 180, -1, 1.1) * 0.13);
  x.drawImage(body, -body.width / 2, -body.height / 2);
  x.restore();
  const grip = rigGrip(phi);
  const dirRad = phi * Math.PI / 180;
  // 뒤쪽 팔 → 클럽 → 앞쪽 팔 순으로 겹친다
  const drawArm = (sx) => {
    const sy = -116;
    const dx = grip.x - sx, dy = grip.y - sy;
    const ang = Math.atan2(dx, dy);
    const d = Math.hypot(dx, dy);
    x.save();
    x.translate(sx, sy);
    x.rotate(-ang);
    x.scale(1, clamp(d / 56, 0.62, 1.2));
    x.drawImage(a.arm, -a.arm.width / 2, -6);
    x.restore();
  };
  drawArm(-31);
  x.save();
  x.translate(grip.x, grip.y);
  x.rotate(-dirRad);
  drawClub(x, o.clubType, o.clubColor);
  x.restore();
  drawArm(31);
  const hx = Math.sin(dirRad) * 8, hy = Math.cos(dirRad) * 8;
  x.drawImage(a.hand, grip.x - a.hand.width / 2 - hx, grip.y - a.hand.height / 2 - hy);
  x.drawImage(a.hand, grip.x - a.hand.width / 2 + hx, grip.y - a.hand.height / 2 + hy);
  x.save();
  x.translate(2, -126);
  x.rotate(clamp(phi / 200, -0.8, 1.1) * 0.2 + 0.05);
  const head = a[o.expr || 'head'];
  x.translate(-head.width / 2, -head.height + 12);
  x.drawImage(head, 0, 0);
  drawHat(x, o.hatId);
  x.restore();
  x.restore();
}

function ballSprite() {
  return cached('ball', () => {
    const c = mkCanvas(64, 64);
    const x = c.getContext('2d');
    const g = x.createRadialGradient(24, 21, 2, 32, 32, 30);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.7, '#eef3f6');
    g.addColorStop(1, '#a9b8c6');
    x.fillStyle = g;
    x.beginPath();
    x.arc(32, 32, 30, 0, Math.PI * 2);
    x.fill();
    x.fillStyle = 'rgba(95,120,150,.26)';
    for (let i = 0; i < 26; i++) {
      const a = i * 2.4, r = 5 + i * 0.95;
      x.beginPath();
      x.arc(32 + Math.cos(a) * r, 32 + Math.sin(a) * r, 2.2, 0, Math.PI * 2);
      x.fill();
    }
    return c;
  });
}

function vignetteCanvas(W, H) {
  return cached('vig:' + W + 'x' + H, () => {
    const c = mkCanvas(W, H);
    const x = c.getContext('2d');
    const r = Math.hypot(W, H) * 0.62;
    const g = x.createRadialGradient(W / 2, H * 0.44, r * 0.45, W / 2, H * 0.44, r);
    g.addColorStop(0, 'rgba(10,20,50,0)');
    g.addColorStop(1, 'rgba(10,20,50,.42)');
    x.fillStyle = g;
    x.fillRect(0, 0, W, H);
    return c;
  });
}

/** 상점 아이콘 */
function itemIcon(slot, item, size) {
  const c = mkCanvas(size, size);
  const x = c.getContext('2d');
  if (slot === 'char') {
    const im = ART.char[item.id].idle;
    const k = Math.min((size * 0.94) / im.width, (size * 0.94) / im.height);
    x.drawImage(im, (size - im.width * k) / 2, size - im.height * k, im.width * k, im.height * k);
  } else if (slot === 'club') {
    x.translate(size * 0.3, size * 0.1);
    x.rotate(-0.42);
    x.scale(size / 180, size / 180);
    drawClub(x, '5I', item.color);
  } else if (slot === 'hat') {
    if (!item.color) { noneIcon(x, size); return c; }
    x.translate(size * 0.14, size * 0.42);
    x.scale(size / 150, size / 150);
    drawHat(x, item.id);
  } else if (slot === 'top') {
    const im = bodySprite('leo', item.id);
    const k = (size * 0.8) / Math.max(im.width, im.height);
    x.drawImage(im, (size - im.width * k) / 2, (size - im.height * k) / 2, im.width * k, im.height * k);
  } else {
    const im = legSprite('leo', item.id, 'leg');
    const k = (size * 0.84) / im.height;
    x.drawImage(im, (size - im.width * k) / 2, (size - im.height * k) / 2, im.width * k, im.height * k);
  }
  return c;
}

function noneIcon(x, size) {
  x.strokeStyle = '#a7b3c0';
  x.lineWidth = size * 0.07;
  x.beginPath();
  x.arc(size / 2, size / 2, size * 0.26, 0, Math.PI * 2);
  x.moveTo(size * 0.32, size * 0.32);
  x.lineTo(size * 0.68, size * 0.68);
  x.stroke();
}
