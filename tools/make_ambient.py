"""맵을 살아 있게 하는 그림·애니메이션 (거점·원룸·던전 공통).

실행: python tools/make_ambient.py   (tools/make_shadows.py 다음. 흔들림 프레임은 그림자를 넣은 그림에서 만듦)
  흔들림  나무·덤불·꽃밭·깃발·풀포기: 원래 그림의 윗부분을 1~2px 좌우로 기울인 프레임 + 반복 클립 (밑동·그림자는 그대로)
  깜빡임  FX_Glow_*: 크기·밝기가 조금씩 다른 빛 번짐 6장을 불규칙한 길이로 → 횃불·가로등 빛이 촛불처럼 흔들림
  생물    새(쪼기·날기), 나비, 박쥐, 쥐: 코드로 그린 도트 (C++ Ambient가 움직임)
  입자    잎, 연기, 먼지, 불씨, 반짝임, 구름 그늘: 엔진 ParticleSystem 텍스처
  바닥    풀포기·꽃무더기·조약돌 (풀포기는 흔들림)
  기타    숲 가장자리 타일(거점 바깥), 빚 전광판에 붙은 고지서, 보이지 않는 상호작용 그림
결과: Assets/Sprites/Ambient/*, Assets/Animations/SA_*.hbspriteanimation.json
"""
import json
import random
from pathlib import Path

from PIL import Image, ImageDraw

ASSETS = Path(__file__).resolve().parent.parent / "AuricLoop/Assets"
OUT = ASSETS / "Sprites/Ambient"
ANIM = ASSETS / "Animations"
OUT.mkdir(parents=True, exist_ok=True)
rng = random.Random(11)
INK = (20, 16, 18, 255)


def sprite_asset(png, pivot=(0.5, 0.5)):
    im = Image.open(png)
    rel = png.relative_to(ASSETS.parent).as_posix()
    data = {"version": 1, "name": "S_" + png.stem, "texture": rel, "pixelsPerUnit": 32, "rect": [0, 0, im.width, im.height],
            "pivot": list(pivot), "filter": "nearest", "border": [0, 0, 0, 0]}
    path = png.parent / f"S_{png.stem}.hbsprite.json"
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return path.relative_to(ASSETS.parent).as_posix()


def clip(name, sprites, durations, loop=True):
    if not isinstance(durations, list):
        durations = [durations] * len(sprites)
    data = {"version": 1, "name": name, "frames": [{"sprite": s, "duration": d} for s, d in zip(sprites, durations)], "loop": loop, "playRate": 1}
    (ANIM / f"{name}.hbspriteanimation.json").write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def frames(name, images, durations, folder=OUT, loop=True):
    paths = []
    for i, im in enumerate(images):
        png = folder / f"{name}_{i}.png"
        im.save(png)
        paths.append(sprite_asset(png))
    clip("SA_" + name, paths, durations, loop)
    return paths


def pixels(rows, colors, scale=1):
    im = Image.new("RGBA", (max(len(r) for r in rows), len(rows)))
    for y, row in enumerate(rows):
        for x, ch in enumerate(row):
            if ch in colors:
                im.putpixel((x, y), colors[ch])
    return im.resize((im.width * scale, im.height * scale), Image.NEAREST) if scale > 1 else im


# ---- 흔들림: 바람에 윗부분이 기움 ------------------------------------------------------
def sway(im, offset, rigid_bottom=0.35, top_down=False):
    """offset px만큼 기울인 그림. 아래(밑동) rigid_bottom 비율은 고정, 위로 갈수록 많이 움직임. top_down이면 위가 고정(깃발)."""
    box = im.getbbox()
    top, bottom = box[1], box[3]
    out = Image.new("RGBA", im.size)
    for y in range(im.height):
        row = im.crop((0, y, im.width, y + 1))
        if top_down:
            k = max(0.0, (y - top) / max(1, bottom - top))
        else:
            k = max(0.0, ((bottom - y) / max(1, bottom - top) - rigid_bottom) / (1 - rigid_bottom))
        out.paste(row, (round(offset * k * k), y), row)
    return out


def sway_set(src, name, amp, period, folder, rigid=0.35, top_down=False):
    im = Image.open(src).convert("RGBA")
    offs = [0, amp / 2, amp, amp / 2, 0, -amp / 2, -amp, -amp / 2]
    images = [sway(im, o, rigid, top_down) for o in offs]
    return frames(name, images, period / len(offs), folder)


