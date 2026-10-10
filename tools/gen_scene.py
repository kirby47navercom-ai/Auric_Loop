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
import zlib
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


NPC_PPU = json.loads((ASSETS / "Sprites/npc_ppu.json").read_text(encoding="utf-8"))  # tools/make_npc_sd.py: 해상도를 줄이지 않고 키를 맞춘 NPC


def ppu_of(texture):
    return NPC_PPU.get(texture.removeprefix("Assets/"), PPU)


def size_of(texture):
    w, h = Image.open(ASSETS / texture.removeprefix("Assets/")).size
    return w / ppu_of(texture), h / ppu_of(texture)


SHADOWED = set(json.loads((ASSETS / "Sprites/shadowed.json").read_text(encoding="utf-8")))  # tools/make_shadows.py: 위아래 8px 여백


def pad_of(texture):
    """그림자 여백(m). 이 그림의 내용 맨 아래(밑동)는 그림 맨 아래보다 이만큼 위"""
    return round(8 * ppu_of(texture) / PPU) / ppu_of(texture) if texture.removeprefix("Assets/") in SHADOWED else 0


def animate(o, clip, speed=1.0, sprite=None):
    """Animator로 반복 재생 (흔들림·깜빡임·숨쉬기). 엔진이 돌리므로 C++ 비용 없음. speed를 조금씩 달리해 서로 박자가 어긋나게"""
    sp = comp(o, "SpriteRenderer")["properties"]
    if sprite:
        sp.update(sprite=sprite, texture="")
    o["components"].append({"id": "animator", "name": "Animator", "type": "Animator", "properties": {
        "enabled": True, "clip": f"Assets/Animations/{clip}.hbspriteanimation.json", "playOnStart": True, "loop": True, "speed": round(speed, 3)}})
    return o


def particles(oid, x, y, z=0.2, **props):
    """엔진 입자 (연기·잎·먼지·불씨·반짝임). props는 ParticleSystem 속성"""
    base = {"enabled": True, "playOnStart": True, "duration": 5, "loop": True, "startDelay": 0, "lifetime": 1, "lifetimeMax": 2, "speed": 0,
            "size": 0.1, "endSize": 1, "color": [1, 1, 1, 1], "endColor": [1, 1, 1, 0], "gravity": 0, "simulationSpace": "world",
            "maxParticles": 200, "seed": zlib.crc32(oid.encode()) % 100000, "rate": 1, "rateOverDistance": 0, "burstCount": 0, "burstTime": 0, "burstCycles": 1,
            "burstInterval": 1, "burstProbability": 1, "shape": "box", "radius": 0.2, "angle": 20, "extent": [0.3, 0.3, 0], "force": [0, 0, 0],
            "drag": 0, "texture": "", "blend": "alpha", "sortingLayer": "default", "sortingOrder": 10, "maskInteraction": "none", "sortMode": "none",
            "minParticleSize": 0, "maxParticleSize": 1}
    base.update(props)
    return {"id": oid, "name": oid, "kind": "empty", "group": "WORLD", "position": [x, y, z], "rotation": [0, 0, 0], "scale": [1, 1, 1],
            "visible": True, "components": [transform(), {"id": "particles", "name": "ParticleSystem", "type": "ParticleSystem", "properties": base}]}


AMB = "Assets/Sprites/Ambient/"
LEAVES = dict(texture=AMB + "P_Leaf.png", rate=0.18, lifetime=3, lifetimeMax=5, size=0.14, force=[0.35, -0.55, 0], drag=1.4, maxParticles=12)
SMOKE = dict(texture=AMB + "P_Smoke.png", rate=1.6, lifetime=2.6, lifetimeMax=3.6, size=0.3, endSize=2.6, color=[0.86, 0.86, 0.9, 0.55],
             endColor=[0.8, 0.8, 0.86, 0], force=[0.18, 0.7, 0], drag=0.6, shape="circle", radius=0.08, sortingOrder=30, maxParticles=20)
SPARKLE = dict(texture=AMB + "P_Sparkle.png", blend="additive", rate=2.5, lifetime=1.2, lifetimeMax=2.2, size=0.16, endSize=0.3,
               color=[1, 0.9, 0.5, 1], endColor=[1, 0.7, 0.2, 0], force=[0, 0.35, 0], drag=0.5, maxParticles=16)
EMBERS = dict(texture=AMB + "P_Ember.png", blend="additive", rate=2.2, lifetime=0.7, lifetimeMax=1.3, size=0.07, endSize=0.4,
              color=[1, 0.75, 0.3, 1], endColor=[1, 0.2, 0, 0], force=[0.05, 1.0, 0], drag=0.8, shape="circle", radius=0.06, maxParticles=10,
              simulationSpace="local")
DUST = dict(texture=AMB + "P_Dust.png", blend="additive", rate=8, lifetime=4, lifetimeMax=7, size=0.09, endSize=1, color=[1, 0.95, 0.8, 0.7],
            endColor=[1, 0.95, 0.8, 0], force=[0.06, 0.05, 0], drag=1, extent=[13, 7.5, 0], sortingOrder=40, maxParticles=60)


def critter(oid, tag, sprite, clip, x, y):
    """C++ Ambient가 움직이는 생물 (새·나비·박쥐·쥐·구름 그늘)"""
    o = sprite_obj(oid, AMB + sprite + ".png", x, y, order=0)
    animate(o, clip, 1, f"{AMB}S_{sprite}.hbsprite.json") if clip else None
    o["tags"] = [tag]
    return o


def sprite_obj(oid, texture, x, y, order=-1, collider=None, pooled=None, width=None, height=None):
    """장식·문 같은 그림 오브젝트. collider=(반너비, 반높이, 중심 y 오프셋)"""
    o = copy.deepcopy(objs["Enemy0"])
    o.update(id=oid, name=oid, position=[x, y, 0.05])
    keep = {"Transform", "SpriteRenderer"} | ({"BoxCollider2D"} if collider else set()) | ({"PooledActor"} if pooled is not None else set())
    o["components"] = [c for c in o["components"] if c["type"] in keep]
    w, h = size_of(texture)
    comp(o, "SpriteRenderer")["properties"].update(texture=texture, sprite="", width=width or w, height=height or h, pixelsPerUnit=ppu_of(texture),
                                                   sortingOrder=order, color=[1, 1, 1, 1], useCustomSize=width is not None, sortPoint="feet")
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
                  {"sprite": {"texture": texture, "width": w, "height": h, "pixelsPerUnit": ppu_of(texture)}, "collider": col})


