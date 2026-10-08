"""타이틀 화면을 살아 있게 하는 작은 그림 (C++ TitleFx가 깜빡이고 움직임).

실행: python tools/make_title_fx.py
  fx_torch_glow.png  횃불 빛 번짐 (가운데 밝은 주황 → 투명, 도트처럼 6단계 고리)
  fx_star.png        네 갈래 반짝임 (로고 둘레 별 자리에 겹침)
  fx_dust.png        떠오르는 금가루 한 알
"""
from pathlib import Path

from PIL import Image

KIT = Path(__file__).resolve().parent.parent / "AuricLoop/Assets/UI/Kit"


def glow(size=72, steps=6):
    im = Image.new("RGBA", (size, size))
    px = im.load()
    c = (size - 1) / 2
    for y in range(size):
        for x in range(size):
            d = ((x - c) ** 2 + (y - c) ** 2) ** 0.5 / c
            if d < 1:
                k = int((1 - d) * steps) / steps  # 계단처럼 끊긴 고리
                px[x, y] = (255, 170 + int(60 * k), 70 + int(50 * k), int(150 * k ** 1.6))
    return im.resize((size * 2, size * 2), Image.NEAREST)


def star():
    rows = ["      W      ",
            "      W      ",
            "      Y      ",
            "     YWY     ",
            "    YWWWY    ",
            "WWYYWWWWWYYWW",
            "    YWWWY    ",
            "     YWY     ",
            "      Y      ",
            "      W      ",
            "      W      "]
    col = {"W": (255, 250, 225, 255), "Y": (255, 214, 106, 255)}
    im = Image.new("RGBA", (len(rows[0]), len(rows)))
    for y, row in enumerate(rows):
        for x, ch in enumerate(row):
            if ch in col:
                im.putpixel((x, y), col[ch])
    return im.resize((im.width * 3, im.height * 3), Image.NEAREST)


def dust():
    im = Image.new("RGBA", (2, 2), (255, 213, 106, 255))
    im.putpixel((0, 0), (255, 246, 200, 255))
    return im.resize((6, 6), Image.NEAREST)


for name, im in (("fx_torch_glow", glow()), ("fx_star", star()), ("fx_dust", dust())):
    im.save(KIT / f"{name}.png")
    print(name, im.size)
