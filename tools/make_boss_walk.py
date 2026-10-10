"""해골 대장 걷기: 생성된 걷기 4장이 다리가 거의 그대로라 제자리걸음처럼 보였음 → 걷기 0번 그림에서 다리를 떼어
엉덩이를 축으로 앞뒤로 흔들고(앞으로 나가는 다리는 들어 올림) 몸은 다리가 모일 때 살짝 올라가는 6장 걷기를 만든다.
그림자(반투명 alpha 120)는 그대로 바닥에 둠.
실행: python tools/make_boss_walk.py  (make_enemy_poses·make_shadows·unify_sprites 뒤에. 원본은 git의 걷기 0번이 아니라 Walk_base.png)
결과: SkeletonCaptain_Walk_0~5.png + S_*.hbsprite.json, SA_SkeletonCaptain_Walk (0.1초씩)
"""
import json
import math
from pathlib import Path

from PIL import Image

A = Path(__file__).resolve().parent.parent / "AuricLoop/Assets"
FOLDER = A / "Sprites/Enemies/SkeletonCaptain"
FRAMES, STRIDE, LIFT, STEP = 6, 6, 4, 0.1  # 장 수, 발 앞뒤 폭(px), 드는 높이(px), 한 장 시간(s)
# 다리 영역 (175x132 그림 기준, 오른쪽을 봄): 뒷다리·앞다리. 앞다리 윗부분은 대검이 가려 칼날 아래부터
LEGS = {"back": (44, 79, 100, 124), "front": (96, 131, 106, 124)}  # x0, x1, 엉덩이 y, 발끝 y

base_path = FOLDER / "SkeletonCaptain_Walk_base.png"
if not base_path.exists():
    Image.open(FOLDER / "SkeletonCaptain_Walk_0.png").save(base_path)  # 처음 한 번: 지금 걷기 0번을 원본으로 보관
base = Image.open(base_path).convert("RGBA")
W, H = base.size
src = base.load()


def leg(name, x, y):
    x0, x1, top, _ = LEGS[name]
    return x0 <= x < x1 and y >= top and src[x, y][3] == 255  # 그림자(반투명)는 다리가 아님


frames = []
for i in range(FRAMES):
    ph = 2 * math.pi * i / FRAMES
    swing = {"front": STRIDE * math.sin(ph), "back": -STRIDE * math.sin(ph)}
    lift = {"front": LIFT * max(0.0, math.cos(ph)), "back": LIFT * max(0.0, -math.cos(ph))}  # 앞으로 나가는 쪽 다리를 듦
    bob = -1 if abs(math.sin(ph)) < 0.5 else 0  # 두 다리가 모일 때 몸이 1px 올라감
    out = Image.new("RGBA", (W, H))
    o = out.load()
    shadow = [(x, y) for y in range(H) for x in range(W) if 0 < src[x, y][3] < 255]
    for x, y in shadow:
        o[x, y] = src[x, y]

    def put(x, y, p):
        if 0 <= x < W and 0 <= y < H:
            o[x, y] = p

    def draw_leg(name):
        x0, x1, top, foot = LEGS[name]
        for y in range(top, H):
            for x in range(x0, x1):
                if leg(name, x, y):
                    t = (y - top) / (foot - top)
                    put(x + round(swing[name] * t), y + bob - round(lift[name] * t), src[x, y])

    draw_leg("back")
    for y in range(H):
        for x in range(W):
            p = src[x, y]
            if p[3] == 255 and not leg("back", x, y) and not leg("front", x, y):
                put(x, y + bob, p)
    draw_leg("front")
    frames.append(out)

ref = json.loads((FOLDER / "S_SkeletonCaptain_Walk_0.hbsprite.json").read_text(encoding="utf-8"))
anim = []
for i, im in enumerate(frames):
    im.save(FOLDER / f"SkeletonCaptain_Walk_{i}.png")
    s = dict(ref, name=f"S_SkeletonCaptain_Walk_{i}", texture=f"Assets/Sprites/Enemies/SkeletonCaptain/SkeletonCaptain_Walk_{i}.png")
    (FOLDER / f"S_SkeletonCaptain_Walk_{i}.hbsprite.json").write_text(json.dumps(s, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    anim.append({"sprite": f"Assets/Sprites/Enemies/SkeletonCaptain/S_SkeletonCaptain_Walk_{i}.hbsprite.json", "duration": STEP})
clip = A / "Animations/SA_SkeletonCaptain_Walk.hbspriteanimation.json"
data = json.loads(clip.read_text(encoding="utf-8"))
data["frames"] = anim
clip.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print("해골 대장 걷기", FRAMES, "장")
