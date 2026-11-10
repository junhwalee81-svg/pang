/* three.js 장면. G를 읽기만 한다(장면 객체는 화면 전용 상태). */

var VIEW = { ready: false, tex: {}, fxMat: new Map(), hole: null, W: 0, H: 0 };

function loadTexture(src, opts) {
  return loadImage3(src).then((im) => {
    const t = new THREE.Texture(im);
    t.encoding = opts && opts.linear ? THREE.LinearEncoding : THREE.sRGBEncoding;
    t.wrapS = t.wrapT = opts && opts.clamp ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
    t.anisotropy = 4;
    t.needsUpdate = true;
    return t;
  });
}

async function initView(canvas) {
  THREE.ColorManagement.legacyMode = false;
  const R = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  R.outputEncoding = THREE.sRGBEncoding;
  R.toneMapping = THREE.ACESFilmicToneMapping;
  R.toneMappingExposure = 0.92;
  R.shadowMap.enabled = true;
  R.shadowMap.type = THREE.PCFSoftShadowMap;
  VIEW.R = R;
  VIEW.scene = new THREE.Scene();
  VIEW.camera = new THREE.PerspectiveCamera(50, 1, 0.15, 4200);
  VIEW.sun = new THREE.DirectionalLight(0xffffff, 2);
  VIEW.sun.castShadow = true;
  const shadowSize = window.innerWidth < 700 ? 1024 : 2048; // 휴대폰은 그림자 해상도를 낮춘다
  VIEW.sun.shadow.mapSize.set(shadowSize, shadowSize);
  VIEW.sun.shadow.bias = -0.0004;
  VIEW.sun.shadow.normalBias = 0.05;
  const s = VIEW.sun.shadow.camera;
  s.left = -55; s.right = 55; s.top = 55; s.bottom = -55; s.near = 10; s.far = 500;
  VIEW.scene.add(VIEW.sun, VIEW.sun.target);
  VIEW.hemi = new THREE.HemisphereLight(0xcfe6ff, 0x6a7a3a, 0.5);
  VIEW.scene.add(VIEW.hemi);
  VIEW.scene.fog = new THREE.Fog(0xcfe0ee, 700, 3000);

  const jobs = [];
  for (const k in ASSETS.tex) jobs.push(loadTexture(ASSETS.tex[k], { linear: k === 'water' }).then((t) => { VIEW.tex[k] = t; }));
  VIEW.sky = {};
  for (const k in ASSETS.sky) jobs.push(loadTexture(ASSETS.sky[k], { clamp: false }).then((t) => { VIEW.sky[k] = t; }));
  VIEW.treeTex = {};
  for (const k in ASSETS.tree) jobs.push(loadTexture(ASSETS.tree[k], { clamp: true }).then((t) => { VIEW.treeTex[k] = t; }));
  VIEW.fxTex = {};
  for (const k in ASSETS.fx) jobs.push(loadTexture(ASSETS.fx[k], { clamp: true }).then((t) => { VIEW.fxTex[k] = t; }));
  await Promise.all(jobs);
  buildSharedObjects();
  await loadModels();
  renderIcons(R);
  VIEW.scene.add(MODELS.rig.group);
  VIEW.ready = true;
}

function buildSharedObjects() {
  const scene = VIEW.scene;
  // 하늘(위쪽 반구만)
  const skyGeo = new THREE.SphereGeometry(3400, 64, 20, 0, Math.PI * 2, 0, Math.PI / 2);
  const uv = skyGeo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setY(i, (uv.getY(i) - 0.5) * 2);
  VIEW.skyMesh = new THREE.Mesh(skyGeo, new THREE.MeshBasicMaterial({ side: THREE.BackSide, fog: false, toneMapped: false, depthWrite: false }));
  VIEW.skyMesh.renderOrder = -10;
  scene.add(VIEW.skyMesh);

  // 공
  const ballMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.32 });
  VIEW.ball = new THREE.Mesh(new THREE.SphereGeometry(0.0235, 18, 14), ballMat);
  VIEW.ball.castShadow = true;
  scene.add(VIEW.ball);
  VIEW.ballBlob = new THREE.Mesh(new THREE.CircleGeometry(1, 20), new THREE.MeshBasicMaterial({ color: 0x06180c, transparent: true, opacity: 0.4, depthWrite: false }));
  VIEW.ballBlob.rotation.x = -Math.PI / 2;
  scene.add(VIEW.ballBlob);
  // 공 위치 표시: 풀에 가리거나 멀어도 보이게 항상 맨 앞에 그린다
  const lc = mkCanvas(64, 96);
  const lx = lc.getContext('2d');
  lx.fillStyle = '#ffe24a';
  lx.strokeStyle = 'rgba(20,30,60,.85)';
  lx.lineWidth = 6;
  lx.beginPath();
  lx.moveTo(10, 10); lx.lineTo(54, 10); lx.lineTo(32, 52); lx.closePath();
  lx.stroke();
  lx.fill();
  const ltex = new THREE.CanvasTexture(lc);
  ltex.encoding = THREE.sRGBEncoding;
  VIEW.locator = new THREE.Sprite(new THREE.SpriteMaterial({ map: ltex, depthTest: false, depthWrite: false, transparent: true, fog: false }));
  VIEW.locator.renderOrder = 20;
  VIEW.locator.center.set(0.5, 0);
  scene.add(VIEW.locator);
  VIEW.ballGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: VIEW.fxTex.light, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  scene.add(VIEW.ballGlow);

  // 궤적 띠
  const N = 90;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 2 * 3), 3));
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(N * 2 * 4), 4));
  const idx = [];
  for (let i = 0; i < N - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  geo.setIndex(idx);
  VIEW.trail = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  VIEW.trail.frustumCulled = false;
  VIEW.trailMax = N;
  scene.add(VIEW.trail);

  // 조준 점선과 착지 고리
  VIEW.dots = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, fog: false }), 44);
  VIEW.dots.frustumCulled = false;
  scene.add(VIEW.dots);
  VIEW.ring = new THREE.Mesh(new THREE.RingGeometry(0.82, 1, 44), new THREE.MeshBasicMaterial({ color: 0xfff0a0, transparent: true, opacity: 0.95, side: THREE.DoubleSide, depthWrite: false, fog: false }));
  VIEW.ring.rotation.x = -Math.PI / 2;
  scene.add(VIEW.ring);
  VIEW.beam = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 40, 16, 1, true), new THREE.MeshBasicMaterial({ color: 0xfff0a0, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  scene.add(VIEW.beam);

  // 입자
  VIEW.sprites = [];
  for (let i = 0; i < 180; i++) {
    const sp = new THREE.Sprite();
    sp.visible = false;
    scene.add(sp);
    VIEW.sprites.push(sp);
  }

  // 그린 경사 화살표
  const shape = new THREE.Shape();
  shape.moveTo(-0.5, -0.46); shape.lineTo(0, -0.46); shape.lineTo(0.55, 0); shape.lineTo(0, 0.46); shape.lineTo(-0.5, 0.46); shape.lineTo(0, 0);
  shape.closePath();
  VIEW.chevGeo = new THREE.ShapeGeometry(shape);
  VIEW.chevGeo.rotateX(-Math.PI / 2);
}

function fxMaterial(tex, color, add) {
  const key = tex + color + add;
  let m = VIEW.fxMat.get(key);
  if (!m) {
    m = new THREE.SpriteMaterial({ map: VIEW.fxTex[tex], color, transparent: true, depthWrite: false, blending: add ? THREE.AdditiveBlending : THREE.NormalBlending });
    VIEW.fxMat.set(key, m);
  }
  return m;
}

/* ───────── 코스 ───────── */

function disposeGroup(g) {
  g.traverse((o) => {
    if (o.geometry && o.geometry !== VIEW.chevGeo) o.geometry.dispose();
    if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => { if (m.map && m.map.isCanvasTexture) m.map.dispose(); m.dispose(); });
  });
}

