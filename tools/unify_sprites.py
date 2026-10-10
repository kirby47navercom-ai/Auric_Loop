"""캐릭터 프레임의 그림체를 맞춘다 (make_anims.py 다음, make_walk_attack.py 전에 실행).

실행: python tools/unify_sprites.py && python tools/make_walk_attack.py
1) 색 맞추기: 생성 그림은 프레임마다 색이 천 개 넘게 섞여 있고 시트(서기·걷기 / 공격)마다 색이 조금씩 달라
   애니메이션이 바뀔 때 색이 튄다. 캐릭터의 모든 프레임에서 공통 팔레트(PALETTE색)를 뽑아 모든 프레임을 그 색으로만 다시 칠하고,
   반투명 가장자리는 없앤다 (도트처럼 또렷하게).
2) 구르기: 따로 생성한 구르기 시트는 그림체가 전혀 달라서, 서 있는 그림을 웅크렸다가 90도씩 정확히 돌려 만든다.
   Roll_0 웅크림, Roll_1 90도, Roll_2 180도, Roll_4 270도, Roll_3 일어나기 (C++ Animate가 1→2→4를 돌림)
3) 숨쉬기: Idle_1 = 서 있는 그림에서 허리 위를 1픽셀 내림 (가만히 있어도 살짝 움직임)
"""
import json
from pathlib import Path

from PIL import Image

ASSETS = Path(__file__).resolve().parent.parent / "AuricLoop/Assets"
CHARACTERS = ["Valen", "Sherry", "Alea"]
DIRS = ["S", "SE", "E", "NE", "N"]
PALETTE = 48


def frames(folder, name):
    out = {}
    for d in DIRS:
        for kind, count in (("Idle", 1), ("Walk", 4), ("Attack", 3)):
            for i in range(count):
                key = f"{d}_{kind}_{i}"
                out[key] = Image.open(folder / f"{name}_{key}.png").convert("RGBA")
    return out


def palette_of(images):
    """모든 프레임의 불투명 픽셀을 한 줄로 모아 PALETTE색으로 줄인 팔레트 이미지."""
    pixels = [p[:3] for im in images for p in im.getdata() if p[3] >= 128]
    strip = Image.new("RGB", (len(pixels), 1))
    strip.putdata(pixels)
    return strip.quantize(colors=PALETTE, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)


def repaint(im, pal):
    rgb = im.convert("RGB").quantize(palette=pal, dither=Image.Dither.NONE).convert("RGB")
    out = Image.new("RGBA", im.size)
    alpha = im.getchannel("A").point(lambda a: 255 if a >= 128 else 0)
    out.paste(rgb, (0, 0), alpha)
    return out


def bottom_center(canvas_size, im, lift=0):
    canvas = Image.new("RGBA", canvas_size)
    box = im.getbbox()
    if not box:
        return canvas
    im = im.crop(box)
    canvas.paste(im, ((canvas_size[0] - im.width) // 2, canvas_size[1] - im.height - lift), im)
    return canvas


def crouch(idle):
    body = idle.crop(idle.getbbox())
    squat = body.resize((body.width, max(1, round(body.height * 0.78))), Image.NEAREST)
    return bottom_center(idle.size, squat)


def rolled(idle, degrees):
    body = idle.crop(idle.getbbox())
    body = body.resize((round(body.width * 0.82), round(body.height * 0.82)), Image.NEAREST)  # 몸을 말아 조금 작게
    return bottom_center(idle.size, body.rotate(-degrees, expand=True), lift=2)


def breathe(idle):
    box = idle.getbbox()
    out = idle.copy()
    cut = box[3] - round((box[3] - box[1]) * 0.42)  # 허리 높이 (발끝에서 42%)
    top = idle.crop((0, 0, idle.width, cut))
    out.paste((0, 0, 0, 0), (0, 0, idle.width, cut + 1))
    out.paste(top, (0, 1), top)
    return out


def write_asset(folder, name, key, like):
    asset = json.loads((folder / f"S_{name}_{like}.hbsprite.json").read_text(encoding="utf-8"))
    tex = folder.relative_to(ASSETS.parent).as_posix()
    asset.update(name=f"S_{name}_{key}", texture=f"{tex}/{name}_{key}.png")
    (folder / f"S_{name}_{key}.hbsprite.json").write_text(json.dumps(asset, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


for name in CHARACTERS:
    folder = ASSETS / f"Sprites/{name}"
    all_frames = frames(folder, name)
    pal = palette_of(all_frames.values())
    for key, im in all_frames.items():
        all_frames[key] = repaint(im, pal)
        all_frames[key].save(folder / f"{name}_{key}.png")
    for d in DIRS:
        idle = all_frames[f"{d}_Idle_0"]
        breathe(idle).save(folder / f"{name}_{d}_Idle_1.png")
        write_asset(folder, name, f"{d}_Idle_1", f"{d}_Idle_0")
    for d in ("S", "E", "N"):  # 구르기 그림은 아래·옆·위 셋 (대각선은 C++가 가까운 쪽)
        idle = all_frames[f"{d}_Idle_0"]
        spin = -1 if d == "N" else 1
        roll = {0: crouch(idle), 1: rolled(idle, 90 * spin), 2: rolled(idle, 180), 4: rolled(idle, 270 * spin), 3: crouch(idle)}
        for i, im in roll.items():
            im.save(folder / f"{name}_{d}_Roll_{i}.png")
            write_asset(folder, name, f"{d}_Roll_{i}", f"{d}_Roll_0" if (folder / f"S_{name}_{d}_Roll_0.hbsprite.json").exists() else f"{d}_Idle_0")
    print(name, "프레임", len(all_frames), "개를", PALETTE, "색으로, 숨쉬기·구르기 다시 만듦")

# 적도 같은 방법으로 색만 맞춘다 (걷기·공격·맞음·쓰러짐 모든 프레임에 공통 팔레트)
for name in ["Skeleton", "SkeletonMage", "SkeletonCaptain"]:
    folder = ASSETS / f"Sprites/Enemies/{name}"
    files = sorted(p for p in folder.glob(f"{name}_*.png") if "WalkAttack" not in p.name)
    images = {p: Image.open(p).convert("RGBA") for p in files}
    pal = palette_of(images.values())
    for p, im in images.items():
        repaint(im, pal).save(p)
    print(name, "프레임", len(images), "개를", PALETTE, "색으로")

# 적 걷기 들썩임: 생성된 걷기 4장이 거의 같아 미끄러져 보인다. 1·3번째 장을 발끝 기준 BOB픽셀 띄움 (0·2번째는 바닥에 붙임).
# 위치를 절대값으로 정하므로 여러 번 돌려도 쌓이지 않는다
for name, bob in [("Skeleton", 1), ("SkeletonMage", 1)]:  # 해골 대장 걷기는 tools/make_boss_walk.py (다리를 흔드는 6장)
    folder = ASSETS / f"Sprites/Enemies/{name}"
    for i in range(4):
        path = folder / f"{name}_Walk_{i}.png"
        im = Image.open(path).convert("RGBA")
        body = im.crop(im.getbbox())
        out = Image.new("RGBA", im.size)
        x = im.getbbox()[0]
        out.paste(body, (x, im.height - body.height - (bob if i % 2 else 0)), body)
        out.save(path)
    print(name, "걷기 들썩임", bob, "px")
