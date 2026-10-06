"""Codex(image_gen)로 그린 애니메이션 시트를 잘라 같은 크기·같은 발 위치의 프레임과 엔진 에셋으로 만든다.

실행: python tools/make_anims.py <생성 그림 폴더>
입력 (마젠타 배경 시트):
  <캐릭터>_<방향>.png   valen/sherry/alea × s/se/e/ne/n. 1행: 서 있기 + 걷기 4, 2행: 공격 3 (이펙트 없음)
  <적>_anim.png          skeletonmage 등. 1행: 걷기 4, 2행: 공격 3 + 맞음 1, 3행: 쓰러짐 4 (맞음은 하얀 번쩍 프레임을 하나 더 만든다)
  fx_slash.png, fx_hit.png, fx_torch.png   한 줄 4칸
결과:
  Assets/Sprites/<캐릭터>/S_<캐릭터>_<방향>_<Idle|Walk|Attack>_<n>.hbsprite.json  (서·남서·북서는 동·남동·북동을 뒤집어 씀)
  Assets/Sprites/Enemies/<적>/S_<적>_<Walk|Attack|Hurt|Death>_<n>.hbsprite.json + Assets/Animations/SA_<적>_<동작>.hbspriteanimation.json
  Assets/Sprites/FX/S_Slash_<n>, S_Hit_<n>, Assets/Sprites/Props/S_Torch_<n> + SA_Torch

크기 맞추기: 시트마다 첫 프레임(서 있기·걷기 0)의 키를 BODY에 맞추는 배율 하나를 시트 전체에 쓴다 (프레임마다 따로 줄이면 칼을 든 프레임만 작아짐).
위치 맞추기: 프레임마다 발(맨 아래 몇 줄)의 가운데를 캔버스 가운데에, 발끝을 캔버스 바닥에 둔다. 한 캐릭터의 모든 프레임은 같은 캔버스.
"""
import json
import shutil
import sys
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
from pixelize import snap  # noqa: E402

ASSETS = Path(__file__).resolve().parent.parent / "AuricLoop/Assets"
PPU = 32
FEET = 0.95  # 캐릭터 오브젝트 중심에서 발끝까지 (m), tools/make_sprites.py와 같음
src = Path(sys.argv[1])

CHARACTERS = {"Valen": 62, "Sherry": 66, "Alea": 72}  # 서 있는 키 (px)
ENEMIES = {"Skeleton": 44, "SkeletonMage": 51, "SkeletonCaptain": 111}
DIRS = ["S", "SE", "E", "NE", "N"]


def load(name):
    im = snap(Image.open(src / name).convert("RGB")).convert("RGBA")
    im.putdata([(0, 0, 0, 0) if (p[0] > 190 and p[2] > 190 and p[1] < 90) else p for p in im.get_flattened_data()])
    # 테두리에 남은 분홍 번짐(배경과 섞인 칸)도 지운다
    px = im.load()
    fringe = [(x, y) for y in range(im.height) for x in range(im.width)
              if px[x, y][3] and px[x, y][0] > 150 and px[x, y][2] > 120 and px[x, y][0] - px[x, y][1] > 80 and px[x, y][2] - px[x, y][1] > 60
              and any(0 <= x + dx < im.width and 0 <= y + dy < im.height and not px[x + dx, y + dy][3] for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)))]
    for x, y in fringe:
        px[x, y] = (0, 0, 0, 0)
    return im