TOWN = ASSETS / "Sprites/Town"
PROPS = ASSETS / "Sprites/Props"
sway_set(TOWN / "TreeRound.png", "TreeRound", 2, 3.2, TOWN)
sway_set(TOWN / "TreePine.png", "TreePine", 2, 3.6, TOWN, rigid=0.25)
sway_set(TOWN / "Bush.png", "Bush", 1, 2.4, TOWN, rigid=0.2)
sway_set(TOWN / "FlowerBed.png", "FlowerBed", 1, 2.0, TOWN, rigid=0.3)
sway_set(PROPS / "Prop_Banner.png", "Banner", 2, 2.8, PROPS, top_down=True)
sway_set(TOWN / "PottedPlant.png", "PottedPlant", 1, 3.0, TOWN, rigid=0.45)

# ---- NPC 숨쉬기: 허리 위를 1px 내린 그림과 번갈아 (가만히 서 있어도 살아 있게) ------------------
def breathe(im):
    box = im.getbbox()
    cut = box[3] - round((box[3] - box[1]) * 0.45)
    out = im.copy()
    top = im.crop((0, 0, im.width, cut))
    out.paste((0, 0, 0, 0), (0, 0, im.width, cut))
    out.paste(top, (0, 1), top)
    return out


for npc in ("Collector", "Interior", "Blacksmith"):
    im = Image.open(ASSETS / f"Sprites/NPC_{npc}.png").convert("RGBA")
    frames(f"Npc{npc}", [im, breathe(im)], [1.1, 0.9])


