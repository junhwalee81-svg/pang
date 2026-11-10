/* 3D 캐릭터(뼈대 포즈, 옷 색, 머리·모자·클럽)와 상점 아이콘. 게임 상태를 바꾸지 않는다. */

var CHAR_LOOK = {
  leo: { skin: '#f0c39a', hair: '#8a4f2a', style: 'swept', shirt: '#3fae6b', pants: '#efe6d2', shoes: '#f4f1e8' },
  mina: { skin: '#f6d2b3', hair: '#6b3f22', style: 'pony', shirt: '#5aa7e0', pants: '#fbfbf6', shoes: '#e0e4ea' },
  kai: { skin: '#8d5a3b', hair: '#1f1a18', style: 'flat', shirt: '#f0a13a', pants: '#43507f', shoes: '#f4f4ef' },
  sora: { skin: '#a87048', hair: '#221a18', style: 'bun', shirt: '#37b36f', pants: '#6a5cc8', shoes: '#f4f4ef' },
  zombie: { skin: '#7fc48a', hair: '#26302b', style: 'spike', shirt: '#6b4fa0', pants: '#b07a45', shoes: '#33363d' },
  gbot: { skin: '#8fb0cd', hair: null, style: 'bot', shirt: '#4a6a8c', pants: '#2f4258', shoes: '#20262f', metal: true },
};

var RIG_CFG = { armR: 0.53, tilt: 28, armRatio: 0.88, clubRatio: 1.2, drop: 0.075, stance: 0.13, lean: 0.34 };

var MODELS = { rig: null, ready: false, icons: {} };

var _q1, _q2, _v1, _v2, _v3, _v4;

function base64ToBuffer(b64) {
  const bin = atob(b64);
  const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return u.buffer;
}

function loadImage3(src) {
  return new Promise((ok, no) => {
    const im = new Image();
    im.onload = () => ok(im);
    im.onerror = () => no(new Error('이미지 로드 실패'));
    im.src = src;
  });
}

function color3(hex) { return new THREE.Color(hex); }

