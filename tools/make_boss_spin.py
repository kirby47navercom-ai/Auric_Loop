"""해골 대장 회전 베기 8방향 그림 (Codex 이미지 생성 → 도트 격자 복원) → Spin_0~7 스프라이트 + SA_SkeletonCaptain_Spin.

실행: python tools/make_boss_spin.py [생성 그림 폴더=native/boss_spin]
입력 (마젠타 배경): spin_0.png ~ spin_7.png. 대검을 수평으로 뻗고 화면 시계 방향으로 45도씩 돎
  0 오른쪽 · 1 오른쪽 앞 · 2 정면 · 3 왼쪽 앞 · 4 왼쪽 · 5 왼쪽 뒤 · 6 뒤 · 7 오른쪽 뒤
크기: 0번(옆모습)의 머리(해골) 크기를 지금 회전 그림(Spin_0)과 같게, 나머지는 0번과 몸 키가 같게, 발끝은 같은 줄. 그림자·여백은 tools/make_shadows.py와 같은 방식으로 넣고 기록
결과: Assets/Sprites/Enemies/SkeletonCaptain/SkeletonCaptain_Spin_<n>.png + S_*.hbsprite.json (PPU 25.6, tools/fix_boss_scale.py 배율과 같음)
  Assets/Animations/SA_SkeletonCaptain_Spin (0.06초씩 반복 = 초당 750도, Enemy.cpp 회전 베기 각도와 맞춤)
"""
import json
import sys
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
from defringe import clean  # noqa: E402
from make_shadows import MANIFEST, PAD, digest, shadowed  # noqa: E402
from pixelize import snap  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / "AuricLoop/Assets"
FOLDER = ASSETS / "Sprites/Enemies/SkeletonCaptain"
SRC = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "native/boss_spin"
PPU, STEP = 25.6, 0.06


def skull(im):
    """해골 머리: 가장 큰 밝은 덩어리의 (가로+세로)/2"""
    px = im.load()
    w, h = im.size
    white = {(x, y) for y in range(h) for x in range(w) if px[x, y][3] > 128 and min(px[x, y][:3]) > 150}
    best, seen = [], set()
    for start in white:
        if start in seen:
            continue
        stack, blob = [start], []
        seen.add(start)
        while stack:
            x, y = stack.pop()
            blob.append((x, y))
            for n in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                if n in white and n not in seen:
                    seen.add(n)
                    stack.append(n)
        if len(blob) > len(best):
            best = blob
    xs, ys = [x for x, _ in best], [y for _, y in best]
    return ((max(xs) - min(xs) + 1) + (max(ys) - min(ys) + 1)) / 2


def generated(file):
    im = Image.open(file).convert("RGB")
    if im.width > 600:  # 생성 원본(1536px)이면 도트 격자로 되돌리고 그 결과로 바꿔 저장 (저장소에는 작은 그림만)
        im = snap(im)
        im.save(file)
    im = im.convert("RGBA")
    im.putdata([(0, 0, 0, 0) if (p[0] > 180 and p[2] > 180 and p[1] < 110) else p for p in im.get_flattened_data()])
    im, _ = clean(im, purple=False)
    return im.crop(im.getbbox())


ref = json.loads((FOLDER / "S_SkeletonCaptain_Spin_0.hbsprite.json").read_text(encoding="utf-8"))
ref_im = Image.open(ASSETS.parent / ref["texture"]).convert("RGBA")
ref_head = skull(ref_im.crop((0, PAD, ref_im.width, ref_im.height - PAD)))
origin = ref["pivot"][1] * ref["rect"][3]  # 그림 맨 아래에서 원점까지 px (모든 장 같게)
done = json.loads(MANIFEST.read_text(encoding="utf-8"))
frames = []
gs = [generated(SRC / f"spin_{n}.png") for n in range(8)]


def body(im):
    """가운데 1/3 세로줄(몸통)의 위끝~발끝 키. 대검은 옆으로 뻗어 빠짐"""
    a = im.getchannel("A")
    rows = [y for y in range(im.height) if any(a.getpixel((x, y)) > 128 for x in range(im.width // 3, im.width * 2 // 3))]
    return rows[-1] - rows[0] + 1


# 장마다 도트 격자 크기가 달라(snap) 몸 키로 맞춤: 0번(옆모습)은 머리 크기를 지금 Spin_0과 같게, 나머지는 0번과 몸 키가 같게
# (뒷모습은 해골이 안 보여 머리로 재면 틀림)
k0 = ref_head / skull(gs[0])
tall = body(gs[0]) * k0
for n, g in enumerate(gs):
    k = tall / body(g)
    g = g.resize((max(1, round(g.width * k)), max(1, round(g.height * k))), Image.NEAREST)
    canvas = Image.new("RGBA", (max(ref_im.width, g.width + 4), max(ref_im.height - 2 * PAD, g.height)))
    canvas.alpha_composite(g, ((canvas.width - g.width) // 2, canvas.height - g.height))  # 발끝을 맨 아래 줄에
    out = shadowed(canvas, 0.62)
    png = FOLDER / f"SkeletonCaptain_Spin_{n}.png"
    out.save(png)
    done[png.relative_to(ASSETS).as_posix()] = digest(Image.open(png).convert("RGBA"))  # make_shadows.py가 다시 처리하지 않게
    data = {"version": 1, "name": f"S_SkeletonCaptain_Spin_{n}", "texture": png.relative_to(ASSETS.parent).as_posix(), "pixelsPerUnit": PPU,
            "rect": [0, 0, out.width, out.height], "pivot": [0.5, round(origin / out.height, 5)], "filter": "nearest", "border": [0, 0, 0, 0]}
    (FOLDER / f"S_SkeletonCaptain_Spin_{n}.hbsprite.json").write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    frames.append({"sprite": f"Assets/Sprites/Enemies/SkeletonCaptain/S_SkeletonCaptain_Spin_{n}.hbsprite.json", "duration": STEP})
    print(n, out.size, "배율", round(k, 3))
MANIFEST.write_text(json.dumps(done, ensure_ascii=False, indent=1, sort_keys=True) + "\n", encoding="utf-8")
(ASSETS / "Animations/SA_SkeletonCaptain_Spin.hbspriteanimation.json").write_text(json.dumps(
    {"version": 1, "name": "SA_SkeletonCaptain_Spin", "loop": True, "playRate": 1, "frames": frames}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