def start(oid, x, y):
    o = {"id": oid, "name": oid, "kind": "playerStart", "group": "WORLD", "position": [x, y, 0.1], "rotation": [0, 0, 0], "scale": [1, 1, 1],
         "visible": True, "components": [transform()]}
    return o


def base_objects(director_bp="BP_TopDownShooter", at=(0, 0)):
    player = copy.deepcopy(objs["Player"])
    player["position"] = [at[0], at[1], 0.1]
    comp(player, "TopDownMovement2D")["properties"]["speed"] = 6
    # 충돌 층: 0 벽·장식, 1 플레이어, 2 적, 3 탄. 플레이어와 적은 서로 밀지 않는다 (접촉하면 피해만, 엔터 더 건전처럼)
    # 벽·물체에 막히는 건 발 둘레만 (그림 원점은 발끝 0.95m 위). 머리는 벽 윗면·나무 잎 뒤로 들어간다
    comp(player, "CapsuleCollider2D")["properties"].update(layer=1, mask=0xFFFFFFFF & ~(1 << 2), center=[0, -0.72, 0], radius=0.32, height=0.64)
    hitbox = copy.deepcopy(comp(player, "CapsuleCollider2D"))  # 적 탄이 맞는 범위: 몸통 원 (엔진 투사체는 CircleCollider2D를 먼저 봄)
    hitbox.update(id="hitbox", name="CircleCollider2D", type="CircleCollider2D")
    hitbox["properties"] = {k: v for k, v in hitbox["properties"].items() if k != "height"}
    hitbox["properties"].update(center=[0, -0.15, 0], radius=0.42, trigger=True, mask=0)
    player["components"].append(hitbox)
    comp(player, "Rigidbody2D")["properties"]["freezeRotation"] = [1, 1, 1]  # 부딪혀도 돌지 않게 (예전엔 z가 풀려 맞으면 캐릭터가 빙글 돌았음)
    comp(player, "SpriteRenderer")["properties"].update(sprite="Assets/Sprites/Valen/S_Valen_S_Idle_0.hbsprite.json", texture="", color=[1, 1, 1, 1],
                                                        useCustomSize=False, sortingOrder=0, sortPoint="feet")
    cam = copy.deepcopy(objs["Camera"])
    cam["tags"] = ["MainCamera"]
    cam["position"] = [at[0], at[1], 12]
    # 720p에서 도트 2배(1m = 64px). C++가 조준 쪽으로 끌어당기며 따라감
    comp(cam, "Camera")["properties"].update(orthographicSize=5.625, followTarget="", followOffset=[0, 0, 12])
    director = {"id": "Director", "name": "Director", "kind": "empty", "group": "WORLD", "position": [0, 0, 0], "rotation": [0, 0, 0],
                "scale": [1, 1, 1], "visible": True, "components": [transform()], "blueprintAsset": BP + director_bp + ".hbblueprint.json"}
    # 위젯은 움직이지 않는 빈 액터에 하나씩 (C++ TopDownShooter::UiOwnerOf). 엔진은 위젯 값 하나를 바꿀 때 그 액터의 위젯 전체를 복사하고,
    # 액터가 움직일 때마다 그 액터의 위젯 전체를 글자로 다시 만들어 넘긴다 (플레이어에 붙이면 매 프레임 → 쓰레기 수집으로 끊김)
    player["components"] = [c for c in player["components"] if c.get("type") != "UIWidget"]
    ui_hosts = []
    for asset, inst in (("W_TopDown", "HUD"), ("W_Front", "Front"), ("W_Fast", "Fast")):
        ui_hosts.append({"id": "UI_" + inst, "name": "UI_" + inst, "kind": "empty", "group": "WORLD", "position": [0, -900, 0], "rotation": [0, 0, 0],
                         "scale": [1, 1, 1], "visible": True, "tags": ["UI." + inst],
                         "components": [transform(), {"id": "ui-" + inst.lower(), "name": "UIWidget " + inst, "type": "UIWidget",
                                                      "properties": {"enabled": True, "asset": f"Assets/UI/{asset}.hbwidget.json", "instance": inst, "showOnStart": True}}]})
    shadow = sprite_obj("PlayerShadow", "Assets/Sprites/FX/FX_Shadow.png", 0, -0.95, order=5)  # 발밑 그림자: 플레이어 자식이라 같이 움직임
    shadow["parent"] = "Player"
    comp(shadow, "SpriteRenderer")["properties"]["sortingLayer"] = "overlay"
    # 손에 단 검 (발렌, tools/make_weapon_socket.py): C++가 매 프레임 손 위치로 옮기고 조준 각도 그림으로 바꿈. 다른 캐릭터면 멀리 치워 둠
    # 플레이어 자식으로 두면 스프라이트 에셋 그림이 그려지지 않아(엔진, 텍스처 그림인 그림자는 됨) 따로 둔다
    weapon = sprite_obj("PlayerWeapon", "Assets/Sprites/ValenSocket/sword.png", 0, -500, order=0)
    weapon.update(tags=["PlayerWeapon"])
    comp(weapon, "SpriteRenderer")["properties"].update(sprite="Assets/Sprites/ValenSocket/S_VS_Sword_F_0.hbsprite.json", texture="", useCustomSize=False)
    grip = copy.deepcopy(weapon)  # 검 손잡이 위 손가락 (앞·뒤·오른쪽을 볼 때)
    grip.update(id="PlayerGrip", name="PlayerGrip", tags=["PlayerGrip"])
    comp(grip, "SpriteRenderer")["properties"]["sprite"] = "Assets/Sprites/ValenSocket/S_VS_Grip_walk_0_1.hbsprite.json"
    return [player, shadow, weapon, grip, *ui_hosts, cam, director, bp_obj("Rules", "BP_AuricRules", 0, 0), start("PlayerStart", *at)]


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
        if name is None:  # 플레이어·카메라는 맨 위에 그대로 (이미 부모가 있는 것은 아래에서 부모 뒤에)
            if "parent" not in o:
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
    """벽 횃불 (아트팀 던전 부품 v2, tools/make_dungeon_parts.py) + 빛 번짐. 불꽃 흔들림은 뒤의 빛 번짐(SA_Glow)과 불씨 입자로"""
    o = sprite_obj(oid, PROP + "TorchWall.png", x, y, order=-4)
    comp(o, "SpriteRenderer")["properties"]["emissiveIntensity"] = 1.5  # 블룸으로 불꽃이 번짐
    o["components"].append(particles(oid + "Embers", 0, 0, **{**EMBERS, "sortingOrder": -3})["components"][1])  # 불씨 (횃불을 따라 움직임)
    return [o, animate(glow(oid + "Glow", x, y + 0.35, 3.5), "SA_Glow", 1, "Assets/Sprites/FX/S_FX_Glow_0.hbsprite.json")]


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