/** 옷을 뼈대 기준 위치로 칠하는 재질 */
function paintedMaterial(base, uniforms) {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.62, metalness: 0 });
  mat.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, uniforms);
    s.vertexShader = 'varying vec3 vBindP;\n' + s.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vBindP = position;');
    s.fragmentShader = 'varying vec3 vBindP;\nuniform vec3 uSkin,uShirt,uPants,uShoes;uniform vec2 uH;\n' + s.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      float yy = vBindP.y / uH.x;
      float xx = abs(vBindP.x) / uH.x;
      vec3 c = uSkin;
      if (yy < 0.075) c = uShoes;
      else if (yy < 0.53) c = uPants;
      else if (yy < 0.555) c = uPants * 0.45;
      else if (yy < 0.835 && xx < 0.235) c = uShirt;
      diffuseColor.rgb = c;`);
  };
  return mat;
}

function hairMesh(look, mat) {
  const g = new THREE.Group();
  const cap = (sx, sy, sz, y, z) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), mat);
    m.scale.set(sx, sy, sz);
    m.position.set(0, y, z);
    m.castShadow = true;
    g.add(m);
    return m;
  };
  // 옆·뒷머리
  if (look.hair) cap(0.108, 0.125, 0.112, 0.012, -0.018);
  if (look.style === 'swept') {
    cap(0.1, 0.075, 0.108, 0.05, -0.012);
    cap(0.075, 0.04, 0.07, 0.115, 0.03).rotation.x = -0.4;
  } else if (look.style === 'pony') {
    cap(0.103, 0.082, 0.11, 0.045, -0.015);
    cap(0.042, 0.095, 0.042, -0.015, -0.125);
  } else if (look.style === 'flat') {
    cap(0.099, 0.06, 0.104, 0.075, -0.008);
  } else if (look.style === 'bun') {
    cap(0.102, 0.078, 0.108, 0.048, -0.014);
    cap(0.05, 0.05, 0.05, 0.135, -0.04);
  } else if (look.style === 'spike') {
    cap(0.098, 0.06, 0.103, 0.06, -0.01);
    for (let i = 0; i < 6; i++) {
      const c = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.09, 6), mat);
      const a = (i / 6) * 6.28;
      c.position.set(Math.cos(a) * 0.06, 0.13, Math.sin(a) * 0.06);
      c.rotation.set(Math.sin(a) * 0.4, 0, -Math.cos(a) * 0.4);
      g.add(c);
    }
  }
  return g;
}

function faceGroup(look) {
  const g = new THREE.Group();
  const eyeMat = new THREE.MeshBasicMaterial({ color: look.style === 'bot' ? 0xffe25a : 0x1a1512 });
  [-1, 1].forEach((s) => {
    const e = new THREE.Mesh(new THREE.SphereGeometry(look.style === 'bot' ? 0.024 : 0.017, 10, 8), eyeMat);
    e.position.set(s * 0.04, 0.012, 0.098);
    g.add(e);
    if (look.style !== 'bot') {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.042, 0.009, 0.01), new THREE.MeshBasicMaterial({ color: look.hair || 0x222222 }));
      b.position.set(s * 0.04, 0.045, 0.096);
      g.add(b);
    }
  });
  if (look.style !== 'bot') {
    const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.024, 0.0045, 6, 12, Math.PI), new THREE.MeshBasicMaterial({ color: 0x8a3f33 }));
    mouth.rotation.z = Math.PI;
    mouth.position.set(0, -0.035, 0.1);
    g.add(mouth);
  }
  return g;
}

function hatMesh(id) {
  const it = ITEMS.hat.find((h) => h.id === id);
  const g = new THREE.Group();
  if (!it || !it.color) return g;
  const mat = new THREE.MeshStandardMaterial({ color: it.color, roughness: 0.55 });
  const dark = new THREE.MeshStandardMaterial({ color: new THREE.Color(it.color).multiplyScalar(0.7), roughness: 0.6 });
  const dome = (r, sy) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 12, 0, 6.2832, 0, Math.PI / 2), mat);
    m.scale.y = sy;
    m.castShadow = true;
    return m;
  };
  if (id === 'hat_cap') {
    const d = dome(0.118, 0.9);
    d.position.y = 0.055;
    g.add(d);
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.012, 24, 1), dark);
    brim.scale.set(1, 1, 1.05);
    brim.position.set(0, 0.058, 0.115);
    brim.rotation.x = 0.12;
    g.add(brim);
  } else if (id === 'hat_visor') {
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.117, 0.117, 0.04, 24, 1, true), mat);
    band.position.y = 0.075;
    band.material.side = THREE.DoubleSide;
    g.add(band);
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.105, 0.012, 24, 1), dark);
    brim.position.set(0, 0.058, 0.12);
    brim.rotation.x = 0.12;
    g.add(brim);
  } else if (id === 'hat_bucket') {
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.122, 0.11, 24, 1), mat);
    top.position.y = 0.105;
    top.castShadow = true;
    g.add(top);
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.122, 0.18, 0.045, 24, 1, true), dark);
    brim.material.side = THREE.DoubleSide;
    brim.position.y = 0.036;
    g.add(brim);
  } else if (id === 'hat_crown') {
    const gold = new THREE.MeshStandardMaterial({ color: it.color, metalness: 0.85, roughness: 0.28 });
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.1, 0.05, 24, 1, true), gold);
    ring.material.side = THREE.DoubleSide;
    ring.position.y = 0.13;
    g.add(ring);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * 6.2832;
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.028, 0.08, 4), gold);
      spike.position.set(Math.cos(a) * 0.1, 0.19, Math.sin(a) * 0.1);
      g.add(spike);
    }
  }
  return g;
}

function clubMesh(type, color) {
  const c = CLUB_TYPES[type];
  const g = new THREE.Group();
  const shaftMat = new THREE.MeshStandardMaterial({ color: 0xd4dbe2, metalness: 0.9, roughness: 0.25 });
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.0095, 0.0065, c.len, 8), shaftMat);
  shaft.position.y = -c.len / 2;
  shaft.castShadow = true;
  g.add(shaft);
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.0145, 0.0125, 0.27, 8), new THREE.MeshStandardMaterial({ color: 0x20242b, roughness: 0.8 }));
  grip.position.y = -0.1;
  g.add(grip);
  const mat = new THREE.MeshStandardMaterial({ color, metalness: 0.75, roughness: 0.3 });
  let head;
  if (c.head === 'wood') {
    head = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), mat);
    head.scale.set(0.06, 0.03, 0.06);
    head.position.set(0, -c.len, 0.042);
  } else if (c.head === 'putter') {
    head = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.026, 0.115), mat);
    head.position.set(0, -c.len, 0.05);
  } else {
    head = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.05, 0.078), mat);
    head.rotation.x = c.head === 'wedge' ? 0.75 : 0.35;
    head.position.set(0, -c.len + 0.005, 0.035);
  }
  head.castShadow = true;
  g.add(head);
  return g;
}

/** 내장 GLB → 포즈를 줄 수 있는 캐릭터 */
async function loadModels() {
  _q1 = new THREE.Quaternion(); _q2 = new THREE.Quaternion();
  _v1 = new THREE.Vector3(); _v2 = new THREE.Vector3(); _v3 = new THREE.Vector3(); _v4 = new THREE.Vector3();
  const gltf = await new Promise((ok, no) => new THREE.GLTFLoader().parse(base64ToBuffer(ASSETS.golfer), '', ok, no));
  const root = gltf.scene;
  const group = new THREE.Group();
  group.add(root);
  const bones = {};
  let height = 0;
  const uniforms = { uSkin: { value: color3('#ffffff') }, uShirt: { value: color3('#ffffff') }, uPants: { value: color3('#ffffff') }, uShoes: { value: color3('#ffffff') }, uH: { value: new THREE.Vector2(1, 0) } };
  const mat = paintedMaterial(null, uniforms);
  root.traverse((o) => {
    if (o.isBone) bones[o.name] = o;
    if (o.isSkinnedMesh) {
      o.material = mat;
      o.castShadow = true;
      o.frustumCulled = false;
      o.geometry.computeBoundingBox();
      height = Math.max(height, o.geometry.boundingBox.max.y);
    }
  });
  uniforms.uH.value.x = height;
  group.updateMatrixWorld(true);
  const bind = new Map();
  for (const name in bones) {
    const b = bones[name];
    bind.set(b, { q: b.quaternion.clone(), p: b.position.clone(), world: b.getWorldQuaternion(new THREE.Quaternion()), wp: b.getWorldPosition(new THREE.Vector3()) });
  }
  const headRig = new THREE.Group();
  bones.Head.add(headRig);
  // 머리 뼈대의 축과 무관하게 모델 축 기준으로 장식을 붙인다
  headRig.quaternion.copy(bind.get(bones.Head).world).invert();
  const scaleWorld = bones.Head.getWorldScale(new THREE.Vector3());
  headRig.scale.setScalar(1 / scaleWorld.x);
  headRig.position.set(0, 0.0, 0);
  // 머리 메시의 실제 중심과 크기를 재서 머리카락·얼굴·모자를 맞춘다
  const lo = new THREE.Vector3(1e9, 1e9, 1e9), hi = new THREE.Vector3(-1e9, -1e9, -1e9);
  root.traverse((o) => {
    if (!o.isSkinnedMesh) return;
    const p = o.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) {
      if (p.getY(i) < height * 0.875 || Math.abs(p.getX(i)) > height * 0.1) continue;
      lo.min(_v1.set(p.getX(i), p.getY(i), p.getZ(i)));
      hi.max(_v1);
    }
  });
  const headP = bind.get(bones.Head).wp;
  const headFit = {
    x: (lo.x + hi.x) / 2 - headP.x, y: (lo.y + hi.y) / 2 - headP.y, z: (lo.z + hi.z) / 2 - headP.z,
    sx: (hi.x - lo.x) / 0.2, sy: (hi.y - lo.y) / 0.24, sz: (hi.z - lo.z) / 0.21,
  };
  const rig = { group, root, bones, bind, uniforms, headRig, headFit, height, mixer: new THREE.AnimationMixer(root), clips: {}, club: null, clubKey: '', appearKey: '', dancing: false, grip0: null };
  gltf.animations.forEach((a) => { rig.clips[a.name] = rig.mixer.clipAction(a); });
  MODELS.rig = rig;
  poseGolfer(rig, 0, null);
  MODELS.ready = true;
  return rig;
}

function resetBones(rig) {
  rig.bind.forEach((v, b) => { b.quaternion.copy(v.q); b.position.copy(v.p); });
}

function rotateWorld(bone, axisW, ang) {
  bone.getWorldQuaternion(_q1);
  _q2.setFromAxisAngle(axisW, ang).multiply(_q1);
  bone.parent.getWorldQuaternion(_q1).invert();
  bone.quaternion.copy(_q1).multiply(_q2);
  bone.updateMatrixWorld(true);
}

function aimBone(bone, childWorld, targetWorld) {
  const p = bone.getWorldPosition(new THREE.Vector3());
  const cur = childWorld.clone().sub(p).normalize();
  const want = targetWorld.clone().sub(p).normalize();
  const delta = new THREE.Quaternion().setFromUnitVectors(cur, want);
  const world = bone.getWorldQuaternion(new THREE.Quaternion());
  delta.multiply(world);
  bone.parent.getWorldQuaternion(_q1).invert();
  bone.quaternion.copy(_q1).multiply(delta);
  bone.updateMatrixWorld(true);
}

function twoBoneIK(upper, lower, end, target, poleW) {
  const S = upper.getWorldPosition(new THREE.Vector3());
  const E0 = lower.getWorldPosition(new THREE.Vector3());
  const H0 = end.getWorldPosition(new THREE.Vector3());
  const a = S.distanceTo(E0), b = E0.distanceTo(H0);
  const T = target.clone();
  const toT = T.clone().sub(S);
  const d = clamp(toT.length(), Math.abs(a - b) + 0.02, (a + b) * 0.995);
  toT.setLength(d);
  T.copy(S).add(toT);
  const x = (a * a - b * b + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, a * a - x * x));
  const dir = toT.clone().normalize();
  const pole = poleW.clone().sub(dir.clone().multiplyScalar(poleW.dot(dir))).normalize();
  const E = S.clone().add(dir.multiplyScalar(x)).add(pole.multiplyScalar(h));
  aimBone(upper, E0, E);
  aimBone(lower, end.getWorldPosition(new THREE.Vector3()), T);
}

/** 어드레스 때 클럽 끝이 공에 닿도록 하는 공까지의 거리 */
function clubReach(type) {
  const rig = MODELS.rig;
  const len = CLUB_TYPES[type].len;
  const g = rig && rig.grip0 ? rig.grip0 : { y: 0.76, z: 0.4 };
  return g.z + Math.sqrt(Math.max(0.04, len * len - g.y * g.y));
}

/**
 * 골프 자세. theta: 0이 어드레스, 음수가 백스윙(목표 반대쪽), 양수가 팔로스루(도).
 * 모델 기준: 앞 +Z, 왼쪽 +X(목표 방향).
 */
function poseGolfer(rig, theta, clubType) {
  const B = rig.bones;
  const g = rig.group;
  resetBones(rig);
  g.updateMatrixWorld(true);
  const toW = (x, y, z) => new THREE.Vector3(x, y, z).applyMatrix4(g.matrixWorld);
  const dirW = (x, y, z) => new THREE.Vector3(x, y, z).applyQuaternion(g.quaternion).normalize();
  const X = dirW(1, 0, 0), Y = dirW(0, 1, 0);
  const th = (theta * Math.PI) / 180;
  const turn = clamp(th, -2.4, 2.6);
  const hipShift = clamp(th / 2.4, -0.6, 1) * 0.05;
  const pb = rig.bind.get(B.pelvis);
  const hipW = toW(pb.wp.x + hipShift, pb.wp.y - RIG_CFG.drop, pb.wp.z - 0.02);
  B.pelvis.parent.updateMatrixWorld(true);
  B.pelvis.position.copy(B.pelvis.parent.worldToLocal(hipW.clone()));
  B.pelvis.updateMatrixWorld(true);
  rotateWorld(B.pelvis, Y, turn * 0.22);
  // 다리: 발은 넓게 벌려 고정한다
  [['l', 1], ['r', -1]].forEach(([s, sign]) => {
    const foot = B['foot_' + s];
    const f = rig.bind.get(foot);
    const ankle = toW(f.wp.x + sign * RIG_CFG.stance, f.wp.y, f.wp.z);
    twoBoneIK(B['thigh_' + s], B['calf_' + s], foot, ankle, dirW(sign * 0.25, 0, 1));
    foot.parent.getWorldQuaternion(_q1).invert();
    foot.quaternion.copy(_q1).multiply(_q2.copy(g.quaternion).multiply(f.world));
    foot.updateMatrixWorld(true);
  });
  rotateWorld(B.spine_01, X, RIG_CFG.lean * 0.55);
  rotateWorld(B.spine_02, X, RIG_CFG.lean * 0.45);
  const chestW = B.spine_03.getWorldPosition(new THREE.Vector3());
  const chest = g.worldToLocal(chestW.clone());
  const upAxis = B.spine_03.localToWorld(new THREE.Vector3(0, 0, 0)).sub(B.spine_01.getWorldPosition(new THREE.Vector3())).normalize();
  const twist = clamp(turn * 0.42, -0.95, 0.95);
  rotateWorld(B.spine_02, upAxis, twist * 0.5);
  rotateWorld(B.spine_03, upAxis, twist * 0.5);
  // 그립과 클럽이 움직이는 경사면
  const t = (RIG_CFG.tilt * Math.PI) / 180;
  const D = new THREE.Vector3(0, -Math.cos(t), Math.sin(t));
  const XL = new THREE.Vector3(1, 0, 0);
  const axis = new THREE.Vector3().crossVectors(D, XL).normalize();
  const hub = new THREE.Vector3(0, chest.y - 0.02, chest.z + 0.04);
  const grip = hub.clone().add(D.clone().multiplyScalar(RIG_CFG.armR).applyAxisAngle(axis, th * RIG_CFG.armRatio));
  if (theta === 0) rig.grip0 = { y: grip.y, z: grip.z };
  const reach = clubType ? clubReach(clubType) : 1;
  const addr = hub.clone().add(D.clone().multiplyScalar(RIG_CFG.armR));
  const dir0 = new THREE.Vector3(0, 0, reach).sub(addr).normalize();
  const clubDir = dir0.clone().applyAxisAngle(axis, th * RIG_CFG.clubRatio).normalize();
  const leftH = toW(grip.x, grip.y, grip.z);
  const rightH = toW(grip.x + clubDir.x * 0.1, grip.y + clubDir.y * 0.1, grip.z + clubDir.z * 0.1);
  twoBoneIK(B.upperarm_l, B.lowerarm_l, B.hand_l, leftH, dirW(0.7, -0.4, -0.4));
  twoBoneIK(B.upperarm_r, B.lowerarm_r, B.hand_r, rightH, dirW(-0.7, -0.4, -0.4));
  // 시선은 공에 둔다
  rotateWorld(B.neck_01, X, 0.2);
  rotateWorld(B.Head, Y, -twist * 0.75);
  if (rig.club) {
    rig.club.position.copy(grip);
    rig.club.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), clubDir);
  }
}

/** 캐릭터 외형을 장비에 맞춘다 */
function applyAppearance(rig, equip, clubType) {
  const key = equip.char + equip.hat + equip.top + equip.shoes;
  if (key !== rig.appearKey) {
    rig.appearKey = key;
    const look = CHAR_LOOK[equip.char];
    const top = ITEMS.top.find((t) => t.id === equip.top);
    const shoes = ITEMS.shoes.find((t) => t.id === equip.shoes);
    const u = rig.uniforms;
    u.uSkin.value.set(look.skin);
    u.uShirt.value.set(top && top.color ? top.color : look.shirt);
    u.uPants.value.set(look.pants);
    u.uShoes.value.set(shoes && shoes.color ? shoes.color : look.shoes);
    let mat;
    rig.root.traverse((o) => { if (o.isSkinnedMesh) mat = o.material; });
    mat.metalness = look.metal ? 0.65 : 0;
    mat.roughness = look.metal ? 0.34 : 0.62;
    while (rig.headRig.children.length) rig.headRig.remove(rig.headRig.children[0]);
    const holder = new THREE.Group();
    const fit = rig.headFit;
    holder.position.set(fit.x, fit.y, fit.z);
    holder.scale.set(fit.sx, fit.sy, fit.sz);
    if (look.hair) holder.add(hairMesh(look, new THREE.MeshStandardMaterial({ color: look.hair, roughness: 0.72 })));
    holder.add(faceGroup(look));
    const hat = hatMesh(equip.hat);
    hat.position.y = 0.03;
    holder.add(hat);
    rig.headRig.add(holder);
  }
  const clubKey = clubType + equip.club;
  if (clubKey !== rig.clubKey) {
    rig.clubKey = clubKey;
    if (rig.club) rig.group.remove(rig.club);
    const item = ITEMS.club.find((c) => c.id === equip.club);
    rig.club = clubMesh(clubType, item.color);
    rig.group.add(rig.club);
  }
}

/* ───────── 아이콘 ───────── */

/** 3D 캐릭터·모자를 찍어 상점과 타이틀에 쓴다 */
function renderIcons(renderer) {
  const rig = MODELS.rig;
  const size = 256;
  const rt = new THREE.WebGLRenderTarget(size, size, { encoding: THREE.LinearEncoding });
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x88806f, 0.95));
  const key = new THREE.DirectionalLight(0xffffff, 0.95);
  key.position.set(1.2, 2.5, 3);
  scene.add(key);
  scene.add(rig.group);
  const cam = new THREE.PerspectiveCamera(26, 1, 0.1, 30);
  const prevClear = new THREE.Color();
  renderer.getClearColor(prevClear);
  const prevAlpha = renderer.getClearAlpha();
  renderer.setClearColor(0x000000, 0);
  const shot = (key2) => {
    renderer.setRenderTarget(rt);
    renderer.clear();
    renderer.render(scene, cam);
    const px = new Uint8Array(size * size * 4);
    renderer.readRenderTargetPixels(rt, 0, 0, size, size, px);
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const x = c.getContext('2d');
    const im = x.createImageData(size, size);
    for (let y = 0; y < size; y++) {
      for (let i = 0; i < size * 4; i++) {
        const v = px[(size - 1 - y) * size * 4 + i];
        const channel = i % 4;
        im.data[y * size * 4 + i] = channel === 3 ? v : Math.min(255, Math.pow(v / 255, 1 / 2.2) * 255);
      }
    }
    x.putImageData(im, 0, 0);
    MODELS.icons[key2] = c.toDataURL('image/png');
  };
  rig.group.quaternion.identity();
  rig.group.position.set(0, 0, 0);
  rig.group.rotation.y = 0.35;
  rig.group.updateMatrixWorld(true);
  rig.bind.forEach((v, b) => { b.quaternion.copy(v.q); b.position.copy(v.p); });
  // 팔을 내린 차렷 자세
  const armDown = () => {
    resetBones(rig);
    rig.group.updateMatrixWorld(true);
    ['l', 'r'].forEach((s) => {
      const up = rig.bones['upperarm_' + s];
      const hand = rig.bones['lowerarm_' + s].getWorldPosition(new THREE.Vector3());
      const shoulder = up.getWorldPosition(new THREE.Vector3());
      aimBone(up, hand, shoulder.clone().add(new THREE.Vector3(s === 'l' ? 0.28 : -0.28, -1, 0).applyQuaternion(rig.group.quaternion)));
      const lower = rig.bones['lowerarm_' + s];
      const handW = rig.bones['hand_' + s].getWorldPosition(new THREE.Vector3());
      const elbow = lower.getWorldPosition(new THREE.Vector3());
      aimBone(lower, handW, elbow.clone().add(new THREE.Vector3(s === 'l' ? 0.18 : -0.18, -1, 0.25).applyQuaternion(rig.group.quaternion)));
    });
  };
  const base = Object.assign({}, DEFAULT_EQUIP);
  if (rig.club) rig.club.visible = false;
  cam.position.set(0, rig.height * 0.56, 4.3);
  cam.lookAt(0, rig.height * 0.5, 0);
  ITEMS.char.forEach((c) => {
    applyAppearance(rig, Object.assign({}, base, { char: c.id }), '5I');
    if (rig.club) rig.club.visible = false;
    armDown();
    shot('char:' + c.id);
  });
  cam.position.set(0, rig.height * 0.93, 1.25);
  cam.lookAt(0, rig.height * 0.93, 0);
  ITEMS.hat.forEach((h) => {
    if (!h.color) return;
    applyAppearance(rig, Object.assign({}, base, { hat: h.id }), '5I');
    if (rig.club) rig.club.visible = false;
    armDown();
    shot('hat:' + h.id);
  });
  rig.appearKey = '';
  if (rig.club) rig.club.visible = true;
  renderer.setRenderTarget(null);
  renderer.setClearColor(prevClear, prevAlpha);
  rt.dispose();
  scene.remove(rig.group);
}

function mkCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return c;
}

function drawIconClub(x, size, color) {
  x.save();
  x.translate(size * 0.3, size * 0.1);
  x.rotate(-0.42);
  const k = size / 180;
  x.scale(k, k);
  const g = x.createLinearGradient(-3, 0, 3, 0);
  g.addColorStop(0, '#6d7884');
  g.addColorStop(0.5, '#f2f6fa');
  g.addColorStop(1, '#7f8a96');
  x.fillStyle = g;
  x.fillRect(-2, 0, 4, 120);
  x.fillStyle = '#23272e';
  x.fillRect(-3.2, -8, 6.4, 34);
  x.translate(0, 120);
  x.fillStyle = color;
  x.beginPath();
  x.moveTo(-4, -11); x.lineTo(24, -7); x.lineTo(27, 4); x.lineTo(-4, 4);
  x.closePath();
  x.fill();
  x.restore();
}

/** 상점 아이콘 */
function itemIcon(slot, item, size) {
  const c = mkCanvas(size, size);
  const x = c.getContext('2d');
  if (slot === 'char' || slot === 'hat') {
    if (slot === 'hat' && !item.color) {
      x.strokeStyle = '#a7b3c0';
      x.lineWidth = size * 0.07;
      x.beginPath();
      x.arc(size / 2, size / 2, size * 0.26, 0, Math.PI * 2);
      x.moveTo(size * 0.32, size * 0.32);
      x.lineTo(size * 0.68, size * 0.68);
      x.stroke();
      return c;
    }
    const im = new Image();
    im.onload = () => x.drawImage(im, 0, 0, size, size);
    im.src = MODELS.icons[slot + ':' + item.id];
  } else if (slot === 'club') {
    drawIconClub(x, size, item.color);
  } else if (slot === 'top') {
    x.fillStyle = item.color || CHAR_LOOK.leo.shirt;
    x.beginPath();
    const s = size / 100;
    [[30, 22], [42, 18], [50, 25], [58, 18], [70, 22], [90, 40], [78, 52], [70, 44], [70, 86], [30, 86], [30, 44], [22, 52], [10, 40]].forEach(([a, b], i) => (i ? x.lineTo(a * s, b * s) : x.moveTo(a * s, b * s)));
    x.closePath();
    x.fill();
    x.fillStyle = 'rgba(255,255,255,.28)';
    x.fillRect(46 * s, 25 * s, 8 * s, 18 * s);
  } else {
    const s = size / 100;
    x.fillStyle = item.color || CHAR_LOOK.leo.shoes;
    x.beginPath();
    x.moveTo(14 * s, 42 * s);
    x.lineTo(42 * s, 42 * s);
    x.lineTo(54 * s, 54 * s);
    x.quadraticCurveTo(88 * s, 56 * s, 90 * s, 70 * s);
    x.lineTo(14 * s, 70 * s);
    x.closePath();
    x.fill();
    x.fillStyle = 'rgba(30,30,40,.75)';
    x.fillRect(12 * s, 70 * s, 80 * s, 6 * s);
  }
  return c;
}
