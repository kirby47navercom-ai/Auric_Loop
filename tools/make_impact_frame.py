"""보스·처치 이펙트용 충격파 고리 그림.

실행: python tools/make_impact_frame.py
결과: Assets/Sprites/FX/GroundRing_0~7 (바닥에 퍼지는 납작한 충격파 고리, 흙 알갱이) · BurstRing_0~7 (공중에서 터지는 둥근 고리)
      + S_<이름>.hbsprite.json, Assets/Animations/SA_GroundRing·SA_BurstRing
  보스 내려찍기·충격파·나선 탄막·처치에 씀. 예전 Shockwave 그림은 작게 쓰는 갈래 모양이라 키우면 네모 덩어리처럼 보였음
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
print("ok")
