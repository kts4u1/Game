"""Flare(flare-game) 그림·효과음 자원을 이 게임용으로 변환한다.

필요한 애니메이션 프레임만 골라 축소하고, WebP 아틀라스로 다시 묶은 뒤
좌표 정보를 assets/flare/manifest.js 하나에 담는다.
효과음은 MP3(모노)로 바꿔 assets/flare/sounds.js에 base64로 담는다.
(파일을 직접 열어도 동작하도록 fetch 대신 스크립트로 불러오기 위함)

사용법:
    git clone --depth 1 https://github.com/flareteam/flare-game.git
    python3 -I tools/build_flare_assets.py flare-game/mods/fantasycore assets/flare
    (일부 몬스터·NPC는 옆 폴더 mods/empyrean_campaign 에서 가져온다)

Flare 그림 자원 라이선스: CC-BY-SA 3.0 (자세한 내용은 assets/flare/CREDITS.md)
"""
import base64
import json
import os
import re
import subprocess
import sys
import tempfile

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
    'club', 'reinforced_club', 'maul', 'zweihander', 'infantry_axe', 'shortsword', 'dagger',
    'buckler', 'shield', 'iron_buckler', 'kite_shield',
]
# 몬스터: 이름 → (애니메이션, 모드 폴더, 저장 배율)
EMP = 'empyrean_campaign'
MONSTERS = {
    'zombie': (['stance', 'run', 'swing', 'die'], None, None),
    'skeleton': (['stance', 'run', 'swing', 'die'], None, None),
    'skeleton_archer': (['stance', 'run', 'shoot', 'die'], None, None),
    'skeleton_mage': (['stance', 'run', 'cast', 'die'], None, None),
    'goblin': (['stance', 'run', 'swing', 'die'], None, None),
    'antlion': (['stance', 'run', 'swing', 'die'], None, None),
    'minotaur': (['stance', 'run', 'swing', 'die'], None, None),
    'wyvern_fire': (['stance', 'run', 'swing', 'die'], None, None),
    # 새 몬스터
    'hobgoblin': (['stance', 'run', 'swing', 'die'], EMP, None),
    'hobgoblin_archer': (['stance', 'run', 'shoot', 'die'], EMP, None),
    'zombie_dark': (['stance', 'run', 'swing', 'die', 'spawn'], EMP, None),
    'skeleton_knight_boss': (['stance', 'run', 'swing', 'die'], EMP, 0.6),
    'skeleton_mage_boss': (['stance', 'run', 'cast', 'die'], EMP, 0.6),
    'skeleton_mage_high_boss': (['stance', 'run', 'cast', 'die'], EMP, 0.6),
    'antlion_armored': (['stance', 'run', 'swing', 'die'], EMP, 0.6),
    'antlion_small': (['stance', 'run', 'swing', 'die', 'spawn'], None, None),
    'fire_ant': (['stance', 'run', 'swing', 'die', 'spawn'], None, None),
    'ice_ant': (['stance', 'run', 'swing', 'die', 'spawn'], None, None),
    'goblin_elite': (['stance', 'run', 'swing', 'die'], None, None),
    'skeleton_weak': (['stance', 'run', 'swing', 'die'], None, None),
    'cursed_grave': (['stance', 'cast', 'die'], None, None),  # 방향 1개만
    'wyvern': (['stance', 'run', 'swing', 'die'], None, 0.55),
    'wyvern_water': (['stance', 'run', 'swing', 'die'], None, 0.55),
    'wyvern_air': (['stance', 'run', 'swing', 'die'], None, 0.55),
    'goblin_minecart': (['stance', 'run'], EMP, None),
    'wyvern_air_boss': (['stance', 'run', 'swing', 'die'], EMP, 0.38),
}
# 마을 사람들 (서 있는 모습만)
NPCS = {
    'guild_man': None, 'knight': None, 'peasant_man1': None, 'peasant_man2': None,
    'peasant_woman1': None, 'peasant_woman2': None, 'wandering_trader': None,
    'return_obelisk1': None, 'peddler_goblin': EMP,
}
# 스킬·투사체·타격 효과 (animations/powers)
EFFECTS = [
    'cleave', 'quake', 'blast', 'spikes', 'shield_orange', 'throw_axe', 'arrows', 'fireball',
    'thunderstrike', 'lightning', 'spark_red', 'spark_orange', 'spark_blue', 'heal', 'sparkle', 'freeze', 'rupture',
    'spit', 'icicle', 'runes', 'runes_blue', 'dark_mist', 'spark_green', 'plasmaball', 'stone', 'throw_knife',
    'spear', 'bear_trap', 'status_freeze',
]
EFFECT_SCALE = {'blast': 0.5, 'quake': 0.6, 'shield_orange': 0.55, 'thunderstrike': 0.6, 'dark_mist': 0.5, 'runes': 0.6}

