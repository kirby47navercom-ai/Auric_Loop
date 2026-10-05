"""데모 장면 생성기. 템플릿 장면의 오브젝트를 바탕으로 방·적·카메라를 다시 만든다.

실행: python tools/gen_scene.py
수치 근거: docs/데모_기획서.md (1칸 = 4m, 중형 방 6칸 = 24m, 이동속도 6)
"""
import copy
import json
from pathlib import Path

SCENE = Path(__file__).resolve().parent.parent / "AuricLoop/Assets/Scenes/Garden.hbscene.json"
ROOM = 24.0          # 중형 방 한 변 (m)
PPU = 32             # 도트 밀도: 1m = 32px (UI 키트 1280x720과 같은 픽셀 크기)
SPRITES = SCENE.parents[1] / "Sprites"
WALL = 1.0

scene = json.loads(SCENE.read_text(encoding="utf-8"))
objs = {o["id"]: o for o in scene["objects"]}


def comp(obj, kind):
    return next(c for c in obj["components"] if c["type"] == kind)


def texture(obj, name, **extra):
    """도트 텍스처를 붙이고 PNG 픽셀 크기 / PPU로 크기를 맞춘다."""
    from PIL import Image
    w, h = Image.open(SPRITES / name).size
    props = dict(texture=f"Assets/Sprites/{name}", color=[1, 1, 1, 1], width=w / PPU, height=h / PPU, pixelsPerUnit=PPU)
    comp(obj, "SpriteRenderer")["properties"].update({**props, **extra})


player = objs["Player"]
comp(player, "TopDownMovement2D")["properties"]["speed"] = 6
texture(player, "Valen_Idle.png")
player["position"] = [0, -8, 0.1]
# 게임 규칙 C++(BP_TopDownShooter)는 플레이어가 아니라 별도 Director에 붙인다.
# 플레이어에 붙이면 C++ 인스턴스 생성 때 플레이어 위치가 (0,0,0)으로 덮어써짐 (HBEngine 사용자용 d4de30b4에서 확인).
bp = player.pop("blueprintAsset", None) or next(o for o in scene["objects"] if o["id"] == "Director")["blueprintAsset"]
director = {"id": "Director", "name": "Director", "kind": "empty", "group": "WORLD", "position": [0, 0, 0],
            "rotation": [0, 0, 0], "scale": [1, 1, 1], "visible": True,
            "components": [copy.deepcopy(comp(player, "Transform"))], "blueprintAsset": bp}

cam = comp(objs["Camera"], "Camera")["properties"]
cam.update(orthographicSize=11.25, followTarget="Player", followOffset=[0, 0, 12])  # 세로 22.5m

enemy_spots = [(-6, 4), (0, 6), (6, 4), (-8, -2), (8, -2), (0, 0)]
for i in range(64):
    comp(objs[f"Bullet{i}"], "SpriteRenderer")["properties"].update(color=[0.75, 0.45, 1.0, 1], width=0.3, height=0.3)  # 해골 탄

for i in range(12):
    e = objs[f"Enemy{i}"]
    ranged = i >= 4  # C++ balance::rangedFrom과 같은 값
    texture(e, "SkeletonMage_Idle.png" if ranged else "Skeleton_Idle.png")
    active = i < len(enemy_spots)
    comp(e, "PooledActor")["properties"]["initiallyActive"] = active
    e["position"] = [*enemy_spots[i], 0.1] if active else [0, 40, 0.1]


def static_box(oid, x, y, w, h, color, collider=True, order=0):
    o = copy.deepcopy(objs["Enemy0"])
    o.update(id=oid, name=oid, position=[x, y, 0.0 if collider else -0.1])
    o["components"] = [c for c in o["components"] if c["type"] in ("Transform", "SpriteRenderer", "BoxCollider2D")]
    s = comp(o, "SpriteRenderer")["properties"]
    s.update(color=color, width=w, height=h, sortingOrder=order)
    if collider:
        comp(o, "BoxCollider2D")["properties"].update(trigger=False, layer=0, mask=4294967295, extent=[w / 2, h / 2, 0.5])
    else:
        o["components"] = [c for c in o["components"] if c["type"] != "BoxCollider2D"]
    return o


# 플레이어는 PlayerStart 위치에서 시작한다 (엔진이 Pawn을 이 자리로 옮김)
start = {"id": "PlayerStart", "name": "PlayerStart", "kind": "playerStart", "group": "WORLD",
         "position": [0, -8, 0.1], "rotation": [0, 0, 0], "scale": [1, 1, 1], "visible": True,
         "components": [copy.deepcopy(comp(player, "Transform"))]}

half = ROOM / 2 + WALL / 2
room = [
    start,
    director,
    static_box("Floor", 0, 0, ROOM, ROOM, [1, 1, 1, 1], collider=False, order=-10),
    static_box("WallN", 0, half, ROOM + 2 * WALL, WALL, [1, 1, 1, 1]),
    static_box("WallS", 0, -half, ROOM + 2 * WALL, WALL, [1, 1, 1, 1]),
    static_box("WallW", -half, 0, WALL, ROOM, [1, 1, 1, 1]),
    static_box("WallE", half, 0, WALL, ROOM, [1, 1, 1, 1]),
]


def tiled(src, out, w_m, h_m, band=None):
    """엔진의 tiled 모드가 텍스처를 오브젝트 전체로 늘려서, 미리 반복한 PNG를 만든다 (1m = PPU px)."""
    from PIL import Image
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


for o in room[2:]:
    w, h = (comp(o, "SpriteRenderer")["properties"][k] for k in ("width", "height"))
    if o["id"] == "Floor":
        name = tiled("Floor_Stone.png", "Room_Floor.png", w, h)
    else:
        horizontal = w > h
        name = tiled("Wall_Stone.png", f"Room_Wall_{'H' if horizontal else 'V'}.png", w, h, band=PPU)
    texture(o, name)
scene["objects"] = [o for o in scene["objects"] if o["id"] not in {r["id"] for r in room}] + room
SCENE.write_text(json.dumps(scene, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print("장면 갱신:", SCENE.name, len(scene["objects"]), "objects")
