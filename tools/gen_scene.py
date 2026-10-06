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


def write(name, objects):
    scene = copy.deepcopy(TEMPLATE)
    scene["sceneName"] = name
    # Y 정렬: 같은 순서(sortingOrder) 안에서는 발끝이 아래인 것이 앞에 그려짐 (캐릭터·적·기둥·가구 모두 순서 0)
    scene["runtime"]["sortingLayers"] = [{"id": "default", "name": "Default", "sortMode": "y"}]
    # 블룸: 발광(emissiveIntensity)을 준 스프라이트만 번지게 임계값 1 (횃불·베기·불꽃·탄)
    post = {"id": "PostFX", "name": "PostFX", "kind": "empty", "group": "WORLD", "position": [0, 0, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1],
            "visible": True, "components": [transform(), {"id": "post", "name": "PostProcessVolume", "type": "PostProcessVolume", "properties": {
                "enabled": True, "priority": 0, "bloomEnabled": True, "bloomThreshold": 1, "bloomStrength": 0.7, "bloomRadius": 0.35, "bloomResolutionScale": 0.5}}]}
    scene["objects"] = objects + [post]
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
    parked(objects, "Dungeon.Floor", 18, lambda i: tiled(i, T + "T_DungeonFloor.png", -12, False))
    parked(objects, "Dungeon.Cap", 72, lambda i: tiled(i, T + "T_DungeonCap.png", -9, True))
    parked(objects, "Dungeon.Face", 26, lambda i: tiled(i, T + "T_DungeonFace.png", -10, True))
    parked(objects, "Dungeon.Arch", 10, lambda i: sprite_obj(i, PROP + "Archway.png", 0, 0, order=-8, width=4, height=3))
    parked(objects, "Dungeon.Gate", 4, lambda i: sprite_obj(i, PROP + "Portcullis.png", 0, 0, order=-7, collider=(2, 0.5, -1.0), width=4, height=3))
    parked(objects, "Dungeon.GateSide", 4, lambda i: sprite_obj(i, PROP + "PortcullisSide.png", 0, 0, order=0, collider=(0.5, 2, 0), width=1.2, height=4))
    parked(objects, "Dungeon.Torch", 22, lambda i: torch(i, 0, 0)[0])
    parked(objects, "Dungeon.Glow", 22, lambda i: glow(i, 0, 0, 3.5))
    parked(objects, "Dungeon.Banner", 12, lambda i: sprite_obj(i, PROP + "Banner.png", 0, 0, order=-8))
    parked(objects, "Dungeon.Pillar", 24, lambda i: sprite_obj(i, PROP + "Pillar.png", 0, 0, order=0, collider=(0.35, 0.25, -0.6)))
    for name, count in (("Rubble", 16), ("Bones", 16), ("GoldPile", 8)):
        parked(objects, "Dungeon." + ("Gold" if name == "GoldPile" else name), count, lambda i, n=name: sprite_obj(i, PROP + n + ".png", 0, 0, order=-2))
    parked(objects, "Dungeon.Stairs", 1, lambda i: sprite_obj(i, "Assets/Sprites/Prop_DungeonEntrance.png", 0, 0, order=-2))
    # 채집방·상점 상호작용 대상: C++가 그 방으로 옮김
    for k, (oid, texture, kind, price) in enumerate([("Ore", "Assets/Sprites/Prop_Ore.png", "Ore", 0), ("Herb", "Assets/Sprites/Prop_Herb.png", "Herb", 0),
                                                     ("Blacksmith", "Assets/Sprites/NPC_Blacksmith.png", "Smith", 20), ("Stall", "Assets/Sprites/Prop_Stall.png", "Stall", 15)]):
        objects.append(interactable(oid, texture, -20 + k * 6, -230, kind, price=price, solid=kind in ("Smith", "Stall")))
    # 탄·골드·이펙트 풀 (TopDownShooter::Prewarm)
    for tag, prefab, count in (("Pool.EnemyShot", "PF_EnemyShot", 32), ("Pool.PlayerShot", "PF_PlayerShot", 16), ("Pool.Coin", "PF_Coin", 16), ("Pool.Fx", "PF_Fx", 24)):
        base = json.loads((ASSETS / f"Prefabs/{prefab}.hbprefab.json").read_text(encoding="utf-8"))["objects"][0]
        for k in range(count):
            o = copy.deepcopy(base)
            o.update(id=f"{prefab[3:]}{k}", name=f"{prefab[3:]}{k}", position=[-60 + k % 30 * 4, -260 - k // 30 * 2, 0.15], tags=[tag])
            o["components"] = [comp_ for comp_ in o["components"] if comp_["type"] != "PooledActor"]  # 켜 둔 채 화면 밖에 세워 둠 (C++ Take/Give)
            objects.append(o)
    return objects


counts = {"Dungeon": write("Dungeon", dungeon_scene())}
for name in ("Test_Valen", "Test_Sherry", "Test_Alea"):  # 검사용: 캐릭터·던전 씨앗 고정 (tools/check_demo.mjs)
    write(name, dungeon_scene("BP_" + name))
for old in [f"Scenes/Dungeon_{i}.hbscene.json" for i in range(5)] + ["Scenes/Test_Gather.hbscene.json"] + [f"Tilemaps/TM_Dungeon_{i}.hbtilemap.json" for i in range(5)]:
    (ASSETS / old).unlink(missing_ok=True)  # 예전 고정 방 장면


# ---- 거점 (기획서 3-1, 기획팀 10/05: 분위기 위주) ----
# 광장(가운데) · 원룸(서쪽, 나무 바닥) · NPC 구역(동쪽) · 계단 통로(북쪽, 끝에 던전 입구)
EXIT_Y = 21
hub = base_objects(at=(0, -4))
hub.append(tilemap("TM_Hub", [(-12, -8, 12, 8, "plaza"), (-2, 8, 2, EXIT_Y + 2, "plaza"),
                              (-25, -6, -13, 6, "wood"), (-13, -2, -12, 2, "wood"),
                              (13, -8, 29, 8, "plaza"), (12, -2, 13, 2, "plaza")], "hub"))
hub.append(bp_obj("Room", "BP_RoomInfo", 0, 0, {"Index": -1, "Kind": "Hub", "ExitY": EXIT_Y}))
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
    hub.append(sprite_obj(f"{name}{k}", PROP + name + ".png", x, y, order=0, collider=(w * 0.35, 0.25, -h / 2 + 0.3) if solid else None))
    if name == "Lamp":
        hub.append(glow(f"{name}{k}Glow", x, y + h / 2 - 0.4, 4, order=-2))
counts["Hub"] = write("Hub", hub)

# 예전 생성기가 미리 이어 붙인 그림 (이제 타일맵이 씀)
for f in ASSETS.glob("Sprites/*.png"):
    if f.name.startswith(("Room_", "Plaza_", "Home_", "NpcZone_", "Stair_")):
        f.unlink()
print("장면:", counts)
