"""타이틀 시작 연출·분위기 그림 (Kit 폴더, 공개 저장소에 올리지 않음).

실행: python tools/make_title_fx.py → python tools/gen_hud.py
  title_v2.png를 층으로 나눔: title_plate.png(로고를 지운 바탕), title_letter_N.png(글자 조각), 동전·고리·Tap 조각, TitleLayout.inl
  스스로 움직이는 WebP: title_ambient(횃불·불티·금가루·별), title_fog, title_shine, title_tapglow, title_burst(땅 순간 동전)
  mastiff_logo.png: 회사 로고 화면 (mastiff_logo_src.png에서)
엔진이 위젯 값 하나를 바꿀 때마다 위젯 전체를 복사해 넘기므로(docs/엔진_요청_UI값동기화.md) 계속 움직이는 것은 WebP로 굽는다.
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




# ---- 분위기 층 (2026-10-10): 로고 빛 훑기, 바닥 안개, 아치 빛줄기, 횃불 불티 ------------------------------
import numpy as np  # noqa: E402

SHINE_BOX = (340, 150, 930, 530)  # 1280x720 화면에서 로고 글자 자리
SHINE_FRAMES = 14


def logo_shine():
    """로고 글자(크림색 픽셀)에만 비스듬한 빛 띠가 왼쪽에서 오른쪽으로 지나가는 그림 SHINE_FRAMES장 (C++가 바꿔 끼움)"""
    im = np.array(Image.open(KIT / "title_v2.png").convert("RGB").resize((1280, 720), Image.NEAREST)).astype(int)
    r, g, b = im[..., 0], im[..., 1], im[..., 2]
    x0, y0, x1, y1 = SHINE_BOX
    mask = ((r > 215) & (g > 200) & (b > 165) & ((r - b) < 70))[y0:y1, x0:x1]
    h, w = mask.shape
    grown = mask.copy()
    for _ in range(6):  # 6px 넓힘
        g2 = grown.copy()
        g2[1:] |= grown[:-1]; g2[:-1] |= grown[1:]; g2[:, 1:] |= grown[:, :-1]; g2[:, :-1] |= grown[:, 1:]
        grown = g2
    rim = grown & ~mask
    yy, xx = np.mgrid[0:h, 0:w]
    diag = xx + (h - yy) * 0.45  # 오른쪽 위로 기운 띠
    out = []
    for f in range(SHINE_FRAMES):
        c = -120 + (w + 0.45 * h + 240) * f / (SHINE_FRAMES - 1)
        k = np.clip(1 - np.abs(diag - c) / 60, 0, 1)
        k = np.floor(k * 4) / 4  # 도트처럼 4단계
        # 글자가 이미 흰빛이라 흰 빛은 안 보임: 지나가는 자리의 글자를 금빛으로 물들이고 둘레 6px에 금빛이 번짐
        a = np.where(mask, k * 170, np.where(rim, k * 120, 0)).astype("uint8")
        rgba = np.dstack([np.full_like(a, 255), np.where(mask, 214, 190).astype("uint8"), np.where(mask, 110, 70).astype("uint8"), a])
        out.append(Image.fromarray(rgba, "RGBA"))
    return out


def noise(w, h, cells, seed):
    """가로로 이어지는 부드러운 값 노이즈 (0~1)"""
    rng = np.random.default_rng(seed)
    grid = rng.random((cells[1] + 1, cells[0]))
    grid = np.concatenate([grid, grid[:, :1]], axis=1)  # 오른쪽 끝 = 왼쪽 끝
    xs, ys = np.linspace(0, cells[0], w, endpoint=False), np.linspace(0, cells[1], h)
    xi, yi = xs.astype(int), np.minimum(ys.astype(int), cells[1] - 1)
    xf, yf = xs - xi, ys - yi
    xf, yf = xf * xf * (3 - 2 * xf), yf * yf * (3 - 2 * yf)
    a, b_ = grid[yi][:, xi], grid[yi][:, xi + 1]
    c, d = grid[yi + 1][:, xi], grid[yi + 1][:, xi + 1]
    top, bot = a + (b_ - a) * xf, c + (d - c) * xf
    return top + (bot - top) * yf[:, None]


def rays():
    """아치 위에서 비스듬히 내려오는 빛줄기 셋 (아래로 갈수록 흐려짐), 720x600"""
    w, h = 180, 150
    yy, xx = np.mgrid[0:h, 0:w]
    a = np.zeros((h, w))
    for cx, slope, width, power in ((70, 0.32, 9, 1.0), (98, 0.2, 6, 0.7), (122, 0.42, 11, 0.85)):
        d = np.abs(xx - (cx + slope * yy)) / (width + yy * 0.08)
        a = np.maximum(a, np.clip(1 - d, 0, 1) * power)
    a *= np.clip(1 - yy / h, 0, 1) ** 1.2
    a = np.floor(a * 5) / 5 * 70
    rgba = np.dstack([np.full((h, w), 255), np.full((h, w), 224), np.full((h, w), 160), a]).astype("uint8")
    return Image.fromarray(rgba, "RGBA").resize((w * 4, h * 4), Image.NEAREST)


def ember():
    im = Image.new("RGBA", (2, 2), (255, 140, 40, 255))
    im.putpixel((0, 0), (255, 230, 150, 255))
    return im.resize((6, 6), Image.NEAREST)


rays().save(KIT / "fx_rays.png")  # 아치 빛줄기 (멈춘 그림, C++가 처음에 밝힘)


# ---- 시작 연출 (2026-10-10): 회사 로고 → 글자가 하나씩 → 땅 + 동전이 튀어나옴 ------------------------------
# title_v2.png를 층으로 나눈다: 로고를 지운 바탕(인페인트), 글자 조각(A·u·r·i·c·∞·p·밑줄), 동전 조각, 고리·별 층, Tap To Start.
# 조각 자리는 AuricLoop/Source/TitleLayout.inl (C++가 튀어나오는 동전 위치에 씀)·Kit/title_layout.json (gen_hud.py 노드)로 남김
import json  # noqa: E402

import cv2  # noqa: E402

SRC_DIR = Path(__file__).resolve().parent.parent / "AuricLoop/Source"


def piece(rgb, mask, name):
    ys, xs = np.nonzero(mask)
    x0, y0, x1, y1 = xs.min(), ys.min(), xs.max() + 1, ys.max() + 1
    rgba = np.dstack([rgb[y0:y1, x0:x1], (mask[y0:y1, x0:x1] * 255)]).astype("uint8")
    Image.fromarray(rgba, "RGBA").save(KIT / f"{name}.png")
    return {"name": name, "x": float((x0 + x1) / 2), "y": float((y0 + y1) / 2), "w": int(x1 - x0), "h": int(y1 - y0)}


def title_layers():
    rgb = np.array(Image.open(KIT / "title_v2.png").convert("RGB").resize((1280, 720), Image.NEAREST))
    im = rgb.astype(int)
    r, g, b = im[..., 0], im[..., 1], im[..., 2]
    lum, sat = (r * 3 + g * 6 + b) / 10, im.max(2) - im.min(2)
    H, W = r.shape
    yy, xx = np.mgrid[0:H, 0:W]
    cream = (r > 215) & (g > 200) & (b > 165) & ((r - b) < 70)
    box = (yy >= 60) & (yy < 575) & (xx >= 320) & (xx < 960)
    k3 = np.ones((3, 3), np.uint8)
    near = cv2.dilate((cream & box).astype(np.uint8), k3, iterations=3).astype(bool)
    letterish = (cream & box) | (near & (lum > 55))
    n, lab, st, _ = cv2.connectedComponentsWithStats(letterish.astype(np.uint8), 8)
    # 글자: 큰 덩어리 (밑줄 획은 가로로 긴 것). 작은 크림색 덩어리(별·동전 반짝임)는 장식으로
    big = [i for i in range(1, n) if st[i][4] > 1500 or (st[i][2] > 120 and st[i][3] < 30 and st[i][4] > 500)]
    letters = np.isin(lab, big)
    # 붙어 있는 글자 떼기 (A와 L이 가는 이음매로 붙어 있음): 깎아서 큰 덩어리가 둘 이상이면 각 픽셀을 가까운 덩어리에 나눠 줌
    for i in list(big):
        m = (lab == i).astype(np.uint8)
        nn, el, est, _ = cv2.connectedComponentsWithStats(cv2.erode(m, k3, iterations=3), 8)
        seeds = [j for j in range(1, nn) if est[j][4] > 800]
        if len(seeds) < 2:
            continue
        owner = np.stack([cv2.distanceTransform((el != j).astype(np.uint8), cv2.DIST_L2, 3) for j in seeds]).argmin(0)
        for q in range(1, len(seeds)):
            new = int(lab.max()) + 1
            lab[(m > 0) & (owner == q)] = new
            big.append(new)
    st = {i: (lambda ys, xs: (xs.min(), ys.min(), xs.max() - xs.min() + 1, ys.max() - ys.min() + 1, len(xs)))(*np.nonzero(lab == i)) for i in big}
    gold = (r > 110) & (r >= g) & (g >= b - 10) & (sat > 45)
    deco = box & (gold | letterish) & ~cv2.dilate(letters.astype(np.uint8), k3, iterations=1).astype(bool)  # 글자 크림색도 gold 조건에 걸리므로 글자 자리는 뺌
    tap = cream & (yy > 585) & (yy < 640) & (xx > 470) & (xx < 810)
    # 바탕: 로고·Tap 자리를 둘레 색으로 메움
    shadow = box & (r > g + 6) & (r > b + 6) & (lum < 110)  # 동전 속 어두운 붉은 칠·드리운 그림자
    hole = cv2.dilate((letters | deco | tap | shadow).astype(np.uint8), k3, iterations=5)  # 동전 어두운 테두리까지
    plate = cv2.inpaint(rgb[..., ::-1].copy(), hole, 7, cv2.INPAINT_TELEA)[..., ::-1]
    Image.fromarray(plate).save(KIT / "title_plate.png")
    layout = {"letters": [], "coins": []}
    # 글자 순서: 윗줄(Auric) 왼→오, 아랫줄(Loop) 왼→오, 밑줄은 마지막
    def key(i):
        x, y, w, h, _ = st[i]
        return (2 if h < 30 else 0 if y + h / 2 < 300 or i == max(big, key=lambda j: st[j][4]) else 1, x)
    for k, i in enumerate(sorted(big, key=key)):
        layout["letters"].append(piece(rgb, lab == i, f"title_letter_{k}"))
    # 동전(과 큰 별): 가는 고리를 깎아 낸(열기) 뒤 남는 덩어리를 다시 넓혀 원래 장식에서 떼어 냄. 나머지(고리·작은 별·점)는 한 층
    core = cv2.morphologyEx(deco.astype(np.uint8), cv2.MORPH_OPEN, np.ones((7, 7), np.uint8))
    n2, lab2, st2, _ = cv2.connectedComponentsWithStats(core, 8)
    coins = [i for i in range(1, n2) if st2[i][4] > 250]
    taken = np.zeros_like(deco)
    for k, i in enumerate(sorted(coins, key=lambda i: st2[i][0])):
        m = deco & cv2.dilate((lab2 == i).astype(np.uint8), k3, iterations=4).astype(bool) & ~taken
        taken |= m
        layout["coins"].append(piece(rgb, m, f"title_coin_{k}"))
    rest = deco & ~taken
    layout["ring"] = piece(rgb, rest, "title_ring")
    layout["tap"] = piece(rgb, tap | (cv2.dilate(tap.astype(np.uint8), k3, iterations=2).astype(bool) & (lum > 40)), "title_tap")
    (KIT / "title_layout.json").write_text(json.dumps(layout, indent=1), encoding="utf-8")
    pts = lambda items: ",".join(f"{{{it['x']:.1f}f,{it['y']:.1f}f}}" for it in items)  # noqa: E731
    (SRC_DIR / "TitleLayout.inl").write_text(
        "#pragma once  // tools/make_title_fx.py가 만듦 (손으로 고치지 않음): 타이틀 글자·동전 조각 가운데 (1280x720 화면 좌표)\n"
        f"static const int kTitleLetters={len(layout['letters'])},kTitleCoins={len(layout['coins'])};\n"
        f"static const float kTitleCoinAt[][2]={{{pts(layout['coins'])}}};\n", encoding="utf-8")
    print("글자", len(layout["letters"]), "동전", len(layout["coins"]))


def mastiff():
    """회사 로고 (Kit/mastiff_logo_src.png, 공개 저장소에 올리지 않음)를 화면 크기 2배로 줄여 둠"""
    src = KIT / "mastiff_logo_src.png"
    if not src.exists():
        print("회사 로고 원본 없음:", src)
        return
    im = Image.open(src).convert("RGBA")
    im = im.crop(im.getbbox())
    im.resize((720, round(720 * im.height / im.width)), Image.LANCZOS).save(KIT / "mastiff_logo.png")


title_layers()
mastiff()


# ---- 스스로 움직이는 그림 (2026-10-10) ------------------------------------------------------------------
# 엔진은 위젯 값 하나를 바꿀 때마다 위젯 전체를 복사해 C++로 넘겨서(약 7ms) 매 프레임 여러 노드를 움직이면 타이틀이 초당 3장으로 끊김.
# 계속 움직이는 층은 모두 움직이는 WebP로 구워 브라우저가 알아서 돌리게 함 (C++ 호출 0번):
#   title_ambient.webp  1280x720 6초 반복: 횃불 빛 깜빡임, 불티, 떠오르는 금가루, 로고 둘레 별 반짝임
#   title_fog.webp      1280x240 13.3초 반복: 안개 두 겹이 서로 반대로 흐름
#   title_shine.webp    로고 글자 자리: 금빛이 훑고 3.7초 쉼
#   title_tapglow.webp  Tap To Start 뒤 금빛이 숨 쉼
#   title_burst.webp    땅 순간 동전이 가운데에서 튀어나가 제자리 → 고리·Tap이 나타나고 마지막 장을 몇 시간 유지 (한 번만 보임)
FPS = 12
BURST_BOX = (320, 60, 960, 640)  # 동전·고리·Tap 자리를 다 덮는 칸
TORCHES = [(42, 205), (1238, 205)]
STARS = [(572, 102), (388, 192), (757, 208), (903, 255), (712, 492), (452, 560), (858, 120)]


def stamp(canvas, im, cx, cy, alpha=1.0, scale=1.0):
    if alpha <= 0.02 or scale <= 0.05:
        return
    if scale != 1:
        im = im.resize((max(1, round(im.width * scale)), max(1, round(im.height * scale))), Image.NEAREST)
    if alpha < 1:
        a = np.array(im)
        a[..., 3] = (a[..., 3] * alpha).astype("uint8")
        im = Image.fromarray(a, "RGBA")
    canvas.alpha_composite(im, (round(cx - im.width / 2), round(cy - im.height / 2)))


def save_anim(name, frames, durations):
    frames[0].save(KIT / name, save_all=True, append_images=frames[1:], duration=durations, loop=0, lossless=True, quality=100, method=4)
    print(name, len(frames), "장", (KIT / name).stat().st_size // 1024, "KB")


def ambient():
    n, rng = 6 * FPS, np.random.default_rng(5)
    flick = [np.convolve(np.tile(rng.random(n), 3), np.ones(3) / 3, "same")[n:2 * n] for _ in TORCHES]  # 이어지는 깜빡임
    glow_im, star_im, dust_im, ember_im = glow(), star(), dust(), ember()
    frames = []
    for f in range(n):
        t = f / FPS
        c = Image.new("RGBA", (1280, 720))
        for (x, y), fl in zip(TORCHES, flick):
            stamp(c, glow_im, x, y, 0.55 + 0.4 * fl[f], 0.92 + 0.12 * fl[f])
        for i in range(10):  # 불티: 불꽃에서 튀어 올라 흔들리며 식음 (수명 1.5·2·3초 → 6초에 딱 맞음)
            life = (1.5, 2.0, 3.0)[i % 3]
            p = ((t + i * 0.53) % life) / life
            x0 = TORCHES[0][0] if i < 5 else TORCHES[1][0]
            stamp(c, ember_im, x0 + np.sin(t * 2 * np.pi / 3 + i * 1.7) * (6 + 14 * p) + (4 if i % 2 else -4) * p * 10, 190 - p * 150,
                  p / 0.15 if p < 0.15 else 1 - (p - 0.15) / 0.85, 1 - 0.6 * p)
        for i in range(8):  # 금가루: 바닥에서 천천히 떠올라 흐려짐 (수명 6·3초)
            life = 6.0 if i % 2 else 3.0
            p = ((t + i * 1.37) % life) / life
            stamp(c, dust_im, 120 + (i * 331) % 1040 + np.sin(t * 2 * np.pi / 6 + i) * 14, 690 - p * 420, np.sin(p * np.pi) * 0.9)
        for i, (x, y) in enumerate(STARS):  # 별: 2초마다 서로 다른 박자로 반짝
            p = (t / 2 + i * 0.37) % 1
            s = np.sin(p / 0.35 * np.pi) if p < 0.35 else 0
            stamp(c, star_im, x, y, s, 0.2 + 0.9 * s)
        frames.append(c)
    save_anim("title_ambient.webp", frames, [round(1000 / FPS)] * n)


def fog_tile(seed):
    """가로 320px마다 이어지는 안개 (4배 도트)"""
    w, h = 80, 60
    nz = noise(w, h, (2, 3), seed) * 0.6 + noise(w, h, (5, 6), seed + 1) * 0.4
    a = np.clip((nz - 0.3) * 1.6, 0, 1) * (np.linspace(0, 1, h)[:, None] ** 1.3)
    a = np.floor(a * 5) / 5 * 170
    rgba = np.dstack([np.full((h, w), 190), np.full((h, w), 206), np.full((h, w), 212), a]).astype("uint8")
    return np.array(Image.fromarray(rgba, "RGBA").resize((w * 4, h * 4), Image.NEAREST))


def fog_anim():
    a, b = np.tile(fog_tile(3), (1, 5, 1)), np.tile(fog_tile(11), (1, 5, 1))  # 1600 폭 (밀어도 빈 곳 없게)
    n = 160  # 13.3초에 한 칸(320px)씩: 앞 겹은 오른쪽으로 24px/s, 뒤 겹은 왼쪽으로
    frames = []
    for f in range(n):
        s = round(320 * f / n)
        c = Image.new("RGBA", (1280, 240))
        back = Image.fromarray(np.ascontiguousarray(a[:, 320 - s:1600 - s]), "RGBA")
        front = Image.fromarray(np.ascontiguousarray(b[:, s:1280 + s]), "RGBA")
        stamp(c, back, 640, 120, 0.8)
        c.alpha_composite(Image.fromarray((np.array(front) * [1, 1, 1, 0.55]).astype("uint8"), "RGBA").crop((0, 0, 1280, 190)), (0, 50))
        frames.append(c)
    save_anim("title_fog.webp", frames, [round(1000 / FPS)] * n)


def shine_anim():
    frames = logo_shine()
    empty = Image.new("RGBA", frames[0].size)
    save_anim("title_shine.webp", frames + [empty], [55] * len(frames) + [3700])


def tapglow():
    g = Image.open(KIT.parent.parent / "Sprites/FX/FX_Glow.png").convert("RGBA").resize((520, 110), Image.BILINEAR)
    n, frames = 24, []
    for f in range(n):  # 1.96초 반복
        b = 0.5 + 0.5 * np.sin(f / n * 2 * np.pi)
        c = Image.new("RGBA", (600, 130))
        stamp(c, g, 300, 65, 0.15 + 0.6 * b * b, 0.9 + 0.15 * b)
        frames.append(c)
    save_anim("title_tapglow.webp", frames, [round(1960 / n)] * n)


def burst():
    layout = json.loads((KIT / "title_layout.json").read_text(encoding="utf-8"))
    x0, y0, x1, y1 = BURST_BOX
    cx, cy = 640 - x0, 330 - y0
    coins = [(Image.open(KIT / f"{it['name']}.png").convert("RGBA"), it["x"] - x0, it["y"] - y0) for it in layout["coins"]]
    ring = (Image.open(KIT / "title_ring.png").convert("RGBA"), layout["ring"]["x"] - x0, layout["ring"]["y"] - y0)
    tap = (Image.open(KIT / "title_tap.png").convert("RGBA"), layout["tap"]["x"] - x0, layout["tap"]["y"] - y0)

    def back(p):  # 살짝 넘쳤다 돌아옴 (C++ EaseBack과 같은 곡선)
        p = min(max(p, 0), 1)
        q = p - 1
        return 1 + 2.9 * q * q * q + 1.9 * q * q

    frames, fps = [], 30
    for f in range(int(1.0 * fps) + 1):
        t = f / fps
        c = Image.new("RGBA", (x1 - x0, y1 - y0))
        stamp(c, ring[0], ring[1], ring[2], min(max((t - 0.15) / 0.45, 0), 1))
        for k, (im, x, y) in enumerate(coins):
            p = (t - 0.02 * k) / 0.5
            if p <= 0:
                continue
            e = back(p)
            stamp(c, im, cx + (x - cx) * e, cy + (y - cy) * e, min(1, p * 4), 0.3 + 0.7 * min(1, e))
        stamp(c, tap[0], tap[1], tap[2], min(max((t - 0.6) / 0.3, 0), 1))
        frames.append(c)
    save_anim("title_burst.webp", frames, [round(1000 / fps)] * (len(frames) - 1) + [16000000])  # 마지막 장을 4시간 넘게


ambient()
fog_anim()
shine_anim()
tapglow()
burst()
