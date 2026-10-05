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
    ("보스방", BOSS, 32, []),  # 해골 대장은 C++가 방 가운데 위쪽에 꺼낸다
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

boss = copy.deepcopy(objs["Enemy0"])  # 1층 보스 해골 대장 (기획서 5장)
boss.update(id="Boss", name="Boss", position=[0, -60, 0.1])
texture(boss, "SkeletonCaptain_Idle.png", sortingOrder=2)
comp(boss, "BoxCollider2D")["properties"]["extent"] = [1.2, 1.4, 0.1]

slash = copy.deepcopy(objs["Bullet0"])  # 검 베기 이펙트
slash.update(id="SlashFX", name="SlashFX", position=[0, -60, 0.2])
slash["components"] = [c for c in slash["components"] if c["type"] in ("Transform", "SpriteRenderer", "PooledActor")]
texture(slash, "FX_Slash.png", sortingOrder=5)

# ---- 방, 벽, 문 ----
made = [boss, slash, start, director]
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
    seg = (below + 2 * WALL - DOOR) / 2
    piece = tiled("Wall_Stone.png", f"Room_Wall_H{seg:g}.png", seg, WALL, band=PPU)
    if i == 0:  # 첫 방 아래는 거점 계단으로 열려 있다
        made += [box("Room0SL", -(DOOR + seg) / 2, wy, seg, WALL, piece), box("Room0SR", (DOOR + seg) / 2, wy, seg, WALL, piece)]
        made.append(box("Floor0Gap", 0, wy, DOOR, WALL, tiled("Floor_Stone.png", "Room_Floor_Gap.png", DOOR, WALL), collider=False, order=-10))
    else:
        made += [box(f"Room{i}SL", -(DOOR + seg) / 2, wy, seg, WALL, piece), box(f"Room{i}SR", (DOOR + seg) / 2, wy, seg, WALL, piece)]
        made.append(box(f"Door{i - 1}", 0, wy, DOOR, WALL, "Room_Wall_Door.png", order=1, pooled=True))  # 풀에서 꺼내면 잠김
        made.append(box(f"Floor{i}Gap", 0, wy, DOOR, WALL, tiled("Floor_Stone.png", "Room_Floor_Gap.png", DOOR, WALL), collider=False, order=-10))  # 문이 열렸을 때 보이는 바닥
    rooms_cpp.append((cy, half, kind, spawns))
    y += size + WALL
w = ROOMS[-1][2] + 2 * WALL
made.append(box("RoomTop", 0, y - WALL / 2, w, WALL, tiled("Wall_Stone.png", f"Room_Wall_H{w:g}.png", w, WALL, band=PPU)))
for o in made:
    if o["id"].startswith("Door"):
        comp(o, "PooledActor")["properties"]["initiallyActive"] = False  # 처음엔 열림

# ---- 거점 (기획서 3-1, 기획팀 10/05: 분위기 위주) ----
# 던전 첫 방 아래로 계단 통로 → 중앙 광장. 광장 왼쪽 원룸, 오른쪽 NPC 구역.
def walled(prefix, cx, cy, w, h, floor_src, gaps):
    """바닥과 네 벽을 만든다. gaps: {'N'|'S'|'W'|'E': 가운데 열린 폭(m)}"""
    out = [box(f"{prefix}Floor", cx, cy, w, h, tiled(floor_src, f"{prefix}_Floor.png", w, h), collider=False, order=-10)]
    for side in "NSWE":
        horizontal = side in "NS"
        length = w + 2 * WALL if horizontal else h
        px = cx if horizontal else cx + (w / 2 + WALL / 2) * (1 if side == "E" else -1)
        py = cy + (h / 2 + WALL / 2) * (1 if side == "N" else -1) if horizontal else cy
        gap = gaps.get(side, 0)
        pieces = [(0, length)] if not gap else [(-(gap + (length - gap) / 2) / 2, (length - gap) / 2), ((gap + (length - gap) / 2) / 2, (length - gap) / 2)]
        for k, (off, ln) in enumerate(pieces):
            ww, hh = (ln, WALL) if horizontal else (WALL, ln)
            img = tiled("Wall_Stone.png", f"Room_Wall_{'H' if horizontal else 'V'}{ln:g}.png", ww, hh, band=PPU)
            out.append(box(f"{prefix}Wall{side}{k}", px + (off if horizontal else 0), py + (0 if horizontal else off), ww, hh, img))
    return out


