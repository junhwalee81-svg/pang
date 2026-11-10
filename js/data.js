/* 게임 데이터: 클럽·장비·홀. 밸런스 수치는 이 파일 상단 표에서만 고친다. */

// v0: 최대 발사 속도(m/s), loft: 기본 발사각(도), spin: 기본 백스핀, spinCtl: 스핀 입력 효과
// curveCtl: 좌우 타점이 휘게 하는 힘, angleRange: 위아래 타점에 따른 발사각 변화(도), reach: 어드레스 때 공까지의 거리(그림용), len: 샤프트 길이(그림용)
var CLUB_TYPES = {
  '1W': { name: '드라이버', v0: 74.5, loft: 13, spin: 0.42, spinCtl: 0.3, curveCtl: 0.5, angleRange: 6, len: 1.12, head: 'wood' },
  '5I': { name: '5번 아이언', v0: 50.2, loft: 22, spin: 0.8, spinCtl: 0.45, curveCtl: 0.45, angleRange: 7, len: 0.98, head: 'iron' },
  'SW': { name: '샌드 웨지', v0: 32.6, loft: 50, spin: 1.2, spinCtl: 0.6, curveCtl: 0.32, angleRange: 9, len: 0.9, head: 'wedge' },
  'PT': { name: '퍼터', v0: 7.1, loft: 0, spin: 0, spinCtl: 0, curveCtl: 0, angleRange: 0, len: 0.86, head: 'putter' },
};
var CLUB_ORDER = ['1W', '5I', 'SW', 'PT'];

// 특수샷: 게이지가 오르는 동안 커맨드를 넣고 임팩트가 판정 폭 안에 들어가야 나간다.
// loftAdd: 발사각 추가(도), speedMul: 속도 배율, spinAdd: 스핀 추가, side: 휘는 힘(회오리는 그린 방향에 따라 부호)
// restMul·tangMul: 첫 착지 반발·수평 유지 배율, muMul: 구름 저항 배율, backMul: 백스핀이 공을 끄는 힘 배율
// gesture: 화면에 그리는 모양, keys: 키보드 화살표 순서(U·D·L·R)
var SPECIAL_SHOTS = {
  tomahawk: { name: '토마호크', desc: '고탄도 · 착지 후 거의 안 구름', gesture: '위로 긋기', keys: ['UU'], icon: '⤒', loftAdd: 18, speedMul: 0.86, spinAdd: 0.05, restMul: 0.3, tangMul: 0.16, muMul: 6, trail: ['255,105,180', '170,80,255'], glow: '#ff78c8' },
  spike: { name: '스파이크', desc: '저탄도 · 강한 런', gesture: '아래로 긋기', keys: ['DD'], icon: '⤓', loftAdd: -4, speedMul: 1, spinAdd: -0.1, restMul: 1, tangMul: 1.15, muMul: 0.55, trail: ['110,240,255', '50,140,255'], glow: '#6ee8ff' },
  tornado: { name: '회오리', desc: '크게 휘어 들어가는 샷', gesture: '원 그리기', keys: ['LUR', 'RUL'], icon: '↻', loftAdd: 3, speedMul: 1.03, spinAdd: 0, side: 0.62, restMul: 1, tangMul: 1, muMul: 1, trail: ['190,255,120', '40,200,120'], glow: '#9dff7a' },
  dot: { name: '도트', desc: '떨어진 뒤 뒤로 끌려오는 샷', gesture: '점 세 번 찍기', keys: ['UDU'], icon: '⁘', loftAdd: 0, speedMul: 0.95, spinAdd: 0.2, backMul: 5, restMul: 0.7, tangMul: 1, muMul: 1, trail: ['255,236,120', '255,150,40'], glow: '#ffe066' },
};
var SPECIAL_ORDER = ['tomahawk', 'spike', 'tornado', 'dot'];

