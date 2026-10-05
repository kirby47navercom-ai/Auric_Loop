"""데모 장면 생성기. 템플릿 장면의 오브젝트를 바탕으로 던전 방·문·적·카메라를 다시 만든다.

실행: python tools/gen_scene.py
수치 근거: docs/데모_기획서.md (1칸 = 4m, 소형 16m / 중형 24m / 대형 32m, 이동속도 6)
C++(TopDownShooter.cpp)의 방 표도 이 파일의 ROOMS에서 만든다.
"""
import copy
import json
import re
from pathlib import Path

from PIL import Image

SCENE = Path(__file__).resolve().parent.parent / "AuricLoop/Assets/Scenes/Garden.hbscene.json"
SOURCE = SCENE.parents[2] / "Source/TopDownShooter.cpp"
SPRITES = SCENE.parents[1] / "Sprites"
PPU = 32             # 도트 밀도: 1m = 32px (UI 키트 1280x720과 같은 픽셀 크기)
WALL = 1.0
DOOR = 4.0           # 방 사이 문 폭 (m)

# 던전 1층 데모 방 (기획서 3-2): 아래에서 위로 한 줄.
# spawns: (방 가운데 기준 x, y, 0=근거리 해골 1=해골 마법사)
COMBAT, GATHER, SHOP, BOSS = 0, 1, 2, 3
ROOMS = [
    ("전투방1", COMBAT, 24, [(-6, 4, 0), (0, 6, 0), (6, 4, 0)]),
    ("전투방2", COMBAT, 24, [(-7, 3, 0), (7, 3, 0), (-5, 8, 1), (5, 8, 1)]),
    ("채집방", GATHER, 16, []),
    ("상점", SHOP, 24, []),
    ("보스방", BOSS, 32, [(-8, 6, 0), (8, 6, 0), (0, 10, 1), (-10, 12, 1), (10, 12, 1)]),  # ponytail: 해골 대장 전까지 임시 무리
]

scene = json.loads(SCENE.read_text(encoding="utf-8"))
objs = {o["id"]: o for o in scene["objects"]}


def comp(obj, kind):
    return next(c for c in obj["components"] if c["type"] == kind)


def texture(obj, name, **extra):
    """도트 텍스처를 붙이고 PNG 픽셀 크기 / PPU로 크기를 맞춘다."""
    w, h = Image.open(SPRITES / name).size
    props = dict(texture=f"Assets/Sprites/{name}", color=[1, 1, 1, 1], width=w / PPU, height=h / PPU, pixelsPerUnit=PPU)
    comp(obj, "SpriteRenderer")["properties"].update({**props, **extra})


def tiled(src, out, w_m, h_m, band=None):
    """엔진의 tiled 모드가 텍스처를 오브젝트 전체로 늘려서, 미리 반복한 PNG를 만든다 (1m = PPU px)."""
    tile = Image.open(SPRITES / src)
    if band:  # 벽은 벽돌 한 줄(1m)만 쓴다
        tile = tile.crop((0, 0, tile.width, band))
    w, h = round(w_m * PPU), round(h_m * PPU)
    img = Image.new("RGBA", (w, h))
    for y in range(0, h, tile.height):
        for x in range(0, w, tile.width):
            img.paste(tile, (x, y))
    img.save(SPRITES / out)
    return out


def box(oid, x, y, w, h, image, collider=True, order=0, pooled=False):
    o = copy.deepcopy(objs["Enemy0"])
    o.update(id=oid, name=oid, position=[x, y, 0.0 if collider else -0.1])
    keep = {"Transform", "SpriteRenderer"} | ({"BoxCollider2D"} if collider else set()) | ({"PooledActor"} if pooled else set())
    o["components"] = [c for c in o["components"] if c["type"] in keep]
    texture(o, image, sortingOrder=order, width=w, height=h)
    if collider:
        comp(o, "BoxCollider2D")["properties"].update(trigger=False, layer=0, mask=4294967295, extent=[w / 2, h / 2, 0.5])
    return o


# ---- 플레이어, 카메라, 게임 규칙 ----
player = objs["Player"]
comp(player, "TopDownMovement2D")["properties"]["speed"] = 6
comp(player, "SpriteRenderer")["properties"].update(  # 프레임은 C++가 S_Valen_*로 바꾼다
    sprite="Assets/Sprites/Valen/S_Valen_Idle_0.hbsprite.json", texture="", color=[1, 1, 1, 1], useCustomSize=False)
player["position"] = [0, -8, 0.1]
# 게임 규칙 C++(BP_TopDownShooter)는 플레이어가 아니라 별도 Director에 붙인다.
# 플레이어에 붙이면 C++ 인스턴스 생성 때 플레이어 위치가 (0,0,0)으로 덮어써짐 (HBEngine 사용자용 d4de30b4에서 확인).
bp = player.pop("blueprintAsset", None) or objs["Director"]["blueprintAsset"]
director = {"id": "Director", "name": "Director", "kind": "empty", "group": "WORLD", "position": [0, 0, 0],
            "rotation": [0, 0, 0], "scale": [1, 1, 1], "visible": True,
            "components": [copy.deepcopy(comp(player, "Transform"))], "blueprintAsset": bp}
start = {"id": "PlayerStart", "name": "PlayerStart", "kind": "playerStart", "group": "WORLD",
         "position": [0, -8, 0.1], "rotation": [0, 0, 0], "scale": [1, 1, 1], "visible": True,
         "components": [copy.deepcopy(comp(player, "Transform"))]}