room0_bottom = rooms_cpp[0][0] - rooms_cpp[0][1] - WALL  # 첫 방 아래 벽 아래쪽
PLAZA = (0, -34, 24, 16)
STAIR_H = room0_bottom - (PLAZA[1] + PLAZA[3] / 2 + WALL)
hub = walled("Plaza", *PLAZA, "Floor_Plaza.png", {"N": DOOR, "W": DOOR, "E": DOOR})
hub += walled("Stair", 0, PLAZA[1] + PLAZA[3] / 2 + WALL + STAIR_H / 2, DOOR, STAIR_H, "Floor_Stone.png", {"N": DOOR, "S": DOOR})
hub = [o for o in hub if not o["id"].startswith("StairWall")] + [o for o in hub if o["id"].startswith("StairWall") and o["id"][9] in "WE"]
ROOM_HOME = (-19, -34, 12, 12)
NPC_ZONE = (21, -34, 16, 16)
hub += walled("Home", *ROOM_HOME, "Floor_Stone.png", {"E": DOOR})
hub += walled("NpcZone", *NPC_ZONE, "Floor_Plaza.png", {"W": DOOR})
for side, (x, y) in {"W": (-12.5, -34), "E": (12.5, -34)}.items():  # 광장과 옆 구역 사이 벽 틈 바닥
    hub.append(box(f"PlazaGap{side}", x + (-0.5 if side == "W" else 0.5), y, 2 * WALL, DOOR, tiled("Floor_Plaza.png", "Plaza_Gap.png", 2 * WALL, DOOR), collider=False, order=-10))

HUB_SPOTS = {  # C++ 상호작용 표와 같은 자리 (아래 <hub> 블록으로 생성)
    "DebtBoard": ("Prop_DebtBoard.png", 0, -29, True),
    "Entrance": ("Prop_DungeonEntrance.png", 0, room0_bottom - 2.5, False),
    "Collector": ("NPC_Collector.png", 16, -29, True),
    "Interior": ("NPC_Interior.png", 21, -29, True),
    "ClosedRental": ("Prop_ClosedShop.png", 26.5, -29, True),
    "ClosedCharm": ("Prop_ClosedShop.png", 15.5, -39.5, True),
    "ClosedRecipe": ("Prop_ClosedShop.png", 21, -39.5, True),
    "ClosedRelic": ("Prop_ClosedShop.png", 26.5, -39.5, True),
    "Sofa": ("Furniture_Sofa.png", -19, -30, True),
    "Bed": ("Furniture_Bed.png", -23, -37, True),
    "Fridge": ("Furniture_Fridge.png", -15, -37, True),
    "TV": ("Furniture_TV.png", -19, -37.5, True),
}
for oid, (img, x, y, solid) in HUB_SPOTS.items():
    o = copy.deepcopy(objs["Enemy0"])
    o.update(id=oid, name=oid, position=[x, y, 0.05])
    o["components"] = [c for c in o["components"] if c["type"] in ({"Transform", "SpriteRenderer", "BoxCollider2D"} if solid else {"Transform", "SpriteRenderer"})]
    texture(o, img, sortingOrder=1)
    if solid:
        w, h = Image.open(SPRITES / img).size
        comp(o, "BoxCollider2D")["properties"].update(trigger=False, layer=0, mask=4294967295, extent=[w / PPU * 0.4, h / PPU * 0.2, 0.5], center=[0, -h / PPU * 0.3, 0])
    hub.append(o)
