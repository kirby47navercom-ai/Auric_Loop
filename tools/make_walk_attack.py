"""걸으면서 공격하는 프레임: 공격 그림의 윗몸 + 걷기 그림의 다리를 붙인다.

공격 그림은 서서 하는 자세라 그대로 움직이면 발이 멈춘 채 미끄러진다. 그래서 움직이는 동안은
윗몸은 공격(칼·활·카드), 다리는 걷기 4장을 돌리는 합성 프레임을 쓴다.
실행: python tools/make_walk_attack.py   (make_anims.py 뒤에. 이미 만든 프레임 PNG만 읽음)
결과:
  Sprites/<캐릭터>/S_<캐릭터>_<방향>_WalkAttack_<공격 0~2>_<걷기 0~3>.hbsprite.json
  Sprites/Enemies/Skeleton/S_Skeleton_WalkAttack_<0~2>.hbsprite.json + Animations/SA_Skeleton_WalkAttack (쫓아가며 휘두르기)
"""
import json
from pathlib import Path

from PIL import Image

ASSETS = Path(__file__).resolve().parent.parent / "AuricLoop/Assets"
CHARACTERS = {"Valen": 62, "Sherry": 66, "Alea": 72}  # make_anims.py와 같은 서 있는 키 (px)
DIRS = ["S", "SE", "E", "NE", "N"]
LEGS = 0.24  # 발끝에서 이 비율(키 대비) 아래가 다리. 위는 공격 그림, 아래는 걷기 그림


def center_x(im, y0, y1):
    box = im.getchannel("A").crop((0, y0, im.width, y1)).getbbox()
    return (box[0] + box[2]) / 2 if box else im.width / 2


def compose(attack, walk, body):
    """같은 캔버스(발끝이 바닥)인 두 프레임. 허리 높이에서 잘라 윗몸 가운데를 걷기 그림에 맞춰 붙인다."""
    cut = attack.height - round(body * LEGS)
    dx = round(center_x(walk, cut - 6, cut) - center_x(attack, cut - 6, cut))
    out = Image.new("RGBA", attack.size)
    out.paste(walk.crop((0, cut, walk.width, walk.height)), (0, cut))
    top = attack.crop((0, 0, attack.width, cut))
    out.alpha_composite(top, (max(0, dx), 0), (max(0, -dx), 0))
    return out


def write(folder, prefix, name, image, like):
    """like: 같은 캔버스 프레임의 .hbsprite.json (피벗·PPU를 그대로 씀)."""
    image.save(folder / f"{prefix}_{name}.png")
    asset = json.loads((folder / f"S_{prefix}_{like}.hbsprite.json").read_text(encoding="utf-8"))
    tex = folder.relative_to(ASSETS.parent).as_posix()
    asset.update(name=f"S_{prefix}_{name}", texture=f"{tex}/{prefix}_{name}.png")
    (folder / f"S_{prefix}_{name}.hbsprite.json").write_text(json.dumps(asset, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return f"{tex}/S_{prefix}_{name}.hbsprite.json"


for name, body in CHARACTERS.items():
    folder = ASSETS / f"Sprites/{name}"
    n = 0
    for d in DIRS:
        for a in range(3):
            attack = Image.open(folder / f"{name}_{d}_Attack_{a}.png").convert("RGBA")
            for w in range(4):
                walk = Image.open(folder / f"{name}_{d}_Walk_{w}.png").convert("RGBA")
                write(folder, name, f"{d}_WalkAttack_{a}_{w}", compose(attack, walk, body), f"{d}_Attack_{a}")
                n += 1
    print(name, n, "프레임")

# 해골 병사: 휘두르기 상태에서도 쫓아가므로 휘두르는 3장에 걷기 0~2의 다리를 붙인 클립
folder = ASSETS / "Sprites/Enemies/Skeleton"
paths = []
for a in range(3):
    attack = Image.open(folder / f"Skeleton_Attack_{a}.png").convert("RGBA")
    walk = Image.open(folder / f"Skeleton_Walk_{a}.png").convert("RGBA")
    paths.append(write(folder, "Skeleton", f"WalkAttack_{a}", compose(attack, walk, 44), f"Attack_{a}"))
clip = {"version": 1, "name": "SA_Skeleton_WalkAttack", "frames": [{"sprite": p, "duration": 0.13} for p in paths], "loop": False, "playRate": 1}
(ASSETS / "Animations/SA_Skeleton_WalkAttack.hbspriteanimation.json").write_text(json.dumps(clip, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print("Skeleton WalkAttack 3 프레임")