function courseBounds(hole) {
  const last = hole.pts[hole.pts.length - 1][0];
  return { x0: COURSE.minX, x1: last, z0: -COURSE.halfZ, z1: COURSE.halfZ };
}

function patternOf(x, tex, scale) {
  const p = x.createPattern(tex.image, 'repeat');
  p.setTransform(new DOMMatrix().scale(scale));
  return p;
}

/** 코스를 위에서 그린 그림: 지형 무늬이자 미니맵 원본 */
function paintCourse(hole) {
  const B = courseBounds(hole);
  const W = 4096;
  const k = W / (B.x1 - B.x0);
  const H = Math.round((B.z1 - B.z0) * k);
  const c = mkCanvas(W, H);
  const x = c.getContext('2d');
  const T = THEMES[hole.theme];
  const px = (wx) => (wx - B.x0) * k;
  const pz = (wz) => (wz - B.z0) * k;
  const rng = makeRng(hole.cup + 11);
  x.fillStyle = T.rough;
  x.fillRect(0, 0, W, H);
  x.globalAlpha = 0.5;
  x.globalCompositeOperation = 'overlay';
  x.fillStyle = patternOf(x, VIEW.tex.grass, 0.55);
  x.fillRect(0, 0, W, H);
  x.globalCompositeOperation = 'source-over';
  for (let i = 0; i < 500; i++) {
    const r = 40 + rng() * 170;
    const gx = rng() * W, gy = rng() * H;
    const g = x.createRadialGradient(gx, gy, 0, gx, gy, r);
    const dark = rng() < 0.5;
    g.addColorStop(0, dark ? 'rgba(15,50,20,.2)' : 'rgba(220,240,120,.13)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    x.globalAlpha = 1;
    x.fillStyle = g;
    x.fillRect(gx - r, gy - r, r * 2, r * 2);
  }
  // 페어웨이
  const fairPath = (grow) => {
    x.beginPath();
    const a = hole.fair[0], b = hole.fair[1];
    const cx = (a + b) / 2, half = (b - a) / 2;
    const edge = (wx, sign) => {
      const u = (wx - cx) / half;
      const end = Math.sqrt(Math.max(0, 1 - Math.pow(Math.abs(u), 10)));
      return centerZ(hole, wx) + sign * (fairwayHalf(hole, wx) * end + grow * Math.min(1, end * 3));
    };
    for (let wx = a; wx <= b; wx += 2) x.lineTo(px(wx), pz(edge(wx, -1)));
    for (let wx = b; wx >= a; wx -= 2) x.lineTo(px(wx), pz(edge(wx, 1)));
    x.closePath();
  };
  fairPath(2.4);
  x.fillStyle = hexShade(T.fair, -0.16);
  x.fill();
  x.save();
  fairPath(0);
  x.fillStyle = T.fair;
  x.fill();
  x.clip();
  x.globalAlpha = 0.5;
  x.globalCompositeOperation = 'overlay';
  x.fillStyle = patternOf(x, VIEW.tex.turf, 0.4);
  x.fillRect(0, 0, W, H);
  x.globalCompositeOperation = 'source-over';
  // 깎은 잔디 무늬(비스듬한 격자)
  x.fillStyle = 'rgba(255,255,210,.12)';
  const stripe = 7 * k;
  for (let i = -H; i < W + H; i += stripe * 2) {
    x.globalAlpha = 1;
    x.save();
    x.translate(i, 0);
    x.transform(1, 0, 0.8, 1, 0, 0);
    x.fillRect(0, 0, stripe, H);
    x.restore();
  }
  x.fillStyle = 'rgba(0,50,10,.08)';
  for (let i = -H; i < W + H; i += stripe * 2) {
    x.save();
    x.translate(i, 0);
    x.transform(1, 0, -0.8, 1, 0, 0);
    x.fillRect(0, 0, stripe, H);
    x.restore();
  }
  x.restore();
  x.globalAlpha = 1;
  const S = holeShapes(hole);
  if (hole.layout) {
    for (const p of hole.layout.patches) {
      const r = p.r * k;
      const g = x.createRadialGradient(px(p.x), pz(p.z), r * 0.55, px(p.x), pz(p.z), r);
      const col = p.type === 'hard' ? '205,183,119' : '70,120,60';
      g.addColorStop(0, `rgba(${col},${p.type === 'hard' ? 0.7 : 0.42})`);
      g.addColorStop(1, `rgba(${col},0)`);
      x.fillStyle = g;
      x.fillRect(px(p.x) - r, pz(p.z) - r, r * 2, r * 2);
    }
  }
  const ell = (e, grow, fill) => {
    x.beginPath();
    x.ellipse(px(e.cx), pz(e.cz), (e.rx + grow) * k, (e.rz + grow) * k, 0, 0, Math.PI * 2);
    x.fillStyle = fill;
    x.fill();
  };
  for (const e of S.ponds) {
    ell(e, 2.5, hexShade(T.rough, -0.2));
    ell(e, 0, '#0e4a62');
  }
  for (const e of S.bunkers) {
    ell(e, 1.6, hexShade(T.rough, -0.25));
    ell(e, 0, '#efdca4');
    x.save();
    x.beginPath();
    x.ellipse(px(e.cx), pz(e.cz), e.rx * k, e.rz * k, 0, 0, Math.PI * 2);
    x.clip();
    x.globalAlpha = 0.5;
    x.globalCompositeOperation = 'overlay';
    x.fillStyle = patternOf(x, VIEW.tex.sand, 0.3);
    x.fillRect(0, 0, W, H);
    x.restore();
    x.globalAlpha = 1;
  }
  ell(S.green, 2.6, hexShade(T.fair, 0.1));
  ell(S.green, 0, T.green);
  x.save();
  x.beginPath();
  x.ellipse(px(S.green.cx), pz(S.green.cz), S.green.rx * k, S.green.rz * k, 0, 0, Math.PI * 2);
  x.clip();
  x.fillStyle = 'rgba(255,255,255,.075)';
  const gs = 2.2 * k;
  for (let i = 0; i < W; i += gs * 2) x.fillRect(i, 0, gs, H);
  x.fillStyle = 'rgba(0,40,0,.04)';
  for (let i = 0; i < H; i += gs * 2) x.fillRect(0, i, W, gs);
  x.restore();
  // 티
  x.fillStyle = hexShade(T.fair, 0.12);
  x.beginPath();
  x.roundRect(px(hole.tee[0]), pz(-6), (hole.tee[1] - hole.tee[0]) * k, 12 * k, 2 * k);
  x.fill();
  return { canvas: c, B, k };
}

function hexShade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v) => Math.round(clamp(amt > 0 ? v + (255 - v) * amt : v * (1 + amt), 0, 255));
  return `rgb(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

function terrainMesh(hole, paint) {
  const B = paint.B;
  const step = 2;
  const nx = Math.floor((B.x1 - B.x0) / step) + 1;
  const nz = Math.floor((B.z1 - B.z0) / step) + 1;
  const pos = new Float32Array(nx * nz * 3), uv = new Float32Array(nx * nz * 2);
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < nz; j++) {
      const k = i * nz + j;
      const x = B.x0 + i * step, z = B.z0 + j * step;
      pos[k * 3] = x; pos[k * 3 + 1] = heightAt(hole, x, z); pos[k * 3 + 2] = z;
      uv[k * 2] = (x - B.x0) / (B.x1 - B.x0);
      uv[k * 2 + 1] = 1 - (z - B.z0) / (B.z1 - B.z0);
    }
  }
  const idx = new Uint32Array((nx - 1) * (nz - 1) * 6);
  let n = 0;
  for (let i = 0; i < nx - 1; i++) {
    for (let j = 0; j < nz - 1; j++) {
      const a = i * nz + j, b = a + 1, c = a + nz, d = c + 1;
      idx[n++] = a; idx[n++] = b; idx[n++] = c; idx[n++] = b; idx[n++] = d; idx[n++] = c;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.computeVertexNormals();
  const tex = new THREE.CanvasTexture(paint.canvas);
  tex.encoding = THREE.sRGBEncoding;
  tex.anisotropy = VIEW.R.capabilities.getMaxAnisotropy();
  const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.96, metalness: 0, envMapIntensity: 0.5 });
  const detail = VIEW.tex.turf;
  mat.onBeforeCompile = (s) => {
    s.uniforms.uDetail = { value: detail };
    s.vertexShader = 'varying vec3 vW;\n' + s.vertexShader.replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\n vW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    s.fragmentShader = 'varying vec3 vW;\nuniform sampler2D uDetail;\n' + s.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
      float dist = length(vW - cameraPosition);
      float near = 1.0 - smoothstep(25.0, 140.0, dist);
      vec3 d1 = texture2D(uDetail, vW.xz * 0.7).rgb;
      vec3 d2 = texture2D(uDetail, vW.xz * 0.11).rgb;
      float lum = dot(d1, vec3(.33)) * 2.3;
      float lum2 = dot(d2, vec3(.33)) * 2.3;
      diffuseColor.rgb *= mix(1.0, lum, 0.55 * near) * mix(1.0, lum2, 0.35);`);
  };
  const m = new THREE.Mesh(geo, mat);
  m.receiveShadow = true;
  return m;
}

