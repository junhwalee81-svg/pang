/* 게임 데이터: 클럽·장비·홀. 밸런스 수치는 이 파일 상단 표에서만 고친다. */

// v0: 최대 발사 속도(m/s), loft: 기본 발사각(도), spin: 기본 백스핀, spinCtl: 스핀 입력 효과
// angleRange: 각도 조절 폭(도), reach: 어드레스 때 공까지의 거리(그림용), len: 샤프트 길이(그림용)
var CLUB_TYPES = {
  '1W': { name: '드라이버', v0: 74.5, loft: 13, spin: 0.42, spinCtl: 0.3, angleRange: 8, len: 96, head: 'wood' },
  '5I': { name: '5번 아이언', v0: 50.2, loft: 22, spin: 0.8, spinCtl: 0.45, angleRange: 10, len: 82, head: 'iron' },
  'SW': { name: '샌드 웨지', v0: 32.6, loft: 50, spin: 1.2, spinCtl: 0.6, angleRange: 14, len: 72, head: 'wedge' },
  'PT': { name: '퍼터', v0: 7.1, loft: 0, spin: 0, spinCtl: 0, angleRange: 0, len: 64, head: 'putter' },
};
var CLUB_ORDER = ['1W', '5I', 'SW', 'PT'];

// 특수샷. loftAdd: 발사각 추가(도), speedMul: 속도 배율, spinAdd: 스핀 추가
// restMul·tangMul: 첫 착지 반발·수평 유지 배율, muMul: 구름 저항 배율
var SPECIAL_UNLOCK = 2; // 같은 홀에서 이만큼 팡을 내면 해금
var SPECIAL_SHOTS = {
  tomahawk: { name: '토마호크', desc: '고탄도 · 착지 후 거의 안 구름', loftAdd: 18, speedMul: 0.86, spinAdd: 0.05, restMul: 0.3, tangMul: 0.16, muMul: 6, trail: ['255,105,180', '170,80,255'], glow: '#ff78c8' },
  spike: { name: '스파이크', desc: '저탄도 · 강한 런', loftAdd: -4, speedMul: 1, spinAdd: -0.1, restMul: 1, tangMul: 1.15, muMul: 0.55, trail: ['110,240,255', '50,140,255'], glow: '#6ee8ff' },
};
var SPECIAL_ORDER = ['tomahawk', 'spike'];

var STAT_KEYS = ['power', 'control', 'impact', 'spin'];
var STAT_NAMES = { power: '파워', control: '컨트롤', impact: '임팩트', spin: '스핀' };

var SLOT_ORDER = ['char', 'club', 'hat', 'top', 'shoes'];
var SLOT_NAMES = { char: '캐릭터', club: '클럽', hat: '모자', top: '상의', shoes: '신발' };