# ---- 빛 번짐 깜빡임 (가산 혼합) ---------------------------------------------------------
glow = Image.open(ASSETS / "Sprites/FX/FX_Glow.png").convert("RGBA")
glows = []
for k, (scale, bright) in enumerate([(1.0, 1.0), (0.94, 0.86), (1.04, 0.95), (0.9, 0.78), (0.97, 0.92), (1.06, 1.0)]):
    g = glow.resize((max(1, round(glow.width * scale)), max(1, round(glow.height * scale))), Image.BILINEAR)
    canvas = Image.new("RGBA", glow.size)
    canvas.alpha_composite(g, ((glow.width - g.width) // 2, (glow.height - g.height) // 2))
    r, gg, b, a = canvas.split()
    canvas = Image.merge("RGBA", [c.point(lambda v, f=bright: int(v * f)) for c in (r, gg, b)] + [a])
    glows.append(canvas)
order = [0, 1, 4, 2, 3, 5, 1, 0, 4, 3, 2, 5]
paths = []
for i, im in enumerate(glows):
    png = ASSETS / f"Sprites/FX/FX_Glow_{i}.png"
    im.save(png)
    paths.append(sprite_asset(png))
clip("SA_Glow", [paths[i] for i in order], [0.09, 0.13, 0.07, 0.15, 0.1, 0.08, 0.12, 0.09, 0.14, 0.07, 0.11, 0.1])

# ---- 생물 ---------------------------------------------------------------------------
BIRD = {"k": INK, "b": (122, 82, 52, 255), "d": (84, 56, 38, 255), "w": (232, 222, 200, 255), "o": (240, 170, 60, 255)}
bird_stand = ["   bb    ", "  bkbbo  ", " ddbbb   ", "dddwwb   ", " ddwwb   ", "   k k   "]
bird_peck = ["         ", "   bb    ", " ddbbbb  ", "dddwwbko ", " ddwwb   ", "   k k   "]
bird_up = ["d     d  ", "dd   dd  ", " ddbbd   ", "  bwwbbo ", "  bwwk   ", "         "]
bird_down = ["         ", "   bbb   ", " ddbwwbbo", "dd  wwk  ", "d        ", "         "]
frames("BirdIdle", [pixels(r, BIRD, 2) for r in (bird_stand, bird_stand, bird_peck, bird_stand)], [0.6, 0.3, 0.18, 0.4])
frames("BirdFly", [pixels(r, BIRD, 2) for r in (bird_up, bird_down)], 0.08)
for color, name in (((246, 214, 92, 255), "ButterflyY"), ((236, 236, 250, 255), "ButterflyW"), ((236, 120, 160, 255), "ButterflyP")):
    c = {"a": color, "k": INK, "e": tuple(int(v * 0.7) for v in color[:3]) + (255,)}
    frames(name, [pixels(["aa aa", "aekea", " aka ", " a a "], c, 2), pixels(["     ", " eke ", " aka ", "     "], c, 2)], 0.11)
BAT = {"k": (30, 20, 38, 255), "p": (70, 46, 86, 255), "r": (230, 60, 60, 255)}
frames("Bat", [pixels(["p        p", "pp  kk  pp", " ppkrrkpp ", "   kkkk   "], BAT, 2),
               pixels(["          ", "   kk     ", "ppkrrkpp  ", "pp kkkk pp", "        p "], BAT, 2)], 0.07)
RAT = {"g": (110, 100, 104, 255), "d": (70, 64, 70, 255), "p": (220, 150, 160, 255), "k": INK}
frames("Rat", [pixels(["   ggg  ", "pggggkgp", " d  d   "], RAT, 2), pixels(["   ggg  ", "pggggkgp", "  dd    "], RAT, 2)], 0.09)

# ---- 입자 텍스처 ----------------------------------------------------------------------
def save(name, im):
    im.save(OUT / f"{name}.png")


save("P_Leaf", pixels([" gg", "ggd", "dd "], {"g": (150, 176, 70, 255), "d": (96, 128, 48, 255)}, 2))
save("P_LeafGold", pixels([" gg", "ggd", "dd "], {"g": (232, 186, 70, 255), "d": (176, 118, 40, 255)}, 2))
puff = Image.new("RGBA", (16, 16))
ImageDraw.Draw(puff).ellipse([1, 1, 14, 14], fill=(200, 200, 205, 150))
ImageDraw.Draw(puff).ellipse([4, 3, 12, 10], fill=(230, 230, 235, 170))
save("P_Smoke", puff)
save("P_Dust", pixels(["ww", "ww"], {"w": (255, 246, 214, 255)}, 1))
save("P_Ember", pixels(["oy", "yo"], {"o": (255, 140, 40, 255), "y": (255, 220, 120, 255)}, 1))
save("P_Sparkle", pixels([" w ", "wyw", " w "], {"w": (255, 250, 220, 255), "y": (255, 214, 106, 255)}, 2))
cloud = Image.new("RGBA", (96, 48))
d = ImageDraw.Draw(cloud)
for (x0, y0, x1, y1) in [(0, 12, 54, 44), (24, 2, 80, 40), (46, 14, 95, 46)]:
    d.ellipse([x0, y0, x1, y1], fill=(10, 16, 24, 255))
cloud.putalpha(cloud.getchannel("A").point(lambda v: 38 if v else 0))
save("P_Cloud", cloud)

# ---- 바닥 장식 -----------------------------------------------------------------------
GRASS = {"g": (98, 140, 62, 255), "l": (138, 178, 78, 255), "d": (60, 96, 44, 255)}
tuft = pixels(["  l   l ", " lg l g ", " gg gdg ", "dgdgddgd", " ddddd  "], GRASS, 1)
for k in range(3):  # 풀포기 세 모양, 각자 흔들림
    base = Image.new("RGBA", (12, 10))
    for _ in range(2 + k):
        base.alpha_composite(tuft, (rng.randint(0, 4), rng.randint(0, 5)))
    frames(f"Tuft{k}", [sway(base, o, 0.2) for o in (0, 1, 0, -1)], [0.5, 0.4, 0.5, 0.4])
for k, petal in enumerate([(232, 84, 84, 255), (246, 214, 92, 255), (240, 240, 248, 255), (176, 120, 220, 255)]):
    im = Image.new("RGBA", (14, 10))
    for _ in range(5):
        x, y = rng.randint(1, 11), rng.randint(2, 8)
        im.putpixel((x, y), (60, 96, 44, 255))
        for dx, dy in ((0, -1), (-1, -1), (1, -1), (0, -2)):
            if 0 <= x + dx < 14 and 0 <= y + dy < 10:
                im.putpixel((x + dx, y + dy), petal)
        im.putpixel((x, y - 1), (250, 230, 140, 255))
    frames(f"Flowers{k}", [im, sway(im, 1, 0.2), im, sway(im, -1, 0.2)], [0.7, 0.5, 0.7, 0.5])
for k in range(3):
    im = Image.new("RGBA", (12, 8))
    d = ImageDraw.Draw(im)
    for _ in range(3):
        x, y, r = rng.randint(1, 8), rng.randint(2, 5), rng.randint(1, 2)
        d.ellipse([x, y, x + r + 1, y + r], fill=(120, 116, 112, 255), outline=(70, 66, 66, 255))
        im.putpixel((x + 1, y), (170, 166, 160, 255))
    save(f"Pebbles{k}", im)

# ---- 거점 바깥 숲 (반복 타일): 둥근 나무 잎을 겹쳐 어둡게 -------------------------------
tree = Image.open(TOWN / "TreeRound.png").convert("RGBA")
canopy = tree.crop((0, 8, tree.width, int(tree.height * 0.62)))
tile = Image.new("RGBA", (128, 128), (22, 40, 26, 255))
for _ in range(26):
    x, y = rng.randint(-40, 127), rng.randint(-40, 127)
    for dx in (-128, 0, 128):
        for dy in (-128, 0, 128):
            tile.alpha_composite(canopy, (x + dx, y + dy)) if 0 <= x + dx and 0 <= y + dy and x + dx + canopy.width <= 128 and y + dy + canopy.height <= 128 else tile.paste(canopy, (x + dx, y + dy), canopy)
r, g, b, a = tile.split()
tile = Image.merge("RGBA", [c.point(lambda v: int(v * 0.5)) for c in (r, g, b)] + [a])
tile.save(ASSETS / "Tiles/T_ForestEdge.png")

# ---- 빚 전광판: 빈 칸에 고지서·명단 (C++가 E로 보여 주는 정보는 그대로) --------------------
board = Image.open(ASSETS / "Sprites/Prop_DebtBoard.png").convert("RGBA")
src_board = ASSETS / "Sprites/Prop_DebtBoard_base.png"
if not src_board.exists():
    board.save(src_board)  # 처음 한 번 원본 보관 (다시 돌려도 종이가 겹치지 않게)
board = Image.open(src_board).convert("RGBA")
d = ImageDraw.Draw(board)
PAPER, LINE, RED, GOLD = (226, 214, 186, 255), (120, 104, 90, 255), (196, 52, 46, 255), (246, 198, 84, 255)
bw = board.width
# 그림 안쪽 어두운 칸 세 개(위·가운데·아래)를 찾아 각 칸에 종이 2장
alpha = board.getchannel("A")
dark_rows = [y for y in range(board.height) if sum(1 for x in range(bw) if alpha.getpixel((x, y)) > 200 and sum(board.getpixel((x, y))[:3]) < 150) > bw * 0.5]
bands, start = [], None
for y in range(board.height + 1):
    inside = y in dark_rows
    if inside and start is None:
        start = y
    if not inside and start is not None:
        if y - start > 8:
            bands.append((start, y))
        start = None
for n, (y0, y1) in enumerate(bands[:3]):
    for k in range(2):
        px0 = 12 + k * (bw - 24) // 2 + rng.randint(0, 3)
        pw, ph = (bw - 30) // 2 - 2, min(y1 - y0 - 6, 22)
        py0 = y0 + 3 + rng.randint(0, max(0, y1 - y0 - ph - 6))
        d.rectangle([px0, py0, px0 + pw, py0 + ph], fill=PAPER, outline=LINE)
        for ly in range(py0 + 4, py0 + ph - 2, 3):
            d.line([px0 + 3, ly, px0 + pw - 3 - rng.randint(0, 6), ly], fill=LINE)
        if (n + k) % 2 == 0:
            d.rectangle([px0 + pw - 7, py0 + ph - 7, px0 + pw - 3, py0 + ph - 3], fill=RED)  # 독촉 도장
        d.point((px0 + pw // 2, py0 + 1), fill=GOLD)  # 압정
board.save(ASSETS / "Sprites/Prop_DebtBoard.png")
import hashlib  # noqa: E402  make_shadows가 이 그림을 다시 처리하지 않게 기록 갱신 (이미 여백·그림자가 있는 그림 위에 그렸음)
manifest = ASSETS / "Sprites/shadowed.json"
done = json.loads(manifest.read_text(encoding="utf-8"))
saved = Image.open(ASSETS / "Sprites/Prop_DebtBoard.png").convert("RGBA")
done["Sprites/Prop_DebtBoard.png"] = hashlib.sha256(saved.tobytes() + str(saved.size).encode()).hexdigest()[:16]
manifest.write_text(json.dumps(done, ensure_ascii=False, indent=1, sort_keys=True) + "\n", encoding="utf-8")

Image.new("RGBA", (2, 2)).save(OUT / "Invisible.png")
print("살아 있는 맵 그림 완료:", len(list(OUT.glob("*.png"))), "장 (Ambient)")
