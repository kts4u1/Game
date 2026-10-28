"""Flare(flare-game) 그림 자원을 이 게임용으로 변환한다.

필요한 애니메이션 프레임만 골라 축소하고, WebP 아틀라스로 다시 묶은 뒤
좌표 정보를 assets/flare/manifest.js 하나에 담는다.

사용법:
    git clone --depth 1 https://github.com/flareteam/flare-game.git
    python3 -I tools/build_flare_assets.py flare-game/mods/fantasycore assets/flare

Flare 그림 자원 라이선스: CC-BY-SA 3.0 (자세한 내용은 assets/flare/CREDITS.md)
"""
import json
import os
import re
import sys

from PIL import Image

SCALE = 0.7          # 원본 대비 저장 배율 (게임에서는 2/3 크기로 그림)
QUALITY = 76
MAX_W = 2048

HERO_ANIMS = ['stance', 'run', 'swing', 'cast', 'hit', 'die']
HERO_LAYERS = [
    'head_short', 'default_chest', 'default_legs', 'default_hands', 'default_feet',
    'leather_hood', 'leather_chest', 'leather_pants', 'leather_gloves', 'leather_boots',
    'chain_coif', 'chain_cuirass', 'chain_greaves', 'chain_gloves', 'chain_boots',
    'plate_helm', 'plate_cuirass', 'plate_greaves', 'plate_gauntlets', 'plate_boots',
    'hand_axe', 'battle_axe', 'longsword', 'greatsword', 'mace', 'war_hammer',
]
MONSTERS = {
    'zombie': ['stance', 'run', 'swing', 'die'],
    'skeleton': ['stance', 'run', 'swing', 'die'],
    'skeleton_archer': ['stance', 'run', 'shoot', 'die'],
    'skeleton_mage': ['stance', 'run', 'cast', 'die'],
    'goblin': ['stance', 'run', 'swing', 'die'],
    'antlion': ['stance', 'run', 'swing', 'die'],
    'minotaur': ['stance', 'run', 'swing', 'die'],
    'wyvern_fire': ['stance', 'run', 'swing', 'die'],
}
TILESETS = {
    'dungeon': {
        'floor': [16, 18, 19, 23, 30, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47],
        'floorDecor': [56, 57, 58, 59],
        'wallSE': [64, 68, 96, 98, 100, 104, 106, 108],
        'wallSW': [65, 69, 97, 99, 101, 105, 107, 109],
        'torchSE': [102], 'torchSW': [103],
        'outer': [73], 'inner': [77], 'black': [66, 67, 79],
        'decor': [176, 177, 178, 179, 180, 181, 182, 183],
        'props': {'chest': 288, 'chestOpen': 289, 'stairs': 286, 'brazier': 167},
    },
    'cave': {
        'floor': list(range(16, 32)),
        'floorDecor': [52, 53, 54, 55],
        'wallSE': [64, 68, 96],
        'wallSW': [65, 69, 97],
        'torchSE': [], 'torchSW': [],
        'outer': [72, 76, 98], 'inner': [74], 'black': [66, 67, 74],
        'decor': [],
        'props': {},
    },
}


def parse_anim(path):
    images, anims, cur = {}, {}, None
    for line in open(path, encoding='utf-8'):
        line = line.strip()
        if not line or line.startswith('#'):
            continue
        if line.startswith('['):
            cur = line[1:-1]
            anims[cur] = {'n': 0, 'dur': 0, 'type': 'looped', 'frames': []}
            continue
        k, _, v = line.partition('=')
        if k == 'image':
            p = v.split(',')
            images[p[1] if len(p) > 1 else None] = p[0]
        elif cur and k == 'frames':
            anims[cur]['n'] = int(v)
        elif cur and k == 'duration':
            anims[cur]['dur'] = int(float(v.replace('ms', ''))) if 'ms' in v else int(float(v.replace('s', '')) * 1000)
        elif cur and k == 'type':
            anims[cur]['type'] = v
        elif cur and k == 'frame':
            p = v.split(',')
            f = [int(x) for x in p[:8]] + [p[8] if len(p) > 8 else None]
            anims[cur]['frames'].append(f)
    return images, anims


class Packer:
    """간단한 선반(shelf) 방식 아틀라스 패킹"""

    def __init__(self):
        self.items = []

    def add(self, key, im):
        self.items.append((key, im))

    def pack(self):
        order = sorted(range(len(self.items)), key=lambda i: -self.items[i][1].height)
        x = y = shelf_h = 0
        width = 0
        pos = {}
        for i in order:
            key, im = self.items[i]
            if x + im.width > MAX_W:
                x = 0
                y += shelf_h + 1
                shelf_h = 0
            pos[key] = (x, y)
            x += im.width + 1
            width = max(width, x)
            shelf_h = max(shelf_h, im.height)
        height = y + shelf_h
        atlas = Image.new('RGBA', (max(1, width), max(1, height)), (0, 0, 0, 0))
        for key, im in self.items:
            atlas.paste(im, pos[key])
        return atlas, pos


def scaled(im):
    w, h = max(1, round(im.width * SCALE)), max(1, round(im.height * SCALE))
    return im.resize((w, h), Image.LANCZOS)


