"""데모 장면 생성기 (처음 한 번 배치용). 이후에는 편집기에서 고친다. 다시 돌리면 장면·타일맵을 덮어쓴다.

실행: python tools/gen_scene.py   (먼저 tools/make_tiles.py, tools/make_blueprints.py)

장면은 구역마다 따로: Hub(거점), Dungeon_0~4(방 하나씩). 장면마다 그 구역 가운데가 (0, 0).
  - 바닥·벽은 장면마다 타일맵 하나 (Assets/Tilemaps/TM_*.hbtilemap.json). 층 3개: floor / walls(충돌) / wallTop(위로 솟은 벽면)
    탑다운 3/4 시점: 북쪽 벽은 벽면 2칸 + 금테 윗면 1칸으로 위로 솟아 보이고, 나머지 벽은 윗면만 보인다
  - 적은 BP_SpawnPoint 자리에서 나오고(무엇이 나올지는 오브젝트마다 덮어씀), NPC·가구·채집물·상점은 BP_Interactable
  - 이 장면이 어떤 구역인지는 BP_RoomInfo, 밸런스·에셋 경로는 BP_AuricRules
  - 장면 전환 도착 자리: PlayerStart 이름 DoorBottom / DoorTop / StairTop
"""
import copy
import json
import random
from pathlib import Path

from PIL import Image

PROJECT = Path(__file__).resolve().parent.parent / "AuricLoop"
ASSETS = PROJECT / "Assets"
SCENES = ASSETS / "Scenes"
TEMPLATE = json.loads((SCENES / "Template.hbscene.json").read_text(encoding="utf-8"))
objs = {o["id"]: o for o in TEMPLATE["objects"]}
PPU = 32
DOOR = 4      # 방 사이 문 폭 (m)
BP = "Assets/Blueprints/"

# 던전 1층 데모 방 (기획서 3-2): 아래에서 위로. spawns: (x, y, BP), returns: 귀환 때 무적 해골 자리
SK, MAGE, CAPTAIN = "Enemies/BP_Skeleton", "Enemies/BP_SkeletonMage", "Enemies/BP_SkeletonCaptain"
ROOMS = [
    dict(name="전투방1", kind="Combat", size=24, spawns=[(-6, 4, SK), (0, 6, SK), (6, 4, SK)]),
    dict(name="전투방2", kind="Combat", size=24, spawns=[(-7, 3, SK), (7, 3, SK), (-5, 8, MAGE), (5, 8, MAGE)], monster=True),
    dict(name="채집방", kind="Gather", size=16, spawns=[]),
    dict(name="상점", kind="Shop", size=24, spawns=[]),
    dict(name="보스방", kind="Boss", size=32, spawns=[(0, 6, CAPTAIN)]),
]


def comp(obj, kind):
    return next(c for c in obj["components"] if c["type"] == kind)


def transform():
    return {"id": "component_0", "name": "Transform", "type": "Transform", "properties": {"position": [0, 0, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]}}


def size_of(texture):
    w, h = Image.open(ASSETS / texture.removeprefix("Assets/")).size
    return w / PPU, h / PPU


def sprite_obj(oid, texture, x, y, order=-1, collider=None, pooled=None, width=None, height=None):
    """장식·문 같은 그림 오브젝트. collider=(반너비, 반높이, 중심 y 오프셋)"""
    o = copy.deepcopy(objs["Enemy0"])
    o.update(id=oid, name=oid, position=[x, y, 0.05])
    keep = {"Transform", "SpriteRenderer"} | ({"BoxCollider2D"} if collider else set()) | ({"PooledActor"} if pooled is not None else set())
    o["components"] = [c for c in o["components"] if c["type"] in keep]
    w, h = size_of(texture)
    comp(o, "SpriteRenderer")["properties"].update(texture=texture, sprite="", width=width or w, height=height or h, pixelsPerUnit=PPU,
                                                   sortingOrder=order, color=[1, 1, 1, 1], useCustomSize=width is not None)
    if collider:
        comp(o, "BoxCollider2D")["properties"].update(trigger=False, layer=0, mask=4294967295, extent=[collider[0], collider[1], 0.5], center=[0, collider[2], 0])
    if pooled is not None:
        comp(o, "PooledActor")["properties"]["initiallyActive"] = pooled
    return o


def bp_obj(oid, blueprint, x, y, native=None, components=None, tags=None):
    o = {"id": oid, "name": oid, "kind": "empty", "group": "WORLD", "position": [x, y, 0.05], "rotation": [0, 0, 0], "scale": [1, 1, 1],
         "visible": True, "components": [transform()], "blueprintAsset": BP + blueprint + ".hbblueprint.json"}
    over = {}
    if native:
        over["nativeProperties"] = native
    if components:
        over["components"] = components
    if over:
        o["overrides"] = over
    if tags:
        o["tags"] = tags
    return o


