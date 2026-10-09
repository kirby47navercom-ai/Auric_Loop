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


def fog(seed):
    """바닥 안개 1280x240 (4배 도트). 아래로 갈수록 짙고 가로로 끝없이 이어짐"""
    w, h = 320, 60
    n = noise(w, h, (8, 3), seed) * 0.6 + noise(w, h, (20, 6), seed + 1) * 0.4
    fade = np.linspace(0, 1, h)[:, None] ** 1.3
    a = np.clip((n - 0.3) * 1.6, 0, 1) * fade
    a = np.floor(a * 5) / 5 * 170
    rgba = np.dstack([np.full((h, w), 190), np.full((h, w), 206), np.full((h, w), 212), a]).astype("uint8")
    return Image.fromarray(rgba, "RGBA").resize((w * 4, h * 4), Image.NEAREST)


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


for i, im in enumerate(logo_shine()):
    im.save(KIT / f"title_shine_{i}.png")
for name, im in (("fx_fog_a", fog(3)), ("fx_fog_b", fog(11)), ("fx_rays", rays()), ("fx_ember", ember())):
    im.save(KIT / f"{name}.png")
    print(name, im.size)


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
