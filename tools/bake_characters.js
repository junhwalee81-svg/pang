// VRoid CC0 VRM 두 개 → js/characters.js (base64 GLB).
// node tools/bake_characters.js <VRM 폴더> <공용에셋 폴더> <icarus 폴더> <작업 폴더>
// VRM 폴더에 HairSample_Female.vrm, HairSample_Male.vrm (opengameart.org/content/vroid-studio-cc0-models)
const { execFileSync } = require('child_process');
const fs = require('fs'), path = require('path');
const [vrmDir, shared, icarus, work] = process.argv.slice(2);
fs.mkdirSync(work, { recursive: true });
const out = {};
for (const [file, key] of [['HairSample_Female.vrm', 'girl'], ['HairSample_Male.vrm', 'boy']]) {
  execFileSync('node', [path.join(__dirname, 'vrm_slim.js'), path.join(vrmDir, file), work, key], { stdio: 'inherit' });
  execFileSync('py', ['-I', path.join(__dirname, 'vrm_tex.py'), work, key], { stdio: 'inherit' });
  execFileSync('node', [path.join(shared, 'tools/gltf-pack/gltf-pack.js'), key + '.gltf', key + '.glb'], { cwd: work });
  execFileSync('node', [path.join(icarus, 'tools_glbslim.js'), key + '.glb', key + '_s.glb'], { cwd: work, stdio: 'inherit' });
  out[key] = fs.readFileSync(path.join(work, key + '_s.glb')).toString('base64');
}
const text = '/* tools/bake_characters.js 로 생성 — VRoid 샘플 모델(CC0). 출처는 CREDITS.md */\nvar CHAR_GLB = ' + JSON.stringify(out) + ';\n';
fs.writeFileSync(path.join(__dirname, '..', 'js', 'characters.js'), text);
console.log('characters.js', Math.round(text.length / 1024), 'KB');
