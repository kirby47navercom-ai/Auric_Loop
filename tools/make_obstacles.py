"""던전 장애물·시작 방 계단을 던전 타일 그림으로 다시 만든다 (맵과 같은 그림체).

실행: python tools/make_obstacles.py
T_DungeonFace.png는 그 자체로 작은 벽이다: 위 0~21줄 덮개돌, 22~23줄 금테, 24줄 그림자, 26~78줄 벽돌, 80~95줄 밑동.
장애물은 이 벽을 작게 잘라 붙인 돌덩이로 만들고(크기는 예전 그림과 같게 → 장면·충돌체 그대로),
시작 방 계단(Prop_DungeonEntrance)은 같은 그림체인 아치(Prop_Archway) 안에 위로 올라가는 계단을 그려 넣는다.
보물상자(GoldChest)는 보물이라 그대로 둔다.
"""
from pathlib import Path

from PIL import Image, ImageDraw

ASSETS = Path(__file__).resolve().parent.parent / "AuricLoop/Assets"
FACE = Image.open(ASSETS / "Tiles/T_DungeonFace.png").convert("RGBA")
CAP = Image.open(ASSETS / "Tiles/T_DungeonCap.png").convert("RGBA")
DARK = (11, 17, 19, 255)
GOLD, GOLD_DARK = (230, 181, 78, 255), (150, 108, 40, 255)


def tile(src, box, w, h):
    """src의 box 영역을 가로·세로로 반복해 w x h로."""
    part = src.crop(box)
    out = Image.new("RGBA", (w, h))
    for y in range(0, h, part.height):
        for x in range(0, w, part.width):
            out.paste(part, (x, y))
    return out


def block(w, h, cap_ratio=0.3, bands=1):
    """덮개돌 + 금테 + 벽돌 + 밑동으로 된 돌덩이. bands: 금테 줄 수 (2면 벽돌 가운데에 하나 더)."""
    im = Image.new("RGBA", (w, h))
    cap = max(5, round(h * cap_ratio))
    base = 3
    im.paste(tile(FACE, (0, 2, 128, 22), w, cap), (0, 0))
    y = cap
    for c in (GOLD, GOLD_DARK, DARK):
        ImageDraw.Draw(im).line([(0, y), (w - 1, y)], fill=c)
        y += 1
    bricks = h - y - base
    im.paste(tile(FACE, (5, 26, 123, 78), w, bricks), (0, y))
    if bands == 2:
        mid = y + bricks // 2
        ImageDraw.Draw(im).line([(0, mid), (w - 1, mid)], fill=GOLD)
        ImageDraw.Draw(im).line([(0, mid + 1), (w - 1, mid + 1)], fill=GOLD_DARK)
    im.paste(tile(FACE, (0, 86, 128, 92), w, base), (0, h - base))
    px = im.load()
    for x in range(w):  # 덮개돌 윗변 밝게
        r, g, b, a = px[x, 1]
        px[x, 1] = (min(255, r + 40), min(255, g + 48), min(255, b + 46), a)
    for yy in range(cap + 3, h - base):  # 오른쪽 면 어둡게 (입체감)
        for xx in range(w - max(2, w // 7), w):
            r, g, b, a = px[xx, yy]
            px[xx, yy] = (r * 2 // 3, g * 2 // 3, b * 2 // 3, a)
    d = ImageDraw.Draw(im)
    d.rectangle([0, 0, w - 1, h - 1], outline=DARK)  # 테두리
    return im


def entrance(w, h):
    """아치 안쪽 어둠 속으로 올라가는 계단 + 아치 아래 넓은 계단 (던전 → 거점 출구)."""
    arch = Image.open(ASSETS / "Sprites/Props/Prop_Archway.png").convert("RGBA")
    im = Image.new("RGBA", (w, h))
    ox = (w - arch.width) // 2
    d = ImageDraw.Draw(im)
    # 아치 안쪽: 위로 갈수록 어두워지는 계단 (덮개돌 무늬를 띠로)
    inner = (ox + 24, 18, ox + arch.width - 24, arch.height)
    steps = 9
    for i in range(steps):
        y0 = inner[1] + (inner[3] - inner[1]) * i // steps
        y1 = inner[1] + (inner[3] - inner[1]) * (i + 1) // steps
        band = tile(CAP, (0, 0, 64, 8), inner[2] - inner[0], y1 - y0)
        k = 0.15 + 0.85 * (i / steps) ** 1.3  # 멀리(위) 갈수록 어둡게
        r, g, b, a = band.split()
        band = Image.merge("RGBA", [Image.eval(c, lambda v, k=k: int(v * k)) for c in (r, g, b)] + [a])  # 색만 어둡게 (불투명 유지)
        im.paste(band, (inner[0], y0))
        d.line([(inner[0], y0), (inner[2] - 1, y0)], fill=(int(120 * k), int(150 * k), int(146 * k), 255))  # 디딤돌 앞 모서리
    im.paste(arch, (ox, 0), arch)
    # 아치 아래 넓은 계단 3단
    top = arch.height
    for i in range(3):
        y0 = top + (h - top) * i // 3
        y1 = top + (h - top) * (i + 1) // 3
        inset = 10 - i * 4
        band = tile(FACE, (0, 2, 128, 22), w - 2 * inset, y1 - y0)
        im.paste(band, (inset, y0))
        d.line([(inset, y0), (w - inset - 1, y0)], fill=(96, 122, 118, 255))
        d.line([(inset, y0 + 1), (w - inset - 1, y0 + 1)], fill=GOLD if i == 0 else (70, 92, 90, 255))
        d.line([(inset, y1 - 1), (w - inset - 1, y1 - 1)], fill=DARK)
        d.line([(inset, y0), (inset, y1 - 1)], fill=DARK)
        d.line([(w - inset - 1, y0), (w - inset - 1, y1 - 1)], fill=DARK)
    return im


PROPS = ASSETS / "Sprites/Props"
out = {
    PROPS / "Prop_Pillar.png": block(29, 52, 0.22, bands=2),   # 기둥: 금테 두 줄
    PROPS / "Prop_Crates2.png": block(32, 56, 0.25),            # 큰 돌덩이 (예전 상자 더미 자리)
    PROPS / "Prop_Barrel2.png": block(30, 44, 0.3),             # 작은 돌덩이 (예전 통 자리)
    PROPS / "Prop_LowWall.png": block(52, 36, 0.36),            # 낮은 벽
    PROPS / "Prop_Statue.png": block(34, 60, 0.18, bands=2),    # 높은 기둥 (예전 황금 해골상 자리)
    ASSETS / "Sprites/Prop_DungeonEntrance.png": entrance(129, 160),
}
for path, im in out.items():
    old = Image.open(path).size
    assert im.size in (old, (old[0], old[1] - 16)), (path.name, im.size, old)  # 크기가 같아야 장면 배치·충돌체가 그대로 맞음 (16 = make_shadows 여백)
    im.save(path)
    print(path.name, im.size)
print("다음: python tools/make_shadows.py (그림자·정렬 여백)")
