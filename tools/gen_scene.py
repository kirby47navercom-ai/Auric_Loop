"""데모 장면 생성기. 템플릿 장면의 오브젝트를 바탕으로 방·적·카메라를 다시 만든다.

실행: python tools/gen_scene.py
수치 근거: docs/데모_기획서.md (1칸 = 4m, 중형 방 6칸 = 24m, 이동속도 6)
"""
import copy
import json
from pathlib import Path

SCENE = Path(__file__).resolve().parent.parent / "AuricLoop/Assets/Scenes/Garden.hbscene.json"
ROOM = 24.0          # 중형 방 한 변 (m)
WALL = 1.0

scene = json.loads(SCENE.read_text(encoding="utf-8"))
objs = {o["id"]: o for o in scene["objects"]}


def comp(obj, kind):
    return next(c for c in obj["components"] if c["type"] == kind)


player = objs["Player"]
comp(player, "TopDownMovement2D")["properties"]["speed"] = 6
comp(player, "SpriteRenderer")["properties"]["color"] = [0.72, 0.2, 0.18, 1]  # 발렌 임시 색
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
for i in range(12):
    e = objs[f"Enemy{i}"]
    comp(e, "SpriteRenderer")["properties"]["color"] = [0.9, 0.88, 0.8, 1]  # 해골 임시 색
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
    static_box("Floor", 0, 0, ROOM, ROOM, [0.13, 0.17, 0.17, 1], collider=False, order=-10),
    static_box("WallN", 0, half, ROOM + 2 * WALL, WALL, [0.24, 0.3, 0.29, 1]),
    static_box("WallS", 0, -half, ROOM + 2 * WALL, WALL, [0.24, 0.3, 0.29, 1]),
    static_box("WallW", -half, 0, WALL, ROOM, [0.24, 0.3, 0.29, 1]),
    static_box("WallE", half, 0, WALL, ROOM, [0.24, 0.3, 0.29, 1]),
]
scene["objects"] = [o for o in scene["objects"] if o["id"] not in {r["id"] for r in room}] + room
SCENE.write_text(json.dumps(scene, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print("장면 갱신:", SCENE.name, len(scene["objects"]), "objects")
