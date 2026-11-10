// 기본 스탯 비거리 검사: node tests/distance.js
require('../js/data.js');
require('../js/physics.js');

// 보통 정타(판정 폭 바로 밖, 손해 없음) 기준 캐리 허용 범위
const RANGE = { '1W': [195, 230], '5I': [150, 170], 'SW': [72, 88] };
const EDGE = PHYS.impactBase + 1e-6;
let bad = 0;
for (const club of ['1W', '5I', 'SW', 'PT']) {
  const r = simulateShot({ club, power: 1, impact: EDGE });
  const p = simulateShot({ club, power: 1, impact: 0 });
  const line = `${club}: 정타 캐리 ${r.carry.toFixed(1)}m 총 ${r.total.toFixed(1)}m 최고 ${r.apex.toFixed(1)}m · 팡! 캐리 ${p.carry.toFixed(1)}m`;
  const range = RANGE[club];
  const ok = !range || (r.carry >= range[0] && r.carry <= range[1] && p.carry > r.carry + 4);
  if (!ok) bad++;
  console.log((ok ? 'OK  ' : 'FAIL') + ' ' + line);
}
for (const name of [null].concat(SPECIAL_ORDER)) {
  const r = simulateShot({ club: '1W', power: 1, special: name });
  console.log(`  ${name || '팡!'}: 캐리 ${r.carry.toFixed(1)}m 런 ${(r.total - r.carry).toFixed(1)}m 좌우 ${r.lateral.toFixed(1)}m 최고 ${r.apex.toFixed(1)}m`);
}
process.exitCode = bad ? 1 : 0;
