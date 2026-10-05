"""캐릭터 프레임들을 같은 캔버스(발끝·가운데 정렬)에 맞추고 엔진 스프라이트 에셋(.hbsprite.json)을 만든다.

실행: python tools/make_sprites.py <프레임 폴더> [이름 키]   예) python tools/make_sprites.py frames/sherry Sherry 66
프레임 폴더에는 tools/pixelize.py로 만든 <이름 소문자>.png, walk_0~3.png, attack_0~2.png 가 있어야 한다.
결과: AuricLoop/Assets/Sprites/<이름>/*.png, S_<이름>_*.hbsprite.json
"""
import json
import sys
from pathlib import Path

from PIL import Image

PPU = 32
NAME = sys.argv[2] if len(sys.argv) > 2 else "Valen"
BODY = int(sys.argv[3]) if len(sys.argv) > 3 else 62  # 서 있는 키(px). 생성 시트마다 크기가 달라 모든 프레임을 이 키에 맞춘다 (발렌은 걷기만)
FEET = 0.95         # 오브젝트 중심에서 발끝까지 거리(m) = 캡슐 콜라이더 높이 1.8의 절반 정도
OUT = Path(__file__).resolve().parent.parent / f"AuricLoop/Assets/Sprites/{NAME}"

src = Path(sys.argv[1])
frames = {"Idle_0": f"{NAME.lower()}.png", **{f"Walk_{i}": f"walk_{i}.png" for i in range(4)},
          **{f"Attack_{i}": f"attack_{i}.png" for i in range(3)}}
images = {}
for name, file in frames.items():
    im = Image.open(src / file).convert("RGBA")
    if (name.startswith("Walk") or NAME != "Valen") and im.height != BODY:  # 생성 시트마다 키가 조금씩 달라 맞춘다
        im = im.resize((round(im.width * BODY / im.height), BODY), Image.NEAREST)
    images[name] = im

w = max(i.width for i in images.values())
h = max(i.height for i in images.values())
OUT.mkdir(parents=True, exist_ok=True)
pivot_y = FEET * PPU / h  # 캔버스 아래에서 발끝까지는 0, 중심은 발끝 위 FEET m
for name, im in images.items():
    canvas = Image.new("RGBA", (w, h))
    canvas.paste(im, ((w - im.width) // 2, h - im.height))
    canvas.save(OUT / f"{NAME}_{name}.png")
    asset = {"version": 1, "name": f"S_{NAME}_{name}", "texture": f"Assets/Sprites/{NAME}/{NAME}_{name}.png",
             "pixelsPerUnit": PPU, "rect": [0, 0, w, h], "pivot": [0.5, round(pivot_y, 4)], "filter": "nearest",
             "border": [0, 0, 0, 0]}
    (OUT / f"S_{NAME}_{name}.hbsprite.json").write_text(json.dumps(asset, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(NAME, "스프라이트:", len(images), "프레임, 캔버스", (w, h))
