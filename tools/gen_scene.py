"""데모 장면 생성기 (처음 한 번 배치용). 이후에는 편집기에서 고친다. 다시 돌리면 장면·타일맵을 덮어쓴다.

실행: python tools/gen_scene.py   (먼저 tools/make_tiles.py, tools/make_blueprints.py)

장면: Hub(거점), Dungeon(던전 한 층). 던전 방 배치는 들어올 때마다 C++(Source/Dungeon.h)가 무작위로 만든다.
  - 거점 바닥·벽은 타일맵 (Assets/Tilemaps/TM_Hub.hbtilemap.json). 층 3개: floor / walls(충돌) / wallTop(위로 솟은 벽면)
  - 던전은 바닥·벽·문·장식을 화면 밖에 넉넉히 놓아 두고 C++가 옮겨 깐다 (태그 Dungeon.*)
  - 적은 방에 들어서면 웨이브로 나온다 (Assets/Data/DT_Rooms). NPC·가구·채집물·상점은 BP_Interactable
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
BP = "Assets/Blueprints/"

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
    comp(player, "Rigidbody2D")["properties"]["freezeRotation"] = [1, 1, 1]  # 부딪혀도 돌지 않게 (예전엔 z가 풀려 맞으면 캐릭터가 빙글 돌았음)
    comp(player, "SpriteRenderer")["properties"].update(sprite="Assets/Sprites/Valen/S_Valen_S_Idle_0.hbsprite.json", texture="", color=[1, 1, 1, 1],
                                                        useCustomSize=False, sortingOrder=0)
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


# 아웃라이너 폴더: 종류별 그룹 오브젝트(원점) 아래에 넣는다. 위치는 그대로 (그룹이 원점이라 로컬 = 월드)
OUTLINE = [
    ("시스템", lambda o: o["id"] in ("Director", "Rules", "Room", "PostFX", "PlayerStart", "StairTop", "DoorBottom", "DoorTop") or o.get("kind") == "playerStart"),
    ("맵", lambda o: o.get("kind") == "tilemap" or o["id"] in ("Background", "Grass", "Plaza", "NorthRoad", "HomePath", "Street", "Floor", "Mountain", "Stairs") or any(t in ("Dungeon.Background", "Dungeon.Floor", "Dungeon.Cap", "Dungeon.Face", "Dungeon.Arch") for t in o.get("tags", []))),
    ("문", lambda o: any(t in ("Dungeon.Gate", "Dungeon.GateSide", "Dungeon.Stairs") for t in o.get("tags", []))),
    ("엄폐물", lambda o: any(t in ("Dungeon.Pillar", "Dungeon.Crate", "Dungeon.Barrel", "Dungeon.LowWall", "Dungeon.Statue", "Dungeon.Chest") for t in o.get("tags", []))),
    ("장식·조명", lambda o: any(t.startswith("Dungeon.") for t in o.get("tags", [])) or o["id"].startswith(("Torch", "Banner", "Lamp", "Pillar", "Bench", "Plant", "Crates", "Barrel", "NoticeBoard", "Decor"))),
    ("상호작용 (NPC·채집·상점)", lambda o: o.get("blueprintAsset", "").endswith("BP_Interactable.hbblueprint.json")),
    ("건물·벽", lambda o: o["id"].startswith(("PlayerHouse", "HouseBody", "LoanOffice", "Workshop", "Shop", "Wall", "Window", "Door", "Edge", "Mountain", "Mouth", "Stair"))),
    ("나무·장식", lambda o: o["id"].startswith(("Tree", "Bush", "Firewood", "HomeFence", "HomeBush", "Well", "FlowerBed", "Rug", "Plant"))),
    ("적 대기 풀", lambda o: any(t.startswith("Enemy.") for t in o.get("tags", []))),
    ("탄·골드·이펙트 풀", lambda o: any(t.startswith("Pool.") for t in o.get("tags", []))),
]


def outline(objects):
    out, groups = [], {}
    for o in objects:
        name = next((g for g, test in OUTLINE if test(o)), None)
        if name is None:  # 플레이어·카메라는 맨 위에 그대로
            out.append(o)
            continue
        if name not in groups:
            groups[name] = {"id": "Group_" + str(len(groups)), "name": name, "kind": "group", "group": "WORLD", "position": [0, 0, 0], "rotation": [0, 0, 0],
                            "scale": [1, 1, 1], "visible": True, "components": [transform()]}
        o["parent"] = groups[name]["id"]
    return out + [g for _, g in sorted(groups.items(), key=lambda kv: [n for n, _ in OUTLINE].index(kv[0]))] + [o for o in objects if "parent" in o]


LAYERS = {"back": {"Background", "Dungeon.Background"},
          "ground": {"Grass", "Floor", "World", "Dungeon.Floor"},
          "overlay": {"Plaza", "NorthRoad", "HomePath", "Street", "Rug", "Dungeon.Face", "Dungeon.Cap", "Dungeon.Arch"}}  # 아이디 또는 태그


HUB_Z = {"Background": -1, "Grass": -0.3, "Floor": -0.3, "Plaza": -0.25, "NorthRoad": -0.25, "HomePath": -0.25, "Street": -0.25}  # 깊이 (클수록 앞)


def write(name, objects):
    scene = copy.deepcopy(TEMPLATE)
    scene["sceneName"] = name
    # Y 정렬: 같은 순서(sortingOrder) 안에서는 발끝이 아래인 것이 앞에 그려짐 (캐릭터·적·기둥·가구 모두 순서 0)
    # 정렬 레이어 (앞의 것부터 그림): back 맵 밖 배경 → ground 바닥(잔디·던전 바닥·원룸 바닥) → overlay 바닥 위 덧칠(자갈길·벽·러그)
    # → default 캐릭터·적·장식 (발끝 Y 정렬). 새 엔진의 거리 정렬은 같은 레이어 안의 순서값을 무시해 큰 배경이 바닥을 덮었음
    scene["runtime"]["sortingLayers"] = [{"id": k, "name": k.capitalize(), "sortMode": "distance"} for k in ("back", "ground", "overlay")] + [
        {"id": "default", "name": "Default", "sortMode": "y"}]
    for o in objects:
        layer = next((k for k, ids in LAYERS.items() if o["id"] in ids or any(t in ids for t in o.get("tags", []))), None)
        if layer:
            for c in o["components"]:
                if c["type"] in ("SpriteRenderer", "TilemapRenderer"):
                    c["properties"]["sortingLayer"] = layer
                    if c["type"] == "SpriteRenderer" and o["id"] not in ("Rug",) and "Dungeon.Arch" not in o.get("tags", []):
                        c["properties"]["blendMode"] = "opaque"  # 불투명: 깊이(z)로 앞뒤가 정해져 편집기·패키지 정렬 차이에 흔들리지 않음
            if o["id"] in HUB_Z:
                o["position"][2] = HUB_Z[o["id"]]
    post = {"id": "PostFX", "name": "PostFX", "kind": "empty", "group": "WORLD", "position": [0, 0, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1],
            "visible": True, "components": [transform(), {"id": "post", "name": "PostProcessVolume", "type": "PostProcessVolume", "properties": {
                "enabled": True, "priority": 0, "bloomEnabled": True, "bloomThreshold": 1, "bloomStrength": 0.45, "bloomRadius": 0.35, "bloomResolutionScale": 0.5}}]}
    scene["objects"] = outline(objects + [post])
    (SCENES / f"{name}.hbscene.json").write_text(json.dumps(scene, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n")
    return len(objects)


PROP = "Assets/Sprites/Props/Prop_"


def glow(oid, x, y, size, order=-5):
    """빛 번짐: 반투명 주황 원을 불 뒤에 겹친다 (엔진에 블룸이 없어서 그림으로 흉내)"""
    o = sprite_obj(oid, "Assets/Sprites/FX/FX_Glow.png", x, y, order=order, width=size, height=size)
    comp(o, "SpriteRenderer")["properties"]["blendMode"] = "additive"  # 밑바닥을 밝게 더함
    return o


def torch(oid, x, y):
    """불꽃이 흔들리는 횃불 (Animator가 SA_Torch를 반복 재생) + 빛 번짐"""
    o = sprite_obj(oid, PROP + "Torch.png", x, y, order=-4)
    comp(o, "SpriteRenderer")["properties"].update(texture="", sprite="Assets/Sprites/Props/S_Torch_0.hbsprite.json", emissiveIntensity=1.5)  # 블룸으로 불꽃이 번짐
    o["components"].append({"id": "animator", "name": "Animator", "type": "Animator", "properties": {
        "enabled": True, "clip": "Assets/Animations/SA_Torch.hbspriteanimation.json", "playOnStart": True, "loop": True, "speed": 1}})
    return [o, glow(oid + "Glow", x, y + 0.35, 3.5)]


def tiled(oid, texture, order, collider):
    """C++ Dungeon이 옮기고 크기를 바꿔 까는 반복 무늬 조각 (바닥·벽 윗면·북쪽 벽면). 충돌 크기도 C++가 맞춤"""
    o = sprite_obj(oid, texture, 0, 0, order=order, collider=(0.5, 0.5, 0) if collider else None, width=4, height=4)
    comp(o, "SpriteRenderer")["properties"]["drawMode"] = "tiled"
    return o


def background(oid, x, y, w, h):
    """맵 밖을 메우는 어두운 돌 무늬 (벽 윗면 텍스처를 어둡게, 가장 뒤)"""
    o = tiled(oid, "Assets/Tiles/T_DungeonCap.png", -30, False)
    o["position"] = [x, y, -0.3]
    comp(o, "SpriteRenderer")["properties"].update(width=w, height=h, color=[0.32, 0.32, 0.38, 1])  # 벽 윗면보다 어둡게 (벽 테두리가 보이게)
    return o


def parked(objects, tag, count, make):
    """풀: 화면 밖(y -200)에 세워 둔 같은 오브젝트 count개. C++가 태그로 찾아 옮겨 씀 (실행 중 생성은 끊김)"""
    for k in range(count):
        o = make(f"{tag.split('.')[-1]}{k}")
        o["position"] = [-60 + (k % 30) * 4, -200 - (k // 30) * 6, o["position"][2]]
        o["tags"] = [tag]
        objects.append(o)


def dungeon_scene(director_bp="BP_TopDownShooter"):
    """던전 장면 하나. 방 배치는 들어올 때마다 C++(Dungeon.h)가 데이터 에셋(DA_Floor·DT_Rooms)으로 무작위로 만든다.
    여기엔 바닥·벽·문·장식·상호작용 대상을 넉넉히 화면 밖에 놓아 둘 뿐이다."""
    objects = base_objects(director_bp, (0, 0))
    objects.append(bp_obj("Room", "BP_RoomInfo", 0, 0, {"Index": 0, "Kind": "Dungeon"}))
    T = "Assets/Tiles/"
    parked(objects, "Dungeon.Background", 1, lambda i: background(i, 0, 0, 4, 4))
    parked(objects, "Dungeon.Floor", 28, lambda i: tiled(i, T + "T_DungeonFloor.png", -12, False))
    parked(objects, "Dungeon.Cap", 100, lambda i: tiled(i, T + "T_DungeonCap.png", -9, True))
    parked(objects, "Dungeon.Face", 36, lambda i: tiled(i, T + "T_DungeonFace.png", -10, True))
    parked(objects, "Dungeon.Arch", 14, lambda i: sprite_obj(i, PROP + "Archway.png", 0, 0, order=-8, width=4, height=3))
    parked(objects, "Dungeon.Gate", 4, lambda i: sprite_obj(i, PROP + "Portcullis.png", 0, 0, order=-7, collider=(2, 0.5, -1.0), width=4, height=3))
    parked(objects, "Dungeon.GateSide", 4, lambda i: sprite_obj(i, PROP + "GateSide.png", 0, 0, order=0, collider=(0.5, 2, 0)))
    parked(objects, "Dungeon.Torch", 26, lambda i: torch(i, 0, 0)[0])
    parked(objects, "Dungeon.Glow", 26, lambda i: glow(i, 0, 0, 3.5))
    parked(objects, "Dungeon.Banner", 12, lambda i: sprite_obj(i, PROP + "Banner.png", 0, 0, order=-8))
    parked(objects, "Dungeon.Pillar", 16, lambda i: sprite_obj(i, PROP + "Pillar.png", 0, 0, order=0, collider=(0.35, 0.25, -0.6)))
    # 전투방 엄폐물 (Dungeon::Build의 배치 6가지). 충돌은 그림 아랫부분만
    for tag, file, count, col in (("Crate", "Crates2", 14, (0.45, 0.3, -0.5)), ("Barrel", "Barrel2", 10, (0.4, 0.25, -0.4)),
                                  ("LowWall", "LowWall", 22, (0.8, 0.3, -0.25)), ("Statue", "Statue", 8, (0.45, 0.3, -0.6)), ("Chest", "GoldChest", 2, (0.55, 0.3, -0.3))):
        parked(objects, "Dungeon." + tag, count, lambda i, f=file, c=col: sprite_obj(i, PROP + f + ".png", 0, 0, order=0, collider=c))
    for name, count in (("Rubble", 10), ("Bones", 10), ("GoldPile", 6)):
        parked(objects, "Dungeon." + ("Gold" if name == "GoldPile" else name), count, lambda i, n=name: sprite_obj(i, PROP + n + ".png", 0, 0, order=-2))
    parked(objects, "Dungeon.Stairs", 1, lambda i: sprite_obj(i, "Assets/Sprites/Prop_DungeonEntrance.png", 0, 0, order=-2))
    # 채집방·상점 상호작용 대상: C++가 그 방으로 옮김
    for k, (oid, texture, kind, price) in enumerate([("Ore", "Assets/Sprites/Prop_Ore.png", "Ore", 0), ("Herb", "Assets/Sprites/Prop_Herb.png", "Herb", 0),
                                                     ("Blacksmith", "Assets/Sprites/NPC_Blacksmith.png", "Smith", 20), ("Stall", "Assets/Sprites/Prop_Stall.png", "Stall", 15)]):
        objects.append(interactable(oid, texture, -20 + k * 6, -230, kind, price=price, solid=kind in ("Smith", "Stall")))
    parked(objects, "Pool.Warn", 3, lambda i: sprite_obj(i, "Assets/Sprites/FX/FX_Warning.png", 0, 0, order=-3, width=4, height=1.4))  # 보스 돌진 예고선
    # 적 풀: 웨이브·소환·귀환 때 C++가 꺼내 씀 (태그 Enemy.기호 = BP_AuricRules.Enemies). 엔진 풀(PooledActor)은 꺼 둔 채 시작하므로 켜서 놓음
    for code, name, count in (("S", "Skeleton", 10), ("M", "SkeletonMage", 6), ("C", "SkeletonCaptain", 1)):
        for k in range(count):
            objects.append(bp_obj(f"{name}{k}", f"Enemies/BP_{name}", -60 + k * 4 + (40 if code != "S" else 0), -300 - (k % 2) * 4,
                                  components={"pool": {"initiallyActive": True}}, tags=["Enemy." + code]))
    # 탄·골드·이펙트 풀 (TopDownShooter::Prewarm)
    for tag, prefab, count in (("Pool.EnemyShot", "PF_EnemyShot", 32), ("Pool.PlayerShot", "PF_PlayerShot", 16), ("Pool.Coin", "PF_Coin", 16), ("Pool.Fx", "PF_Fx", 32)):
        base = json.loads((ASSETS / f"Prefabs/{prefab}.hbprefab.json").read_text(encoding="utf-8"))["objects"][0]
        for k in range(count):
            o = copy.deepcopy(base)
            o.update(id=f"{prefab[3:]}{k}", name=f"{prefab[3:]}{k}", position=[-60 + k % 30 * 4, -260 - k // 30 * 2, 0.15], tags=[tag])
            o["components"] = [comp_ for comp_ in o["components"] if comp_["type"] != "PooledActor"]  # 켜 둔 채 화면 밖에 세워 둠 (C++ Take/Give)
            objects.append(o)
    return objects


counts = {"Dungeon": write("Dungeon", dungeon_scene())}
for name in ("Test_Valen", "Test_Sherry", "Test_Alea", "Test_Boss"):  # 검사용: 캐릭터·던전 씨앗 고정 (tools/check_demo.mjs)
    write(name, dungeon_scene("BP_" + name))
for old in [f"Scenes/Dungeon_{i}.hbscene.json" for i in range(5)] + ["Scenes/Test_Gather.hbscene.json"] + [f"Tilemaps/TM_Dungeon_{i}.hbtilemap.json" for i in range(5)]:
    (ASSETS / old).unlink(missing_ok=True)  # 예전 고정 방 장면


# ---- 거점 (기획서 3-1): 빚쟁이 마을의 야외. 광장(가운데, 부채 전광판) · 서쪽 내 집(들어가면 원룸 장면) · 동쪽 NPC 거리
#      · 북쪽 높은 계단 위 황금 산의 마몬의 입(던전 입구). 땅은 잔디·자갈·흙길 반복 무늬, 건물은 정면 그림 + 바닥 충돌
TOWN = "Assets/Sprites/Town/"
EXIT_Y = 21


def ground(oid, texture, x0, y0, x1, y1, order):
    o = sprite_obj(oid, texture, (x0 + x1) / 2, (y0 + y1) / 2, order=order, width=x1 - x0, height=y1 - y0)
    comp(o, "SpriteRenderer")["properties"]["drawMode"] = "tiled"
    o["position"][2] = -0.25
    return o


def block(oid, x0, y0, x1, y1):
    """보이지 않는 벽 (마을 바깥 경계·건물 몸통)"""
    o = copy.deepcopy(objs["Enemy0"])
    o.update(id=oid, name=oid, position=[(x0 + x1) / 2, (y0 + y1) / 2, 0])
    o["components"] = [c for c in o["components"] if c["type"] in ("Transform", "BoxCollider2D")]
    comp(o, "BoxCollider2D")["properties"].update(trigger=False, layer=0, mask=4294967295, extent=[(x1 - x0) / 2, (y1 - y0) / 2, 0.5], center=[0, 0, 0])
    return o


def standing(oid, file, x, base, depth=0.8, solid=True):
    """바닥(base y)에 선 물체: 그림 아래가 base에 오고, 충돌은 아랫부분 depth m만"""
    w, h = size_of(file)
    return sprite_obj(oid, file, x, base + h / 2, order=0, collider=(w * 0.42, depth / 2, -h / 2 + depth / 2) if solid else None)


hub = base_objects(at=(0, -4))
hub += [background("Background", 10, 8, 150, 110),
        ground("Grass", "Assets/Tiles/T_TownGrass.png", -54, -30, 74, 34, -14),  # 카메라가 경계 끝까지 가도 잔디가 보이게 넉넉히
        ground("Plaza", "Assets/Tiles/T_TownCobble.png", -12, -9, 12, 9, -13),
        ground("NorthRoad", "Assets/Tiles/T_TownCobble.png", -2.5, 9, 2.5, 17, -13),
        ground("HomePath", "Assets/Tiles/T_TownDirt.png", -27, -1.5, -12, 1.5, -13),
        ground("Street", "Assets/Tiles/T_TownCobble.png", 12, -3.5, 57, 3.5, -13)]
hub.append(bp_obj("Room", "BP_RoomInfo", 0, 0, {"Index": -1, "Kind": "Hub", "ExitY": EXIT_Y}))
hub += [start("StairTop", 0, EXIT_Y - 1.2), start("HomeDoor", -24, -0.6)]
# 북쪽: 높은 계단 → 황금 산의 마몬의 입 (입 안쪽 y > EXIT_Y이면 던전)
mw, mh = size_of(TOWN + "Mountain.png")
hub += [sprite_obj("Mountain", TOWN + "Mountain.png", 0, 19 + mh / 2, order=-6),
        sprite_obj("Stairs", TOWN + "Stairs.png", 0, 17 + size_of(TOWN + "Stairs.png")[1] / 2 - 0.4, order=-7),
        block("MountainL", -mw / 2, 19.5, -2.1, 32), block("MountainR", 2.1, 19.5, mw / 2, 32), block("MouthTop", -2.1, EXIT_Y + 2.5, 2.1, 32),
        block("StairL", -3, 15.5, -2.2, 19.5), block("StairR", 2.2, 15.5, 3, 19.5)]
hub.append(interactable("Entrance", "Assets/UI/Map/map_link.png", 0, EXIT_Y - 0.3, "Entrance", "마몬의 입 - 황금 던전 입구", solid=False))
# 광장
CLOSED, VACATION, PREP = "Assets/Sprites/Prop_ClosedShop.png", "휴가 중입니다. 빚쟁이 여러분 다음에 또 오세요", "가게 개장 준비 중"
hub.append(interactable("DebtBoard", "Assets/Sprites/Prop_DebtBoard.png", 0, 5, "DebtBoard"))
for k, (name, x, y, solid) in enumerate([("Lamp", -10.5, 7.5, True), ("Lamp", 10.5, 7.5, True), ("Lamp", -10.5, -7.5, True), ("Lamp", 10.5, -7.5, True),
                                         ("Lamp", -2.8, 14, True), ("Lamp", 2.8, 14, True),
                                         ("Bench", -6, -7.5, False), ("Bench", 6, -7.5, False), ("NoticeBoard", 5, 7.6, False)]):
    w, h = size_of(PROP + name + ".png")
    hub.append(sprite_obj(f"{name}{k}", PROP + name + ".png", x, y, order=0, collider=(w * 0.35, 0.25, -h / 2 + 0.3) if solid else None))
    if name == "Lamp":
        hub.append(glow(f"{name}{k}Glow", x, y + h / 2 - 0.4, 4, order=-2))
hub += [standing("Well", TOWN + "Well.png", -7, -4.5), standing("FlowerBedA", TOWN + "FlowerBed.png", -4, 7.2, solid=False),
        standing("FlowerBedB", TOWN + "FlowerBed.png", 8, -3, solid=False)]
# 서쪽: 내 집 (문 앞에서 E로 들어가면 원룸 장면)
hw_, hh_ = size_of(TOWN + "PlayerHouse.png")
hub += [sprite_obj("PlayerHouse", TOWN + "PlayerHouse.png", -24, 0.6 + hh_ / 2, order=0),
        block("HouseBody", -24 - hw_ / 2 + 0.2, 0.6, -24 + hw_ / 2 - 0.2, 4.5),
        interactable("HomeEnter", "Assets/UI/Map/map_link.png", -24, 1.4, "Home", solid=False),
        standing("Firewood", TOWN + "Firewood.png", -21, 0.4), standing("HomeFence1", TOWN + "Fence.png", -29.5, -1.8, 0.4),
        standing("HomeFence2", TOWN + "Fence.png", -18.5, -1.8, 0.4), standing("HomeBush", TOWN + "Bush.png", -27.5, 0.6, solid=False)]
# 동쪽 NPC 거리: 대부업 사무소(수금원)·인테리어 공방(세공사)·문 닫은 가게 넷
STREET = [("LoanOffice", 18, "Collector", "Assets/Sprites/NPC_Collector.png", "Collector", "수금원: 이번 주 이자는 아직이던데?", 0),
          ("Workshop", 27.5, "Interior", "Assets/Sprites/NPC_Interior.png", "Interior", "세공사: 다음 공사는 다음 시즌에!", 150),
          ("ShopBag", 35.5, "ClosedRental", CLOSED, "Note", "가방 렌탈 - " + VACATION, 0), ("ShopCharm", 41, "ClosedCharm", CLOSED, "Note", "부적 상점 - " + PREP, 0),
          ("ShopRecipe", 46.5, "ClosedRecipe", CLOSED, "Note", "제작서 상점 - " + PREP, 0), ("ShopRelic", 52, "ClosedRelic", CLOSED, "Note", "유물 감정소 - " + VACATION, 0)]
for name, x, npc, tex, kind, text, price in STREET:
    w, h = size_of(TOWN + name + ".png")
    hub += [sprite_obj(name, TOWN + name + ".png", x, 3.6 + h / 2, order=0), block(name + "Body", x - w / 2 + 0.2, 3.6, x + w / 2 - 0.2, 7.5),
            interactable(npc, tex, x + (0 if kind != "Note" else 1.6), 2.4, kind, text, price=price)]
# 나무·덤불·울타리 (마을 가장자리)
rng = random.Random(5)
spots = [(-34, 9), (-31, 13), (-36, -6), (-33, -12), (-16, 11), (-14, -12), (-6, 12), (7, 12), (15, -10), (21, -9), (27, -11), (34, -9), (40, -10),
         (47, -9), (54, -11), (58, 6), (13, 12), (-20, -10), (-27, 9), (31, 13), (45, 13)]
for k, (x, y) in enumerate(spots):
    file = TOWN + ("TreePine.png" if rng.random() < 0.45 else "TreeRound.png")
    hub.append(standing(f"Tree{k}", file, x, y, 0.6))
for k in range(8):
    hub.append(standing(f"Bush{k}", TOWN + "Bush.png", rng.uniform(-36, 58), rng.uniform(-14, -5), solid=False))
# 마을 바깥 경계
hub += [block("EdgeW", -42, -20, -37, 34), block("EdgeE", 59, -20, 64, 34), block("EdgeS", -42, -20, 64, -15), block("EdgeN1", -42, 15, -11, 34),
        block("EdgeN2", 11, 15, 64, 34)]
counts["Hub"] = write("Hub", hub)


# ---- 원룸 (기획서 3-1): 레벨마다 장면 하나. Lv1 좁고 낡은 방, Lv2(세공사 공사) 넓어지고 책상·러그·화분 추가
def home_scene(level):
    W, D = (4, 3) if level == 1 else (6, 4)  # 반너비, 반깊이 (m)
    objects = base_objects(at=(0, -D + 1.2))
    objects += [ground("Floor", "Assets/Tiles/T_HomeWood.png", -W, -D, W, D, -13), background("Background", 0, 0, 40, 30)]
    objects.append(bp_obj("Room", "BP_RoomInfo", 0, 0, {"Index": -2, "Kind": "Home", "ExitY": -D - 0.3}))
    ww, wh = size_of(TOWN + "HomeWall.png")
    for k, x in enumerate([-W + ww / 2 + i * ww for i in range(int(2 * W / ww + 0.99))]):
        objects.append(sprite_obj(f"Wall{k}", TOWN + "HomeWall.png", min(x, W - ww / 2), D + wh / 2, order=-9))
    objects += [sprite_obj("Window", TOWN + "HomeWindow.png", -W / 2, D + 1.6, order=-8),
                sprite_obj("Door", TOWN + "HomeDoor.png", 0, -D - 0.2, order=0),
                block("WallN", -W - 1, D, W + 1, D + 1), block("WallW", -W - 1, -D - 1, -W, D + 1), block("WallE", W, -D - 1, W + 1, D + 1),
                block("WallSL", -W, -D - 1, -1.2, -D), block("WallSR", 1.2, -D - 1, W, -D)]
    objects += [interactable("Sofa", "Assets/Sprites/Furniture_Sofa.png", -W + 2, D - 1.2, "Sofa", "푹신한 소파. 더는 바꿀 수 없다", price=50),
                interactable("Bed", "Assets/Sprites/Furniture_Bed.png", W - 1.8, D - 1.4, "Note", "삐걱거리는 침대. 오늘 밤도 빚 꿈을 꾸겠지"),
                interactable("Fridge", "Assets/Sprites/Furniture_Fridge.png", W - 0.9, -D + 1.6, "Note", "텅 빈 냉장고. 물 한 병뿐이다"),
                interactable("TV", "Assets/Sprites/Furniture_TV.png", -W + 1.2, -D + 1.4, "Note", "꺼진 TV. 화면에 비친 내 얼굴이 피곤해 보인다")]
    if level >= 2:
        objects += [sprite_obj("Window2", TOWN + "HomeWindow.png", W / 2, D + 1.6, order=-8),
                    sprite_obj("Rug", TOWN + "Rug.png", 0, 0.3, order=-11),
                    interactable("Desk", TOWN + "Desk.png", 2.2, D - 1.0, "Note", "책상 위 고지서. 이번 달 이자 납부일이 내일이다"),
                    standing("Plant", TOWN + "PottedPlant.png", -W + 0.7, -0.5)]
    return objects


for level in (1, 2):
    counts[f"Home_{level}"] = write(f"Home_{level}", home_scene(level))

(ASSETS / "Tilemaps/TM_Hub.hbtilemap.json").unlink(missing_ok=True)  # 예전 실내형 거점 타일맵
# 예전 생성기가 미리 이어 붙인 그림 (이제 타일맵이 씀)
for f in ASSETS.glob("Sprites/*.png"):
    if f.name.startswith(("Room_", "Plaza_", "Home_", "NpcZone_", "Stair_")):
        f.unlink()
print("장면:", counts)
