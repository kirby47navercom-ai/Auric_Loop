"""아트팀 던전 배경 부품 v2를 게임 그림으로 (바닥·벽면·기둥·출입구·횃불·상자·통·광석·돌).

실행: python tools/make_dungeon_parts.py [부품 폴더=native/dungeon_v2] && python tools/make_shadows.py && python tools/gen_scene.py
입력: png/ (원래 도트 크기), svg/ (doorway_left·right·down은 SVG만 있어 픽셀 사각형을 직접 칠함)
결과 (1m = 32px, 원래 그림 그대로):
  Tiles/T_DungeonFloor.png  128x128: 기본·균열·이끼·잔돌 바닥을 2x2로 (4m마다 반복)
  Tiles/T_DungeonFace.png   92x96: 가로 벽 (양옆 투명 2px 자르고, 3m 높이에 맞게 벽돌 한 줄 더함)
  Sprites/Props/Prop_Pillar·Crates2·CrateStack·Barrel2·Rubble·SmallRock·Bucket·TorchWall·Archway·ArchW·ArchE·ArchS.png
  Sprites/Prop_Ore.png (금광석), Prop_OreSilver·Prop_OreCopper.png
"""
import re
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent / "AuricLoop/Assets"
SRC = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).resolve().parent.parent / "native/dungeon_v2"


def png(name):
    return Image.open(SRC / "png" / f"{name}.png").convert("RGBA")


def svg(name):
    """픽셀 사각형만으로 된 SVG (path d="Mx yhWvHh-WZ...")를 그대로 칠함"""
    text = (SRC / "svg" / f"{name}.svg").read_text(encoding="utf-8")
    w, h = (int(v) for v in re.search(r'width="(\d+)" height="(\d+)"', text).groups())
    im = Image.new("RGBA", (w, h))
    px = im.load()
    for fill, d in re.findall(r'<path fill="#([0-9a-fA-F]{6})"[^>]*d="([^"]+)"', text):
        color = tuple(int(fill[i:i + 2], 16) for i in (0, 2, 4)) + (255,)
        for x, y, rw, rh in re.findall(r"M(\d+) (\d+)h(\d+)v(\d+)h-\d+Z", d):
            for yy in range(int(y), int(y) + int(rh)):
                for xx in range(int(x), int(x) + int(rw)):
                    px[xx, yy] = color
    return im


# 바닥: 네 가지를 2x2로
floor = Image.new("RGBA", (128, 128))
for k, name in enumerate(("floor_plain", "floor_cracked", "floor_moss", "floor_chips")):
    floor.paste(png(name), ((k % 2) * 64, (k // 2) * 64))
mortar = Image.new("RGBA", floor.size, (11, 19, 25, 255))  # 바닥 그림 모서리가 둥글게 투명해서 반복하면 구멍(점)이 보임 → 줄눈 색으로 메움
mortar.alpha_composite(floor)
mortar.save(ROOT / "Tiles/T_DungeonFloor.png")

# 북쪽 벽면: 윗돌(0~15) + 벽돌 줄 하나 더(16~33) + 벽돌·밑돌(16~77) → 96줄, 가로는 양옆 투명 2px를 잘라 이어지게
wall = png("wall_horizontal").crop((2, 0, 94, 78))
face = Image.new("RGBA", (92, 96))
face.paste(wall.crop((0, 0, 92, 16)), (0, 0))
face.paste(wall.crop((0, 16, 92, 34)), (0, 16))
face.paste(wall.crop((0, 16, 92, 78)), (0, 34))
face.save(ROOT / "Tiles/T_DungeonFace.png")

props = ROOT / "Sprites/Props"
for out, src in (("Pillar", "pillar"), ("Crates2", "crate"), ("CrateStack", "crate_stack"), ("Barrel2", "barrel"), ("Rubble", "rock_pile"),
                 ("SmallRock", "small_rock"), ("Bucket", "bucket"), ("TorchWall", "torch"), ("Archway", "doorway")):
    png(src).save(props / f"Prop_{out}.png")
# 위 문 테: 아치 안쪽 어둠·문턱을 지워 복도 바닥이 보이게 (기둥·아치만 남김). 서·동·남 문은 테 없이 벽 틈 그대로
#   (위에서 본 1m 벽 윗면에 옆모습 문 그림을 세우면 바닥에 누운 것처럼 보였음)
import numpy as np  # noqa: E402
door = np.array(png("doorway"))
lum = door[..., :3].mean(2)
for x in range(19, 77):  # 기둥 사이: 위에서부터 처음 어두운 칸 아래는 모두 안쪽
    ys = [y for y in range(8, 84) if door[y, x, 3] > 0 and lum[y, x] < 30]
    if ys:
        door[ys[0]:, x, 3] = 0
Image.fromarray(door).save(props / "Prop_ArchNorth.png")
# 던전에서 거점으로 올라가는 계단: 같은 아치 안에 위로 올라가며 어두워지는 돌계단 (아치 안쪽 칸만 칠함)
stairs = Image.fromarray(door.copy()).copy()
sp = stairs.load()
for x in range(19, 77):
    for y in range(8, 84):
        if door[y, x, 3] == 0:
            k, j = (83 - y) // 8, (83 - y) % 8  # 아래에서 8px마다 한 칸: 디딤판(위 5px, 밝게) + 챌판(아래 3px, 어둡게)
            fade = max(0.18, 1 - k * 0.11)  # 위로 갈수록 어둠 속으로
            tread = j >= 3
            joint = (x + k * 7) % 14 == 0  # 돌 이음매 (칸마다 엇갈림)
            r, g, b = (70, 92, 98) if tread else (38, 52, 58)
            if j == 7 or joint:
                r, g, b = r - 18, g - 20, b - 20
            sp[x, y] = (int(r * fade), int(g * fade), int(b * fade), 255)
stairs.save(props / "Prop_StairsUp.png")
for out, src in (("Prop_Ore", "gold_ore"), ("Prop_OreSilver", "silver_ore"), ("Prop_OreCopper", "copper_ore")):
    png(src).save(ROOT / f"Sprites/{out}.png")
print("던전 부품 완료")