# 효과음: 게임 안 이름 → soundfx 경로
SOUNDS = {
    'swing1': 'melee_attack', 'swing2': 'melee_attack_2', 'swing3': 'melee_attack_3',
    'male_hit': 'male_hit', 'male_die': 'male_die', 'level_up': 'level_up', 'no_mana': 'no_mana',
    'heartbeat': 'heartbeat', 'flying_loot': 'flying_loot',
    'warcry': 'powers/warcry', 'quake': 'powers/quake', 'spikes': 'powers/spikes', 'fireball': 'powers/fireball',
    'burn': 'powers/burn', 'shock': 'powers/shock', 'thunder': 'powers/thunder', 'shoot': 'powers/shoot',
    'arrow_wall': 'powers/arrow_wall', 'potion': 'powers/potion', 'freeze': 'powers/freeze', 'shield': 'powers/shield',
    'coins': 'inventory/inventory_coins', 'inv_metal': 'inventory/inventory_metal', 'inv_maille': 'inventory/inventory_maille',
    'inv_leather': 'inventory/inventory_leather', 'inv_cloth': 'inventory/inventory_cloth', 'inv_heavy': 'inventory/inventory_heavy',
    'inv_gem': 'inventory/inventory_gem', 'inv_object': 'inventory/inventory_object', 'inv_potion': 'inventory/inventory_potion',
    'wood_open': 'wood_open', 'stairs': 'environment/stairs',
    'amb_drops': 'environment/cave_droplets_loop', 'amb_wind': 'environment/cave_wind_loop',
    'step1': 'steps/step_echo1', 'step2': 'steps/step_echo2', 'step3': 'steps/step_echo3', 'step4': 'steps/step_echo4',
    'grave_attack': 'enemies/grave_attack', 'grave_die': 'enemies/grave_die', 'grave_hit': 'enemies/grave_hit',
    'amb_birds': 'environment/bird_twitter_loop', 'teleporter': 'environment/teleporter', 'teleport': 'powers/teleport',
    'block': 'powers/block', 'heal': 'powers/heal', 'stone_open': 'environment/stone_open', 'door': 'door_open',
    'click': 'widget_activate', 'page': 'inventory/inventory_page', 'inv_book': 'inventory/inventory_book',
    'fire_loop': 'environment/open_fire_loop',
    'npc_m1': 'npcs/male_merchant_01', 'npc_m2': 'npcs/male_merchant_02', 'npc_m3': 'npcs/male_merchant_03',
    'npc_m4': 'npcs/male_merchant_04', 'npc_f1': 'npcs/female_merchant_01', 'npc_f2': 'npcs/female_merchant_02',
    'npc_f3': 'npcs/female_merchant_03', 'npc_f4': 'npcs/female_merchant_04',
}
for _m in ('zombie', 'skeleton', 'goblin', 'antlion', 'minotaur', 'wyvern'):
    for _k in ('hit', 'die', 'phys', 'ment', 'critdie'):
        SOUNDS[f'{_m}_{_k}'] = f'enemies/{_m}_{_k}'

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
    # 마을: 풀밭, 돌길, 나무, 천막, 모루, 웨이포인트 고리
    'grassland': {
        'floor': list(range(16, 32)),
        'path': [32, 33, 34, 35, 36, 37, 38, 39],
        'trees': list(range(240, 256)),
        'bushes': list(range(112, 128)),
        'rocks': [128, 129, 130, 131],
        'graves': [140, 141, 142, 143],
        'fences': [104, 107],
        'props': {
            'tent': 72, 'tent2': 75, 'chest': 76, 'chestOpen': 77, 'crate': 96, 'crateOpen': 97,
            'crates': 98, 'crates2': 99, 'wood': 100, 'wood2': 101, 'campfire': 102, 'anvil': 103,
            'stump': 136, 'stumpAxe': 137, 'sign': 138, 'sign2': 139, 'pillar': 132, 'pillar2': 133,
            'ring': 264, 'portal': 265,
        },
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


def scaled(im, k=None):
    k = SCALE if k is None else k
    w, h = max(1, round(im.width * k)), max(1, round(im.height * k))
    return im.resize((w, h), Image.LANCZOS)


def build_sprite(base, anim_path, wanted, out_png, scale=None, one_dir=False):
    """one_dir: 방향이 상관없는 것(무덤 등)은 0번 방향만 저장"""
    scale = SCALE if scale is None else scale
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
            if idx >= n or d >= 8 or (one_dir and d):
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
                packer.add(seen[rect_key][0], scaled(im, scale))
            fid, bbox = seen[rect_key]
            table[d][idx] = [fid, round((ox - bbox[0]) * scale), round((oy - bbox[1]) * scale)]
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
    return {'size': list(atlas.size), 'anims': meta, 'scale': scale}


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


def build_sounds(base, out_js):
    """ogg → MP3(모노, 64kbps) → base64. 반복 재생용 배경음은 48kbps"""
    data = {}
    with tempfile.TemporaryDirectory() as tmp:
        for key, rel in SOUNDS.items():
            src = os.path.join(base, 'soundfx', rel + '.ogg')
            if not os.path.exists(src):
                continue
            dst = os.path.join(tmp, key + '.mp3')
            rate = '48k' if key.startswith('amb_') else '64k'
            subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', src, '-ac', '1', '-ar', '44100', '-b:a', rate, dst], check=True)
            with open(dst, 'rb') as f:
                data[key] = base64.b64encode(f.read()).decode('ascii')
    with open(out_js, 'w', encoding='utf-8') as f:
        f.write('// 자동 생성: tools/build_flare_assets.py — Flare 효과음 (CC-BY-SA 3.0), MP3 base64\n')
        f.write('var FLARE_SOUNDS = ' + json.dumps(data, separators=(',', ':')) + ';\n')
    return sorted(data)


def main():
    base, out = sys.argv[1], sys.argv[2]
    for sub in ('hero', 'monsters', 'npcs', 'tiles', 'effects'):
        os.makedirs(os.path.join(out, sub), exist_ok=True)
    manifest = {'scale': SCALE, 'hero': {}, 'monsters': {}, 'tiles': {}, 'effects': {}}
    for layer in HERO_LAYERS:
        manifest['hero'][layer] = build_sprite(base, os.path.join(base, 'animations', 'avatar', 'male', f'{layer}.txt'), HERO_ANIMS, os.path.join(out, 'hero', f'{layer}.webp'))
        print('hero', layer, manifest['hero'][layer]['size'])
    mods = os.path.dirname(os.path.abspath(base))
    for name, (anims, mod, scale) in MONSTERS.items():
        b = os.path.join(mods, mod) if mod else base
        manifest['monsters'][name] = build_sprite(b, os.path.join(b, 'animations', 'enemies', f'{name}.txt'), anims, os.path.join(out, 'monsters', f'{name}.webp'), scale, name == 'cursed_grave')
        print('monster', name, manifest['monsters'][name]['size'])
    manifest['npcs'] = {}
    for name, mod in NPCS.items():
        b = os.path.join(mods, mod) if mod else base
        manifest['npcs'][name] = build_sprite(b, os.path.join(b, 'animations', 'npcs', f'{name}.txt'), ['stance'], os.path.join(out, 'npcs', f'{name}.webp'))
        print('npc', name, manifest['npcs'][name]['size'])
    for name, spec in TILESETS.items():
        manifest['tiles'][name] = build_tileset(base, name, spec, os.path.join(out, 'tiles', f'{name}.webp'))
        print('tiles', name, manifest['tiles'][name]['size'])
    for name in EFFECTS:
        manifest['effects'][name] = build_sprite(base, os.path.join(base, 'animations', 'powers', f'{name}.txt'), ['power'], os.path.join(out, 'effects', f'{name}.webp'), EFFECT_SCALE.get(name))
        print('effect', name, manifest['effects'][name]['size'])
    manifest['sounds'] = build_sounds(base, os.path.join(out, 'sounds.js'))
    print('sounds', len(manifest['sounds']))
    icons = Image.open(os.path.join(base, 'images', 'icons', 'icons.png')).convert('RGBA')
    icons.save(os.path.join(out, 'icons.webp'), 'WEBP', quality=88, method=6)
    manifest['icons'] = {'size': 64, 'cols': icons.width // 64}
    # 하위 폴더 안의 그림 경로 계층
    for k in ('hero', 'monsters', 'npcs', 'effects'):
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