def build_sprite(base, anim_path, wanted, out_png):
    images, anims = parse_anim(anim_path)
    sheets = {}

    def sheet(key, anim):
        path = images.get(key) or images.get(anim) or images.get(None) or next(iter(images.values()))
        if path not in sheets:
            sheets[path] = Image.open(os.path.join(base, path)).convert('RGBA')
        return sheets[path]

    packer = Packer()
    seen = {}
    meta = {}
    for anim in wanted:
        a = anims.get(anim)
        if not a:
            continue
        n = a['n']
        table = [[None] * n for _ in range(8)]
        for idx, d, x, y, w, h, ox, oy, key in a['frames']:
            if idx >= n or d >= 8:
                continue
            src = sheet(key, anim)
            rect_key = (id(src), x, y, w, h)
            if rect_key not in seen:
                im = src.crop((x, y, x + w, y + h))
                bbox = im.getbbox()
                if not bbox:
                    bbox = (0, 0, 1, 1)
                im = im.crop(bbox)
                seen[rect_key] = (len(seen), bbox)
                packer.add(seen[rect_key][0], scaled(im))
            fid, bbox = seen[rect_key]
            table[d][idx] = [fid, round((ox - bbox[0]) * SCALE), round((oy - bbox[1]) * SCALE)]
        meta[anim] = {'n': n, 'dur': a['dur'], 'type': a['type'], 'f': table}
    atlas, pos = packer.pack()
    # 프레임 번호를 아틀라스 좌표로 치환: [x, y, w, h, ox, oy]
    sizes = {i: im.size for i, im in packer.items}
    for anim in meta.values():
        for d in range(8):
            for k, fr in enumerate(anim['f'][d]):
                if fr is None:
                    anim['f'][d][k] = anim['f'][d][0] if anim['f'][d] and anim['f'][d][0] else None
                    continue
                fid, ox, oy = fr
                x, y = pos[fid]
                w, h = sizes[fid]
                anim['f'][d][k] = [x, y, w, h, ox, oy]
    atlas.save(out_png, 'WEBP', quality=QUALITY, method=6, alpha_quality=90)
    return {'size': list(atlas.size), 'anims': meta}


def parse_tileset(path):
    tiles = {}
    for m in re.finditer(r'^tile=(\d+),(\d+),(\d+),(\d+),(\d+),(\d+),(\d+)', open(path, encoding='utf-8').read(), re.M):
        tid, x, y, w, h, ox, oy = map(int, m.groups())
        tiles[tid] = (x, y, w, h, ox, oy)
    return tiles


def build_tileset(base, name, spec, out_png):
    tiles = parse_tileset(os.path.join(base, 'tilesetdefs', f'tileset_{name}.txt'))
    src = Image.open(os.path.join(base, 'images', 'tilesets', f'tileset_{name}.png')).convert('RGBA')
    ids = set()
    for k, v in spec.items():
        if k == 'props':
            ids.update(v.values())
        else:
            ids.update(v)
    packer = Packer()
    trims = {}
    for tid in sorted(ids):
        x, y, w, h, ox, oy = tiles[tid]
        im = src.crop((x, y, x + w, y + h))
        bbox = im.getbbox() or (0, 0, 1, 1)
        trims[tid] = (bbox, ox, oy)
        packer.add(tid, scaled(im.crop(bbox)))
    atlas, pos = packer.pack()
    sizes = {i: im.size for i, im in packer.items}
    rects = {}
    for tid, (bbox, ox, oy) in trims.items():
        x, y = pos[tid]
        w, h = sizes[tid]
        rects[str(tid)] = [x, y, w, h, round((ox - bbox[0]) * SCALE), round((oy - bbox[1]) * SCALE)]
    atlas.save(out_png, 'WEBP', quality=QUALITY, method=6, alpha_quality=90)
    out = {k: v for k, v in spec.items()}
    out['rects'] = rects
    out['size'] = list(atlas.size)
    return out


def main():
    base, out = sys.argv[1], sys.argv[2]
    for sub in ('hero', 'monsters', 'tiles'):
        os.makedirs(os.path.join(out, sub), exist_ok=True)
    manifest = {'scale': SCALE, 'hero': {}, 'monsters': {}, 'tiles': {}}
    for layer in HERO_LAYERS:
        manifest['hero'][layer] = build_sprite(base, os.path.join(base, 'animations', 'avatar', 'male', f'{layer}.txt'), HERO_ANIMS, os.path.join(out, 'hero', f'{layer}.webp'))
        print('hero', layer, manifest['hero'][layer]['size'])
    for name, anims in MONSTERS.items():
        manifest['monsters'][name] = build_sprite(base, os.path.join(base, 'animations', 'enemies', f'{name}.txt'), anims, os.path.join(out, 'monsters', f'{name}.webp'))
        print('monster', name, manifest['monsters'][name]['size'])
    for name, spec in TILESETS.items():
        manifest['tiles'][name] = build_tileset(base, name, spec, os.path.join(out, 'tiles', f'{name}.webp'))
        print('tiles', name, manifest['tiles'][name]['size'])
    icons = Image.open(os.path.join(base, 'images', 'icons', 'icons.png')).convert('RGBA')
    icons.save(os.path.join(out, 'icons.webp'), 'WEBP', quality=88, method=6)
    manifest['icons'] = {'size': 64, 'cols': icons.width // 64}
    # 하위 폴더 안의 그림 경로 계층
    for k in ('hero', 'monsters'):
        for name, m in manifest[k].items():
            m['img'] = f'{k}/{name}.webp'
    for name, m in manifest['tiles'].items():
        m['img'] = f'tiles/{name}.webp'
    with open(os.path.join(out, 'manifest.js'), 'w', encoding='utf-8') as f:
        f.write('// 자동 생성: tools/build_flare_assets.py\n')
        f.write('const FLARE = ' + json.dumps(manifest, separators=(',', ':')) + ';\n')
    print('done')


if __name__ == '__main__':
    main()
