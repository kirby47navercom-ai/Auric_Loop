"""보스·처치 이펙트용 충격파 고리 그림.

실행: python tools/make_impact_frame.py
결과: Assets/Sprites/FX/GroundRing_0~7 (바닥에 퍼지는 납작한 충격파 고리, 흙 알갱이) · BurstRing_0~7 (공중에서 터지는 둥근 고리)
      + S_<이름>.hbsprite.json, Assets/Animations/SA_GroundRing·SA_BurstRing
  보스 내려찍기·충격파·나선 탄막·처치에 씀. 예전 Shockwave 그림은 작게 쓰는 갈래 모양이라 키우면 네모 덩어리처럼 보였음
  SpinSlash_0~7: 보스 회전 베기 때 맞는 범위(반지름 3m 원) 둘레를 대검 궤적 두 줄기가 바닥에서 빙빙 도는 그림 (반복) + SA_SpinSlash
  (임팩트 프레임은 그림이 아니라 후처리 색 보정으로 장면 전체를 흑백으로 바꿈: Combat.cpp ImpactFrame)
"""
import json
import math
import random
from pathlib import Path

from PIL import Image

FX = Path(__file__).resolve().parent.parent / "AuricLoop/Assets/Sprites/FX"


FX.mkdir(parents=True, exist_ok=True)


def ring(w, h, k, frames, dots, seed):
    """k번째 프레임: 반지름이 빠르게 커지다 느려지고(ease-out), 고리는 얇아지며 바깥쪽부터 흐려짐. 도트 그림이라 작게 그리고 nearest로 키움"""
    rng = random.Random(seed + k)
    t = (k + 1) / frames
    grow = 1 - (1 - t) ** 3
    im = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    px = im.load()
    rx, ry = (w / 2 - 1) * (0.2 + 0.8 * grow), (h / 2 - 1) * (0.2 + 0.8 * grow)
    thick = max(0.06, 0.34 * (1 - t))
    fade = 1 - t ** 1.6
    for y in range(h):
        for x in range(w):
            d = math.hypot((x + 0.5 - w / 2) / rx, (y + 0.5 - h / 2) / ry)
            if 1 - thick <= d <= 1:
                u = (d - (1 - thick)) / thick  # 0 안쪽 → 1 바깥
                col = (255, 244, 200) if u > 0.66 else (255, 178, 70) if u > 0.33 else (214, 78, 34)
                px[x, y] = (*col, int(255 * fade * (0.55 + 0.45 * u)))
    if dots:  # 바닥 고리: 튀는 흙·돌 알갱이
        for _ in range(int(18 * (1 - t)) + 4):
            a = rng.uniform(0, 2 * math.pi); r = rng.uniform(0.7, 1.15)
            x, y = int(w / 2 + math.cos(a) * rx * r), int(h / 2 + math.sin(a) * ry * r - (1 - t) * rng.uniform(0, 4))
            if 0 <= x < w - 1 and 0 <= y < h - 1:
                for dx in range(2):
                    px[x + dx, y] = (120, 96, 74, int(255 * fade))
    return im


def anim(name, count, step):
    frames = [{"sprite": f"Assets/Sprites/FX/S_{name}_{i}.hbsprite.json", "duration": step} for i in range(count)]
    path = FX.parent.parent / f"Animations/SA_{name}.hbspriteanimation.json"
    path.write_text(json.dumps({"version": 1, "name": f"SA_{name}", "frames": frames, "loop": False, "playRate": 1}, indent=2), encoding="utf-8")


for name, (w, h, dots) in {"GroundRing": (64, 28, True), "BurstRing": (48, 48, False)}.items():
    for k in range(8):
        ring(w, h, k, 8, dots, 11).save(FX / f"{name}_{k}.png")
        (FX / f"S_{name}_{k}.hbsprite.json").write_text(json.dumps({"version": 1, "name": f"S_{name}_{k}", "texture": f"Assets/Sprites/FX/{name}_{k}.png",
            "pixelsPerUnit": 16, "rect": [0, 0, w, h], "pivot": [0.5, 0.5], "filter": "nearest", "border": [0, 0, 0, 0]}, indent=2), encoding="utf-8")
    anim(name, 8, 0.04)


def spin_slash(k, frames=8, size=96):
    """보스 회전 베기: 맞는 범위 원(지름 6m = 96px, PPU 16) 둘레를 대검 궤적 두 줄기가 돎. 앞(머리) 쪽은 굵고 하얗게, 꼬리는 가늘고 붉게 사라짐.
    범위가 보이도록 원 테두리에 옅은 선. 프레임마다 45도씩 (8장이면 한 바퀴)"""
    im = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    px = im.load()
    c, r = size / 2, size / 2 - 2
    for y in range(size):  # 범위 테두리: 옅은 주황 원
        for x in range(size):
            d = math.hypot(x + 0.5 - c, y + 0.5 - c)
            if r - 1.2 <= d <= r:
                px[x, y] = (255, 150, 70, 70)
    for blade in range(2):  # 칼이 쓸고 지나간 부채꼴: 머리 쪽일수록 진한 반투명 주황 (원 안쪽 35%~테두리)
        head = math.radians(k * (360 / frames) + blade * 180)
        for y in range(size):
            for x in range(size):
                dx, dy = x + 0.5 - c, y + 0.5 - c
                d = math.hypot(dx, dy)
                if not (r * 0.35 <= d <= r):
                    continue
                behind = (head - math.atan2(dy, dx)) % (2 * math.pi)
                if behind <= math.radians(150):
                    t = 1 - behind / math.radians(150)
                    al = int(120 * t ** 1.4 * (0.4 + 0.6 * (d / r)))
                    if px[x, y][3] < al:
                        px[x, y] = (255, 190, 110, al)
    for blade in range(2):
        head = math.radians(k * (360 / frames) + blade * 180)
        for step in range(220):
            t = step / 220  # 0 꼬리 → 1 머리
            a = head - math.radians((1 - t) * 160)
            thick = 1 + 11 * t ** 1.5
            col = (255, 252, 236) if t > 0.8 else (255, 220, 140) if t > 0.55 else (255, 150, 70) if t > 0.3 else (210, 70, 40)
            al = int(255 * (0.25 + 0.75 * t))
            for j in range(int(thick * 2) + 1):
                rr = r - j * 0.5  # 바깥 테두리에서 안쪽으로 두께만큼
                x, y = int(c + math.cos(a) * rr), int(c + math.sin(a) * rr)
                if 0 <= x < size and 0 <= y < size and px[x, y][3] < al:
                    px[x, y] = (*col, al)
    return im


for k in range(8):
    spin_slash(k).save(FX / f"SpinSlash_{k}.png")
    (FX / f"S_SpinSlash_{k}.hbsprite.json").write_text(json.dumps({"version": 1, "name": f"S_SpinSlash_{k}", "texture": f"Assets/Sprites/FX/SpinSlash_{k}.png",
        "pixelsPerUnit": 16, "rect": [0, 0, 96, 96], "pivot": [0.5, 0.5], "filter": "nearest", "border": [0, 0, 0, 0]}, indent=2), encoding="utf-8")
anim("SpinSlash", 8, 0.03)
p = FX.parent.parent / "Animations/SA_SpinSlash.hbspriteanimation.json"
d = json.loads(p.read_text(encoding="utf-8")); d["loop"] = True; p.write_text(json.dumps(d, indent=2), encoding="utf-8")
print("ok")