def shiny(o, name):
    """금 더미: 가끔 반짝임 (입자가 금 더미를 따라 움직임)"""
    if name == "GoldPile":
        o["components"].append(particles(o["id"] + "Shine", 0, 0, **{**SPARKLE, "rate": 0.9, "extent": [0.45, 0.25, 0], "force": [0, 0.15, 0],
                                                                       "simulationSpace": "local", "sortingOrder": 5})["components"][1])
    return o


def dungeon_scene(director_bp="BP_TopDownShooter"):
    """던전 장면 하나. 방 배치는 들어올 때마다 C++(Dungeon.h)가 데이터 에셋(DA_Floor·DT_Rooms)으로 무작위로 만든다.
    여기엔 바닥·벽·문·장식·상호작용 대상을 넉넉히 화면 밖에 놓아 둘 뿐이다."""
    objects = base_objects(director_bp, (0, 0))
    objects.append(bp_obj("Room", "BP_RoomInfo", 0, 0, {"Index": 0, "Kind": "Dungeon"}))
    T = "Assets/Tiles/"
    parked(objects, "Dungeon.Background", 1, lambda i: background(i, 0, 0, 4, 4))
    parked(objects, "Dungeon.Floor", 18, lambda i: tiled(i, T + "T_DungeonFloor.png", -12, False))
    parked(objects, "Dungeon.Cap", 64, lambda i: tiled(i, T + "T_DungeonCap.png", -9, True))
    parked(objects, "Dungeon.Face", 22, lambda i: tiled(i, T + "T_DungeonFace.png", -10, True))
    # 출입구 테 (아트팀 던전 부품 v2): 위 문 4x3.5m, 서·동 문 2.625x3.5m, 아래 문 4x2.7m (원래 그림의 1.33배, 문 폭 4m에 맞춤)
    parked(objects, "Dungeon.Arch", 8, lambda i: sprite_obj(i, PROP + "Archway.png", 0, 0, order=-8, width=4, height=3.5))
    parked(objects, "Dungeon.ArchW", 8, lambda i: sprite_obj(i, PROP + "ArchW.png", 0, 0, order=-8, width=2.625, height=3.5))
    parked(objects, "Dungeon.ArchE", 8, lambda i: sprite_obj(i, PROP + "ArchE.png", 0, 0, order=-8, width=2.625, height=3.5))
    parked(objects, "Dungeon.ArchS", 8, lambda i: sprite_obj(i, PROP + "ArchS.png", 0, 0, order=-8, width=4, height=2.71))
    parked(objects, "Dungeon.Gate", 4, lambda i: sprite_obj(i, PROP + "Portcullis.png", 0, 0, order=-7, collider=(2, 0.5, -1.0), width=4, height=3))
    parked(objects, "Dungeon.GateSide", 4, lambda i: sprite_obj(i, PROP + "GateSide.png", 0, 0, order=0, collider=(0.5, 2, 0)))
    parked(objects, "Dungeon.Torch", 18, lambda i: torch(i, 0, 0)[0])
    parked(objects, "Dungeon.Glow", 18, lambda i: animate(glow(i, 0, 0, 3.5), "SA_Glow", 0.8 + (int(i[4:]) % 5) * 0.1,
                                                         "Assets/Sprites/FX/S_FX_Glow_0.hbsprite.json"))
    parked(objects, "Dungeon.Banner", 8, lambda i: animate(sprite_obj(i, PROP + "Banner.png", 0, 0, order=-8), "SA_Banner",
                                                           0.85 + (int(i[6:]) % 4) * 0.1, PROP.rsplit("/", 1)[0] + "/S_Banner_0.hbsprite.json"))
    parked(objects, "Dungeon.Pillar", 16, lambda i: sprite_obj(i, PROP + "Pillar.png", 0, 0, order=0, collider=(0.4, 0.25, -1.125)))  # 1.1x2.75m, 밑동만 막음
    # 전투방 엄폐물 (Dungeon::Build의 배치 6가지). 충돌은 그림 아랫부분만
    # 상자는 홀수 번째를 상자 더미로 (아트팀 던전 부품 v2: 상자 1.5x1.75m·더미 1.5x2.2m·통 1.25x1.6m)
    for tag, file, count, col in (("Crate", "Crates2", 12, (0.6, 0.3, -0.575)), ("Barrel", "Barrel2", 10, (0.5, 0.25, -0.56)),
                                  ("LowWall", "LowWall", 20, (0.8, 0.3, -0.25)), ("Statue", "Statue", 8, (0.45, 0.3, -0.6)), ("Chest", "GoldChest", 2, (0.55, 0.3, -0.3))):
        parked(objects, "Dungeon." + tag, count, lambda i, f=file, c=col: sprite_obj(i, PROP + ("CrateStack" if f == "Crates2" and int(i[5:]) % 2 else f) + ".png", 0, 0, order=0,
                                                                                    collider=(c[0], c[1], -0.78) if f == "Crates2" and int(i[5:]) % 2 else c))
    # 바닥 잔해: 돌무더기·작은 돌·양동이를 번갈아
    parked(objects, "Dungeon.Rubble", 10, lambda i: sprite_obj(i, PROP + ("Rubble", "SmallRock", "Bucket")[int(i[6:]) % 3] + ".png", 0, 0, order=-2))
    for name, count in (("Bones", 10), ("GoldPile", 6)):
        parked(objects, "Dungeon." + ("Gold" if name == "GoldPile" else name), count, lambda i, n=name: shiny(sprite_obj(i, PROP + n + ".png", 0, 0, order=-2), n))
    for n in ("Move", "Attack", "Dodge", "Interact", "Craft", "Bag", "Return"):  # 튜토리얼 표지판 (시작 방, C++ Dungeon::Build가 놓음)
        o = sprite_obj("Sign" + n, "Assets/Sprites/Props/Sign_" + n + ".png", 0, -230, order=0, collider=(0.15, 0.12, -1.2))  # 기둥만 막음
        o["tags"] = ["Dungeon.Sign"]
        objects.append(o)
    parked(objects, "Dungeon.Stairs", 1, lambda i: sprite_obj(i, "Assets/Sprites/Prop_DungeonEntrance.png", 0, 0, order=-2))
    # 채집방·상점 상호작용 대상: C++가 그 방으로 옮김
    for k, (oid, texture, kind, price) in enumerate([("Ore", "Assets/Sprites/Prop_Ore.png", "Ore", 0), ("Herb", "Assets/Sprites/Prop_Herb.png", "Herb", 0),
                                                     ("Blacksmith", "Assets/Sprites/NPC_Blacksmith.png", "Smith", 20), ("Stall", "Assets/Sprites/Prop_Stall.png", "Stall", 15)]):
        objects.append(interactable(oid, texture, -20 + k * 6, -230, kind, price=price, solid=kind in ("Smith", "Stall")))
    # 살아 있는 던전: 떠다니는 먼지(카메라를 따라감), 가끔 방을 가로지르는 박쥐, 벽 밑을 달리는 쥐 (C++ Ambient)
    dust = particles("DungeonDust", 0, 0, **DUST)
    dust["parent"] = "Camera"
    dust["position"][2] = -11.8  # 카메라(z 12) 앞쪽 바닥 높이에
    objects.append(dust)
    for k in range(2):
        objects += [critter(f"Bat{k}", "Ambient.Bat", "Bat_0", "SA_Bat", 0, -400), critter(f"Rat{k}", "Ambient.Rat", "Rat_0", "SA_Rat", 0, -400)]
    # 공격 범위 예고 (C++ Warn·WarnCircle): 테두리 + 시간에 따라 차오르는 안쪽. 바닥 위·캐릭터 아래 층
    def warn(i, file, w, h, order, sliced=False):
        o = sprite_obj(i, "Assets/Sprites/FX/" + file, 0, 0, order=order, width=w, height=h)
        sp = comp(o, "SpriteRenderer")["properties"]
        sp.update(sortingLayer="overlay", sortPoint="center")
        if sliced:
            sp.update(drawMode="sliced", borderLeft=3, borderRight=3, borderTop=3, borderBottom=3)
        return o
    parked(objects, "Pool.Warn", 10, lambda i: warn(i, "FX_WarnBand.png", 4, 1.4, 30, sliced=True))
    parked(objects, "Pool.WarnFill", 10, lambda i: warn(i, "FX_WarnFill.png", 1, 1.4, 31))
    parked(objects, "Pool.WarnCircle", 8, lambda i: warn(i, "FX_WarnCircle.png", 3, 3, 30))
    parked(objects, "Pool.WarnCircleFill", 8, lambda i: warn(i, "FX_WarnCircleFill.png", 1, 1, 31))
    # 적 풀: 웨이브·소환·귀환 때 C++가 꺼내 씀 (태그 Enemy.기호 = BP_AuricRules.Enemies). 엔진 풀(PooledActor)은 꺼 둔 채 시작하므로 켜서 놓음
    for code, name, count in (("S", "Skeleton", 10), ("M", "SkeletonMage", 6), ("C", "SkeletonCaptain", 1), ("E", "Eyeball", 6)):
        for k in range(count):
            objects.append(bp_obj(f"{name}{k}", f"Enemies/BP_{name}", -60 + k * 4 + (40 if code != "S" else 0), -300 - (k % 2) * 4,
                                  components={"pool": {"initiallyActive": True}}, tags=["Enemy." + code]))
    # 눈알 레이저 조각 (TopDownShooter::FireLaser): 몸통(길이만큼 늘림)과 시작·끝을 따로 (늘린 크기가 다른 이펙트에 남지 않게)
    eye = "Assets/Sprites/Enemies/Eyeball/"
    for tag, count, spr in (("Pool.LaserBody", 6, "S_Laser_Body_0"), ("Pool.LaserCap", 12, "S_Laser_Start_0")):
        for k in range(count):
            o = sprite_obj(f"{tag.split('.')[1]}{k}", eye + "laser_body.png", -60 + k * 3, -260, order=6)
            comp(o, "SpriteRenderer")["properties"].update(texture="", sprite=eye + spr + ".hbsprite.json", useCustomSize=False, blendMode="additive")
            o["tags"] = [tag]
            objects.append(o)
    # 탄·골드·이펙트 풀 (TopDownShooter::Prewarm)
    for tag, prefab, count in (("Pool.EnemyShot", "PF_EnemyShot", 32), ("Pool.PlayerShot", "PF_PlayerShot", 16), ("Pool.Coin", "PF_Coin", 16), ("Pool.Fx", "PF_Fx", 64)):
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