def interactable(oid, texture, x, y, kind, text="", price=0, solid=True):
    w, h = size_of(texture)
    col = {"extent": [w * 0.4, h * 0.2, 0.5], "center": [0, -h * 0.3, 0], "enabled": solid}
    return bp_obj(oid, "BP_Interactable", x, y, {"Kind": kind, "Text": text, "Price": price},
                  {"sprite": {"texture": texture, "width": w, "height": h}, "collider": col})


def start(oid, x, y):
    o = {"id": oid, "name": oid, "kind": "playerStart", "group": "WORLD", "position": [x, y, 0.1], "rotation": [0, 0, 0], "scale": [1, 1, 1],
         "visible": True, "components": [transform()]}
    return o


def base_objects(director_bp="BP_TopDownShooter", at=(0, 0)):
    player = copy.deepcopy(objs["Player"])
    player["position"] = [at[0], at[1], 0.1]
    comp(player, "TopDownMovement2D")["properties"]["speed"] = 6
    # 충돌 층: 0 벽·장식, 1 플레이어, 2 적, 3 탄. 플레이어와 적은 서로 밀지 않는다 (접촉하면 피해만, 엔터 더 건전처럼)
    comp(player, "CapsuleCollider2D")["properties"].update(layer=1, mask=0xFFFFFFFF & ~(1 << 2))
    comp(player, "SpriteRenderer")["properties"].update(sprite="Assets/Sprites/Valen/S_Valen_Idle_0.hbsprite.json", texture="", color=[1, 1, 1, 1],
                                                        useCustomSize=False, sortingOrder=2)
    cam = copy.deepcopy(objs["Camera"])
    cam["tags"] = ["MainCamera"]
    cam["position"] = [at[0], at[1], 12]
    # 720p에서 도트 2배(1m = 64px). C++가 조준 쪽으로 끌어당기며 따라감
    comp(cam, "Camera")["properties"].update(orthographicSize=5.625, followTarget="", followOffset=[0, 0, 12])
    director = {"id": "Director", "name": "Director", "kind": "empty", "group": "WORLD", "position": [0, 0, 0], "rotation": [0, 0, 0],
                "scale": [1, 1, 1], "visible": True, "components": [transform()], "blueprintAsset": BP + director_bp + ".hbblueprint.json"}
    return [player, cam, director, bp_obj("Rules", "BP_AuricRules", 0, 0), start("PlayerStart", *at)]


# ---- 타일맵 ------------------------------------------------------------------------------
# 아틀라스 T_World.png (tools/make_tiles.py): 8열, 32px
FLOOR = {"dungeon": lambda x, y: (y % 4) * 8 + x % 4, "plaza": lambda x, y: (4 + y % 4) * 8 + x % 4, "wood": lambda x, y: (4 + y % 4) * 8 + 4 + x % 4}
WALL_COL = {"dungeon": 0, "hub": 4}   # 벽 띠의 열 시작
CAP = lambda x, y: (y % 2) * 8 + 4 + x % 2  # noqa: E731


