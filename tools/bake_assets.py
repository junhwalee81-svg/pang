"""CC0 원본 그림을 줄여 js/assets.js(data URI)로 굽는다.

사용법: py -I tools/bake_assets.py <Kenney 2D 폴더> <공용에셋 폴더>
Kenney 2D 폴더 안에 toon-characters, background-elements-remastered,
foliage-pack, particle-pack 이 있어야 한다.
"""
import base64
import io
import json
import os
import sys

from PIL import Image, ImageEnhance

KENNEY, SHARED = sys.argv[1], sys.argv[2]
OUT = os.path.join(os.path.dirname(__file__), '..', 'js', 'assets.js')

CHARS = {
    'leo': ('Male adventurer', 'maleAdventurer'),
    'mina': ('Female adventurer', 'femaleAdventurer'),
    'kai': ('Male person', 'malePerson'),
    'sora': ('Female person', 'femalePerson'),
    'zombie': ('Zombie', 'zombie'),
    'gbot': ('Robot', 'robot'),
}
PARTS = ['head', 'headFocus', 'headShock', 'body', 'arm', 'hand', 'leg', 'legBend']
POSES = {'idle': 400, 'cheer0': 400, 'cheer1': 400}

BG = 'background-elements-remastered/PNG/Retina'
SCENERY = {
    'tree': 'tree', 'treeLong': 'treeLong', 'treeOrange': 'treeOrange',
    'treeLongOrange': 'treeLongOrange', 'treePine': 'treePine',
    'treePalm': 'treePalm', 'treeSmall': 'treeSmall_green1',
    'treeRound': 'treeSmall_green3', 'treeRoundOrange': 'treeSmall_orange3',
    'bush1': 'bush1', 'bush2': 'bush2', 'bush3': 'bush3', 'bushO1': 'bushOrange1',
    'bushO3': 'bushOrange3', 'fence': 'fence', 'house1': 'houseSmallAlt1',
    'house2': 'houseAlt2', 'house3': 'houseSmall1', 'tower': 'towerAlt',
}
FOLIAGE = {
    'flowerBlue': 1, 'flowerPurple': 3, 'flowerRed': 62, 'tuft1': 18, 'tuft2': 19,
    'tuft3': 20, 'rock1': 53, 'rock2': 56, 'rock3': 58,
}
PARTICLES = {
    'smoke': 'smoke_04', 'star': 'star_06', 'spark': 'spark_03', 'light': 'light_02',
    'flare': 'flare_01', 'ring': 'circle_05', 'twirl': 'twirl_01', 'magic': 'magic_03',
}
TEXTURES = {'grass': 'grass004', 'turf': 'grass001', 'soil': 'ground037', 'sand': 'ground054'}


def uri(im, quality=82, lossless=False):
    buf = io.BytesIO()
    im.save(buf, 'WEBP', quality=quality, method=6, lossless=lossless)
    return 'data:image/webp;base64,' + base64.b64encode(buf.getvalue()).decode()


def fit(im, max_side):
    if max(im.size) > max_side:
        im = im.copy()
        im.thumbnail((max_side, max_side), Image.LANCZOS)
    return im


def open_rgba(path):
    return Image.open(path).convert('RGBA')


def main():
    out = {'char': {}, 'scene': {}, 'cloud': [], 'fx': {}, 'tex': {}}
    for cid, (folder, prefix) in CHARS.items():
        root = os.path.join(KENNEY, 'toon-characters', folder, 'PNG')
        item = {}
        for part in PARTS:
            item[part] = uri(open_rgba(os.path.join(root, 'Parts HD', part + '.png')), 90)
        for pose, size in POSES.items():
            im = open_rgba(os.path.join(root, 'Poses HD', f'character_{prefix}_{pose}.png'))
            item[pose] = uri(fit(im.crop(im.getbbox()), size), 88)
        out['char'][cid] = item
    for key, name in SCENERY.items():
        out['scene'][key] = uri(fit(open_rgba(os.path.join(KENNEY, BG, name + '.png')), 360), 84)
    for i in range(1, 9):
        out['cloud'].append(uri(fit(open_rgba(os.path.join(KENNEY, BG, f'cloud{i}.png')), 320), 84))
    foliage = os.path.join(KENNEY, 'foliage-pack', 'PNG')
    index = {}
    for dirpath, _, files in os.walk(foliage):
        for name in files:
            index[name] = os.path.join(dirpath, name)
    for key, num in FOLIAGE.items():
        out['scene'][key] = uri(fit(open_rgba(index[f'foliagePack_{num:03d}.png']), 180), 84)
    fx_root = os.path.join(KENNEY, 'particle-pack', 'PNG (Transparent)')
    for key, name in PARTICLES.items():
        out['fx'][key] = uri(fit(open_rgba(os.path.join(fx_root, name + '.png')), 128), 80)
    tex_root = os.path.join(SHARED, 'textures', 'ambientcg_512')
    for key, name in TEXTURES.items():
        im = Image.open(os.path.join(tex_root, name + '.jpg')).convert('RGB').resize((256, 256), Image.LANCZOS)
        out['tex'][key] = uri(ImageEnhance.Contrast(im).enhance(1.1), 62)
    text = '/* tools/bake_assets.py 로 생성 — 직접 고치지 말 것. 출처는 CREDITS.md */\n'
    text += 'var ASSETS = ' + json.dumps(out, separators=(',', ':')) + ';\n'
    with open(OUT, 'w', encoding='utf-8') as fh:
        fh.write(text)
    print('assets.js', round(len(text) / 1024), 'KB')
    for group in ('char', 'scene', 'fx', 'tex'):
        print(group, round(len(json.dumps(out[group])) / 1024), 'KB')


main()
