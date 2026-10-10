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
for out, src in (("ArchW", "doorway_left"), ("ArchE", "doorway_right"), ("ArchS", "doorway_down")):
    im = svg(src)
    im.save(props / f"Prop_{out}.png")
    print(out, im.size)
for out, src in (("Prop_Ore", "gold_ore"), ("Prop_OreSilver", "silver_ore"), ("Prop_OreCopper", "copper_ore")):
    png(src).save(ROOT / f"Sprites/{out}.png")
print("던전 부품 완료")