# ---- 거점 (기획서 3-1): 빚쟁이 마을. 숲으로 둘러싸인 아늑한 마을이 되게 가장자리를 나무로 막고, 카메라는 그 안만 보여 줌
#      광장(가운데, 빚 전광판) · 서쪽 내 집(원룸) · 동쪽 가게 거리 · 북쪽 계단 위 황금 산의 마몬의 입(던전 입구)
#      모든 것이 조금씩 움직인다: 나무·덤불·꽃·풀포기 흔들림, 가로등 빛 깜빡임, 굴뚝 연기, 떨어지는 잎, 산 입의 금가루,
#      새(다가가면 날아감)·나비·구름 그늘(C++ Ambient), NPC 숨쉬기
TOWN = "Assets/Sprites/Town/"
EXIT_Y = 21
WEST, EAST, SOUTH, NORTH = -31.5, 54.0, -9.5, 15.2  # 걸을 수 있는 범위 (북쪽은 계단·산 입 제외)


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


def standing(oid, file, x, base, depth=0.8, solid=True, half_width=None, sway=None, speed=1.0):
    """바닥(base y)에 선 물체: 밑동(그림자 여백 위)이 base에 오고, 충돌은 아랫부분 depth m만. sway: 흔들림 클립 이름"""
    w, h = size_of(file)
    pad = pad_of(file)
    o = sprite_obj(oid, file, x, base + h / 2 - pad, order=0,
                   collider=(half_width or w * 0.42, depth / 2, -h / 2 + pad + depth / 2) if solid else None)
    if sway:
        animate(o, "SA_" + sway, speed, f"{file.rsplit('/', 1)[0]}/S_{sway}_0.hbsprite.json")
    return o