/** 코스 밖으로 이어지는 낮은 언덕 */
function outerLand(hole) {
  const B = courseBounds(hole);
  const span = 3600, n = 90;
  const geo = new THREE.PlaneGeometry(span, span, n, n);
  geo.rotateX(-Math.PI / 2);
  const cx = (B.x0 + B.x1) / 2;
  geo.translate(cx, 0, 0);
  const pos = geo.attributes.position;
  const far = new THREE.Color(THEMES[hole.theme].far), near = new THREE.Color(THEMES[hole.theme].rough);
  const col = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const qx = clamp(x, B.x0, B.x1), qz = clamp(z, B.z0, B.z1);
    const d = Math.hypot(x - qx, z - qz);
    const hills = (Math.sin(x * 0.006 + 1.3) * Math.cos(z * 0.0043) + 0.55 * Math.sin(x * 0.013 + z * 0.009) + 0.8) * 13;
    pos.setY(i, d <= 1 ? heightAt(hole, qx, qz) - 6 : heightAt(hole, qx, qz) - 0.6 + smooth(d / 520) * hills);
    c.copy(near).lerp(far, smooth(d / 300));
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, envMapIntensity: 0.4 }));
  return m;
}

/** 겹친 판의 뒷면이 까맣게 되지 않도록 법선을 뒤집지 않는다 */
function keepNormals(mat) {
  mat.onBeforeCompile = (s) => {
    s.fragmentShader = s.fragmentShader.replace('#include <normal_fragment_begin>', THREE.ShaderChunk.normal_fragment_begin.replace('gl_FrontFacing ? 1.0 : - 1.0', '1.0'));
  };
  return mat;
}