comp(objs["Camera"], "Camera")["properties"].update(orthographicSize=11.25, followTarget="Player", followOffset=[0, 0, 12])

# ---- 탄, 적 (모두 풀에서 꺼내 쓴다. 처음엔 숨김) ----
for i in range(64):
    comp(objs[f"Bullet{i}"], "SpriteRenderer")["properties"].update(color=[0.75, 0.45, 1.0, 1], width=0.3, height=0.3)
for i in range(12):
    e = objs[f"Enemy{i}"]
    texture(e, "SkeletonMage_Idle.png" if i >= 4 else "Skeleton_Idle.png")  # C++ balance::rangedFrom = 4
    comp(e, "PooledActor")["properties"]["initiallyActive"] = False
    e["position"] = [0, -60, 0.1]

slash = copy.deepcopy(objs["Bullet0"])  # 검 베기 이펙트
slash.update(id="SlashFX", name="SlashFX", position=[0, -60, 0.2])
slash["components"] = [c for c in slash["components"] if c["type"] in ("Transform", "SpriteRenderer", "PooledActor")]
texture(slash, "FX_Slash.png", sortingOrder=5)

# ---- 방, 벽, 문 ----
made = [slash, start, director]
rooms_cpp = []
y = -12.0  # 첫 방 아래쪽 안쪽 경계
tiled("Wall_Stone.png", "Room_Wall_Door.png", DOOR, WALL, band=PPU)
for i, (name, kind, size, spawns) in enumerate(ROOMS):
    half, cy = size / 2, y + size / 2
    floor = tiled("Floor_Stone.png", f"Room_Floor_{size}.png", size, size)
    made.append(box(f"Floor{i}", 0, cy, size, size, floor, collider=False, order=-10))
    side = tiled("Wall_Stone.png", f"Room_Wall_V{size}.png", WALL, size, band=PPU)
    made += [box(f"Room{i}W", -half - WALL / 2, cy, WALL, size, side), box(f"Room{i}E", half + WALL / 2, cy, WALL, size, side)]
    # 아래 벽: 첫 방은 막고, 나머지는 가운데 문 자리를 비운다. 위쪽 벽은 다음 방의 아래 벽이 맡는다.
    below = max(size, ROOMS[i - 1][2]) if i else size
    wy = y - WALL / 2
    if i == 0:
        w = below + 2 * WALL
        made.append(box("Room0S", 0, wy, w, WALL, tiled("Wall_Stone.png", f"Room_Wall_H{w:g}.png", w, WALL, band=PPU)))
    else:
        seg = (below + 2 * WALL - DOOR) / 2
        piece = tiled("Wall_Stone.png", f"Room_Wall_H{seg:g}.png", seg, WALL, band=PPU)
        made += [box(f"Room{i}SL", -(DOOR + seg) / 2, wy, seg, WALL, piece), box(f"Room{i}SR", (DOOR + seg) / 2, wy, seg, WALL, piece)]
        made.append(box(f"Door{i - 1}", 0, wy, DOOR, WALL, "Room_Wall_Door.png", order=1, pooled=True))  # 풀에서 꺼내면 잠김
    rooms_cpp.append((cy, half, kind, spawns))
    y += size + WALL
w = ROOMS[-1][2] + 2 * WALL
made.append(box("RoomTop", 0, y - WALL / 2, w, WALL, tiled("Wall_Stone.png", f"Room_Wall_H{w:g}.png", w, WALL, band=PPU)))
for o in made:
    if o["id"].startswith("Door"):
        comp(o, "PooledActor")["properties"]["initiallyActive"] = False  # 처음엔 열림

old_ids = {o["id"] for o in made} | {o["id"] for o in scene["objects"] if re.match(r"(Floor|Wall|Room|Door)", o["id"])}
scene["objects"] = [o for o in scene["objects"] if o["id"] not in old_ids] + made
SCENE.write_text(json.dumps(scene, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
for f in ("Room_Wall_H.png", "Room_Wall_V.png", "Room_Floor.png"):  # 이전 한 방 구조의 그림
    (SPRITES / f).unlink(missing_ok=True)
print("장면 갱신:", SCENE.name, len(scene["objects"]), "objects,", len(ROOMS), "rooms")

# ---- C++ 방 표 ----
spawn_rows, rows = [], []
for cy, half, kind, spawns in rooms_cpp:
    rows.append(f"{{{float(cy)}f,{float(half)}f,{kind},{len(spawn_rows)},{len(spawns)}}}")
    spawn_rows += [f"{{{float(x)}f,{float(sy)}f,{t}}}" for x, sy, t in spawns]
block = ("// <rooms> tools/gen_scene.py가 만든 표. 손으로 고치지 말고 생성기를 고친다.\n"
         "struct Spawn{float x,y;int ranged;};\n"
         "struct Room{float cy,half;int kind,first,count;};  // kind: 0 전투, 1 채집, 2 상점, 3 보스\n"
         f"constexpr Spawn spawns[]={{{','.join(spawn_rows)}}};\n"
         f"constexpr Room rooms[]={{{','.join(rows)}}};\n"
         f"constexpr int roomCount={len(rows)};\n"
         "// </rooms>")
src = SOURCE.read_text(encoding="utf-8")
src = re.sub(r"// <rooms>.*?// </rooms>", lambda _: block, src, flags=re.S)
SOURCE.write_text(src, encoding="utf-8")
print("C++ 방 표 갱신:", len(rows), "rooms,", len(spawn_rows), "spawns")