def low(oid, file, x, base, sway, speed=1.0):
    """꽃밭·덤불처럼 낮은 물체: 몸통 전체를 막아 캐릭터가 그 안으로 들어가지 않게 (들어가면 물체가 캐릭터를 덮어 발만 보임)"""
    w, h = size_of(file)
    return standing(oid, file, x, base, depth=h - 2 * pad_of(file) - 0.15, half_width=w * 0.45, sway=sway, speed=speed)


rng = random.Random(5)


rng = random.Random(5)


rng = random.Random(5)
hub = base_objects(at=(0, -4))
forest = ground("Background", "Assets/Tiles/T_ForestEdge.png", -60, -40, 80, 50, -30)  # 마을 밖은 빽빽한 숲 지붕
forest["position"][2] = -1
hub += [forest,
        ground("Grass", "Assets/Tiles/T_TownGrass.png", -40, -16, 62, 26, -14),
        ground("Plaza", "Assets/Tiles/T_TownCobble.png", -12, -8, 12, 8, -13),
        ground("NorthRoad", "Assets/Tiles/T_TownCobble.png", -2.5, 8, 2.5, 17, -13),
        ground("HomePath", "Assets/Tiles/T_TownDirt.png", -27, -1.5, -12, 1.5, -13),
        ground("Street", "Assets/Tiles/T_TownCobble.png", 12, -3.5, 52, 3.5, -13)]
hub.append(bp_obj("Room", "BP_RoomInfo", 0, 0, {"Index": -1, "Kind": "Hub", "ExitY": EXIT_Y,
                                                "CamMinX": -35, "CamMinY": -13, "CamMaxX": 57.5, "CamMaxY": 25}))
hub += [start("StairTop", 0, EXIT_Y - 1.2), start("HomeDoor", -24, -0.6)]

# 북쪽: 높은 계단 → 황금 산의 마몬의 입 (입 안쪽 y > EXIT_Y이면 던전). 입에서 금빛이 숨 쉬듯 번지고 금가루가 피어오름
mw, mh = size_of(TOWN + "Mountain.png")
hub += [sprite_obj("Mountain", TOWN + "Mountain.png", 0, 19 + mh / 2, order=-6),
        sprite_obj("Stairs", TOWN + "Stairs.png", 0, 17 + size_of(TOWN + "Stairs.png")[1] / 2 - 0.4, order=-7),
        block("MountainL", -mw / 2, 19.5, -2.1, 32), block("MountainR", 2.1, 19.5, mw / 2, 32), block("MouthTop", -2.1, EXIT_Y + 2.5, 2.1, 32),
        block("StairL", -3, 15.5, -2.2, 19.5), block("StairR", 2.2, 15.5, 3, 19.5)]
mouth = glow("MouthGlow", 0, EXIT_Y + 1.2, 6, order=-5)
hub += [animate(mouth, "SA_Glow", 0.45, "Assets/Sprites/FX/S_FX_Glow_0.hbsprite.json"),
        particles("MouthSparkle", 0, EXIT_Y + 0.6, extent=[1.6, 0.5, 0], **SPARKLE)]
hub.append(interactable("Entrance", "Assets/UI/Map/map_link.png", 0, EXIT_Y - 0.3, "Entrance", "마몬의 입 - 황금 던전 입구", solid=False))

# 광장: 북쪽 가운데 빚 전광판(양옆 꽃밭), 네 귀퉁이와 북쪽 길에 가로등, 남쪽 벤치·화분, 서쪽 우물, 북동쪽 게시판
hub.append(interactable("DebtBoard", "Assets/Sprites/Prop_DebtBoard.png", 0, 6, "DebtBoard"))
LAMPS = [(-11, 7.4), (11, 7.4), (-11, -6.8), (11, -6.8), (-3.2, 10.5), (3.2, 10.5), (-3.2, 14.2), (3.2, 14.2), (16, -4.3), (24, -4.3), (32, -4.3),
         (40, -4.3), (48, -4.3)]
for k, (x, y) in enumerate(LAMPS):
    w, h = size_of(PROP + "Lamp.png")
    hub.append(standing(f"Lamp{k}", PROP + "Lamp.png", x, y, 0.4, half_width=0.25))
    hub.append(animate(glow(f"Lamp{k}Glow", x, y + h - pad_of(PROP + "Lamp.png") - 0.75, 3.2, order=-2), "SA_Glow", rng.uniform(0.8, 1.25),
                       "Assets/Sprites/FX/S_FX_Glow_0.hbsprite.json"))
hub += [low("FlowerBedA", TOWN + "FlowerBed.png", -3.2, 5.6, "FlowerBed", speed=1.1),
        low("FlowerBedB", TOWN + "FlowerBed.png", 3.2, 5.6, "FlowerBed", speed=0.9),
        standing("NoticeBoard", PROP + "NoticeBoard.png", 7.2, 7.0, 0.4),
        standing("Bench0", PROP + "Bench.png", -5, -6.9, 0.4), standing("Bench1", PROP + "Bench.png", 5, -6.9, 0.4),
        standing("PlantA", TOWN + "PottedPlant.png", -7, -7.0, 0.4, sway="PottedPlant"),
        standing("PlantB", TOWN + "PottedPlant.png", -3, -7.0, 0.4, sway="PottedPlant", speed=1.2),
        standing("PlantC", TOWN + "PottedPlant.png", 3, -7.0, 0.4, sway="PottedPlant", speed=0.85),
        standing("PlantD", TOWN + "PottedPlant.png", 7, -7.0, 0.4, sway="PottedPlant", speed=1.1),
        standing("Well", TOWN + "Well.png", 0, -2.2), standing("WellBarrel", PROP + "Barrel.png", 1.9, -2.5, 0.4)]