function treeGeometry(info, variant) {
  const [u0, v0, u1, v1] = info.bbox;
  const cw = (u1 - u0) / info.cols;
  const a = u0 + cw * variant, b = a + cw;
  const aspect = (cw / (v1 - v0));
  const hw = aspect / 2;
  const mk = (ang) => {
    const c = Math.cos(ang) * hw, s = Math.sin(ang) * hw;
    return {
      p: [-c, 0, -s, c, 0, s, c, 1, s, -c, 1, -s],
      u: [a, 1 - v1, b, 1 - v1, b, 1 - v0, a, 1 - v0],
    };
  };
  const planes = [mk(0.4), mk(0.4 + Math.PI / 2), mk(0.4 + Math.PI / 4)];
  const pos = [], uv = [], idx = [], nor = [];
  planes.forEach((pl, i) => {
    pos.push(...pl.p);
    uv.push(...pl.u);
    for (let k = 0; k < 4; k++) nor.push(0.2, 0.95, 0.2);
    const o = i * 4;
    idx.push(o, o + 1, o + 2, o, o + 2, o + 3);
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setIndex(idx);
  return g;
}

function buildTrees(hole, group) {
  const T = THEMES[hole.theme];
  const byKey = new Map();
  hole.layout.trees.forEach((t) => {
    const key = t.kind + ':' + t.variant;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(t);
  });
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), P = new THREE.Vector3(), S = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  const col = new THREE.Color();
  VIEW.treeLook = [];
  byKey.forEach((list, key) => {
    const [kind, variant] = key.split(':');
    const info = TREE_KINDS[kind];
    const tex = VIEW.treeTex[info.tex];
    const mat = keepNormals(new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.38, side: THREE.DoubleSide, roughness: 0.9, envMapIntensity: 0.55, alphaToCoverage: true }));
    const mesh = new THREE.InstancedMesh(treeGeometry(info, +variant), mat, list.length);
    mesh.castShadow = true;
    mesh.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: tex, alphaTest: 0.42 });
    mesh.frustumCulled = false;
    list.forEach((t, i) => {
      P.set(t.x, heightAt(hole, t.x, t.z) - 0.1, t.z);
      Q.setFromAxisAngle(up, t.turn);
      S.setScalar(t.h);
      M.compose(P, Q, S);
      mesh.setMatrixAt(i, M);
      const v = 0.88 + t.tint * 0.26;
      col.setRGB(T.tint[0] * v, T.tint[1] * v, T.tint[2] * v);
      mesh.setColorAt(i, col);
      VIEW.treeLook.push({ tree: t, mesh, index: i });
    });
    group.add(mesh);
  });
}

function buildRocks(hole, group) {
  const rocks = hole.layout.rocks;
  if (!rocks.length) return;
  const geo = new THREE.IcosahedronGeometry(1, 1);
  const p = geo.attributes.position;
  const rng = makeRng(77);
  for (let i = 0; i < p.count; i++) {
    const k = 0.8 + 0.34 * Math.abs(Math.sin(p.getX(i) * 7.1 + p.getY(i) * 3.3 + p.getZ(i) * 5.7));
    p.setXYZ(i, p.getX(i) * k, p.getY(i) * k, p.getZ(i) * k);
  }
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ color: 0x9a9c9b, roughness: 0.92, map: VIEW.tex.soil, flatShading: true });
  const mesh = new THREE.InstancedMesh(geo, mat, rocks.length);
  mesh.castShadow = mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), P = new THREE.Vector3(), S = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  rocks.forEach((r, i) => {
    P.set(r.x, heightAt(hole, r.x, r.z) + r.r * 0.3, r.z);
    Q.setFromAxisAngle(up, r.turn);
    S.set(r.r * 1.05, r.r * 0.9, r.r);
    M.compose(P, Q, S);
    mesh.setMatrixAt(i, M);
  });
  group.add(mesh);
  rng();
}

