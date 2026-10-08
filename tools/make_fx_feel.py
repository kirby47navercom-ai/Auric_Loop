"""적 공격·타격감 이펙트 그림 (코드로 그림 / 플레이어 베기 궤적을 다시 칠함).

실행: python tools/make_fx_feel.py
  Alert       공격 예고 때 머리 위 "!" (튀어나왔다 멈춤)
  EnemySlash  적 베기 궤적 (플레이어 SA_Slash를 붉게), BossSlash 보스용 2배
  Impact      맞은 자리 불꽃 (흰·노랑), ImpactRed 플레이어가 맞을 때 (붉음)
  Crack       보스 충격파 파편 (땅을 타고 나가는 탄)
  GoldDrop    금화 비: 하늘에서 떨어져 바닥에서 튀는 금화 줄기
결과: Assets/Sprites/FX/<이름>_<n>.png + S_*.hbsprite.json, Assets/Animations/SA_<이름>.hbspriteanimation.json
"""
import json
import math
from pathlib import Path

from PIL import Image, ImageDraw

ASSETS = Path(__file__).resolve().parent.parent / "AuricLoop/Assets"
FX = ASSETS / "Sprites/FX"
ANIM = ASSETS / "Animations"


def save_clip(name, images, durations, loop=False):
    if not isinstance(durations, list):
        durations = [durations] * len(images)
    frames = []
    for i, im in enumerate(images):
        png = FX / f"{name}_{i}.png"
        im.save(png)
        sp = {"version": 1, "name": f"S_{name}_{i}", "texture": f"Assets/Sprites/FX/{name}_{i}.png", "pixelsPerUnit": 32,
              "rect": [0, 0, im.width, im.height], "pivot": [0.5, 0.5], "filter": "nearest", "border": [0, 0, 0, 0]}
        (FX / f"S_{name}_{i}.hbsprite.json").write_text(json.dumps(sp, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        frames.append({"sprite": f"Assets/Sprites/FX/S_{name}_{i}.hbsprite.json", "duration": durations[i]})
    (ANIM / f"SA_{name}.hbspriteanimation.json").write_text(json.dumps({"version": 1, "name": f"SA_{name}", "frames": frames, "loop": loop, "playRate": 1},
                                                                      ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def pixels(rows, colors):
    im = Image.new("RGBA", (max(len(r) for r in rows), len(rows)))
    for y, row in enumerate(rows):
        for x, ch in enumerate(row):
            if ch in colors:
                im.putpixel((x, y), colors[ch])
    return im


def canvas(im, size):
    c = Image.new("RGBA", size)
    c.alpha_composite(im, ((size[0] - im.width) // 2, (size[1] - im.height) // 2))
    return c


# ---- "!" 경고 -----------------------------------------------------------------------
BANG = ["  KKKK  ", " KRRRRK ", " KRYYRK ", " KRYYRK ", " KRYYRK ", " KRYYRK ", " KRYYRK ", "  KRRK  ", "  KRRK  ", "   KK   ",
        "        ", "  KKKK  ", " KRYYRK ", " KRRRRK ", "  KKKK  "]
bang = pixels(BANG, {"K": (30, 10, 12, 255), "R": (226, 52, 44, 255), "Y": (255, 214, 106, 255)})
alert = [canvas(bang.resize((bang.width * k // 4, bang.height * k // 4), Image.NEAREST), (16, 30)) for k in (2, 5, 4, 4)]
save_clip("Alert", [a.resize((a.width * 2, a.height * 2), Image.NEAREST) for a in alert], [0.05, 0.06, 0.3, 0.2])

# ---- 적 베기 궤적: 플레이어 궤적을 붉은 주황으로 -----------------------------------------------
slash = [Image.open(FX / f"Slash_{i}.png").convert("RGBA") for i in range(4)]


def recolor(im):
    out = im.copy()
    px = out.load()
    for y in range(out.height):
        for x in range(out.width):
            r, g, b, a = px[x, y]
            if a:
                v = (r + g + b) / 765
                px[x, y] = (255, int(40 + 120 * v ** 3), int(30 + 60 * v ** 4), a)  # 붉은 주황, 가운데만 밝게
    return out


red_slash = [recolor(im) for im in slash]
save_clip("EnemySlash", red_slash, 0.04)
save_clip("BossSlash", [im.resize((im.width * 2, im.height * 2), Image.NEAREST) for im in red_slash], 0.05)

# ---- 타격 불꽃 -------------------------------------------------------------------------


def burst(radius, rays, color, core):
    im = Image.new("RGBA", (40, 40))
    d = ImageDraw.Draw(im)
    for k in range(rays):
        a = k * 2 * math.pi / rays + 0.3
        d.line([(20 + math.cos(a) * radius * 0.35, 20 + math.sin(a) * radius * 0.35), (20 + math.cos(a) * radius, 20 + math.sin(a) * radius)], fill=color, width=2)
    if core:
        d.ellipse([20 - core, 20 - core, 20 + core, 20 + core], fill=(255, 255, 240, 255))
    return im


for name, col in (("Impact", (255, 236, 150, 255)), ("ImpactRed", (255, 70, 60, 255))):
    save_clip(name, [burst(r, 8, col, c).resize((80, 80), Image.NEAREST) for r, c in ((8, 6), (15, 5), (19, 2), (19, 0))], [0.03, 0.04, 0.05, 0.05])

# ---- 충격파 파편 (탄) -------------------------------------------------------------------
ROCK = {"K": (24, 18, 20, 255), "G": (230, 181, 78, 255), "S": (140, 128, 120, 255), "D": (90, 80, 78, 255), "W": (255, 236, 160, 255)}
crack = [pixels(["   KK    ", "  KSSK   ", " KSGSSK  ", "KSSWGSDK ", " KDSSDK  ", "  KDDK   ", "   KK    "], ROCK),
         pixels(["   KK    ", "  KSSK K ", " KSSGSKGK", "KSDGWSK  ", " KSSDDK  ", "  KDK    ", "         "], ROCK)]
save_clip("Crack", [c.resize((c.width * 3, c.height * 3), Image.NEAREST) for c in crack], 0.08, loop=True)

# ---- 금화 비: 위에서 떨어지는 금화 줄기 → 바닥에서 튐 ------------------------------------------
coin = Image.open(FX / "Coin_0.png").convert("RGBA")
drops = []
for k, y in enumerate([4, 30, 56, 78]):
    im = Image.new("RGBA", (48, 96))
    d = ImageDraw.Draw(im)
    d.line([(24, max(0, y - 30)), (24, y)], fill=(255, 214, 106, 120), width=3)  # 떨어지는 빛줄기
    im.alpha_composite(coin, (24 - coin.width // 2, min(96 - coin.height, y)))
    drops.append(im)
splash = Image.new("RGBA", (48, 96))
splash.alpha_composite(burst(16, 10, (255, 214, 106, 255), 4).resize((48, 48), Image.NEAREST), (0, 48))
drops.append(splash)
save_clip("GoldDrop", drops, [0.06, 0.06, 0.06, 0.06, 0.12])
print("이펙트 완료")