made += hub
for oid in ("PlayerStart", "Player"):  # 거점 광장에서 시작
    (start if oid == "PlayerStart" else player)["position"] = [0, PLAZA[1] - 4, 0.1]

# ---- 채집물, 상점, 골드 (기획서 6-1, 6-2) ----
def prop(oid, image, room, x, y, pooled=False, active=True, collider=False, order=1):
    o = copy.deepcopy(objs["Enemy0"])
    o.update(id=oid, name=oid, position=[x, rooms_cpp[room][0] + y, 0.05])
    keep = {"Transform", "SpriteRenderer"} | ({"PooledActor"} if pooled else set()) | ({"BoxCollider2D"} if collider else set())
    o["components"] = [c for c in o["components"] if c["type"] in keep]
    texture(o, image, sortingOrder=order)
    if pooled:
        comp(o, "PooledActor")["properties"]["initiallyActive"] = active
    if collider:
        w, h = Image.open(SPRITES / image).size
        comp(o, "BoxCollider2D")["properties"].update(trigger=False, layer=0, mask=4294967295, extent=[w / PPU * 0.4, h / PPU * 0.25, 0.5],
                                                     center=[0, -h / PPU * 0.2, 0])
    return o


props = [
    prop("Ore", "Prop_Ore.png", 2, -3, 1, pooled=True),     # 채집방: 광물 바위
    prop("Herb", "Prop_Herb.png", 2, 3, 1, pooled=True),    # 채집방: 약초 덤불
    prop("Blacksmith", "NPC_Blacksmith.png", 3, -6, 5, collider=True),
    prop("Stall", "Prop_Stall.png", 3, 6, 5, collider=True),
] + [prop(f"Coin{i}", "Item_Coin.png", 0, 0, -60, pooled=True, active=False, order=3) for i in range(12)]
made += props

old_ids = {o["id"] for o in made} | {o["id"] for o in scene["objects"] if re.match(r"(Floor|Wall|Room|Door|Plaza|Stair|Home|NpcZone)", o["id"])}
scene["objects"] = [o for o in scene["objects"] if o["id"] not in old_ids] + made
SCENE.write_text(json.dumps(scene, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
for f in ("Room_Wall_H.png", "Room_Wall_V.png", "Room_Floor.png"):  # 이전 한 방 구조의 그림
    (SPRITES / f).unlink(missing_ok=True)
print("장면 갱신:", SCENE.name, len(scene["objects"]), "objects,", len(ROOMS), "rooms")

# 검사용 장면 (tools/check_demo.mjs): 보스방 입구, 채집방 광물 앞에서 시작
for test_name, (room, sx, sy) in {"Test_Dungeon": (0, 0, -8), "Test_Boss": (4, 0, None), "Test_Gather": (2, -3, -1)}.items():
    cy, half = rooms_cpp[room][0], rooms_cpp[room][1]
    pos = [sx, cy - half + 3 if sy is None else cy + sy, 0.1]
    test = copy.deepcopy(scene)
    for oid in ("PlayerStart", "Player"):
        next(o for o in test["objects"] if o["id"] == oid)["position"] = pos
    (SCENE.parent / f"{test_name}.hbscene.json").write_text(json.dumps(test, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


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
hub_rows = ",".join(f'{{"{k}",{float(x)}f,{float(y)}f}}' for k, (_, x, y, _) in HUB_SPOTS.items())
hub_block = ("// <hub> tools/gen_scene.py가 만든 거점 상호작용 자리\n"
             "struct Spot{const char* id;float x,y;};\n"
             f"constexpr Spot hubSpots[]={{{hub_rows}}};\n"
             f"constexpr float dungeonBottom={float(room0_bottom)}f;  // 이보다 아래는 거점\n"
             "// </hub>")
src = re.sub(r"// <hub>.*?// </hub>", lambda _: hub_block, src, flags=re.S)
SOURCE.write_text(src, encoding="utf-8")
print("C++ 방 표 갱신:", len(rows), "rooms,", len(spawn_rows), "spawns")