/** 풀 포기: 가까이서 땅이 납작해 보이지 않게 한다 */
function buildTufts(hole, group) {
  const c = mkCanvas(128, 128);
  const x = c.getContext('2d');
  const r = makeRng(5);
  for (let i = 0; i < 46; i++) {
    const bx = 8 + r() * 112, top = 8 + r() * 80;
    x.strokeStyle = `rgba(${90 + r() * 50},${150 + r() * 60},${50 + r() * 30},1)`;
    x.lineWidth = 3 + r() * 3;
    x.beginPath();
    x.moveTo(bx, 128);
    x.quadraticCurveTo(bx + (r() - 0.5) * 18, 70, bx + (r() - 0.5) * 34, top);
    x.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.encoding = THREE.sRGBEncoding;
  tex.generateMipmaps = false;
  tex.minFilter = THREE.LinearFilter;
  const geo = new THREE.PlaneGeometry(1, 1);
  geo.translate(0, 0.5, 0);
  const merged = new THREE.BufferGeometry();
  const pa = [], ua = [], ia = [], na = [];
  [0.6, 0.6 + Math.PI / 2].forEach((a, j) => {
    const cs = Math.cos(a) * 0.5, sn = Math.sin(a) * 0.5;
    pa.push(-cs, 0, -sn, cs, 0, sn, cs, 1, sn, -cs, 1, -sn);
    ua.push(0, 0, 1, 0, 1, 1, 0, 1);
    for (let k = 0; k < 4; k++) na.push(0, 1, 0);
    const o = j * 4;
    ia.push(o, o + 1, o + 2, o, o + 2, o + 3);
  });
  merged.setAttribute('position', new THREE.Float32BufferAttribute(pa, 3));
  merged.setAttribute('uv', new THREE.Float32BufferAttribute(ua, 2));
  merged.setAttribute('normal', new THREE.Float32BufferAttribute(na, 3));
  merged.setIndex(ia);
  geo.dispose();
  const count = 1900;
  const mesh = new THREE.InstancedMesh(merged, keepNormals(new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 1, envMapIntensity: 0.3 })), count);
  mesh.frustumCulled = false;
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), P = new THREE.Vector3(), S = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  const col = new THREE.Color();
  const tint = new THREE.Color(THEMES[hole.theme].rough);
  const rng = makeRng(hole.cup + 3);
  const last = hole.end;
  let n = 0;
  for (let tries = 0; tries < count * 12 && n < count; tries++) {
    const wx = -8 + rng() * (last + 8);
    const wz = centerZ(hole, wx) + (rng() * 2 - 1) * (fairwayHalf(hole, wx) + 40);
    if (surfaceAt(hole, wx, wz) !== 'rough') continue;
    const h = 0.16 + rng() * 0.26;
    P.set(wx, heightAt(hole, wx, wz) - 0.02, wz);
    Q.setFromAxisAngle(up, rng() * 6.28);
    S.set(h * 1.5, h, h * 1.5);
    M.compose(P, Q, S);
    mesh.setMatrixAt(n, M);
    col.copy(tint).lerp(new THREE.Color(0xdff0a0), 0.12 + rng() * 0.22);
    mesh.setColorAt(n, col);
    n++;
  }
  mesh.count = n;
  group.add(mesh);
}

function buildFlag(hole, group) {
  const S = holeShapes(hole);
  const y = heightAt(hole, hole.cup, S.cupZ);
  const f = new THREE.Group();
  f.position.set(hole.cup, y, S.cupZ);
  const hole2 = new THREE.Mesh(new THREE.CircleGeometry(0.17, 28), new THREE.MeshBasicMaterial({ color: 0x0b0f0a }));
  hole2.rotation.x = -Math.PI / 2;
  hole2.position.y = 0.012;
  f.add(hole2);
  const rim = new THREE.Mesh(new THREE.RingGeometry(0.165, 0.19, 28), new THREE.MeshStandardMaterial({ color: 0xf2f2f2 }));
  rim.rotation.x = -Math.PI / 2;
  rim.position.y = 0.014;
  f.add(rim);
  const H = 3.2;
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, H, 8), new THREE.MeshStandardMaterial({ color: 0xf6f6f6, roughness: 0.4 }));
  pole.position.y = H / 2;
  pole.castShadow = true;
  f.add(pole);
  const cloth = new THREE.PlaneGeometry(1.15, 0.72, 14, 4);
  cloth.translate(0.575, 0, 0);
  const mat = new THREE.MeshStandardMaterial({ color: 0xe8362e, side: THREE.DoubleSide, roughness: 0.65 });
  const flag = new THREE.Mesh(cloth, mat);
  flag.position.y = H - 0.38;
  flag.castShadow = true;
  f.add(flag);
  VIEW.flag = flag;
  VIEW.flagBase = Float32Array.from(cloth.attributes.position.array);
  group.add(f);
  // 티 마커
  [-3.4, 3.4].forEach((z) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 8), new THREE.MeshStandardMaterial({ color: 0xe8362e, roughness: 0.35 }));
    m.position.set(hole.tee[1] - 6, heightAt(hole, hole.tee[1] - 6, z) + 0.05, z);
    m.castShadow = true;
    group.add(m);
  });
}

function buildWater(hole, group) {
  VIEW.waterTex = null;
  const t = prepareHole(hole);
  if (!t.level.length) return;
  const nor = VIEW.tex.water.clone();
  nor.needsUpdate = true;
  nor.repeat.set(26, 26);
  VIEW.waterTex = nor;
  t.level.forEach((p) => {
    const geo = new THREE.CircleGeometry(1, 64);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshStandardMaterial({ color: 0x2b86b4, roughness: 0.1, metalness: 0.15, normalMap: nor, normalScale: new THREE.Vector2(0.5, 0.5), transparent: true, opacity: 0.9, envMapIntensity: 1.5 });
    const m = new THREE.Mesh(geo, mat);
    m.scale.set(p.rx + 0.4, 1, p.rz + 0.4);
    m.position.set(p.cx, p.y, p.cz);
    m.receiveShadow = true;
    group.add(m);
  });
}