for k, (x, y) in enumerate([(-3.4, -1.2), (3.6, -0.9), (-3.0, -4.6), (3.2, -4.4)]):  # 광장 가운데 우물을 꽃밭이 둘러쌈
    hub.append(low(f"WellFlowers{k}", TOWN + "FlowerBed.png", x, y, "FlowerBed", speed=0.8 + 0.1 * k))

# 서쪽: 내 집 (문 앞에서 E로 들어가면 원룸 장면). 장작·덤불, 굴뚝 연기, 길 남쪽은 울타리 친 작은 마당
hw_, hh_ = size_of(TOWN + "PlayerHouse.png")
house_y = 0.6 + hh_ / 2 - pad_of(TOWN + "PlayerHouse.png")
hub += [sprite_obj("PlayerHouse", TOWN + "PlayerHouse.png", -24, house_y, order=0),
        block("HouseBody", -24 - hw_ / 2 + 0.3, 0.6, -24 + hw_ / 2 - 0.3, 4.5),
        interactable("HomeEnter", "Assets/UI/Map/map_link.png", -24, 1.4, "Home", solid=False),
        particles("HouseSmoke", -24 + (42 - 73) / 32, house_y + (120 - 11) / 32, **{**SMOKE, "rate": 0.8}),
        standing("Firewood", TOWN + "Firewood.png", -20.6, 0.5), low("HomeBush", TOWN + "Bush.png", -27.8, 0.7, "Bush"),
        low("HomeFlowers", TOWN + "FlowerBed.png", -21.2, -3.4, "FlowerBed")]
for k, x in enumerate([-30.2, -28.4, -26.6, -24.8, -19.4, -17.6]):  # 길 남쪽 울타리 (가운데는 마당 입구)
    hub.append(standing(f"HomeFence{k}", TOWN + "Fence.png", x, -2.4, 0.4, half_width=0.88))
hub += [low("YardFlowersA", TOWN + "FlowerBed.png", -28.6, -5, "FlowerBed", speed=0.8),
        low("YardFlowersB", TOWN + "FlowerBed.png", -25.8, -5.4, "FlowerBed", speed=1.15),
        standing("YardBarrel", PROP + "Barrel.png", -22.6, -6, 0.4)]

# 북서쪽: 울타리 친 텃밭 (꽃밭 두 줄)
for k, x in enumerate([-24.2, -22.4, -20.6, -18.8, -17.0]):
    hub += [standing(f"GardenFenceS{k}", TOWN + "Fence.png", x, 5.6, 0.4, half_width=0.88),
            standing(f"GardenFenceN{k}", TOWN + "Fence.png", x, 10.4, 0.4, half_width=0.88)]
for k, (x, y) in enumerate([(-23.4, 7.0), (-21.2, 7.0), (-19.0, 7.0), (-16.8, 7.0), (-23.4, 8.8), (-21.2, 8.8), (-19.0, 8.8), (-16.8, 8.8)]):
    hub.append(low(f"GardenBed{k}", TOWN + "FlowerBed.png", x, y, "FlowerBed", speed=0.75 + 0.07 * k))
hub += [standing("GardenBarrel", PROP + "Barrel2.png", -25.6, 6.0, 0.4), standing("GardenWood", TOWN + "Firewood.png", -15.0, 6.2, 0.4)]

# 동쪽 가게 거리: 대부업 사무소(수금원)·인테리어 공방(세공사)·문 닫은 가게 넷(판자로 막힌 문 앞에서 E로 안내)
STREET = [("LoanOffice", 18, "Collector", "Collector", "수금원: 이번 주 이자는 아직이던데?", 0),
          ("Workshop", 27.5, "Interior", "Interior", "세공사: 다음 공사는 다음 시즌에!", 150),
          ("ShopBag", 35.5, "ClosedRental", "Note", "가방 렌탈 - 휴가 중입니다. 빚쟁이 여러분 다음에 또 오세요", 0),
          ("ShopCharm", 41, "ClosedCharm", "Note", "부적 상점 - 가게 개장 준비 중", 0),
          ("ShopRecipe", 46.5, "ClosedRecipe", "Note", "제작서 상점 - 가게 개장 준비 중", 0),
          ("ShopRelic", 52, "ClosedRelic", "Note", "유물 감정소 - 휴가 중입니다. 빚쟁이 여러분 다음에 또 오세요", 0)]
for name, x, who, kind, text, price in STREET:
    w, h = size_of(TOWN + name + ".png")
    y = 3.6 + h / 2 - pad_of(TOWN + name + ".png")
    hub += [sprite_obj(name, TOWN + name + ".png", x, y, order=0), block(name + "Body", x - w / 2 + 0.3, 3.6, x + w / 2 - 0.3, 7.5)]
    if kind == "Note":  # 문 앞 보이지 않는 안내 (가게 앞을 막던 노점 그림은 없앰: 문이 판자로 막힌 그림이라 닫힌 게 보임)
        hub.append(interactable(who, AMB + "Invisible.png", x, 3.2, kind, text, solid=False))
    else:  # NPC: 보이는 그림은 숨쉬는 애니메이션, 상호작용은 같은 자리의 보이지 않는 대상
        tex = f"Assets/Sprites/NPC_{who}.png"
        nw, nh = size_of(tex)
        npc = interactable(who, AMB + "Invisible.png", x, 2.3, kind, text, price=price)
        npc["overrides"]["components"]["collider"].update(extent=[0.35, 0.3, 0.5], center=[0, -nh / 2 + pad_of(tex) + 0.3, 0], enabled=True)
        hub += [npc, animate(sprite_obj(who + "Look", tex, x, 2.3, order=0), "SA_Npc" + who, rng.uniform(0.9, 1.1),
                             f"{AMB}S_Npc{who}_0.hbsprite.json")]