var ITEMS = {
  char: [
    { id: 'leo', name: '레오', price: 0, stats: { power: 10, control: 10, impact: 10, spin: 10 }, passive: { kind: 'windMul', value: 0.9, text: '바람 영향 -10%' } },
    { id: 'mina', name: '미나', price: 300, stats: { power: 8, control: 13, impact: 11, spin: 10 }, passive: { kind: 'puttErrMul', value: 0.8, text: '퍼팅 오차 -20%' } },
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

// 테마 색. sky: 위→아래, far/mid: 먼 산, sun: 해 위치(화면 비율)
var THEMES = {
  spring: { sky: ['#2f8fe6', '#7cc8f5', '#d8f1f4'], far: ['#9cc9de', '#7fb6c6'], mid: ['#6db58b', '#4d9c74'], sun: [0.8, 0.14], glow: '#fff3c4', grade: '#ffe9b0', trees: ['tree', 'treeLong', 'treeRound', 'treePine', 'treeSmall'], bushes: ['bush1', 'bush2', 'bush3'], grass: '#62c23d', fair: '#7fd84f', rough: '#46a233' },
  autumn: { sky: ['#4a7fd0', '#f0b98a', '#fbe4bd'], far: ['#c9a3a0', '#b48a86'], mid: ['#c98a4e', '#a9683c'], sun: [0.24, 0.2], glow: '#ffd59a', grade: '#ffb86b', trees: ['treeOrange', 'treeLongOrange', 'treeRoundOrange', 'tree', 'treeOrange'], bushes: ['bushO1', 'bushO3', 'bush2'], grass: '#8fb33b', fair: '#a6c84a', rough: '#6f9231' },
  beach: { sky: ['#128ad6', '#5fd0ea', '#d9f7ee'], far: ['#7fd2d6', '#4db8c4'], mid: ['#57bda0', '#2c9d88'], sun: [0.62, 0.1], glow: '#fff8d6', grade: '#d6fff0', trees: ['treePalm', 'treePalm', 'treeSmall', 'treeRound'], bushes: ['bush1', 'bush3', 'bush2'], grass: '#5ccf54', fair: '#7ce865', rough: '#3cac4a' },
  dusk: { sky: ['#30317c', '#d0608a', '#ffc27a'], far: ['#70508f', '#553d7e'], mid: ['#40407f', '#2f3268'], sun: [0.5, 0.42], glow: '#ffb27a', grade: '#ff8a70', trees: ['treePine', 'tree', 'treeLong', 'treeRound'], bushes: ['bush1', 'bush2', 'bush3'], grass: '#3f9a58', fair: '#58b562', rough: '#2c7d4f' },
};

// pts: [x(m), 높이(m)] / tee·fair: [시작, 끝] / green: 시작, 끝, 기준 높이, 경사(%) (+ 오른쪽이 높음)
// bunkers·ponds: [시작, 끝] / wind: 최대 풍속(m/s)
var HOLES = [
  { name: '봄바람 언덕', par: 4, theme: 'spring', cup: 318, end: 390, wind: 3,
    pts: [[-70, 8], [0, 7], [14, 6.4], [70, 3], [130, 6.5], [190, 4], [250, 2], [290, 2.5], [340, 2], [390, 5], [470, 10]],
    tee: [-7, 9], fair: [28, 268], green: { from: 298, to: 340, base: 2.5, slope: 1.5 }, bunkers: [[275, 290]], ponds: [] },
  { name: '연못 너머', par: 3, theme: 'spring', cup: 152, end: 215, wind: 4,
    pts: [[-70, 9], [0, 8], [12, 7.2], [60, 4], [120, 4.5], [175, 5], [215, 8], [290, 12]],
    tee: [-7, 9], fair: [112, 132], green: { from: 134, to: 172, base: 5, slope: -2 }, bunkers: [[174, 186]], ponds: [[42, 106]] },
  { name: '단풍 능선', par: 5, theme: 'autumn', cup: 505, end: 570, wind: 5,
    pts: [[-70, 6], [0, 5], [14, 4.6], [90, 9], [170, 5], [245, 12], [320, 7], [395, 3], [470, 3.5], [530, 3], [570, 7], [650, 11]],
    tee: [-7, 9], fair: [30, 460], green: { from: 484, to: 528, base: 3.3, slope: 2.4 }, bunkers: [[218, 232], [468, 480]], ponds: [] },
  { name: '해안 절벽', par: 4, theme: 'beach', cup: 330, end: 395, wind: 6,
    pts: [[-70, 3], [0, 3], [14, 3], [80, 2], [150, 4], [225, 8], [285, 13], [320, 14], [360, 13.6], [395, 16], [470, 20]],
    tee: [-7, 9], fair: [30, 280], green: { from: 308, to: 352, base: 14, slope: -1.2 }, bunkers: [[290, 302]], ponds: [[92, 138]] },
  { name: '가을 내리막', par: 3, theme: 'autumn', cup: 182, end: 245, wind: 4,
    pts: [[-70, 28], [0, 25], [14, 24], [60, 15], [120, 7], [165, 4], [205, 4], [245, 8], [320, 12]],
    tee: [-7, 9], fair: [108, 150], green: { from: 164, to: 204, base: 4, slope: 3 }, bunkers: [[152, 162], [206, 218]], ponds: [] },
  { name: '노을 챔피언', par: 5, theme: 'dusk', cup: 548, end: 615, wind: 6,
    pts: [[-70, 9], [0, 8], [14, 7.5], [80, 3], [150, 6], [235, 2.5], [320, 7], [400, 2.5], [470, 5], [525, 3], [570, 3], [615, 7], [690, 11]],
    tee: [-7, 9], fair: [30, 505], green: { from: 528, to: 572, base: 3, slope: -2.6 }, bunkers: [[186, 200], [508, 522]], ponds: [[268, 300], [372, 428]] },
];

if (typeof module !== 'undefined') {
  Object.assign(globalThis, { SPECIAL_UNLOCK, SPECIAL_SHOTS, SPECIAL_ORDER, CLUB_TYPES, CLUB_ORDER, STAT_KEYS, STAT_NAMES, SLOT_ORDER, SLOT_NAMES, ITEMS, DEFAULT_EQUIP, THEMES, HOLES });
}