var STAT_KEYS = ['power', 'control', 'impact', 'spin'];
var STAT_NAMES = { power: '파워', control: '컨트롤', impact: '임팩트', spin: '스핀' };

var SLOT_ORDER = ['char', 'club', 'hat', 'top', 'shoes'];
var SLOT_NAMES = { char: '캐릭터', club: '클럽', hat: '모자', top: '상의', shoes: '신발' };

var ITEMS = {
  char: [
    { id: 'leo', name: '레오', price: 0, stats: { power: 10, control: 10, impact: 10, spin: 10 }, passive: { kind: 'windMul', value: 0.9, text: '바람 영향 -10%' } },
    { id: 'mina', name: '미나', price: 300, stats: { power: 8, control: 13, impact: 11, spin: 10 }, passive: { kind: 'puttGaugeMul', value: 0.8, text: '퍼팅 게이지 20% 느림' } },
    { id: 'kai', name: '카이', price: 500, stats: { power: 14, control: 8, impact: 10, spin: 8 }, passive: { kind: 'driverDist', value: 1.05, text: '드라이버 비거리 +5%' } },
    { id: 'sora', name: '소라', price: 500, stats: { power: 9, control: 11, impact: 9, spin: 15 }, passive: { kind: 'backMul', value: 1.3, text: '백스핀 효과 +30%' } },
    { id: 'zombie', name: '좀비 버디', price: 800, stats: { power: 12, control: 7, impact: 14, spin: 9 }, passive: { kind: 'perfectCoinMul', value: 2, text: '팡 성공 시 코인 2배' } },
    { id: 'gbot', name: 'G-BOT', price: 1200, stats: { power: 11, control: 14, impact: 12, spin: 11 }, passive: { kind: 'windMarker', value: true, text: '최대비거리 마커에 바람 반영' } },
  ],
  club: [
    { id: 'club_basic', name: '연습용 세트', price: 0, color: '#9aa7b4', stats: {} },
    { id: 'club_sky', name: '하늘 카본', price: 400, color: '#3ea6ff', stats: { power: 3, control: 1 } },
    { id: 'club_gold', name: '황금 단조', price: 900, color: '#f2b632', stats: { power: 3, impact: 3 } },
    { id: 'club_ruby', name: '루비 블레이드', price: 1500, color: '#e0405a', stats: { power: 6, spin: 3 } },
  ],
  hat: [
    { id: 'hat_none', name: '모자 없음', price: 0, stats: {} },
    { id: 'hat_cap', name: '스포츠 캡', price: 150, color: '#e8493f', stats: { control: 1 } },
    { id: 'hat_visor', name: '선 바이저', price: 250, color: '#2fb6a6', stats: { impact: 2 } },
    { id: 'hat_bucket', name: '버킷햇', price: 350, color: '#e9b44c', stats: { control: 2, spin: 1 } },
    { id: 'hat_crown', name: '우승 왕관', price: 1000, color: '#f7c531', stats: { power: 2, impact: 2 } },
  ],
  top: [
    { id: 'top_basic', name: '기본 셔츠', price: 0, stats: {} },
    { id: 'top_mint', name: '민트 폴로', price: 200, color: '#39c7a5', stats: { control: 2 } },
    { id: 'top_red', name: '레드 니트', price: 300, color: '#e4503f', stats: { power: 2 } },
    { id: 'top_navy', name: '네이비 조끼', price: 650, color: '#2f4a8c', stats: { power: 1, spin: 3 } },
  ],
  shoes: [
    { id: 'shoes_basic', name: '기본 운동화', price: 0, stats: {} },
    { id: 'shoes_white', name: '화이트 스파이크', price: 200, color: '#f4f4ef', stats: { control: 2 } },
    { id: 'shoes_orange', name: '오렌지 러너', price: 300, color: '#f28a2e', stats: { impact: 2 } },
    { id: 'shoes_black', name: '블랙 프로', price: 700, color: '#2a2d36', stats: { power: 2, control: 2 } },
  ],
};

