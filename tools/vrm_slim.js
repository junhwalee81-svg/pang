// VRM(0.x) -> 게임용 작은 glTF(.gltf + .bin + 그림). 모프·노멀맵·매트캡·썸네일·VRM 확장을 버린다.
// node vrm_slim.js in.vrm outDir key
// 그림 줄이기는 뒤이어 python(vrm_tex.py)이 한다: outDir/key_tex.json 목록을 읽는다.
const fs = require('fs'), path = require('path');
const [inp, outDir, key] = process.argv.slice(2);
const raw = fs.readFileSync(inp);
const n = raw.readUInt32LE(12);
const j = JSON.parse(raw.toString('utf8', 20, 20 + n));
const bin = raw.subarray(28 + n, 28 + n + raw.readUInt32LE(20 + n));
fs.mkdirSync(outDir, { recursive: true });

// 재질: 기본 색 그림만 남기고 MToon 설정에서 투명 방식을 가져온다
const props = (j.extensions && j.extensions.VRM && j.extensions.VRM.materialProperties) || [];
const texList = [];
j.materials.forEach((m, i) => {
  const p = props.find((q) => q.name === m.name) || {};
  const bt = m.pbrMetallicRoughness && m.pbrMetallicRoughness.baseColorTexture;
  const mode = (p.keywordMap && p.keywordMap._ALPHABLEND_ON) ? 'BLEND' : (p.keywordMap && p.keywordMap._ALPHATEST_ON) ? 'MASK' : m.alphaMode || 'OPAQUE';
  const cutoff = p.floatProperties && p.floatProperties._Cutoff;
  const out = { name: m.name, pbrMetallicRoughness: { metallicFactor: 0, roughnessFactor: 1, baseColorFactor: (m.pbrMetallicRoughness && m.pbrMetallicRoughness.baseColorFactor) || [1, 1, 1, 1] }, alphaMode: mode, doubleSided: !!m.doubleSided || (p.floatProperties && p.floatProperties._CullMode === 0) };
  if (mode === 'MASK') out.alphaCutoff = cutoff != null ? cutoff : 0.5;
  if (bt) {
    const img = j.images[j.textures[bt.index].source];
    let t = texList.findIndex((x) => x.src === img.name);
    if (t < 0) { texList.push({ src: img.name, bv: img.bufferView, alpha: mode !== 'OPAQUE', sampler: j.textures[bt.index].sampler }); t = texList.length - 1; }
    out.pbrMetallicRoughness.baseColorTexture = { index: t };
  }
  j.materials[i] = out;
});
// 그림 원본을 꺼내 둔다(줄이기는 python)
const texOut = texList.map((t, i) => {
  const v = j.bufferViews[t.bv];
  const file = key + '_src_' + i + '.png';
  fs.writeFileSync(path.join(outDir, file), bin.subarray(v.byteOffset || 0, (v.byteOffset || 0) + v.byteLength));
  return { src: file, name: t.src, alpha: t.alpha, out: key + '_' + i + (t.alpha ? '.png' : '.jpg') };
});
fs.writeFileSync(path.join(outDir, key + '_tex.json'), JSON.stringify(texOut));
j.textures = texList.map((t, i) => ({ source: i, ...(t.sampler != null ? { sampler: t.sampler } : {}) }));
j.images = texOut.map((t) => ({ uri: t.out, name: t.name, mimeType: t.alpha ? 'image/png' : 'image/jpeg' }));
// 모프 타깃 제거
for (const m of j.meshes) { delete m.extras; delete m.weights; for (const p of m.primitives) { delete p.targets; delete p.extras; } }
delete j.extensions; delete j.extensionsUsed; delete j.extensionsRequired;
// 원래 버퍼는 그대로 두고 gltf-pack이 쓰는 것만 다시 묶는다
fs.writeFileSync(path.join(outDir, key + '.bin'), bin);
j.buffers = [{ uri: key + '.bin', byteLength: bin.length }];
fs.writeFileSync(path.join(outDir, key + '.gltf'), JSON.stringify(j));
console.log(key, 'materials', j.materials.length, 'textures', texOut.map((t) => t.name).join(','));
