"""거점(야외 마을)·원룸 그림을 Codex(image_gen) 시트에서 잘라 게임용 크기로 만든다.

실행: python tools/make_town.py <생성 그림 폴더>
입력: town_grass/cobble/dirt.png (이어지는 텍스처), town_houses/shops/nature/mountain.png, home_interior.png (마젠타 배경 한 줄 시트)
결과: Assets/Tiles/T_Town*.png (128px, 4m 반복), Assets/Sprites/Town/*.png (1m = 32px)
"""
import sys
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
from defringe import clean  # noqa: E402
from pixelize import save_frames, snap  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent / "AuricLoop/Assets"
src = Path(sys.argv[1])

for name, out in (("town_grass.png", "T_TownGrass"), ("town_cobble.png", "T_TownCobble"), ("town_dirt.png", "T_TownDirt")):
    snap(Image.open(src / name).convert("RGB")).resize((128, 128), Image.NEAREST).save(ROOT / f"Tiles/{out}.png")

# 시트: (이름, 높이 px). 1m = 32px, 캐릭터 키 약 2m
SHEETS = {
    "town_houses.png": [("PlayerHouse", 224), ("LoanOffice", 256), ("Workshop", 224)],
    "town_shops.png": [("ShopBag", 160), ("ShopCharm", 160), ("ShopRecipe", 160), ("ShopRelic", 160)],
    "town_nature.png": [("TreeRound", 128), ("TreePine", 150), ("Bush", 34), ("FlowerBed", 32), ("Fence", 40), ("Well", 76), ("Firewood", 36)],
    "town_mountain.png": [("Mountain", 330), ("Stairs", 140)],
    "home_interior.png": [("HomeWall", 96), ("HomeWindow", 44), ("HomeDoor", 84), ("Rug", 40), ("Sofa2", 50), ("Sofa3", 54), ("Desk", 50), ("PottedPlant", 46)],
}
out = ROOT / "Sprites/Town"
out.mkdir(parents=True, exist_ok=True)
tmp = src / "_split"
tmp.mkdir(exist_ok=True)
for sheet, items in SHEETS.items():
    im = snap(Image.open(src / sheet).convert("RGB")).convert("RGBA")
    im.putdata([(0, 0, 0, 0) if (p[0] > 170 and p[2] > 170 and p[1] < 100) else p for p in im.get_flattened_data()])
    save_frames(im, str(tmp / sheet), len(items))
    for i, (name, height) in enumerate(items):
        f = Image.open(tmp / f"{sheet.rsplit('.', 1)[0]}_{i}.png")
        f = f.crop(f.getbbox())
        f = f.resize((max(1, round(f.width * height / f.height)), height), Image.NEAREST)
        clean(f)[0].save(out / f"{name}.png")
        print(name, f.size)
# 원룸 바닥: 거점 아틀라스의 나무 바닥 4x4칸
atlas = Image.open(ROOT / "Tiles/T_World.png")
atlas.crop((4 * 32, 4 * 32, 8 * 32, 8 * 32)).save(ROOT / "Tiles/T_HomeWood.png")

# 소파 레벨별 스프라이트 에셋 (C++ ShowSofa가 SofaLevel에 맞춰 바꿔 끼움): 0 낡은 소파, 1·2 가죽, 3 황금 벨벳
import json  # noqa: E402
for level, file in enumerate(["Sprites/Furniture_Sofa.png", "Sprites/Town/Sofa2.png", "Sprites/Town/Sofa2.png", "Sprites/Town/Sofa3.png"]):
    w, h = Image.open(ROOT / file).size
    asset = {"version": 1, "name": f"S_Sofa_{level}", "texture": f"Assets/{file}", "pixelsPerUnit": 32, "rect": [0, 0, w, h], "pivot": [0.5, 0.5],
             "filter": "nearest", "border": [0, 0, 0, 0]}
    (ROOT / f"Sprites/Town/S_Sofa_{level}.hbsprite.json").write_text(json.dumps(asset, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