function buildGreenArrows(hole, group) {
  const S = holeShapes(hole);
  const pts = [];
  for (let x = S.green.cx - S.green.rx; x <= S.green.cx + S.green.rx; x += 3.2) {
    for (let z = S.green.cz - S.green.rz; z <= S.green.cz + S.green.rz; z += 3.2) {
      if (ellipseR(S.green, x, z) < 0.94) pts.push([x, z]);
    }
  }
  const mesh = new THREE.InstancedMesh(VIEW.chevGeo, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide, fog: false }), pts.length);
  mesh.frustumCulled = false;
  mesh.visible = false;
  mesh.userData.pts = pts;
  group.add(mesh);
  VIEW.arrows = mesh;
}

function applyTheme(hole) {
  const T = THEMES[hole.theme];
  const R = VIEW.R, scene = VIEW.scene;
  const tex = VIEW.sky[T.sky];
  VIEW.skyMesh.material.map = tex;
  VIEW.skyMesh.material.needsUpdate = true;
  const sunU = { spring: 0.6, autumn: 0.6, beach: 0.7, dusk: 0.6 }[T.sky];
  const skyAng = Math.PI - 2 * Math.PI * sunU;
  const az = (T.sunAz * Math.PI) / 180, el = (T.sunEl * Math.PI) / 180;
  VIEW.skyMesh.rotation.y = skyAng - az;
  VIEW.sunDir = new THREE.Vector3(Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el));
  VIEW.sun.color.set(T.sun);
  VIEW.sun.intensity = T.sunI;
  VIEW.hemi.intensity = T.hemi;
  scene.fog.color.set(T.fog);
  if (VIEW.envKey !== T.sky) {
    VIEW.envKey = T.sky;
    const sub = new THREE.Scene();
    const dome = VIEW.skyMesh.clone();
    dome.material = VIEW.skyMesh.material.clone();
    dome.scale.setScalar(0.1);
    sub.add(dome);
    const floor = new THREE.Mesh(new THREE.SphereGeometry(300, 16, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), new THREE.MeshBasicMaterial({ color: T.far, side: THREE.BackSide }));
    sub.add(floor);
    if (!VIEW.pmrem) VIEW.pmrem = new THREE.PMREMGenerator(R);
    if (VIEW.envRT) VIEW.envRT.dispose();
    VIEW.envRT = VIEW.pmrem.fromScene(sub, 0.02);
    scene.environment = VIEW.envRT.texture;
    dome.material.dispose();
    floor.geometry.dispose();
    floor.material.dispose();
  }
}

/** 홀이 바뀌면 코스를 새로 만든다 */
function buildHole(hole) {
  if (VIEW.holeKey === hole.name + hole.layout.seed) return;
  VIEW.holeKey = hole.name + hole.layout.seed;
  if (VIEW.group) {
    VIEW.scene.remove(VIEW.group);
    disposeGroup(VIEW.group);
  }
  const g = new THREE.Group();
  applyTheme(hole);
  const paint = paintCourse(hole);
  g.add(terrainMesh(hole, paint));
  g.add(outerLand(hole));
  buildWater(hole, g);
  buildTrees(hole, g);
  buildRocks(hole, g);
  buildTufts(hole, g);
  buildFlag(hole, g);
  buildGreenArrows(hole, g);
  VIEW.group = g;
  VIEW.scene.add(g);
  VIEW.paint = paint;
  VIEW.miniDirty = true;
}

/* ───────── 매 프레임 ───────── */

function resizeView(W, H, offsetY) {
  VIEW.W = W; VIEW.H = H;
  const dpr = Math.min(window.devicePixelRatio || 1, W < 700 ? 1.5 : 2);
  VIEW.R.setPixelRatio(dpr);
  VIEW.R.setSize(W, H, false);
  VIEW.camera.aspect = W / H;
  VIEW.camera.fov = W < H ? 62 : 44;
  VIEW.camera.setViewOffset(W, H, 0, offsetY, W, H);
  VIEW.camera.updateProjectionMatrix();
}

function placeCamera(G) {
  const c = VIEW.camera, g = G.cam;
  c.position.set(g.px, g.py, g.pz);
  c.lookAt(g.lx, g.ly, g.lz);
  VIEW.skyMesh.position.copy(c.position);
}

function updateSunTarget(focus) {
  VIEW.sun.target.position.copy(focus);
  VIEW.sun.position.copy(focus).addScaledVector(VIEW.sunDir, 220);
}

function updateGolfer(G) {
  const rig = MODELS.rig;
  const show = !!G.hole;
  rig.group.visible = show;
  if (!show) return;
  const gf = G.golfer;
  const club = G.swingClub || G.club;
  applyAppearance(rig, G.equip, club);
  rig.group.position.set(gf.x, heightAt(G.hole, gf.x, gf.z), gf.z);
  rig.group.rotation.y = -gf.yaw;
  rig.group.updateMatrixWorld(true);
  if (gf.pose === 'dance') {
    if (!rig.dancing) {
      rig.dancing = true;
      resetBones(rig);
      rig.clips.Dance_Loop.reset().play();
      if (rig.club) rig.club.visible = false;
    }
    rig.mixer.setTime(G.time);
    return;
  }
  if (rig.dancing) {
    rig.dancing = false;
    rig.clips.Dance_Loop.stop();
    if (rig.club) rig.club.visible = true;
  }
  poseGolfer(rig, gf.phi, club);
}

