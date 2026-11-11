"""vrm_slim.js가 꺼낸 그림을 줄인다. 머리·바지·신발은 밝은 회색으로 바꿔 게임에서 색을 입힌다.
usage: py -I tools/vrm_tex.py <outDir> <key>"""
import json, os, sys
from PIL import Image, ImageOps

out, key = sys.argv[1], sys.argv[2]
SIZE = [('Body', 512), ('Tops', 512), ('Bottoms', 256), ('Shoes', 128), ('Face_00', 256), ('Hair', 256),
        ('EyeIris', 128), ('EyeWhite', 64), ('EyeHighlight', 64), ('EyeExtra', 64), ('FaceMouth', 128),
        ('FaceEyeline', 256), ('FaceEyelash', 128), ('FaceBrow', 128)]
GRAY = ('Hair', 'Bottoms', 'Shoes')


def to_gray(im):
    """밝기만 남겨 0.5~1 범위로 펴서 곱하는 색이 잘 보이게 한다"""
    a = im.getchannel('A') if im.mode == 'RGBA' else None
    l = ImageOps.autocontrast(im.convert('L'), cutoff=1).point(lambda v: int(128 + v * 127 / 255))
    rgb = Image.merge('RGB', (l, l, l))
    return Image.merge('RGBA', (*rgb.split(), a)) if a else rgb


for t in json.load(open(os.path.join(out, key + '_tex.json'), encoding='utf8')):
    im = Image.open(os.path.join(out, t['src']))
    size = next((v for k, v in SIZE if k in t['name']), 256)
    w = min(size, im.width)
    im = im.convert('RGBA' if t['alpha'] else 'RGB').resize((w, max(1, round(im.height * w / im.width))), Image.LANCZOS)
    if any(k in t['name'] for k in GRAY):
        im = to_gray(im)
    p = os.path.join(out, t['out'])
    if t['alpha']:
        im.save(p, optimize=True)
    else:
        im.save(p, quality=84)
    os.remove(os.path.join(out, t['src']))
    print(t['name'], im.size, os.path.getsize(p) // 1024, 'KB')
