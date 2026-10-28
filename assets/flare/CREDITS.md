# 그림 자원 저작자 표시 (Art credits)

이 폴더의 그림(`hero/`, `monsters/`, `tiles/`, `icons.webp`)은
**Flare: Empyrean Campaign** (flare-game) 프로젝트의 그림을 변환한 것입니다.

- 원본: https://github.com/flareteam/flare-game (`mods/fantasycore`)
- 저작권: Copyright © 2010-2013 Clint Bellanger. 각 기여자가 자신의 기여분에 대한 저작권을 가집니다.
- 라이선스: [CC-BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/) (원 프로젝트가 이후 버전도 허용). 원문은 `LICENSE-CC-BY-SA-3.0.txt`
- 파일별 상세 저작자: https://github.com/flareteam/flare-game/wiki/Credits

## 변경 사항

`tools/build_flare_assets.py`로 다음과 같이 바꿨습니다.

- 필요한 애니메이션 프레임만 골라 투명 여백을 잘라냄
- 원본의 70% 크기로 줄이고 새 아틀라스로 다시 묶음
- PNG를 WebP로 변환
- 게임 안에서 층 테마에 따라 타일에 색을 입힘 (초록, 붉은색, 보라색)

변환한 그림도 같은 CC-BY-SA 3.0 조건으로 배포합니다. 이 라이선스는 그림에만 적용되며, 게임 코드(`js/`, `css/`, `index.html`, `tools/`)는 포함하지 않습니다.

## Flare 그림 제작자 (CREDITS.txt 발췌)

**Art**: Blarumyrran, Brandon Morris "Augmentality", Clint Bellanger, Holly Daniel, Justin Jacobs, Justin Nichol, Jessica "Zeldyn" Cox, remaxim, rubberduck, Sarah Benalene, Scrittl, Stefan Beller

**Additional Art** (재사용 가능한 공개 라이선스 그림 제공): Aare, Bart K, Blender Foundation, Cori Samuel, D. Sharon Pruitt, Hythlodaeus, Iwan "qubodup" Gabovitch, Lamoot, Lattice, Ljudbank, Lorc, MaximB, Michael Baradari, Mike Koenig, Mikodrak, Misha, Mumu, Naraphim, p0ss, Renderwahn, rubberduck, Samuel Moxham, Sindwiller, Spookymodem, Stephan, TiZiana, Vwolfdog, Yughues, Zuendholz

## 사용한 그림

| 게임 안 | Flare 원본 |
| --- | --- |
| 야만용사 몸·머리 | `avatar/male/default_*`, `head_short` |
| 투구·갑옷·장갑·장화 | `avatar/male/leather_*`, `chain_*`, `plate_*` |
| 무기 | `avatar/male/hand_axe`, `battle_axe`, `longsword`, `greatsword`, `mace`, `war_hammer` |
| 좀비, 해골 창병, 해골 석궁병, 해골 마법사 | `enemies/zombie`, `skeleton`, `skeleton_archer`, `skeleton_mage` |
| 고블린, 개미귀신, 미노타우로스, 화염 비룡 | `enemies/goblin`, `antlion`, `minotaur`, `wyvern_fire` |
| 던전·동굴 바닥과 벽, 화로, 상자, 계단, 뼈 | `tilesets/tileset_dungeon`, `tileset_cave` |
| 아이템·스킬 아이콘 | `icons/icons.png` |
