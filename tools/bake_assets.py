"""CC0 원본을 줄여 js/assets.js(data URI)로 굽는다.

사용법: py -I tools/bake_assets.py <particle-pack 폴더> <공용에셋 폴더> <golfer.glb>
golfer.glb 는 공용에셋 tools/gltf-pack 으로 UAL1_Standard.glb 에서 Idle_Loop, Dance_Loop 만 남긴 것.
"""
import base64
import io
import json
import os
import sys

from PIL import Image, ImageEnhance, ImageStat

Image.MAX_IMAGE_PIXELS = None

PARTICLE, SHARED, GLB = sys.argv[1], sys.argv[2], sys.argv[3]
OUT = os.path.join(os.path.dirname(__file__), '..', 'js', 'assets.js')
SAMJOKO = os.path.join(SHARED, '받은에셋', 'samjoko')

SKIES = {
    'spring': 'kloofendal_48d_partly_cloudy_puresky',
    'autumn': 'autumn_field_puresky',
    'beach': 'citrus_orchard_puresky',
    'dusk': 'qwantani_sunset_puresky',
}
TREES = {'oak': 'tree_island_tree_02', 'maple': 'tree_jacaranda_tree', 'fir': 'tree_fir_tree_01', 'shrub': 'tree_pine_sapling_small'}
PARTICLES = {
    'smoke': 'smoke_04', 'star': 'star_06', 'spark': 'spark_03', 'light': 'light_02',
    'ring': 'circle_05', 'magic': 'magic_03',
}
TEXTURES = {'grass': 'grass004', 'turf': 'grass001', 'soil': 'ground037', 'sand': 'ground054'}


def uri(im, quality=82, kind='WEBP', exact=False):
    buf = io.BytesIO()
    if kind == 'WEBP':
        im.save(buf, 'WEBP', quality=quality, method=6, exact=exact)
    else:
        im.save(buf, 'JPEG', quality=quality, optimize=True)
    return 'data:image/%s;base64,' % kind.lower() + base64.b64encode(buf.getvalue()).decode()


def main():
    out = {'sky': {}, 'tree': {}, 'fx': {}, 'tex': {}}
    for key, name in SKIES.items():
        im = Image.open(os.path.join(SAMJOKO, 'polyhaven_sky', name + '.jpg')).convert('RGB')
        top = im.crop((0, 0, im.width, im.height // 2)).resize((3072, 768), Image.LANCZOS)
        out['sky'][key] = uri(top, 68)
    for key, name in TREES.items():
        im = Image.open(os.path.join(SAMJOKO, 'polyhaven_trees_baked', name + '.png')).convert('RGBA')
        r, g, b, a = im.split()
        rgb = ImageEnhance.Brightness(Image.merge('RGB', (r, g, b))).enhance(1.5)
        # 투명 칸의 검은색이 가장자리에 번지지 않도록 평균색으로 채운다
        mean = ImageStat.Stat(rgb, a.point(lambda v: 255 if v > 200 else 0)).mean
        solid = Image.new('RGB', rgb.size, tuple(int(v) for v in mean))
        solid.paste(rgb, (0, 0), a.point(lambda v: 255 if v > 8 else 0))
        out['tree'][key] = uri(Image.merge('RGBA', (*solid.split(), a)), 78, exact=True)
    for key, name in PARTICLES.items():
        im = Image.open(os.path.join(PARTICLE, 'PNG (Transparent)', name + '.png')).convert('RGBA')
        im.thumbnail((128, 128), Image.LANCZOS)
        out['fx'][key] = uri(im, 80)
    for key, name in TEXTURES.items():
        im = Image.open(os.path.join(SHARED, 'textures', 'ambientcg_512', name + '.jpg')).convert('RGB')
        out['tex'][key] = uri(ImageEnhance.Contrast(im).enhance(1.1), 66)
    water = Image.open(os.path.join(SAMJOKO, 'three_water', 'waternormals.jpg')).convert('RGB').resize((256, 256), Image.LANCZOS)
    out['tex']['water'] = uri(water, 70)
    with open(GLB, 'rb') as fh:
        out['golfer'] = base64.b64encode(fh.read()).decode()
    text = '/* tools/bake_assets.py 로 생성 — 직접 고치지 말 것. 출처는 CREDITS.md */\n'
    text += 'var ASSETS = ' + json.dumps(out, separators=(',', ':')) + ';\n'
    with open(OUT, 'w', encoding='utf-8') as fh:
        fh.write(text)
    print('assets.js', round(len(text) / 1024), 'KB')
    for group in ('sky', 'tree', 'fx', 'tex', 'golfer'):
        print(group, round(len(json.dumps(out[group])) / 1024), 'KB')


main()