def tilemap(name, rects, style):
    """rects: [(x0, y0, x1, y1, 바닥 종류)] 걸을 수 있는 칸. 둘레 1칸은 벽(충돌), 북쪽 벽은 위로 2칸 더 솟은 벽면."""
    floor = {}
    for x0, y0, x1, y1, kind in rects:
        for cx in range(x0, x1):
            for cy in range(y0, y1):
                floor[(cx, cy)] = kind
    wall = {(cx + dx, cy + dy) for cx, cy in floor for dx in (-1, 0, 1) for dy in (-1, 0, 1)} - set(floor)
    top = {}  # 위로 솟은 칸: (cx, cy) -> 아틀라스 번호
    walls = {}
    col = WALL_COL[style]
    for cx, cy in wall:
        if (cx, cy - 1) in floor:  # 북쪽 벽: 이 칸이 벽면 아래, 위 두 칸이 벽면 위·금테 윗면
            walls[(cx, cy)] = 10 * 8 + col + cx % 4
            for dy, row in ((1, 9), (2, 8)):
                if (cx, cy + dy) not in floor:
                    top[(cx, cy + dy)] = row * 8 + col + cx % 4
        else:
            walls[(cx, cy)] = CAP(cx, cy)
    for cx, cy in list(top):  # 솟은 벽면 옆의 기둥 윗면도 같은 높이까지 올린다
        for nx in (cx - 1, cx + 1):
            if (nx, cy) not in top and (nx, cy) not in floor and (nx, cy - 1) not in floor and ((nx, cy) in wall or (nx, cy - 1) in wall or (nx, cy - 2) in wall):
                if (nx, cy) not in walls:
                    top[(nx, cy)] = CAP(nx, cy)
    cells = set(floor) | set(walls) | set(top)
    x0, x1 = min(c[0] for c in cells), max(c[0] for c in cells) + 1
    y0, y1 = min(c[1] for c in cells), max(c[1] for c in cells) + 1
    tile = lambda cx, cy, index: {"x": cx - x0, "y": y1 - 1 - cy, "index": index}  # noqa: E731  타일 y는 아래로
    layers = [
        {"id": "floor", "name": "Floor", "visible": True, "collision": False, "tiles": [tile(cx, cy, FLOOR[k](cx, cy)) for (cx, cy), k in sorted(floor.items())]},
        {"id": "walls", "name": "Walls", "visible": True, "collision": True, "tiles": [tile(cx, cy, i) for (cx, cy), i in sorted(walls.items())]},
        {"id": "wallTop", "name": "Wall Top", "visible": True, "collision": False, "tiles": [tile(cx, cy, i) for (cx, cy), i in sorted(top.items())]},
    ]
    asset = {"version": 1, "name": name, "tileset": "Assets/Tiles/T_World.png", "normalTexture": "", "tileSize": [32, 32], "cellSize": [1, 1],
             "width": x1 - x0, "height": y1 - y0, "layers": layers}
    path = ASSETS / f"Tilemaps/{name}.hbtilemap.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(asset, ensure_ascii=False, indent=1) + "\n", encoding="utf-8", newline="\n")
    o = {"id": "World", "name": "World", "kind": "tilemap", "group": "WORLD", "position": [x0, y1, -0.2], "rotation": [0, 0, 0], "scale": [1, 1, 1],
         "visible": True, "components": [transform(), {"id": "tilemap", "name": "TilemapRenderer", "type": "TilemapRenderer", "properties": {
             "enabled": True, "tilemap": f"Assets/Tilemaps/{name}.hbtilemap.json", "sortingOrder": -10, "visible": True, "sortingLayer": "default",
             "maskInteraction": "none", "shading": "unlit"}}]}
    return o