function updateBallView(G) {
  const b = G.ball;
  const has = !!b && !!G.hole && !b.holed;
  VIEW.ball.visible = VIEW.ballBlob.visible = has;
  VIEW.ballGlow.visible = has && !!G.shotStyle && b.mode !== 'stop';
  VIEW.locator.visible = has && (G.phase === 'ball' || G.phase === 'stopped');
  if (!has) return;
  const camDist = VIEW.camera.position.distanceTo(_vTmp.set(b.x, b.y, b.z));
  const sc = Math.max(1.2, camDist / 9);
  VIEW.ball.scale.setScalar(sc);
  VIEW.ball.position.set(b.x, b.y + 0.0235 * sc, b.z);
  VIEW.ball.rotation.x = b.rot;
  const gy = heightAt(G.hole, b.x, b.z);
  const alt = Math.max(0, b.y - gy);
  const s = 0.028 * sc * (1 + alt * 0.04);
  VIEW.ballBlob.scale.set(s, s, 1);
  VIEW.ballBlob.position.set(b.x, gy + 0.02, b.z);
  VIEW.ballBlob.material.opacity = clamp(0.5 - alt * 0.008, 0.14, 0.5);
  if (VIEW.locator.visible) {
    const ls = clamp(camDist * 0.035, 0.18, 6);
    VIEW.locator.scale.set(ls * 0.66, ls, 1);
    VIEW.locator.position.set(b.x, b.y + 0.12 * sc + ls * 0.25 + Math.abs(Math.sin(G.time * 5)) * ls * 0.15, b.z);
  }
  if (VIEW.ballGlow.visible) {
    const sp = SPECIAL_SHOTS[G.shotStyle];
    VIEW.ballGlow.material.color.set(sp ? sp.glow : '#ffd25a');
    VIEW.ballGlow.scale.setScalar(sc * 0.45);
    VIEW.ballGlow.position.copy(VIEW.ball.position);
  }
}

var _vTmp;

function updateTrail(G) {
  const T = G.trail, N = VIEW.trailMax;
  const geo = VIEW.trail.geometry;
  const pa = geo.attributes.position.array, ca = geo.attributes.color.array;
  const n = Math.min(T.length, N);
  VIEW.trail.visible = n >= 2;
  if (n < 2) return;
  const sp = SPECIAL_SHOTS[G.shotStyle];
  const c0 = sp ? sp.trail[0].split(',') : G.shotStyle === 'perfect' ? ['255', '214', '84'] : ['255', '255', '255'];
  const cam = VIEW.camera.position;
  const dir = new THREE.Vector3(), side = new THREE.Vector3(), toCam = new THREE.Vector3(), p = new THREE.Vector3(), q = new THREE.Vector3();
  for (let i = 0; i < N; i++) {
    const a = T[Math.min(i, n - 1)], b = T[Math.min(i + 1, n - 1)], a0 = T[Math.max(Math.min(i, n - 1) - 1, 0)];
    p.set(a.x, a.y, a.z);
    q.set(b.x, b.y, b.z);
    dir.subVectors(q, a0 === a && a === b ? p : p).add(p.clone().sub(a0 ? new THREE.Vector3(a0.x, a0.y, a0.z) : p));
    toCam.subVectors(cam, p).normalize();
    side.crossVectors(dir, toCam).normalize();
    const u = Math.min(i, n - 1) / (n - 1);
    const w = clamp(cam.distanceTo(p) * 0.0045, 0.012, 0.32) * (0.2 + u * 0.8);
    for (let k = 0; k < 2; k++) {
      const s = k ? -w : w;
      const o = (i * 2 + k) * 3;
      pa[o] = p.x + side.x * s;
      pa[o + 1] = p.y + side.y * s;
      pa[o + 2] = p.z + side.z * s;
      const c = (i * 2 + k) * 4;
      ca[c] = +c0[0] / 255;
      ca[c + 1] = +c0[1] / 255;
      ca[c + 2] = +c0[2] / 255;
      ca[c + 3] = (i < n ? u * u : 0) * 0.62 * G.trailFade;
    }
  }
  geo.attributes.position.needsUpdate = true;
  geo.attributes.color.needsUpdate = true;
}

