"""Codex(image_gen)로 그린 바닥·벽 텍스처와 장식 시트를 게임용 도트로 줄여 타일 아틀라스와 장식 스프라이트를 만든다.

실행: python tools/make_tiles.py <생성 그림 폴더>
입력: dungeon_floor.png, dungeon_cap.png, dungeon_wall.png, hub_floor.png, hub_wood.png, hub_wall.png (텍스처)
      dungeon_props.png, hub_props.png, dungeon_door.png (마젠타 배경 시트)
결과: AuricLoop/Assets/Tiles/T_World.png (32px 타일, 8열) + Assets/Sprites/Props/*.png

아틀라스 배치 (타일 번호 = 행 * 8 + 열). tools/gen_scene.py의 TILE 표와 같다.
  행 0~3, 열 0~3  던전 바닥 4x4 (이어지는 텍스처라 (x%4, y%4)로 깔면 이음매가 없다)
  행 0~1, 열 4~5  벽 윗면(캡) 2x2
  행 4~7, 열 0~3  거점 광장 돌바닥 4x4      행 4~7, 열 4~7  원룸 나무 바닥 4x4
  행 8~10, 열 0~3 던전 벽 (8: 윗면+금테, 9~10: 벽면)   행 8~10, 열 4~7 거점 벽
"""
import sys
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
from pixelize import KEY, save_frames, snap  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent / "AuricLoop/Assets"
T = 32
src = Path(sys.argv[1])


def texture(name, w, h):
    """확대된 도트 그림을 원래 픽셀 격자로 되돌리고 정확한 크기로 맞춘다."""
    return snap(Image.open(src / name).convert("RGB")).resize((w, h), Image.NEAREST)


atlas = Image.new("RGBA", (8 * T, 11 * T), (0, 0, 0, 0))
atlas.paste(texture("dungeon_floor.png", 4 * T, 4 * T), (0, 0))
atlas.paste(texture("dungeon_cap.png", 2 * T, 2 * T), (4 * T, 0))
atlas.paste(texture("hub_floor.png", 4 * T, 4 * T), (0, 4 * T))
atlas.paste(texture("hub_wood.png", 4 * T, 4 * T), (4 * T, 4 * T))
atlas.paste(texture("dungeon_wall.png", 4 * T, 3 * T), (0, 8 * T))
atlas.paste(texture("hub_wall.png", 4 * T, 3 * T), (4 * T, 8 * T))
(ROOT / "Tiles").mkdir(parents=True, exist_ok=True)
atlas.save(ROOT / "Tiles/T_World.png")
print("아틀라스", atlas.size)

# 장식: 마젠타 시트를 빈 열로 나눠 하나씩 (같은 높이 기준). 캐릭터(약 62px)와 같은 도트 크기가 되게 높이를 맞춘다
PROPS = {
    "dungeon_props.png": [("Torch", 40), ("Banner", 64), ("GoldPile", 30), ("Rubble", 22), ("Pillar", 52), ("Bones", 18)],
    "hub_props.png": [("Lamp", 72), ("Crates", 44), ("Plant", 36), ("Bench", 30), ("Barrel", 34), ("NoticeBoard", 44)],
    "dungeon_door.png": [("Portcullis", 96), ("Archway", 96)],
}
out = ROOT / "Sprites/Props"
out.mkdir(parents=True, exist_ok=True)
tmp = Path(sys.argv[1]) / "_split"
tmp.mkdir(exist_ok=True)
for sheet, items in PROPS.items():
    im = snap(Image.open(src / sheet).convert("RGB")).convert("RGBA")
    im.putdata([(0, 0, 0, 0) if (p[0] > 140 and p[2] > 140 and p[1] < 110) else p for p in im.get_flattened_data()])
    save_frames(im, str(tmp / sheet), len(items))
    for i, (name, height) in enumerate(items):
        f = Image.open(tmp / f"{sheet.rsplit('.', 1)[0]}_{i}.png")
        f = f.crop(f.getbbox())
        f = f.resize((max(1, round(f.width * height / f.height)), height), Image.NEAREST)
        f.save(out / f"Prop_{name}.png")
        print(name, f.size)

# 던전 층(C++ Dungeon)이 크기만 바꿔 까는 반복 무늬 텍스처: 바닥 4x4칸, 벽 윗면 2x2칸, 북쪽 벽면(금테 윗면 + 벽면 2칸) 4x3칸
for name, box in (("T_DungeonFloor", (0, 0, 4 * T, 4 * T)), ("T_DungeonCap", (4 * T, 0, 6 * T, 2 * T)), ("T_DungeonFace", (0, 8 * T, 4 * T, 11 * T))):
    atlas.crop(box).save(ROOT / f"Tiles/{name}.png")
# 옆문 철창: 앞에서 본 철창을 눕혀 옆에서 본 모양으로
gate = Image.open(out / "Prop_Portcullis.png")
gate.rotate(90, expand=True).save(out / "Prop_PortcullisSide.png")
print("던전 텍스처·옆문 철창")
