// 기본 스탯 비거리 검사: node tests/distance.js
require('../js/data.js');
require('../js/physics.js');

const RANGE = { '1W': [195, 230], '5I': [150, 170], 'SW': [72, 88] };
let bad = 0;
for (const club of ['1W', '5I', 'SW', 'PT']) {
  const r = simulateShot({ club, power: 1 });
  const line = `${club}: 캐리 ${r.carry.toFixed(1)}m 총 ${r.total.toFixed(1)}m 최고 ${r.apex.toFixed(1)}m ${r.time.toFixed(1)}초`;
  const range = RANGE[club];
  const ok = !range || (r.carry >= range[0] && r.carry <= range[1]);
  if (!ok) bad++;
  console.log((ok ? 'OK  ' : 'FAIL') + ' ' + line);
}
for (const name of [null, 'tomahawk', 'spike']) {
  const r = simulateShot({ club: '1W', power: 1, special: name });
  console.log(`  ${name || '일반'}: 캐리 ${r.carry.toFixed(1)}m 런 ${(r.total - r.carry).toFixed(1)}m 최고 ${r.apex.toFixed(1)}m`);
}
process.exitCode = bad ? 1 : 0;