wh_ = size_of(TOWN + "Workshop.png")[1]
hub += [particles("WorkshopSmoke", 27.5 + (166 - 114) / 32, 3.6 + wh_ / 2 - 0.25 + (120 - 12) / 32, **SMOKE),
        standing("ShopCrates0", PROP + "Crates.png", 24.2, 3.4, 0.4), standing("ShopBarrel0", PROP + "Barrel.png", 31.2, 3.3, 0.4),
        standing("ShopBarrel1", PROP + "Barrel2.png", 31.9, 3.0, 0.4), standing("ShopCrates1", PROP + "Crates2.png", 38.3, 3.3, 0.4),
        standing("ShopBarrel2", PROP + "Barrel.png", 49.3, 3.3, 0.4), standing("ShopCrates2", PROP + "Crates.png", 13.8, 3.3, 0.4)]
# 거리 남쪽: 벤치와 정원 (꽃밭·덤불)
for k, x in enumerate([20, 36, 44]):
    hub.append(standing(f"StreetBench{k}", PROP + "Bench.png", x, -4.6, 0.4))
for k, x in enumerate([18, 28, 39, 50]):
    hub.append(low(f"StreetFlowers{k}", TOWN + "FlowerBed.png", x, -6.4, "FlowerBed", speed=rng.uniform(0.8, 1.2)))
for k, x in enumerate([23, 33.5, 45]):
    hub.append(low(f"StreetBush{k}", TOWN + "Bush.png", x, -6.8, "Bush", speed=rng.uniform(0.8, 1.2)))


def free(x, y):
    """바닥 장식을 둘 수 있는 곳 (길·건물·숲 밖 제외)"""
    on_path = (-12.5 < x < 12.5 and -8.5 < y < 8.5) or (-3 < x < 3 and y > 7.5) or (-27.5 < x < -11.5 and -2 < y < 2) or (11.5 < x < 52.5 and -4 < y < 4)
    building = (-27 < x < -21 and y > 0) or (14 < x < 55 and y > 3.2) or (abs(x) < 11 and y > 18)
    return not on_path and not building and WEST < x < EAST and SOUTH < y < NORTH


# 숲 가장자리 안쪽 덤불 (나무 줄과 잔디 사이를 부드럽게), 가게 뒤 덤불
bushes = [(x, -9.6 + rng.uniform(-0.2, 0.3)) for x in [-29 + 3.3 * i for i in range(25)]] + [(-30.8, y) for y in [-5, 0, 5, 10]] +          [(53.4, y) for y in [-7, -2, 2, 8, 12]] + [(x, 14.6) for x in [-28, -22, -12, -6, 6, 13, 19, 26, 33, 40, 47, 52]] +          [(x, 12.2) for x in [31.5, 37.5, 43.5, 49.5]]
for k, (x, y) in enumerate(bushes):
    if free(x, y) or y > 12:
        hub.append(low(f"EdgeBush{k}", TOWN + "Bush.png", x, y, "Bush", speed=rng.uniform(0.7, 1.3)))

# 나무: 마을 안쪽 몇 그루(잎이 떨어짐) + 가장자리를 두 줄로 막는 숲 (앞줄은 흔들림·충돌, 뒷줄은 그림만)
def tree_at(oid, x, base, front=True, leaves=False):
    kind = "TreePine" if rng.random() < 0.42 else "TreeRound"
    out = [standing(oid, TOWN + kind + ".png", x, base, 0.6, solid=front, half_width=0.45, sway=kind if front else None,
                    speed=rng.uniform(0.75, 1.3))]
    if leaves:
        out.append(particles(oid + "Leaves", x, base + 3.2, **{**LEAVES, "extent": [1.2, 0.6, 0]}))
    return out


INNER = [(-16, 11), (-8, 12.5), (8, 12.5), (15, 10.5), (-17, -6.5), (-14.5, -8.2), (14.5, -7.6), (-29, 8), (-21, 11.5), (21.5, 11.8),
         (-30.5, -7.5), (26, -8)]
for k, (x, y) in enumerate(INNER):
    hub += tree_at(f"Tree{k}", x, y, leaves=k % 2 == 0)
edge = []
for x in [-36 + 2.7 * i for i in range(36)]:
    edge += [(x + rng.uniform(-0.4, 0.4), -11.7 + rng.uniform(-0.2, 0.2), True), (x + 1.35, -13.3, False)]  # 남쪽 (잎이 광장 끝을 가리지 않게 낮춤)
for y in [-12 + 2.5 * i for i in range(12)]:  # 서·동쪽
    edge += [(-33.2 + rng.uniform(-0.3, 0.3), y, True), (-35.2, y + 1.2, False), (56 + rng.uniform(-0.3, 0.3), y, True), (58, y + 1.2, False)]
for x in [-36 + 2.7 * i for i in range(36)]:  # 북쪽 (계단·산 자리 비움)
    if abs(x) > 4:
        edge.append((x + rng.uniform(-0.4, 0.4), 16.4, True))
    if abs(x) > 11.5:
        edge += [(x + 1.35, 18.2, False), (x + rng.uniform(-0.3, 0.3), 20.0, False)]
for k, (x, y, front) in enumerate(sorted(edge, key=lambda e: -e[1])):
    hub += tree_at(f"Edge{k}", x, y, front)


# 바닥: 풀포기·꽃무더기·조약돌. 풀포기·꽃은 바람에 흔들림
spots = []
while len(spots) < 150:
    x, y = rng.uniform(WEST, EAST), rng.uniform(SOUTH, NORTH)
    if free(x, y) and all(abs(x - a) + abs(y - b) > 1.2 for a, b in spots):
        spots.append((x, y))
for k, (x, y) in enumerate(spots):
    r = rng.random()
    name = f"Tuft{rng.randrange(3)}" if r < 0.55 else f"Flowers{rng.randrange(4)}" if r < 0.85 else f"Pebbles{rng.randrange(3)}"
    still = name.startswith("Pebbles")
    o = sprite_obj(f"Decor{k}", AMB + (name + ".png" if still else name + "_0.png"), x, y, order=-5)
    comp(o, "SpriteRenderer")["properties"]["sortingLayer"] = "overlay"
    if not still:
        animate(o, "SA_" + name, rng.uniform(0.7, 1.3), f"{AMB}S_{name}_0.hbsprite.json")
    hub.append(o)