function updateAimView(G) {
  const aiming = !!G.hole && (G.phase === 'aim' || G.phase === 'power' || G.phase === 'impact');
  const ring = VIEW.ring, beam = VIEW.beam, dots = VIEW.dots;
  const showFull = aiming && G.markerX != null && G.club !== 'PT';
  ring.visible = beam.visible = showFull;
  dots.visible = aiming && G.preview.length > 1;
  if (showFull) {
    const y = heightAt(G.hole, G.markerX, G.markerZ);
    const camD = VIEW.camera.position.distanceTo(_vTmp.set(G.markerX, y, G.markerZ));
    const rr = clamp(camD * 0.05, 2.4, 13);
    ring.scale.set(rr, rr, 1);
    ring.position.set(G.markerX, y + 0.4, G.markerZ);
    beam.position.set(G.markerX, y + 20, G.markerZ);
    beam.scale.set(rr * 0.07, 1, rr * 0.07);
  }
  if (dots.visible) {
    const M = new THREE.Matrix4();
    const P = new THREE.Vector3(), S = new THREE.Vector3(), Q = new THREE.Quaternion();
    const n = Math.min(G.preview.length, dots.count);
    for (let i = 0; i < n; i++) {
      const pt = G.preview[i];
      P.set(pt.x, pt.y, pt.z);
      const d = VIEW.camera.position.distanceTo(P);
      S.setScalar(clamp(d * 0.0035, 0.02, 0.5));
      M.compose(P, Q, S);
      dots.setMatrixAt(i, M);
    }
    dots.count = n;
    dots.instanceMatrix.needsUpdate = true;
  }
  const arrows = VIEW.arrows;
  arrows.visible = aiming && G.club === 'PT';
  if (arrows.visible) {
    const M = new THREE.Matrix4(), P = new THREE.Vector3(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    const col = new THREE.Color();
    const phase = (G.time * 0.55) % 1;
    arrows.userData.pts.forEach(([x, z], i) => {
      const g = gradAt(G.hole, x, z);
      const pct = Math.hypot(g[0], g[1]) * 100;
      const ang = Math.atan2(-g[1], -g[0]);
      const ax = x + Math.cos(ang) * phase * 1.8, az = z + Math.sin(ang) * phase * 1.8;
      P.set(ax, heightAt(G.hole, ax, az) + 0.03, az);
      Q.setFromAxisAngle(up, -ang);
      S.setScalar(0.26 + Math.min(pct, 4) * 0.05);
      M.compose(P, Q, S);
      arrows.setMatrixAt(i, M);
      col.set(pct < 1 ? '#ffffff' : pct < 2.2 ? '#ffe45c' : '#ff9a3d');
      arrows.setColorAt(i, col);
    });
    arrows.instanceMatrix.needsUpdate = true;
    if (arrows.instanceColor) arrows.instanceColor.needsUpdate = true;
  }
}

function updateFlag(G) {
  if (!VIEW.flag) return;
  const pos = VIEW.flag.geometry.attributes.position, base = VIEW.flagBase;
  const speed = 5 + Math.hypot(G.wind, G.windZ);
  for (let i = 0; i < pos.count; i++) {
    const x = base[i * 3];
    pos.setZ(i, Math.sin(x * 5.5 - G.time * speed) * 0.09 * (x / 1.15));
    pos.setY(i, base[i * 3 + 1] + Math.sin(x * 3.1 - G.time * speed * 0.7) * 0.03 * x);
  }
  pos.needsUpdate = true;
  VIEW.flag.geometry.computeVertexNormals();
  VIEW.flag.rotation.y = -Math.atan2(G.windZ, G.wind);
}

function updateParticles(G) {
  const list = VIEW.sprites;
  const n = Math.min(G.fx.length, list.length);
  for (let i = 0; i < list.length; i++) {
    const sp = list[i];
    if (i >= n) { sp.visible = false; continue; }
    const p = G.fx[i];
    const u = p.life / p.max;
    sp.visible = true;
    sp.material = fxMaterial(p.tex, p.color, p.add);
    sp.position.set(p.x, p.y, p.z);
    const s = p.size * (1 + (1 - u) * p.grow);
    sp.scale.set(s, s, 1);
    sp.material.opacity = clamp(u * (p.alpha || 1), 0, 1);
  }
}

function renderGame(G) {
  if (!VIEW.ready) return;
  _vTmp = _vTmp || new THREE.Vector3();
  const hole = G.hole || G.titleHole;
  if (!hole) return;
  buildHole(hole);
  placeCamera(G);
  updateSunTarget(_vTmp.set(G.cam.lx, G.hole ? G.cam.ly : 0, G.cam.lz).clone());
  updateGolfer(G);
  updateBallView(G);
  updateTrail(G);
  updateAimView(G);
  updateFlag(G);
  updateParticles(G);
  if (VIEW.waterTex) {
    VIEW.waterTex.offset.x = G.time * 0.012;
    VIEW.waterTex.offset.y = G.time * 0.007;
  }
  VIEW.R.render(VIEW.scene, VIEW.camera);
}

/** 위에서 본 코스 지도 */
function drawMinimap(G, x, w, h) {
  const hole = G.hole;
  if (!hole || !VIEW.paint) return;
  const P = VIEW.paint;
  const zs = [];
  for (let wx = 0; wx <= hole.end; wx += 10) zs.push(centerZ(hole, wx));
  const midZ = (Math.min(...zs) + Math.max(...zs)) / 2;
  const x0 = -12, x1 = hole.end + 4;
  const scale = h / (x1 - x0);
  const halfWorldZ = w / 2 / scale;
  if (VIEW.miniDirty || VIEW.miniW !== w) {
    VIEW.miniDirty = false;
    VIEW.miniW = w;
    const c = mkCanvas(w * 2, h * 2);
    const m = c.getContext('2d');
    m.scale(2, 2);
    m.translate(w / 2, h);
    m.rotate(-Math.PI / 2);
    const sw = (x1 - x0) * P.k, sh = halfWorldZ * 2 * P.k;
    m.drawImage(P.canvas, (x0 - P.B.x0) * P.k, (midZ - halfWorldZ - P.B.z0) * P.k, sw, sh, 0, -w / 2, h, w);
    VIEW.miniBg = c;
  }
  x.clearRect(0, 0, w, h);
  x.drawImage(VIEW.miniBg, 0, 0, w, h);
  const px = (wz) => w / 2 + (wz - midZ) * scale;
  const py = (wx) => h - (wx - x0) * scale;
  const S = holeShapes(hole);
  const b = G.ball;
  if (G.markerX != null && G.club !== 'PT' && (G.phase === 'aim' || G.phase === 'power' || G.phase === 'impact')) {
    x.strokeStyle = 'rgba(255,240,150,.95)';
    x.lineWidth = 1.5;
    x.setLineDash([3, 3]);
    x.beginPath();
    x.moveTo(px(b.z), py(b.x));
    x.lineTo(px(G.markerZ), py(G.markerX));
    x.stroke();
    x.setLineDash([]);
    x.beginPath();
    x.arc(px(G.markerZ), py(G.markerX), 3.5, 0, 6.3);
    x.stroke();
  }
  const fx = px(S.cupZ), fy = py(hole.cup);
  x.strokeStyle = '#fff';
  x.lineWidth = 1.4;
  x.beginPath();
  x.moveTo(fx, fy);
  x.lineTo(fx, fy - 11);
  x.stroke();
  x.fillStyle = '#ff3d3d';
  x.beginPath();
  x.moveTo(fx, fy - 11);
  x.lineTo(fx + 7, fy - 8);
  x.lineTo(fx, fy - 5);
  x.fill();
  x.fillStyle = '#fff';
  x.strokeStyle = '#123';
  x.lineWidth = 1.3;
  x.beginPath();
  x.arc(px(b.z), py(b.x), 3.6, 0, 6.3);
  x.fill();
  x.stroke();
}