var DEFAULT_EQUIP = { char: 'leo', club: 'club_basic', hat: 'hat_none', top: 'top_basic', shoes: 'shoes_basic' };

// 나무 종류. scale: 높이 배율, halfWidth: 잎 절반 폭(높이 대비), base: 잎 시작 높이 비율, cols: 그림 안 변형 수
var TREE_KINDS = {
  oak: { tex: 'oak', cols: 1, scale: 1, halfWidth: 0.42, base: 0.3, bbox: [0.04, 0.04, 0.96, 0.82] },
  maple: { tex: 'maple', cols: 1, scale: 1, halfWidth: 0.44, base: 0.3, bbox: [0.04, 0.15, 0.96, 0.87] },
  fir: { tex: 'fir', cols: 3, scale: 1.45, halfWidth: 0.17, base: 0.22, bbox: [0.04, 0.05, 0.96, 0.95] },
};

// 테마. sky: 내장 하늘, sunAz·sunEl: 코스 기준 해 방향(도), tree: 잎 색 배율
var THEMES = {
  spring: { sky: 'spring', skyTurn: 0, sunAz: 150, sunEl: 48, sun: '#fff1d8', sunI: 2.6, hemi: 0.55, fog: '#b9d4ea', trees: ['oak', 'maple', 'fir'], tint: [0.82, 1.12, 0.62], fair: '#74c63f', rough: '#3f8f2f', green: '#a3e266', far: '#5b9a58' },
  autumn: { sky: 'autumn', skyTurn: 0, sunAz: 205, sunEl: 30, sun: '#ffe2b8', sunI: 2.5, hemi: 0.5, fog: '#d9d6c6', trees: ['oak', 'maple', 'fir'], tint: [1.75, 0.95, 0.42], fair: '#9dbb46', rough: '#7a8c33', green: '#bfdc6a', far: '#a58a4a' },
  beach: { sky: 'beach', skyTurn: 0, sunAz: 120, sunEl: 34, sun: '#fff4dc', sunI: 2.3, hemi: 0.62, fog: '#c7dbe0', trees: ['oak', 'fir', 'maple'], tint: [0.78, 1.16, 0.7], fair: '#6fd34f', rough: '#39a146', green: '#a8ec70', far: '#6bb08a' },
  dusk: { sky: 'dusk', skyTurn: 0, sunAz: 175, sunEl: 14, sun: '#ffc08a', sunI: 2.6, hemi: 0.7, fog: '#e9b590', trees: ['fir', 'oak', 'fir'], tint: [0.78, 0.82, 0.55], fair: '#6da648', rough: '#3f7a3c', green: '#9bc960', far: '#5a5a58' },
};

