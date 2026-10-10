"""UI 장식 그림 (네모 패널 대신): 정산 동전, 리본, 명패, 9칸 늘이는 금테 테두리, 표지판.

실행: python tools/make_ui_art.py
결과: Assets/UI/Art/*.png (공개 저장소에 올림, UI 키트와 그림체를 맞춘 도트)
  coin_empty / coin_full  정산 가운데 큰 동전 (빈 동전은 어두운 홈, 찬 동전은 금. 진행 막대로 아래부터 차오름)
  ribbon                  제목 리본 (가운데 글씨, 양끝 접힘)
  plaque                  빚 명패 (나무판에 금테·리벳)
  frame_gold              9칸 늘이는 창 테두리 (모서리 장식 16px, nineSlice 16)
  frame_dark              어두운 안쪽만 있는 창 (대화창·메뉴 버튼)
"""
import math
from pathlib import Path

from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parent.parent / "AuricLoop/Assets/UI/Art"
OUT.mkdir(parents=True, exist_ok=True)
INK = (20, 14, 12, 255)
GOLD_D, GOLD, GOLD_L, GOLD_W = (120, 74, 24, 255), (208, 150, 52, 255), (246, 200, 92, 255), (255, 240, 180, 255)
NAVY, NAVY_L = (14, 20, 26, 255), (30, 40, 48, 255)
WOOD_D, WOOD, WOOD_L = (54, 32, 22, 255), (88, 54, 34, 255), (122, 80, 50, 255)


def x2(im):
    return im.resize((im.width * 2, im.height * 2), Image.NEAREST)


# ---- 동전 (96px → 2배) ----------------------------------------------------------------
def coin(full):
    S = 96
    im = Image.new("RGBA", (S, S))
    px = im.load()
    c = (S - 1) / 2
    for y in range(S):
        for x in range(S):
            d = math.hypot(x - c, y - c)
            if d > 47:
                continue
            if d > 45:
                col = INK
            elif d > 40:  # 테
                k = (math.atan2(y - c, x - c) + math.pi) / (2 * math.pi)
                col = (GOLD_L if 0.55 < k < 0.85 else GOLD if k < 0.95 else GOLD_D) if full else (70, 56, 40, 255)
                if int(k * 48) % 2 == 0 and full:
                    col = GOLD_D  # 톱니 무늬
            elif d > 38:
                col = INK if not full else GOLD_D
            else:  # 안쪽: 위는 밝고 아래는 어둡게
                t = (y - c) / 38
                if full:
                    col = GOLD_L if t < -0.4 else GOLD if t < 0.45 else (182, 124, 40, 255)
                else:
                    col = (24, 30, 34, 220) if t < 0.5 else (18, 22, 26, 230)
            px[x, y] = col
    d = ImageDraw.Draw(im)
    # 가운데 문장: 마몬의 입 (이빨 난 입 모양) — 찬 동전은 돋을새김, 빈 동전은 흐린 홈
    e1, e2 = (GOLD_D, GOLD_W) if full else ((40, 46, 50, 255), (52, 58, 62, 255))
    d.arc([22, 22, 73, 73], 200, 340, fill=e1, width=3)
    d.arc([22, 24, 73, 75], 200, 340, fill=e2, width=1)
    for i, x in enumerate(range(30, 68, 7)):  # 이빨
        d.polygon([(x, 52), (x + 6, 52), (x + 3, 59 + (i % 2) * 3)], fill=e2 if full else e1)
    d.line([(28, 52), (68, 52)], fill=e1, width=2)
    d.ellipse([33, 30, 41, 38], fill=e1)
    d.ellipse([55, 30, 63, 38], fill=e1)  # 눈
    if full:
        for (x, y) in [(28, 22), (30, 20), (26, 24), (70, 70)]:
            px[x, y] = GOLD_W  # 반짝임
    return x2(im)


coin(False).save(OUT / "coin_empty.png")
coin(True).save(OUT / "coin_full.png")