# 생물·구름 그늘 (C++ Ambient가 움직임)
for k, (x, y) in enumerate([(-6, -2), (-4.6, -2.8), (6.2, 2.2), (7.4, -5), (33, -2), (42.5, -1.6), (-18, 0.2)]):
    hub.append(critter(f"Bird{k}", "Ambient.Bird", "BirdIdle_0", "SA_BirdIdle", x, y))
for k, (x, y, c) in enumerate([(-3.2, 5.6, "Y"), (3.2, 5.6, "W"), (-27, -5, "P"), (28, -6.4, "Y"), (-21.2, -3.4, "W")]):
    hub.append(critter(f"Butterfly{k}", "Ambient.Butterfly", f"Butterfly{c}_0", f"SA_Butterfly{c}", x, y))
for k, (x, y) in enumerate([(-30, 2), (8, 11), (40, -6)]):
    o = critter(f"Cloud{k}", "Ambient.Cloud", "P_Cloud", None, x, y)
    comp(o, "SpriteRenderer")["properties"].update(width=9, height=4.5, useCustomSize=True, sortingLayer="overlay", sortingOrder=20)
    hub.append(o)
pollen = particles("Pollen", 0, 0, **{**DUST, "rate": 3, "color": [1, 1, 0.85, 0.4]})  # 떠다니는 꽃가루 (카메라를 따라감)
pollen["parent"] = "Camera"
pollen["position"][2] = -11.8  # 카메라(z 12) 앞쪽 바닥 높이에 (자식 위치는 카메라 기준)
hub.append(pollen)
# 마을 바깥 경계 (나무 줄 안쪽)
hub += [block("EdgeW", -42, -20, WEST, 34), block("EdgeE", EAST, -20, 64, 34), block("EdgeS", -42, -20, 64, SOUTH),
        block("EdgeN1", -42, NORTH, -3, 34), block("EdgeN2", 3, NORTH, 64, 34)]
counts["Hub"] = write("Hub", hub)


# ---- 원룸 (기획서 3-1): 레벨마다 장면 하나. Lv1 좁고 낡은 방, Lv2(세공사 공사) 넓어지고 책상·러그·화분 추가
def home_scene(level):
    W, D = (4, 3) if level == 1 else (6, 4)  # 반너비, 반깊이 (m)
    objects = base_objects(at=(0, -D + 2.4))  # 문과 겹치지 않게 한 걸음 안쪽
    objects += [ground("Floor", "Assets/Tiles/T_HomeWood.png", -W, -D, W, D, -13), background("Background", 0, 0, 40, 30)]
    objects.append(bp_obj("Room", "BP_RoomInfo", 0, 0, {"Index": -2, "Kind": "Home", "ExitY": -D - 0.3,  # 방이 화면보다 작아 카메라는 방 가운데 고정
                                                        "CamMinX": -W - 1, "CamMinY": -D - 1, "CamMaxX": W + 1, "CamMaxY": D + 3}))
    ww, wh = size_of(TOWN + "HomeWall.png")
    for k, x in enumerate([-W + ww / 2 + i * ww for i in range(int(2 * W / ww + 0.99))]):
        objects.append(sprite_obj(f"Wall{k}", TOWN + "HomeWall.png", min(x, W - ww / 2), D + wh / 2, order=-9))
    for wx in ([-W / 2] if level == 1 else [-W / 2, W / 2]):  # 창에서 바닥으로 드는 빛줄기, 그 안에 떠다니는 먼지
        beam = sprite_obj(f"WindowBeam{wx}", AMB + "WindowBeam.png", wx + 0.3, D - 1.3, order=-11, width=1.5, height=3)
        comp(beam, "SpriteRenderer")["properties"].update(blendMode="additive", sortingLayer="overlay", sortingOrder=5)
        objects += [beam, particles(f"WindowDust{wx}", wx + 0.3, D - 1.4, **{**DUST, "rate": 2.2, "extent": [0.6, 1.3, 0], "maxParticles": 16})]
    objects += [sprite_obj("Window", TOWN + "HomeWindow.png", -W / 2, D + 1.6, order=-8),
                sprite_obj("Door", TOWN + "HomeDoor.png", 0, -D - 0.2, order=0),
                block("WallN", -W - 1, D, W + 1, D + 1), block("WallW", -W - 1, -D - 1, -W, D + 1), block("WallE", W, -D - 1, W + 1, D + 1),
                block("WallSL", -W, -D - 1, -1.2, -D), block("WallSR", 1.2, -D - 1, W, -D)]
    # 처음 원룸은 텅 빈 방: 소파 놓을 자리(바닥 분필 표시)만 있고, 골드로 들여놓을 때마다 소파가 생기고 좋아짐 (C++ ShowSofa).
    # 침대·냉장고·TV는 유료 재화 커스텀(기획서)이라 데모에는 없음. 세공사 공사(Lv2)로 방이 넓어지면 러그·책상·화분이 생김
    objects += [interactable("Sofa", "Assets/Sprites/Furniture_Sofa.png", -W + 2, D - 1.2, "Sofa", "황금 벨벳 소파. 더는 바꿀 수 없다", price=50)]
    if level >= 2:
        objects += [sprite_obj("Window2", TOWN + "HomeWindow.png", W / 2, D + 1.6, order=-8),
                    sprite_obj("Rug", TOWN + "Rug.png", 0, 0.3, order=-11),
                    interactable("Desk", TOWN + "Desk.png", 2.2, D - 1.0, "Note", "책상 위 고지서. 이번 달 이자 납부일이 내일이다"),
                    standing("Plant", TOWN + "PottedPlant.png", -W + 0.7, -0.5, sway="PottedPlant")]
    return objects


for level in (1, 2):
    counts[f"Home_{level}"] = write(f"Home_{level}", home_scene(level))

(ASSETS / "Tilemaps/TM_Hub.hbtilemap.json").unlink(missing_ok=True)  # 예전 실내형 거점 타일맵
# 예전 생성기가 미리 이어 붙인 그림 (이제 타일맵이 씀)
for f in ASSETS.glob("Sprites/*.png"):
    if f.name.startswith(("Room_", "Plaza_", "Home_", "NpcZone_", "Stair_")):
        f.unlink()
print("장면:", counts)
