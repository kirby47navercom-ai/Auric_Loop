"""마우스 포인터 조준점 (32x32, 가운데가 찍는 곳). tools/package.mjs가 플레이어 CSS에 넣음.

실행: python tools/make_cursor.py → AuricLoop/Assets/UI/cursor_crosshair.png
금빛 고리 + 네 방향 눈금 + 가운데 점, 어두운 테두리로 밝은 바닥에서도 보이게
"""
from pathlib import Path

from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parent.parent / "AuricLoop/Assets/UI/cursor_crosshair.png"
DARK, GOLD, LIGHT = (40, 22, 8, 255), (245, 190, 60, 255), (255, 244, 200, 255)


def shape(d, color, grow):
    c = 16
    d.ellipse((c - 9 - grow, c - 9 - grow, c + 8 + grow, c + 8 + grow), outline=color, width=2 + 2 * grow)
    for x0, y0, x1, y1 in ((c - 1, 1, c, 6), (c - 1, 25, c, 30), (1, c - 1, 6, c), (25, c - 1, 30, c)):
        d.rectangle((x0 - grow, y0 - grow, x1 + grow, y1 + grow), fill=color)
    d.rectangle((c - 1 - grow, c - 1 - grow, c + grow, c + grow), fill=color)


im = Image.new("RGBA", (32, 32))
d = ImageDraw.Draw(im)
shape(d, DARK, 1)
shape(d, GOLD, 0)
d.rectangle((15, 15, 16, 16), fill=LIGHT)
im.save(OUT)
print(OUT)
