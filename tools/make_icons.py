"""가방·제작 창 아이템 아이콘 (40x40, 도트 그대로 정수배 확대).

실행: python tools/make_icons.py
결과: Assets/UI/Items/<이름>.png
  있는 그림에서: ore(광물)·herb(약초)·bone(마물 소재)·gold(골드, 검은 바탕 지움)
  코드로 그림 (16x16 → 2배, UI 키트 아이콘은 어두운 실루엣이라 새로 그림):
    potion(회복 물약)·bottle(빈 병)·flash(섬광탄)·crystal_power/burn/pierce(각인 결정 금·빨강·파랑)
    sword·bow·card(무기)·scroll([귀환] 두루마리)
"""
import colorsys
import math
from pathlib import Path

from PIL import Image, ImageDraw

ASSETS = Path(__file__).resolve().parent.parent / "AuricLoop/Assets"
OUT = ASSETS / "UI/Items"
SIZE = 40


def fit(im, box=36):
    """가장 큰 정수배(1배 미만이면 줄임)로 키워 40x40 가운데에."""
    im = im.crop(im.getbbox())
    k = box / max(im.size)
    k = max(1, int(k)) if k >= 1 else k
    im = im.resize((max(1, round(im.width * k)), max(1, round(im.height * k))), Image.NEAREST)
    canvas = Image.new("RGBA", (SIZE, SIZE))
    canvas.paste(im, ((SIZE - im.width) // 2, (SIZE - im.height) // 2), im)
    return canvas


def clear_black(im):
    """가장자리에서 이어진 검은 바탕을 투명하게."""
    out = im.copy()
    px = out.load()
    todo = [(0, 0), (out.width - 1, 0), (0, out.height - 1), (out.width - 1, out.height - 1)]
    seen = set()
    while todo:
        x, y = todo.pop()
        if (x, y) in seen or not (0 <= x < out.width and 0 <= y < out.height):
            continue
        seen.add((x, y))
        r, g, b, a = px[x, y]
        if a and max(r, g, b) > 40:
            continue
        px[x, y] = (0, 0, 0, 0)
        todo += [(x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)]
    return out


def hue(im, degrees, sat=1.0):
    out = im.copy()
    px = out.load()
    for y in range(out.height):
        for x in range(out.width):
            r, g, b, a = px[x, y]
            if not a:
                continue
            h, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
            if s < 0.15:  # 흰 반짝임·검은 테두리는 그대로
                continue
            r, g, b = colorsys.hsv_to_rgb(degrees / 360, min(1, s * sat), v)
            px[x, y] = (round(r * 255), round(g * 255), round(b * 255), a)
    return out


def empty_bottle(im):
    """물약에서 색이 짙은 물 부분을 연한 유리색으로 (빈 병)."""
    out = im.copy()
    px = out.load()
    for y in range(out.height):
        for x in range(out.width):
            r, g, b, a = px[x, y]
            h, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
            if a and s > 0.45 and v > 0.25:
                px[x, y] = (196, 226, 236, 120)
    return out


def pixel(draw_fn):
    """16x16에 도트로 그리고 2배로."""
    im = Image.new("RGBA", (16, 16))
    draw_fn(im.load(), ImageDraw.Draw(im))
    return fit(im.resize((32, 32), Image.NEAREST))


OUTLINE = (26, 20, 24, 255)


def outline(px):
    """그린 도트 둘레에 검은 테두리 1칸."""
    filled = {(x, y) for y in range(16) for x in range(16) if px[x, y][3]}
    for x, y in list(filled):
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < 16 and 0 <= ny < 16 and (nx, ny) not in filled:
                px[nx, ny] = OUTLINE


def sword(px, d):
    steel, dark, gold, grip = (222, 228, 236, 255), (138, 147, 163, 255), (224, 176, 64, 255), (107, 62, 31, 255)
    for i in range(9):  # 대각선 칼날
        px[13 - i, 2 + i] = steel
        px[12 - i, 2 + i] = dark if i > 1 else steel
    for x, y in ((3, 9), (4, 10), (5, 11), (6, 12)):  # 가드
        px[x, y] = gold
    for x, y in ((3, 12), (2, 13)):  # 손잡이
        px[x, y] = grip
    px[1, 14] = gold
    outline(px)


def bow(px, d):
    wood, dark, string = (160, 104, 50, 255), (98, 58, 26, 255), (236, 228, 204, 255)
    for t in range(0, 181, 6):  # 왼쪽으로 굽은 활대
        a = math.radians(t - 90)
        x, y = 9 - 6 * math.cos(a), 8 + 6.5 * math.sin(a)
        px[round(x), round(y)] = wood
        px[round(x) + 1, round(y)] = dark
    for y in range(2, 15):  # 시위
        px[10, y] = string
    for x in range(4, 13):  # 화살
        px[x, 8] = (200, 200, 210, 255)
    px[13, 8] = px[12, 7] = px[12, 9] = (230, 230, 240, 255)
    outline(px)


def card(px, d):
    paper, red = (246, 236, 216, 255), (210, 52, 52, 255)
    for y in range(2, 14):
        for x in range(4, 12):
            px[x, y] = paper
    for x, y in ((8, 5), (7, 6), (8, 6), (9, 6), (6, 7), (7, 7), (8, 7), (9, 7), (10, 7), (7, 8), (8, 8), (9, 8), (8, 9)):
        px[x, y] = red  # 가운데 다이아
    px[5, 3] = px[10, 12] = red
    outline(px)


def scroll(px, d):
    paper, shade, roll, seal = (240, 222, 178, 255), (206, 180, 128, 255), (170, 128, 74, 255), (196, 40, 40, 255)
    for y in range(4, 12):
        for x in range(3, 13):
            px[x, y] = paper if (y + x) % 7 else shade
    for y in range(3, 13):  # 양쪽 말린 끝
        px[2, y] = px[13, y] = roll
    for x, y in ((7, 9), (8, 9), (7, 10), (8, 10), (6, 10), (9, 10)):
        px[x, y] = seal  # 붉은 봉인
    for x in range(5, 11):
        px[x, 6] = shade
    outline(px)


def flask(liquid):
    def draw(px, d):
        glass, hi = (206, 232, 242, 210), (255, 255, 255, 240)
        cork = (150, 104, 60, 255)
        for x in range(7, 10):
            px[x, 2] = cork
            px[x, 3] = glass
            px[x, 4] = glass
        for y in range(5, 14):  # 둥근 몸통
            half = [2, 4, 5, 5, 5, 5, 5, 4, 3][y - 5]
            for x in range(8 - half, 9 + half):
                px[x, y] = liquid if (liquid and y >= 8) else glass
        px[6, 7] = px[5, 8] = px[5, 9] = hi
        outline(px)
    return draw


def flashbang(px, d):
    body, dark, spark = (120, 128, 140, 255), (80, 86, 98, 255), (255, 236, 120, 255)
    for y in range(6, 15):
        for x in range(3, 12):
            if (x - 7) ** 2 + (y - 10) ** 2 <= 17:
                px[x, y] = body if x < 8 else dark
    px[7, 5] = px[8, 4] = (90, 70, 50, 255)  # 심지
    for x, y in ((10, 2), (9, 3), (11, 3), (10, 4), (12, 1), (10, 1)):
        px[x, y] = spark
    px[5, 8] = (200, 206, 214, 255)
    outline(px)


def gem(base):
    def draw(px, d):
        h, s_, v = colorsys.rgb_to_hsv(*(c / 255 for c in base))
        tone = lambda vv: tuple(round(c * 255) for c in colorsys.hsv_to_rgb(h, s_, vv)) + (255,)
        rows = [(7, 9), (6, 10), (5, 11), (4, 12), (4, 12), (4, 12), (4, 12), (5, 11), (6, 10), (7, 9)]
        for i, (a, b) in enumerate(rows):
            y = 3 + i
            for x in range(a, b):
                px[x, y] = tone(min(1, v * (1.25 if x < 8 else 0.75)))
        for x, y in ((6, 5), (6, 6), (5, 7)):
            px[x, y] = (255, 255, 255, 230)
        outline(px)
    return draw


OUT.mkdir(parents=True, exist_ok=True)
kit = lambda f: Image.open(ASSETS / "UI/Kit" / f).convert("RGBA")
spr = lambda f: Image.open(ASSETS / "Sprites" / f).convert("RGBA")
icons = {
    "ore": fit(spr("Prop_Ore.png")), "herb": fit(spr("Prop_Herb.png")), "bone": fit(spr("Props/Prop_Bones.png")),
    "gold": fit(clear_black(spr("Item_Coin.png")), 32), "potion": pixel(flask((214, 52, 60, 255))), "bottle": pixel(flask(None)),
    "flash": pixel(flashbang), "crystal_power": pixel(gem((240, 190, 60))), "crystal_burn": pixel(gem((226, 64, 48))),
    "crystal_pierce": pixel(gem((70, 150, 235))),
    "sword": pixel(sword), "bow": pixel(bow), "card": pixel(card), "scroll": pixel(scroll),
}
for name, im in icons.items():
    im.save(OUT / f"{name}.png")
print("아이콘", len(icons), "개:", ", ".join(icons))
