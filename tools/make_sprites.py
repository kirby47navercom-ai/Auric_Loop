"""캐릭터 프레임들을 같은 캔버스(발끝·가운데 정렬)에 맞추고 엔진 스프라이트 에셋(.hbsprite.json)을 만든다.

실행: python tools/make_sprites.py <프레임 폴더>
프레임 폴더에는 tools/pixelize.py로 만든 valen.png, walk_0~3.png, attack_0~2.png 가 있어야 한다.
결과: AuricLoop/Assets/Sprites/Valen/*.png, S_Valen_*.hbsprite.json
"""
import json
import sys
from pathlib import Path

from PIL import Image

PPU = 32
BODY = 62           # 서 있는 발렌의 키(px). 걷기 프레임도 이 키로 맞춘다.
FEET = 0.95         # 오브젝트 중심에서 발끝까지 거리(m) = 캡슐 콜라이더 높이 1.8의 절반 정도
OUT = Path(__file__).resolve().parent.parent / "AuricLoop/Assets/Sprites/Valen"

src = Path(sys.argv[1])
frames = {"Idle_0": "valen.png", **{f"Walk_{i}": f"walk_{i}.png" for i in range(4)},
          **{f"Attack_{i}": f"attack_{i}.png" for i in range(3)}}
images = {}
for name, file in frames.items():
    im = Image.open(src / file).convert("RGBA")
    if name.startswith("Walk") and im.height != BODY:  # 생성 시트마다 키가 조금씩 달라 맞춘다
        im = im.resize((round(im.width * BODY / im.height), BODY), Image.NEAREST)
    images[name] = im

w = max(i.width for i in images.values())
h = max(i.height for i in images.values())
OUT.mkdir(parents=True, exist_ok=True)
pivot_y = FEET * PPU / h  # 캔버스 아래에서 발끝까지는 0, 중심은 발끝 위 FEET m
for name, im in images.items():
    canvas = Image.new("RGBA", (w, h))
    canvas.paste(im, ((w - im.width) // 2, h - im.height))
    canvas.save(OUT / f"Valen_{name}.png")
    asset = {"version": 1, "name": f"S_Valen_{name}", "texture": f"Assets/Sprites/Valen/Valen_{name}.png",
             "pixelsPerUnit": PPU, "rect": [0, 0, w, h], "pivot": [0.5, round(pivot_y, 4)], "filter": "nearest",
             "border": [0, 0, 0, 0]}
    (OUT / f"S_Valen_{name}.hbsprite.json").write_text(json.dumps(asset, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print("발렌 스프라이트:", len(images), "프레임, 캔버스", (w, h))