def write(name, objects):
    scene = copy.deepcopy(TEMPLATE)
    scene["sceneName"] = name
    scene["objects"] = objects
    (SCENES / f"{name}.hbscene.json").write_text(json.dumps(scene, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n")
    return len(objects)


PROP = "Assets/Sprites/Props/Prop_"


def room_scene(i, room, director_bp="BP_TopDownShooter", at=None):
    hw = hh = room["size"] // 2
    last = i == len(ROOMS) - 1
    d = DOOR // 2
    rects = [(-hw, -hh, hw, hh, "dungeon"), (-d, -hh - 2, d, -hh, "dungeon")]
    if not last:
        rects.append((-d, hh, d, hh + 2, "dungeon"))
    objects = base_objects(director_bp, at or (0, -hh + 3))
    objects.append(tilemap(f"TM_Dungeon_{i}", rects, "dungeon"))
    objects.append(bp_obj("Room", "BP_RoomInfo", 0, 0, {"Index": i, "Kind": room["kind"], "HalfWidth": hw, "HalfHeight": hh,
                                                         "MonsterDrop": bool(room.get("monster"))}))
    objects += [start("DoorBottom", 0, -hh - 0.4)] + ([] if last else [start("DoorTop", 0, hh + 0.3)])
    # 문: 위쪽은 아치 + 잠기면 철창, 아래쪽은 잠기면 낮은 철창 (Door.Top / Door.Bottom 태그로 C++가 찾음)
    if not last:
        objects.append(sprite_obj("ArchTop", PROP + "Archway.png", 0, hh + 1.5, order=-6, width=4, height=3))
        door = sprite_obj("GateTop", PROP + "Portcullis.png", 0, hh + 1.5, order=-5, collider=(2, 0.5, -1.0), pooled=False, width=4, height=3)
        door["tags"] = ["Door.Top"]
        objects.append(door)
    if i > 0:  # 첫 방 아래는 거점 계단이라 문이 없다
        door = sprite_obj("GateBottom", PROP + "Portcullis.png", 0, -hh - 0.4, order=3, collider=(2, 0.5, 0), pooled=False, width=4, height=1.6)
        door["tags"] = ["Door.Bottom"]
        objects.append(door)
    # 적 등장 자리, 귀환 때 무적 해골 자리 (기획서 6-3: 근거리 2 + 원거리 3)
    for k, (x, y, enemy) in enumerate(room["spawns"]):
        objects.append(bp_obj(f"Spawn{k}", "BP_SpawnPoint", x, y, {"EnemyBlueprint": BP + enemy + ".hbblueprint.json"}))
    for k, (fx, fy, enemy) in enumerate([(-0.5, 0.3, SK), (0.5, 0.3, SK), (-0.6, -0.2, MAGE), (0.6, -0.2, MAGE), (0, 0.5, MAGE)]):
        objects.append(bp_obj(f"ReturnSpawn{k}", "BP_SpawnPoint", fx * hw, fy * hh, {"EnemyBlueprint": BP + enemy + ".hbblueprint.json", "ReturnOnly": True}))
    # 탄·골드·베기 이펙트: 프리팹을 장면에 미리 놓아 화면 밖(y -200)에 세워 둔다. 실행 중 생성·엔진 풀은 부를 때마다 수 ms~수십 ms라 프레임이 끊김
    for tag, prefab, count in (("Pool.EnemyShot", "PF_EnemyShot", 24), ("Pool.PlayerShot", "PF_PlayerShot", 16), ("Pool.Coin", "PF_Coin", 12), ("Pool.Slash", "PF_Slash", 1)):
        base = json.loads((ASSETS / f"Prefabs/{prefab}.hbprefab.json").read_text(encoding="utf-8"))["objects"][0]
        for k in range(count):
            o = copy.deepcopy(base)
            o.update(id=f"{prefab[3:]}{k}", name=f"{prefab[3:]}{k}", position=[-12 + k % 12 * 2, -200 - k // 12, 0.15], tags=[tag])
            o["components"] = [comp_ for comp_ in o["components"] if comp_["type"] != "PooledActor"]  # 켜 둔 채 화면 밖에 세워 둠 (C++ Take/Give)
            objects.append(o)
    # 방 종류별 상호작용
    if room["kind"] == "Gather":
        objects += [interactable("Ore", "Assets/Sprites/Prop_Ore.png", -3, 1, "Ore", solid=False),
                    interactable("Herb", "Assets/Sprites/Prop_Herb.png", 3, 1, "Herb", solid=False)]
    if room["kind"] == "Shop":
        objects += [interactable("Blacksmith", "Assets/Sprites/NPC_Blacksmith.png", -6, 5, "Smith", price=20),
                    interactable("Stall", "Assets/Sprites/Prop_Stall.png", 6, 5, "Stall", price=15)]
    # 장식: 북쪽 벽 횃불·깃발, 모서리 기둥, 바닥 잔해 (같은 결과가 나오게 방 번호로 시드)
    rng = random.Random(i * 97 + 13)
    for k, x in enumerate([-hw + 3, hw - 3] + ([-hw // 2 - 1, hw // 2 + 1] if hw >= 12 else [])):
        objects.append(sprite_obj(f"Torch{k}", PROP + "Torch.png", x, hh + 1.1, order=-4))
    for k, x in enumerate([-hw // 2 + 2, hw // 2 - 2] if hw >= 12 else []):
        objects.append(sprite_obj(f"Banner{k}", PROP + "Banner.png", x, hh + 1.6, order=-4))
    for k, (sx, sy) in enumerate([(-1, -1), (1, -1), (-1, 1), (1, 1)] if room["kind"] != "Gather" else []):
        objects.append(sprite_obj(f"Pillar{k}", PROP + "Pillar.png", sx * (hw - 2.5), sy * (hh - 2.5) + 0.6, order=-1, collider=(0.35, 0.25, -0.6)))
    blocked = [(x, y) for x, y, _ in room["spawns"]] + [(0, -hh + 3), (-6, 5), (6, 5), (-3, 1), (3, 1)]
    decor = ["Rubble", "Bones", "Rubble", "GoldPile" if room["kind"] in ("Boss", "Gather") else "Bones"]
    placed = 0
    while placed < (6 if hw >= 12 else 3):
        x, y = rng.uniform(-hw + 1.5, hw - 1.5), rng.uniform(-hh + 1.5, hh - 2)
        if abs(x) < 3 or any(abs(x - bx) < 2.5 and abs(y - by) < 2.5 for bx, by in blocked):
            continue
        objects.append(sprite_obj(f"Decor{placed}", PROP + decor[placed % len(decor)] + ".png", round(x, 1), round(y, 1), order=-2))
        blocked.append((x, y))
        placed += 1
    return objects


counts = {}
for i, room in enumerate(ROOMS):
    counts[f"Dungeon_{i}"] = write(f"Dungeon_{i}", room_scene(i, room))

# ---- 거점 (기획서 3-1, 기획팀 10/05: 분위기 위주) ----
# 광장(가운데) · 원룸(서쪽, 나무 바닥) · NPC 구역(동쪽) · 계단 통로(북쪽, 끝에 던전 입구)
EXIT_Y = 21
hub = base_objects(at=(0, -4))
hub.append(tilemap("TM_Hub", [(-12, -8, 12, 8, "plaza"), (-2, 8, 2, EXIT_Y + 2, "plaza"),
                              (-25, -6, -13, 6, "wood"), (-13, -2, -12, 2, "wood"),
                              (13, -8, 29, 8, "plaza"), (12, -2, 13, 2, "plaza")], "hub"))
hub.append(bp_obj("Room", "BP_RoomInfo", 0, 0, {"Index": -1, "Kind": "Hub", "HalfWidth": 30, "HalfHeight": 25, "ExitY": EXIT_Y}))
hub.append(start("StairTop", 0, EXIT_Y - 0.8))
CLOSED, VACATION, PREP = "Assets/Sprites/Prop_ClosedShop.png", "휴가 중입니다. 빚쟁이 여러분 다음에 또 오세요", "가게 개장 준비 중"
hub += [
    interactable("DebtBoard", "Assets/Sprites/Prop_DebtBoard.png", 0, 5, "DebtBoard"),
    interactable("Entrance", "Assets/Sprites/Prop_DungeonEntrance.png", 0, 18.5, "Entrance", "마몬의 입 - 황금 던전 입구", solid=False),
    interactable("Collector", "Assets/Sprites/NPC_Collector.png", 16, 5, "Collector", "수금원: 이번 주 이자는 아직이던데?"),
    interactable("Interior", "Assets/Sprites/NPC_Interior.png", 21, 5, "Interior", "세공사: 다음 공사는 다음 시즌에!", price=150),
    interactable("ClosedRental", CLOSED, 26.5, 5, "Note", VACATION),
    interactable("ClosedCharm", CLOSED, 15.5, -5.5, "Note", PREP),
    interactable("ClosedRecipe", CLOSED, 21, -5.5, "Note", PREP),
    interactable("ClosedRelic", CLOSED, 26.5, -5.5, "Note", VACATION),
    interactable("Sofa", "Assets/Sprites/Furniture_Sofa.png", -19, 4, "Sofa", "푹신한 소파. 더는 바꿀 수 없다", price=50),
    interactable("Bed", "Assets/Sprites/Furniture_Bed.png", -23, -3, "Note", "삐걱거리는 침대. 오늘 밤도 빚 꿈을 꾸겠지"),
    interactable("Fridge", "Assets/Sprites/Furniture_Fridge.png", -15, -3, "Note", "텅 빈 냉장고. 물 한 병뿐이다"),
    interactable("TV", "Assets/Sprites/Furniture_TV.png", -19, -3.5, "Note", "꺼진 TV. 화면에 비친 내 얼굴이 피곤해 보인다"),
]
for k, (name, x, y, solid) in enumerate([("Lamp", -10.5, 6.5, True), ("Lamp", 10.5, 6.5, True), ("Lamp", -10.5, -6.5, True), ("Lamp", 10.5, -6.5, True),
                                         ("Lamp", -2.8, 14, True), ("Lamp", 2.8, 14, True),
                                         ("Bench", -6, -6.8, False), ("Bench", 6, -6.8, False), ("Plant", -11, 1, False), ("Plant", 11, 1, False),
                                         ("Crates", 27.5, -1.5, True), ("Barrel", 27.5, 1.5, True), ("Crates", 14.5, 0, True),
                                         ("NoticeBoard", 4, 7.1, False), ("Plant", -24, 4.8, False), ("Barrel", -14, 4.8, True)]):
    w, h = size_of(PROP + name + ".png")
    hub.append(sprite_obj(f"{name}{k}", PROP + name + ".png", x, y, order=-1, collider=(w * 0.35, 0.25, -h / 2 + 0.3) if solid else None))
counts["Hub"] = write("Hub", hub)

# 검사용 장면 (tools/check_demo.mjs)
write("Test_Gather", room_scene(2, ROOMS[2], at=(-3, -1)))
for name in ("Test_Sherry", "Test_Alea"):
    write(name, room_scene(0, ROOMS[0], director_bp="BP_" + name))

# 예전 생성기가 미리 이어 붙인 그림 (이제 타일맵이 씀)
for f in ASSETS.glob("Sprites/*.png"):
    if f.name.startswith(("Room_", "Plaza_", "Home_", "NpcZone_", "Stair_")):
        f.unlink()
print("장면:", counts)