def spans(filled, count):
    """채워진 구간들. 많으면 가장 좁은 틈부터 합치고, 적으면(붙은 프레임) 가장 넓은 구간을 반으로 나눈다."""
    out, start = [], None
    for i, f in enumerate(list(filled) + [False]):
        if f and start is None:
            start = i
        elif not f and start is not None:
            out.append((start, i))
            start = None
    while len(out) > count:
        i = min(range(len(out) - 1), key=lambda i: out[i + 1][0] - out[i][1])
        out[i:i + 2] = [(out[i][0], out[i + 1][1])]
    while len(out) < count:
        i = max(range(len(out)), key=lambda i: out[i][1] - out[i][0])
        a, b = out[i]
        out[i:i + 1] = [(a, (a + b) // 2), ((a + b) // 2, b)]
    return out


def grid(im, counts):
    """counts: 행마다 프레임 수. 투명 줄·열을 경계로 자른 프레임들 (행 순서대로)."""
    alpha = im.getchannel("A")
    rows = spans([alpha.crop((0, y, im.width, y + 1)).getbbox() is not None for y in range(im.height)], len(counts))
    frames = []
    for (y0, y1), n in zip(rows, counts):
        row = im.crop((0, y0, im.width, y1))
        a = row.getchannel("A")
        for x0, x1 in spans([a.crop((x, 0, x + 1, row.height)).getbbox() is not None for x in range(row.width)], n):
            f = row.crop((x0, 0, x1, row.height))
            frames.append(f.crop(f.getbbox()))
    return frames


def feet_x(f):
    """맨 아래 4줄에 있는 픽셀의 가운데 x (칼끝·망토가 아니라 발을 기준으로 맞춘다)."""
    a = f.getchannel("A").crop((0, max(0, f.height - 4), f.width, f.height))
    box = a.getbbox()
    return (box[0] + box[2]) / 2 if box else f.width / 2


def scaled(frames, body):
    k = body / frames[0].height
    return [f.resize((max(1, round(f.width * k)), max(1, round(f.height * k))), Image.NEAREST) for f in frames]


def save(folder, prefix, named, pivot_y_px=None):
    """named: [(이름, 프레임)]. 같은 캔버스에 발 가운데·바닥 맞춤. pivot_y_px: 캔버스 바닥에서 피벗까지 (없으면 가운데)."""
    half = max(max(feet_x(f), f.width - feet_x(f)) for _, f in named)
    w, h = int(half * 2 + 1), max(f.height for _, f in named)
    folder.mkdir(parents=True, exist_ok=True)
    tex = folder.relative_to(ASSETS.parent).as_posix()
    paths = {}
    for name, f in named:
        canvas = Image.new("RGBA", (w, h))
        canvas.paste(f, (round(w / 2 - feet_x(f)), h - f.height))
        canvas.save(folder / f"{prefix}_{name}.png")
        asset = {"version": 1, "name": f"S_{prefix}_{name}", "texture": f"{tex}/{prefix}_{name}.png", "pixelsPerUnit": PPU, "rect": [0, 0, w, h],
                 "pivot": [0.5, round(pivot_y_px / h, 4) if pivot_y_px is not None else 0.5], "filter": "nearest", "border": [0, 0, 0, 0]}
        (folder / f"S_{prefix}_{name}.hbsprite.json").write_text(json.dumps(asset, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        paths[name] = f"{tex}/S_{prefix}_{name}.hbsprite.json"
    print(prefix, len(named), "프레임", (w, h))
    return paths


def animation(name, sprites, step, loop):
    path = ASSETS / f"Animations/{name}.hbspriteanimation.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    data = {"version": 1, "name": name, "frames": [{"sprite": s, "duration": step} for s in sprites], "loop": loop, "playRate": 1}
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


# 캐릭터: 방향 5개 × (서 있기 1, 걷기 4, 공격 3)
for name, body in CHARACTERS.items():
    named = []
    for d in DIRS:
        frames = scaled(grid(load(f"{name.lower()}_{d.lower()}.png"), [5, 3]), body)
        named += [(f"{d}_Idle_0", frames[0])] + [(f"{d}_Walk_{i}", frames[1 + i]) for i in range(4)] + [(f"{d}_Attack_{i}", frames[5 + i]) for i in range(3)]
    folder = ASSETS / f"Sprites/{name}"
    shutil.rmtree(folder, ignore_errors=True)  # 예전 한 방향 프레임
    save(folder, name, named, FEET * PPU)

# 적: 오른쪽을 보는 옆모습 (C++가 플레이어 쪽으로 뒤집음). 상태 머신 상태마다 클립을 건다
for name, body in ENEMIES.items():
    frames = scaled(grid(load(f"{name.lower()}_anim.png"), [4, 4, 4]), body)
    named = [(f"Walk_{i}", frames[i]) for i in range(4)] + [(f"Attack_{i}", frames[4 + i]) for i in range(3)] + [("Hurt_0", frames[7])] \
        + [(f"Death_{i}", frames[8 + i]) for i in range(4)]
    folder = ASSETS / f"Sprites/Enemies/{name}"
    shutil.rmtree(folder, ignore_errors=True)
    p = save(folder, name, named, body / 2)  # 예전처럼 몸 가운데가 오브젝트 중심
    animation(f"SA_{name}_Walk", [p[f"Walk_{i}"] for i in range(4)], 0.14, True)
    animation(f"SA_{name}_Attack", [p[f"Attack_{i}"] for i in range(3)], 0.13, False)
    animation(f"SA_{name}_Hurt", [p["Hurt_0"]], 0.2, False)  # 하얀 번쩍임은 C++ Sprites::Flash
    animation(f"SA_{name}_Death", [p[f"Death_{i}"] for i in range(4)], 0.12, False)  # 마지막 장은 C++가 풀로 돌려놓을 때까지 남음


def strip(file, count, height):
    """한 줄 4칸 이펙트: 칸을 똑같이 나누고 모든 칸을 같은 상자로 잘라 위치가 흔들리지 않게 한다."""
    im = load(file)
    cw = im.width / count
    cells = [im.crop((round(i * cw), 0, round((i + 1) * cw), im.height)) for i in range(count)]
    boxes = [c.getbbox() for c in cells if c.getbbox()]
    box = (min(b[0] for b in boxes), min(b[1] for b in boxes), max(b[2] for b in boxes), max(b[3] for b in boxes))
    cells = [c.crop(box) for c in cells]
    k = height / cells[0].height
    return [c.resize((max(1, round(c.width * k)), height), Image.NEAREST) for c in cells]


def save_strip(folder, prefix, frames, pivot=(0.5, 0.5)):
    tex = folder.relative_to(ASSETS.parent).as_posix()
    out = []
    for i, f in enumerate(frames):
        f.save(folder / f"{prefix}_{i}.png")
        asset = {"version": 1, "name": f"S_{prefix}_{i}", "texture": f"{tex}/{prefix}_{i}.png", "pixelsPerUnit": PPU, "rect": [0, 0, f.width, f.height],
                 "pivot": list(pivot), "filter": "nearest", "border": [0, 0, 0, 0]}
        (folder / f"S_{prefix}_{i}.hbsprite.json").write_text(json.dumps(asset, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        out.append(f"{tex}/S_{prefix}_{i}.hbsprite.json")
    print(prefix, len(frames), "프레임", frames[0].size)
    return out


animation("SA_Slash", save_strip(ASSETS / "Sprites/FX", "Slash", strip("fx_slash.png", 4, 72)), 0.045, False)
animation("SA_Hit", save_strip(ASSETS / "Sprites/FX", "Hit", strip("fx_hit.png", 4, 40)), 0.04, False)
animation("SA_Torch", save_strip(ASSETS / "Sprites/Props", "Torch", strip("fx_torch.png", 4, 40)), 0.12, True)

# 횃불·가로등 둘레를 밝히는 주황 빛 (가산 혼합으로 바닥에 더함, 불꽃 자체의 번짐은 블룸)
g = Image.new("RGBA", (64, 64))
g.putdata([(255, 150, 60, int(70 * max(0.0, 1 - (((x - 31.5) ** 2 + (y - 31.5) ** 2) ** 0.5) / 32) ** 2)) for y in range(64) for x in range(64)])
g.save(ASSETS / "Sprites/FX/FX_Glow.png")

# 적 등장 예고 마법진 (엔터 더 건전·소울 나이트의 "나온다" 표시): 붉은 원이 그려지며 룬이 돌고 마지막에 번쩍
def magic_circle(k, n=6, size=48):
    im = Image.new("RGBA", (size, size))
    px = im.load()
    c = (size - 1) / 2
    import math
    grow = min(1.0, (k + 1) / (n - 2))
    for y in range(size):
        for x in range(size):
            d = math.hypot((x - c), (y - c) * 2)  # 바닥에 누운 원 (세로 절반)
            a = (math.degrees(math.atan2((y - c) * 2, x - c)) + 360 + k * 25) % 360
            if abs(d - 21) < 1.2 and a < 360 * grow:
                px[x, y] = (255, 70, 50, 255)
            elif abs(d - 15) < 1 and (a // 30) % 2 == 0 and k >= 1:
                px[x, y] = (255, 190, 80, 255)
            elif d < 21 and k == n - 1:
                px[x, y] = (255, 230, 160, 200)
            elif d < 21:
                px[x, y] = (200, 40, 30, int(40 + 20 * grow))
    return im


spawn = [magic_circle(k) for k in range(6)]
animation("SA_Spawn", save_strip(ASSETS / "Sprites/FX", "Spawn", spawn), 0.15, False)