# ---- 리본 (제목) --------------------------------------------------------------------------
def ribbon(w=200, h=26):
    im = Image.new("RGBA", (w, h + 8))
    d = ImageDraw.Draw(im)
    tail = 18
    for side in (0, 1):  # 접힌 꼬리
        x0 = 0 if side == 0 else w - tail
        pts = [(x0, 8), (x0 + tail, 8), (x0 + tail, h + 8), (x0, h + 8), (x0 + (6 if side == 0 else tail - 6), h // 2 + 8)]
        d.polygon(pts, fill=(120, 28, 30, 255), outline=INK)
    d.rectangle([tail - 4, 0, w - tail + 3, h], fill=(176, 40, 40, 255), outline=INK)
    d.line([(tail - 3, 2), (w - tail + 2, 2)], fill=(222, 84, 74, 255))
    d.line([(tail - 3, h - 2), (w - tail + 2, h - 2)], fill=(120, 28, 30, 255))
    d.line([(tail - 1, 4), (w - tail, 4)], fill=GOLD)
    d.line([(tail - 1, h - 4), (w - tail, h - 4)], fill=GOLD)
    return x2(im)


ribbon().save(OUT / "ribbon.png")


def name_ribbon():
    """대화창 이름표: 앞 띠(110x26 → 220x52)와 뒤로 접혀 대화창 뒤로 들어가는 꼬리(138x30 → 276x60)를 따로.
    꼬리는 대화창보다 뒤에 그려져 아랫부분이 창 테두리 뒤로 숨어서, 띠가 창 윗변을 감싸 넘어가는 것처럼 보임"""
    RED, RED_D, RED_L, FOLD = (176, 40, 40, 255), (112, 26, 28, 255), (222, 84, 74, 255), (70, 14, 16, 255)
    band = Image.new("RGBA", (110, 26))
    d = ImageDraw.Draw(band)
    d.rectangle([0, 0, 109, 25], fill=RED, outline=INK)
    d.line([(1, 1), (108, 1)], fill=RED_L)
    d.line([(1, 24), (108, 24)], fill=RED_D)
    d.line([(2, 3), (107, 3)], fill=GOLD)
    d.line([(2, 22), (107, 22)], fill=GOLD)
    tails = Image.new("RGBA", (138, 30))
    d = ImageDraw.Draw(tails)
    for side in (0, 1):
        x0 = 0 if side == 0 else 138 - 20
        inner = 18 if side == 0 else 138 - 18
        notch = 5 if side == 0 else 138 - 5
        pts = [(x0 if side == 0 else 137, 6), (inner, 6), (inner, 29), (x0 if side == 0 else 137, 29), (notch, 17)]
        d.polygon(pts, fill=RED_D, outline=INK)
        d.line([(x0 + (2 if side == 0 else 1), 8), (inner - (1 if side == 0 else -1), 8)], fill=GOLD)
        # 접힌 자리: 띠 끝 바로 바깥 꼬리 윗부분을 어둡게 (띠가 뒤로 꺾여 들어가는 그늘)
        for y in range(7, 29):
            for x in ((range(12, 14)) if side == 0 else range(124, 126)):
                tails.putpixel((x, y), FOLD)
    band.resize((220, 52), Image.NEAREST).save(OUT / "ribbon_band.png")
    tails.resize((276, 60), Image.NEAREST).save(OUT / "ribbon_tails.png")


name_ribbon()


# ---- 명패 (빚) ----------------------------------------------------------------------------
def plaque(w=180, h=34):
    im = Image.new("RGBA", (w, h))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle([0, 0, w - 1, h - 1], 5, fill=WOOD, outline=INK)
    for y in range(4, h - 4, 5):
        d.line([(4, y), (w - 5, y)], fill=WOOD_D if y % 2 else WOOD_L)
    d.rounded_rectangle([3, 3, w - 4, h - 4], 3, outline=GOLD)
    d.rounded_rectangle([5, 5, w - 6, h - 6], 2, fill=(30, 18, 14, 235))
    for x, y in [(8, 8), (w - 9, 8), (8, h - 9), (w - 9, h - 9)]:
        d.ellipse([x - 2, y - 2, x + 2, y + 2], fill=GOLD_L, outline=INK)
    return x2(im)


plaque().save(OUT / "plaque.png")


# ---- 9칸 테두리 (금테 + 모서리 장식) --------------------------------------------------------
def frame(fill):
    S = 48
    im = Image.new("RGBA", (S, S))
    d = ImageDraw.Draw(im)
    d.rectangle([2, 2, S - 3, S - 3], fill=fill)
    d.rectangle([1, 1, S - 2, S - 2], outline=INK)
    d.rectangle([3, 3, S - 4, S - 4], outline=GOLD_D)
    d.rectangle([4, 4, S - 5, S - 5], outline=GOLD)
    d.line([(5, 5), (S - 6, 5)], fill=GOLD_L)
    for cx, cy in [(0, 0), (S - 13, 0), (0, S - 13), (S - 13, S - 13)]:  # 모서리 장식
        d.rectangle([cx + 1, cy + 1, cx + 11, cy + 11], fill=GOLD_D, outline=INK)
        d.rectangle([cx + 3, cy + 3, cx + 9, cy + 9], fill=GOLD)
        d.rectangle([cx + 5, cy + 5, cx + 7, cy + 7], fill=GOLD_W)
    for mx, my in [(S // 2 - 3, 0), (S // 2 - 3, S - 6), (0, S // 2 - 3), (S - 6, S // 2 - 3)]:  # 변 가운데 작은 보석
        d.rectangle([mx, my, mx + 5, my + 5], fill=(176, 40, 40, 255), outline=INK)
    return x2(im)


frame(NAVY).save(OUT / "frame_gold.png")
frame((22, 30, 36, 255)).save(OUT / "frame_button.png")
print("UI 장식 그림 완료:", sorted(p.name for p in OUT.glob("*.png")))


# ---- 튜토리얼 표지판 (던전 시작 방): 나무 판에 분필 스케치 — 키 하나 + 하는 일 그림. 1m = 32px ----------------
from PIL import ImageFont  # noqa: E402

SIGNS = Path(__file__).resolve().parent.parent / "AuricLoop/Assets/Sprites/Props"
FONT = ImageFont.truetype(str(Path(__file__).resolve().parent.parent / "AuricLoop/Assets/Fonts/DungGeunMo.ttf"), 11)
CHALK, CHALK_D = (236, 230, 214, 255), (170, 164, 150, 255)


def board():
    W, H = 84, 76
    im = Image.new("RGBA", (W, H))
    d = ImageDraw.Draw(im)
    d.rectangle([W // 2 - 3, 44, W // 2 + 2, H - 1], fill=WOOD_D, outline=INK)  # 기둥
    d.rectangle([1, 1, W - 2, 50], fill=WOOD, outline=INK)
    for y in range(4, 49, 6):
        d.line([(3, y), (W - 4, y)], fill=WOOD_D)
    d.rectangle([4, 4, W - 5, 47], fill=(38, 44, 40, 255), outline=WOOD_L)  # 칠판
    for x, y in [(3, 3), (W - 4, 3), (3, 48), (W - 4, 48)]:
        im.putpixel((x, y), GOLD_L)
    return im, d


def key(d, x, y, label, w=None):
    w = w or max(12, int(d.textlength(label, font=FONT)) + 6)
    d.rounded_rectangle([x, y, x + w, y + 12], 2, outline=CHALK)
    d.line([(x + 1, y + 13), (x + w - 1, y + 13)], fill=CHALK_D)
    d.text((x + w / 2, y + 7), label, font=FONT, fill=CHALK, anchor="mm")
    return x + w


HERO = Path(__file__).resolve().parent.parent / "AuricLoop/Assets/Sprites/Valen"


def chalk_hero(im, pose, x, y, h=26, flip=False, fill=False):
    """게임 캐릭터(발렌) 그림을 분필 그림으로: 키 h px로 줄이고 윤곽선(+원하면 옅은 채움)만 분필 색으로. (x, y) = 발끝 가운데"""
    src = Image.open(HERO / f"Valen_{pose}.png").convert("RGBA")
    src = src.crop(src.getbbox())
    w = max(1, round(src.width * h / src.height))
    small = src.resize((w, h), Image.NEAREST)
    if flip:
        small = small.transpose(Image.FLIP_LEFT_RIGHT)
    a = small.getchannel("A").point(lambda v: 255 if v > 100 else 0)
    px, out = a.load(), Image.new("RGBA", (w + 2, h + 2))
    sp = small.load()
    o = out.load()
    for yy in range(h):
        for xx in range(w):
            if not px[xx, yy]:
                continue
            edge = any(not (0 <= xx + dx < w and 0 <= yy + dy < h) or not px[xx + dx, yy + dy] for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)))
            if edge:
                o[xx + 1, yy + 1] = CHALK
            elif fill:  # 안쪽: 밝은 곳은 옅은 분필, 색이 크게 바뀌는 곳(얼굴·머리카락·옷 경계)은 선
                lum = lambda c: c[0] * 0.3 + c[1] * 0.59 + c[2] * 0.11  # noqa: E731
                c0 = sp[xx, yy]
                line = any(0 <= xx + dx < w and 0 <= yy + dy < h and px[xx + dx, yy + dy] and abs(lum(sp[xx + dx, yy + dy]) - lum(c0)) > 70
                           for dx, dy in ((1, 0), (0, 1)))
                if line:
                    o[xx + 1, yy + 1] = CHALK_D
                elif lum(c0) > 150:
                    o[xx + 1, yy + 1] = (200, 196, 182, 140)
    im.alpha_composite(out, (int(x - out.width / 2), int(y - out.height)))


def guy(d, x, y, lean=0):
    """막대 사람 (머리 중심 x,y). lean: 앞으로 기울기"""
    d.ellipse([x - 3, y - 3, x + 3, y + 3], outline=CHALK)
    d.line([(x, y + 3), (x + lean, y + 12)], fill=CHALK)
    d.line([(x + lean, y + 12), (x + lean - 4, y + 19)], fill=CHALK)
    d.line([(x + lean, y + 12), (x + lean + 4, y + 19)], fill=CHALK)
    return (x + lean // 2, y + 7)


def arrow(d, x0, y, x1):
    d.line([(x0, y), (x1, y)], fill=CHALK_D)
    d.polygon([(x1, y - 3), (x1 + 4, y), (x1, y + 3)], fill=CHALK)


def sign(name, draw):
    im, d = board()
    draw(d)
    for pose, x, y, h, flip in HEROES.get(name, []):
        chalk_hero(im, pose, x, y, h, flip, fill=True)
    im.save(SIGNS / f"Sign_{name}.png")


def s_move(d):  # WASD + 걷는 사람
    key(d, 21, 8, "W")
    key(d, 8, 23, "A"); key(d, 21, 23, "S"); key(d, 34, 23, "D")



def s_attack(d):  # 마우스(왼쪽 버튼) + 칼을 휘두르는 사람과 베기 호
    d.rounded_rectangle([8, 10, 22, 32], 6, outline=CHALK)
    d.line([(15, 10), (15, 19)], fill=CHALK)
    d.rectangle([9, 11, 14, 18], fill=CHALK_D)
    d.arc([40, 2, 80, 40], 220, 340, fill=CHALK, width=2)  # 베기 호


def s_dodge(d):  # Space + 몸을 말아 구르는 사람
    key(d, 6, 30, "Space", 32)
    d.arc([44, 4, 76, 36], 150, 330, fill=CHALK_D)  # 도는 궤적
    arrow(d, 10, 18, 40)


def s_interact(d):  # E + 몸을 굽혀 돌을 줍는 사람
    key(d, 8, 16, "E")
    d.polygon([(62, 36), (67, 31), (74, 33), (73, 40), (64, 41)], outline=CHALK)  # 광물


def s_craft(d):  # Q + 약초 → 물약
    key(d, 6, 16, "Q")
    d.line([(26, 34), (30, 20)], fill=CHALK); d.line([(29, 25), (35, 20)], fill=CHALK_D); d.line([(28, 29), (23, 24)], fill=CHALK_D)
    arrow(d, 38, 27, 46)
    d.rectangle([58, 12, 62, 17], outline=CHALK); d.ellipse([53, 17, 67, 33], outline=CHALK); d.line([(56, 26), (64, 26)], fill=CHALK_D)


def s_bag(d):  # Tab + 가방
    key(d, 6, 16, "Tab")
    d.rounded_rectangle([46, 16, 70, 38], 4, outline=CHALK)
    d.arc([51, 8, 65, 22], 180, 360, fill=CHALK)
    d.line([(46, 24), (70, 24)], fill=CHALK_D)
    d.rectangle([56, 22, 60, 27], outline=CHALK)


def s_return(d):  # [귀환] 두루마리 → Tab·Enter → 집
    d.rectangle([7, 12, 19, 30], outline=CHALK); d.line([(5, 12), (21, 12)], fill=CHALK); d.line([(5, 30), (21, 30)], fill=CHALK)
    d.line([(10, 18), (16, 18)], fill=CHALK_D); d.line([(10, 23), (16, 23)], fill=CHALK_D)
    key(d, 26, 8, "Tab"); key(d, 26, 26, "Enter", 26)
    d.polygon([(68, 10), (77, 19), (59, 19)], outline=CHALK); d.rectangle([61, 19, 75, 33], outline=CHALK); d.rectangle([66, 25, 70, 33], outline=CHALK_D)


# 표지판마다 분필로 그릴 캐릭터 자세: (그림, 발끝 x, 발끝 y, 키, 좌우반전)
HEROES = {"Move": [("E_Walk_1", 64, 44, 36, False)], "Attack": [("E_Attack_1", 56, 45, 38, False)],
          "Dodge": [("E_Roll_1", 60, 34, 22, False)], "Interact": [("S_Idle_0", 50, 45, 36, False)]}
for n, f in [("Move", s_move), ("Attack", s_attack), ("Dodge", s_dodge), ("Interact", s_interact), ("Craft", s_craft), ("Bag", s_bag), ("Return", s_return)]:
    sign(n, f)
print("표지판 7개 완료")