// pts: [x(m), 높이(m)] / curve: [x, 좌우 위치] 도그레그 / tee·fair: [시작, 끝]
// green: 시작, 끝, 기준 높이, slope(앞뒤 경사 %), slopeZ(좌우 경사 %), rz(좌우 반지름) / cupOff: 컵 좌우 위치
// bunkers·ponds: [시작, 끝, 좌우 위치, 좌우 반지름] / wind: 최대 풍속(m/s)
var HOLES = [
  { name: '봄바람 언덕', par: 4, theme: 'spring', cup: 318, cupOff: -3, end: 390, wind: 3,
    pts: [[-70, 8], [0, 7], [14, 6.4], [70, 3], [130, 6.5], [190, 4], [250, 2], [290, 2.5], [340, 2], [390, 5], [470, 10]],
    curve: [[0, 0], [120, 0], [260, 26], [340, 34]],
    tee: [-7, 9], fair: [28, 276], green: { from: 298, to: 340, base: 2.5, slope: 1.5, slopeZ: -0.8, rz: 19 },
    bunkers: [[272, 292, -16, 8], [300, 322, 26, 7], [326, 344, -24, 6]], ponds: [] },
  { name: '연못 너머', par: 3, theme: 'spring', cup: 152, cupOff: 4, end: 215, wind: 4,
    pts: [[-70, 9], [0, 8], [12, 7.2], [60, 4], [120, 4.5], [175, 5], [215, 8], [290, 12]],
    tee: [-7, 9], fair: [114, 132], green: { from: 134, to: 172, base: 5, slope: -2, slopeZ: 1, rz: 17 },
    bunkers: [[136, 158, -24, 6], [174, 188, 6, 12]], ponds: [[42, 106, 0, 60]] },
  { name: '단풍 능선', par: 5, theme: 'autumn', cup: 505, cupOff: 2, end: 570, wind: 5,
    pts: [[-70, 6], [0, 5], [14, 4.6], [90, 9], [170, 5], [245, 12], [320, 7], [395, 3], [470, 3.5], [530, 3], [570, 7], [650, 11]],
    curve: [[0, 0], [170, -6], [330, -46], [470, -18], [530, -14]],
    tee: [-7, 9], fair: [30, 472], green: { from: 484, to: 528, base: 3.3, slope: 2.4, slopeZ: 0.6, rz: 20 },
    bunkers: [[214, 236, 15, 8], [260, 282, -19, 7], [464, 482, 14, 9], [488, 516, -27, 6]], ponds: [] },
  { name: '해안 절벽', par: 4, theme: 'beach', cup: 330, cupOff: -2, end: 395, wind: 6,
    pts: [[-70, 3], [0, 3], [14, 3], [80, 2], [150, 4], [225, 8], [285, 13], [320, 14], [360, 13.6], [395, 16], [470, 20]],
    curve: [[0, 0], [100, 8], [230, 40], [340, 28]],
    tee: [-7, 9], fair: [30, 286], green: { from: 308, to: 352, base: 14, slope: -1.2, slopeZ: -1.4, rz: 20 },
    bunkers: [[288, 304, 16, 9], [316, 340, -28, 6]], ponds: [[92, 140, -24, 26]] },
  { name: '가을 내리막', par: 3, theme: 'autumn', cup: 182, cupOff: -5, end: 245, wind: 4,
    pts: [[-70, 28], [0, 25], [14, 24], [60, 15], [120, 7], [165, 4], [205, 4], [245, 8], [320, 12]],
    tee: [-7, 9], fair: [108, 148], green: { from: 164, to: 204, base: 4, slope: 3, slopeZ: 0.8, rz: 18 },
    bunkers: [[148, 162, 10, 11], [206, 220, -8, 10], [170, 192, 25, 6]], ponds: [] },
  { name: '노을 챔피언', par: 5, theme: 'dusk', cup: 548, cupOff: 3, end: 615, wind: 6,
    pts: [[-70, 9], [0, 8], [14, 7.5], [80, 3], [150, 6], [235, 2.5], [320, 7], [400, 2.5], [470, 5], [525, 3], [570, 3], [615, 7], [690, 11]],
    curve: [[0, 0], [150, 18], [300, 52], [440, 20], [550, 6]],
    tee: [-7, 9], fair: [30, 510], green: { from: 528, to: 572, base: 3, slope: -2.6, slopeZ: 1.2, rz: 20 },
    bunkers: [[184, 204, -18, 8], [506, 524, -12, 10], [534, 562, 28, 6]], ponds: [[268, 300, 30, 24], [372, 430, 12, 58]] },
];

if (typeof module !== 'undefined') {
  Object.assign(globalThis, { TREE_KINDS, SPECIAL_SHOTS, SPECIAL_ORDER, CLUB_TYPES, CLUB_ORDER, STAT_KEYS, STAT_NAMES, SLOT_ORDER, SLOT_NAMES, ITEMS, DEFAULT_EQUIP, THEMES, HOLES });
}
