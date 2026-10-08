"""BP·프리팹·적 상태 머신을 처음 한 번 만든다. 이후에는 편집기에서 고친다 (이 스크립트를 다시 돌리면 덮어씀).

실행: python tools/make_blueprints.py   (그다음 HBEngine runtime/node.exe tools/sync_cpp.mjs 로 C++ 사본 동기화)

  Assets/Blueprints/BP_TopDownShooter      게임 규칙 (장면마다 Director 하나). Tick → Update (소리는 C++ hb::Audio)
  Assets/Blueprints/Enemies/BP_Enemy       적 공통: 그림·충돌·풀 + 상태 머신 상태마다 부르는 사용자 이벤트 → C++ Enemy 함수
                     BP_Skeleton / BP_SkeletonMage / BP_SkeletonCaptain   BP_Enemy 자식. 수치·그림·상태 머신만 덮어씀
  Assets/Blueprints/BP_AuricRules           밸런스·에셋 경로 (장면마다 하나, 기본값 한 곳에서 고침)
  Assets/Blueprints/BP_Interactable / BP_RoomInfo
  Assets/Blueprints/BP_Test_Valen / BP_Test_Sherry / BP_Test_Alea   검사용 (BP_TopDownShooter 자식, 캐릭터와 던전 씨앗 고정)
  Assets/Data/DA_Floor, DT_Rooms           던전 층 구성 (방 순서·곁가지·간격), 방 종류별 크기·웨이브
  Assets/Prefabs/PF_EnemyShot / PF_PlayerShot / PF_Coin / PF_Fx   장면 풀의 원본 (그림은 C++가 애니메이션으로 바꿈)
  Assets/AI/FSM_Skeleton / FSM_SkeletonMage / FSM_SkeletonCaptain   적 행동 (상태 이름의 이벤트를 BP_Enemy가 받음)
"""
import copy
import json
from pathlib import Path

PROJECT = Path(__file__).resolve().parent.parent / "AuricLoop"
BP = PROJECT / "Assets/Blueprints"
TEMPLATE = json.loads((PROJECT / "Assets/Scenes/Template.hbscene.json").read_text(encoding="utf-8"))
objs = {o["id"]: o for o in TEMPLATE["objects"]}
PPU = 32


def write(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n")


def comp(obj, kind):
    return next(c for c in obj["components"] if c["type"] == kind)


def node(nid, key, x, y, **extra):
    return {"id": nid, "key": key, "position": {"x": x, "y": y}, "splitPins": [], "inputValues": {}, **extra}


def edge(a, ap, b, bp):
    return {"from": {"node": a, "pin": ap}, "to": {"node": b, "pin": bp}}


def blueprint(name, parent, components=(), nodes=(), edges=(), defaults=None, overrides=None, native_from=None):
    """parent: C++ 클래스 이름이면 C++ 기반 BP, 'Assets/...'면 BP 자식(얇은 파일)."""
    data = {"version": 1, "name": name, "components": list(components), "variables": [], "nodes": list(nodes), "edges": list(edges),
            "functions": [], "macros": [], "comments": [], "dispatchers": [], "interfaces": [],
            "settings": {"parentClass": parent, "tickEnabled": True, "tickInterval": 0, "overlapEnabled": True}}
    if defaults:
        data["settings"]["nativeDefaults"] = defaults
    if overrides:
        data["settings"]["componentOverrides"] = overrides
    if native_from:  # C++ 기반 BP: 헤더/구현 경로만 적고 sync_cpp.mjs가 원문·클래스 정보를 채움
        data["native"] = {"headerPath": "Source/TopDownShooter.h", "sourcePath": "Source/TopDownShooter.cpp"}
    return data


def transform():
    return {"id": "transform", "name": "Transform", "type": "Transform", "properties": {"position": [0, 0, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]}}


def sprite(texture, w, h, order=0, asset=""):  # 순서 0 = 플레이어와 같은 층에서 Y 정렬
    p = copy.deepcopy(comp(objs["Enemy0"], "SpriteRenderer")["properties"])
    p.update(texture="" if asset else texture, sprite=asset, width=w, height=h, pixelsPerUnit=PPU, sortingOrder=order, color=[1, 1, 1, 1], useCustomSize=False,
             sortPoint="feet")  # 발끝 정렬 (tools/make_shadows.py 여백 규칙)
    return {"id": "sprite", "name": "SpriteRenderer", "type": "SpriteRenderer", "properties": p}


def box(extent, center=(0, 0, 0), trigger=False, layer=0, mask=4294967295):
    p = copy.deepcopy(comp(objs["Enemy0"], "BoxCollider2D")["properties"])
    p.update(extent=list(extent), center=list(center), trigger=trigger, layer=layer, mask=mask)
    return {"id": "collider", "name": "BoxCollider2D", "type": "BoxCollider2D", "properties": p}


def body():
    p = copy.deepcopy(comp(objs["Enemy0"], "Rigidbody2D")["properties"])
    p["freezeRotation"] = [1, 1, 1]  # 2D 몸체가 부딪혀 돌지 않게 (예전엔 z가 풀려 적이 빙글빙글 돌았음)
    return {"id": "body", "name": "Rigidbody2D", "type": "Rigidbody2D", "properties": p}


def pool(keep):
    return {"id": "pool", "name": "PooledActor", "type": "PooledActor", "properties": {"enabled": True, "initiallyActive": False, "maxInactive": keep}}


# ---- 게임 규칙 BP: Tick → Update(delta), 소리 이벤트 → Play Sound ----
gm = json.loads((BP / "BP_TopDownShooter.hbblueprint.json").read_text(encoding="utf-8"))
keep = {"beginPlay", "tick", "endPlay"}  # 소리는 C++ hb::Audio가 직접 재생 (예전 소리 이벤트 그래프는 지움)
gm["nodes"] = [n for n in gm["nodes"] if n["id"] in keep] + [node("tick_update", "tick", 100, 240), node("update", "nativeCall", 430, 240, nativeId="TopDownShooter.Update")]
gm["edges"] = [e for e in gm["edges"] if e["from"]["node"] in keep and e["to"]["node"] in keep] + [
    edge("tick_update", "then", "update", "exec"), edge("tick_update", "delta", "update", "delta")]
gm["variables"] = []
write(BP / "BP_TopDownShooter.hbblueprint.json", gm)

# ---- 적 ----
ENEMY_EVENTS = ["Halt", "Chase", "Range", "Stagger", "Windup", "Fire", "Dash", "Ring", "Summon", "Prowl", "JumpWindup", "Jump", "Slam",
                "SpinWindup", "Spin", "QuakeWindup", "Quake", "GoldRain"]  # 상태에 들어갈 때만 (매 프레임 이동은 C++ 게임 규칙이 한 번에)
nodes = [node("begin", "beginPlay", 60, 40), node("awake", "nativeCall", 360, 40, nativeId="Enemy.Awake")]
edges = [edge("begin", "then", "awake", "exec")]
for i, ev in enumerate(ENEMY_EVENTS):
    nodes += [node(f"ev_{ev}", "customEvent", 60, 160 + i * 110, options={"eventName": ev}),
              node(f"call_{ev}", "nativeCall", 360, 160 + i * 110, nativeId=f"Enemy.{ev}")]
    edges.append(edge(f"ev_{ev}", "then", f"call_{ev}", "exec"))
ENEMY_SPRITE = "Assets/Sprites/Enemies/{0}/S_{0}_{1}.hbsprite.json"  # tools/make_anims.py가 만든 프레임
enemy_layer = dict(layer=2, mask=(1 << 0) | (1 << 2))  # 벽(층 0)·다른 적(층 2)과 부딪힘, 플레이어(층 1)는 통과. 예전엔 trigger라 벽까지 지나갔음
write(BP / "Enemies/BP_Enemy.hbblueprint.json", blueprint(
    "BP_Enemy", "Enemy", [transform(), sprite("", 0.90625, 1.375, asset=ENEMY_SPRITE.format("Skeleton", "Walk_0")), box((0.35, 0.3, 0.1), (0, -0.35, 0), **enemy_layer), body(), pool(16)],
    nodes, edges, native_from=True))
def glint(who, pose, tip="top"):
    """공격 직전 반짝일 자리: "눈x,눈y;무기끝x,무기끝y" (m, 원점 기준, 오른쪽 보는 그림). 자세 그림에서 찾음
    눈: 파란 눈 픽셀(해골) 또는 해골 머리(흰 부분)의 앞쪽 가운데. 무기 끝: tip=top이면 가장 위 픽셀(치켜든 무기), front면 가운데 높이에서 가장 앞"""
    from PIL import Image  # noqa: PLC0415
    sp = json.loads((PROJECT / f"Assets/Sprites/Enemies/{who}/S_{who}_{pose}.hbsprite.json").read_text(encoding="utf-8"))
    im = Image.open(PROJECT / sp["texture"]).convert("RGBA")
    w, h = im.size
    px = im.load()
    solid = [(x, y) for y in range(h) for x in range(w) if px[x, y][3] > 128]
    blue = [(x, y) for x, y in solid if px[x, y][2] > 140 and px[x, y][2] > px[x, y][0] + 40 and y < h * 0.6]
    skull = [(x, y) for x, y in solid if min(px[x, y][:3]) > 190 and y < h * 0.6]
    if blue:
        ex, ey = sum(x for x, _ in blue) / len(blue), sum(y for _, y in blue) / len(blue)
    else:
        x0, x1, y0, y1 = min(x for x, _ in skull), max(x for x, _ in skull), min(y for _, y in skull), max(y for _, y in skull)
        ex, ey = x0 + 0.68 * (x1 - x0), y0 + 0.55 * (y1 - y0)
    top = min(y for _, y in solid)
    if tip == "top":
        tx, ty = max(x for x, y in solid if y == top), top + 1
    else:
        band = [(x, y) for x, y in solid if h * 0.35 < y < h * 0.85]
        tx = max(x for x, _ in band)
        ys = [y for x, y in band if x == tx]
        ty = sum(ys) / len(ys)
    to_m = lambda x, y: ((x - w / 2) / PPU, ((h - y) - sp["pivot"][1] * h) / PPU)  # noqa: E731
    (a, b), (c, d) = to_m(ex, ey), to_m(tx, ty)
    return f"{a:.2f},{b:.2f};{c:.2f},{d:.2f}"


ENEMIES = {
    "BP_Skeleton": ("Skeleton", {"Enemy.DisplayName": "해골", "Enemy.Brain": "Assets/AI/FSM_Skeleton.hbstatemachine.json",
                                 "Enemy.WindupSprite": "Assets/Sprites/Enemies/Skeleton/S_Skeleton_SlashWindup.hbsprite.json",  # 자세 그림: tools/make_enemy_poses.py
                                 "Enemy.GlintSlash": glint("Skeleton", "SlashWindup"), "Enemy.GlintLunge": glint("Skeleton", "LungeReady", "front"),
                                 "Enemy.GlintLeap": glint("Skeleton", "LeapCrouch")}),
    "BP_SkeletonMage": ("SkeletonMage", {"Enemy.DisplayName": "해골 마법사", "Enemy.Brain": "Assets/AI/FSM_SkeletonMage.hbstatemachine.json",
                                                   "Enemy.KeepDistance": 6, "Enemy.GoldMin": 2, "Enemy.GoldMax": 3, "Enemy.GlintCast": glint("SkeletonMage", "CastReady")}),
    "BP_SkeletonCaptain": ("SkeletonCaptain", {"Enemy.DisplayName": "해골 대장", "Enemy.ShotClip": "Assets/Animations/SA_BossOrb.hbspriteanimation.json", "Enemy.Brain": "Assets/AI/FSM_SkeletonCaptain.hbstatemachine.json",
                                                        "Enemy.Boss": True, "Enemy.MaxHp": 40, "Enemy.Speed": 3.6, "Enemy.Radius": 1.4,
                                                        "Enemy.GoldMin": 30, "Enemy.GoldMax": 30,
                                                        # 대검 베기만 (돌진·도약은 대장 패턴이 따로), 예고 길게, 자기 그림으로
                                                        "Enemy.AttackClip": "Assets/Animations/SA_SkeletonCaptain_Slash.hbspriteanimation.json",
                                                        "Enemy.WalkClip": "Assets/Animations/SA_SkeletonCaptain_Walk.hbspriteanimation.json",
                                                        "Enemy.WindupSprite": "Assets/Sprites/Enemies/SkeletonCaptain/S_SkeletonCaptain_SlashWindup.hbsprite.json",
                                                        "Enemy.RoarClip": "Assets/Animations/SA_SkeletonCaptain_Roar.hbspriteanimation.json",
                                                        "Enemy.SlashRange": 1.8, "Enemy.MeleeWindup": 0.7, "Enemy.AttackCooldown": 2.0,
                                                        "Enemy.LungeRange": 0, "Enemy.LeapRange": 0,
                                                        "Enemy.GlintSlash": glint("SkeletonCaptain", "SlashWindup"), "Enemy.GlintDash": glint("SkeletonCaptain", "Dash", "front"),
                                                        "Enemy.GlintCast": glint("SkeletonCaptain", "Cast"), "Enemy.GlintLeap": glint("SkeletonCaptain", "JumpCrouch")}),
}
from PIL import Image  # noqa: E402
for name, (who, defaults) in ENEMIES.items():
    defaults["Enemy.DeathClip"] = f"Assets/Animations/SA_{who}_Death.hbspriteanimation.json"
    over = {"sprite": {"sprite": ENEMY_SPRITE.format(who, "Walk_0"), "texture": ""}}
    if name == "BP_SkeletonCaptain":
        over["collider"] = {"extent": [1.0, 0.8, 0.1], "center": [0, -0.6, 0]}
    write(BP / f"Enemies/{name}.hbblueprint.json", blueprint(name, "Assets/Blueprints/Enemies/BP_Enemy.hbblueprint.json", defaults=defaults, overrides=over))

# ---- 상호작용·적 등장 자리·방 정보 ----
write(BP / "BP_Interactable.hbblueprint.json", blueprint(
    "BP_Interactable", "Interactable", [transform(), sprite("Assets/Sprites/Prop_DebtBoard.png", 2, 2), box((0.8, 0.4, 0.5), (0, -0.6, 0))], native_from=True))
# 효과음은 wav 경로|볼륨으로 바로 튼다. 에셋(.hbaudioasset) 이름으로 틀면 에디터가 이름을 찾느라 프로젝트 목록을 두 번 읽어 소리마다 멈춤
def _sfx(k):
    a = json.loads((PROJECT / f"Assets/Audio/S_{k}.hbaudioasset.json").read_text(encoding="utf-8"))
    return f"{k}={a['clip']}|{a['volume']}"
SOUNDS = [_sfx(k) for k in ["Slash", "Arrow", "Bolt", "Boom", "Hit", "Kill", "Hurt", "Coin", "Dodge", "DoorHit", "DoorOpen",
                            "Flash", "Craft", "Gather", "Select", "BossCharge"]] + ["Type=Assets/Audio/Type.wav|0.25", "Swing=Assets/Audio/Swing.wav|0.45", "Impact=Assets/Audio/Impact.wav|0.6", "Crack=Assets/Audio/Crack.wav|0.55"]
SOUNDS += [f"{k}=Assets/Audio/S_BGM_{k}.hbaudioasset.json" for k in ["Hub", "Dungeon", "Boss", "Return"]]
rules = blueprint("BP_AuricRules", "AuricRules", [transform()], native_from=True, defaults={
    "AuricRules.Debts": [9800, 14500, 31700],  # 기획서 6-4
    "AuricRules.CharacterSprites": ["Assets/Sprites/Valen/S_Valen_", "Assets/Sprites/Sherry/S_Sherry_", "Assets/Sprites/Alea/S_Alea_"],
    "AuricRules.Sounds": SOUNDS,
    "AuricRules.SofaSprites": [f"Assets/Sprites/Town/S_Sofa_{k}.hbsprite.json" for k in range(4)],
    "AuricRules.Enemies": [f"{k}=Assets/Blueprints/Enemies/BP_{v}.hbblueprint.json" for k, v in (("S", "Skeleton"), ("M", "SkeletonMage"), ("C", "SkeletonCaptain"))]})
rules["settings"].update(tickEnabled=False, overlapEnabled=False)
write(BP / "BP_AuricRules.hbblueprint.json", rules)
(BP / "BP_SpawnPoint.hbblueprint.json").unlink(missing_ok=True)  # 적 자리는 이제 웨이브가 방 안에서 무작위로 고름
write(BP / "BP_RoomInfo.hbblueprint.json", blueprint("BP_RoomInfo", "RoomInfo", [transform()], native_from=True))
for name, who, room in (("BP_Test_Valen", 0, ""), ("BP_Test_Sherry", 1, ""), ("BP_Test_Alea", 2, ""), ("BP_Test_Boss", 0, "Boss")):
    write(BP / f"{name}.hbblueprint.json", blueprint(name, "Assets/Blueprints/BP_TopDownShooter.hbblueprint.json",
                                                     defaults={"TopDownShooter.Character": who, "TopDownShooter.Seed": 7, "TopDownShooter.ShowFps": True,
                                                               "TopDownShooter.MaxHp": 30, "TopDownShooter.StartRoom": room}))  # Test_Boss: 성능 측정용, 보스방에서 시작

# ---- 던전 데이터 (편집기 데이터 표에서 고침, 다시 빌드할 필요 없음) ----
# 웨이브: | 로 웨이브를 나누고 , 로 적을 나눔. 기호는 BP_AuricRules.Enemies (S 해골, M 해골 마법사, C 해골 대장)
write(PROJECT / "Assets/Data/DA_Floor.hbdata.json", {"version": 1, "name": "DA_Floor", "fields": [
    {"name": "rooms", "type": "float", "value": 11},    # 방 수 (시작·보스·상점·채집 + 나머지 전투방). 시작에서 가지를 뻗어 나무 모양으로 이음
    {"name": "loops", "type": "float", "value": 1},     # 나무에 더 이어 붙이는 고리 수 (돌아가는 길)
    {"name": "spacing", "type": "float", "value": 36}]})  # 격자 한 칸 (m)
ROOM_COLUMNS = [("minHalf", "float"), ("maxHalf", "float"), ("square", "bool"), ("waves", "string"), ("monsterDrop", "bool")]
ROOM_ROWS = {
    "Start": (8, 8, True, "", False),  # 튜토리얼 표지판 7개가 들어가게
    "Combat1": (6, 9, False, "S,S|S,S,S", False),          # 시작 바로 옆: 작은 방도 나옴
    "Combat2": (7, 11, False, "S,S,M|S,M,M", True),        # 마지막 해골이 마물 소재를 확정으로 떨굼 (인챈트 체험)
    "Combat3": (8, 12, False, "S,S,S,M|S,S,M,M|S,M,M", False),  # 깊은 방: 큰 방, 웨이브 3번
    "Gather": (7, 7, True, "", False),
    "Shop": (9, 9, True, "", False),
    "Boss": (14, 14, True, "C", False),
    "Return": (0, 0, True, "S,S,M,M,M", False),  # 귀환 페이즈에 방마다 나오는 무적 해골 (기획서 6-3)
}
write(PROJECT / "Assets/Data/DT_Rooms.hbdata.json", {"version": 1, "name": "DT_Rooms", "columns": [{"name": n, "type": t} for n, t in ROOM_COLUMNS],
                                                     "rows": {k: dict(zip([n for n, _ in ROOM_COLUMNS], v)) for k, v in ROOM_ROWS.items()}})
(BP / "BP_Hub.hbblueprint.json").unlink(missing_ok=True)  # 거점도 같은 BP를 씀 (생성·찾기로 풀 배열이 필요 없음)

# ---- 생성용 프리팹 (엔진이 PooledActor로 알아서 재사용) ----
def prefab(name, obj_id, texture=None, w=None, h=None, keep_pool=64, order=3, trigger=True, layer=3, mask=4, collider=True, rigid=True):
    o = copy.deepcopy(objs[obj_id])
    o.update(id="root", name=name[3:], position=[0, 0, 0.15])
    kinds = {"Transform", "SpriteRenderer"} | ({"BoxCollider2D"} if collider else set()) | ({"Rigidbody2D"} if rigid else set())
    o["components"] = [c for c in o["components"] if c["type"] in kinds] + [pool(keep_pool)]
    for c in o["components"]:
        if c["type"] == "Rigidbody2D":
            c["properties"]["freezeRotation"] = [1, 1, 1]  # 탄이 부딪혀 돌지 않게 (방향은 C++가 정함)
    sp = comp(o, "SpriteRenderer")["properties"]
    if texture:
        sp.update(texture=texture, sprite="", width=w, height=h, pixelsPerUnit=PPU, color=[1, 1, 1, 1], useCustomSize=False)
    sp["sortingOrder"] = order
    if collider:
        comp(o, "BoxCollider2D")["properties"].update(trigger=trigger, layer=layer, mask=mask)
    write(PROJECT / f"Assets/Prefabs/{name}.hbprefab.json", {"version": 1, "name": name, "root": "root", "objects": [o]})


prefab("PF_EnemyShot", "Bullet0", keep_pool=96)
shot = PROJECT / "Assets/Prefabs/PF_EnemyShot.hbprefab.json"
data = json.loads(shot.read_text(encoding="utf-8"))
comp(data["objects"][0], "SpriteRenderer")["properties"].update(sprite="Assets/Sprites/FX/S_EnemyOrb_0.hbsprite.json", texture="", color=[1, 1, 1, 1], useCustomSize=False,
                                                                emissiveIntensity=0.8)  # 보라 불꽃 탄, 블룸으로 번짐
write(shot, data)
prefab("PF_PlayerShot", "Bullet0", keep_pool=24, order=4)
data = json.loads((PROJECT / "Assets/Prefabs/PF_PlayerShot.hbprefab.json").read_text(encoding="utf-8"))
comp(data["objects"][0], "SpriteRenderer")["properties"].update(sprite="Assets/Sprites/FX/S_Arrow_0.hbsprite.json", texture="", color=[1, 1, 1, 1], useCustomSize=False,
                                                                emissiveIntensity=0.5)  # 블룸으로 살짝 번짐 (세면 사각 후광이 보임)
comp(data["objects"][0], "BoxCollider2D")["properties"]["mask"] = 0
write(PROJECT / "Assets/Prefabs/PF_PlayerShot.hbprefab.json", data)
cw, ch = Image.open(PROJECT / "Assets/Sprites/Item_Coin.png").size
prefab("PF_Coin", "Enemy0", "Assets/Sprites/Item_Coin.png", cw / PPU, ch / PPU, keep_pool=24, order=-1, collider=False, rigid=False)
data = json.loads((PROJECT / "Assets/Prefabs/PF_Coin.hbprefab.json").read_text(encoding="utf-8"))
comp(data["objects"][0], "SpriteRenderer")["properties"].update(sprite="Assets/Sprites/FX/S_Coin_0.hbsprite.json", texture="", useCustomSize=False, emissiveIntensity=0.4)
write(PROJECT / "Assets/Prefabs/PF_Coin.hbprefab.json", data)
# 이펙트(베기·타격 불꽃·적 쓰러짐): 그림은 C++ PlayFx가 프레임마다 바꿔 끼운다
prefab("PF_Fx", "Bullet0", keep_pool=16, order=4, collider=False, rigid=False)
data = json.loads((PROJECT / "Assets/Prefabs/PF_Fx.hbprefab.json").read_text(encoding="utf-8"))
comp(data["objects"][0], "SpriteRenderer")["properties"].update(sprite="Assets/Sprites/FX/S_Slash_0.hbsprite.json", texture="", color=[1, 1, 1, 1], useCustomSize=False)
write(PROJECT / "Assets/Prefabs/PF_Fx.hbprefab.json", data)
(PROJECT / "Assets/Prefabs/PF_Slash.hbprefab.json").unlink(missing_ok=True)

# ---- 적 행동 상태 머신 ----
def state(sid, name, x, y, duration=1.0, enter="", update="", exit_="", parent="", initial="", clip="", loop=True):
    """clip: 이 상태에서 틀 스프라이트 애니메이션 (Assets/Animations/SA_<clip>)"""
    return {"id": sid, "name": name, "x": x, "y": y, "clip": f"Assets/Animations/SA_{clip}.hbspriteanimation.json" if clip else "", "loop": loop, "duration": duration, "onEnter": enter, "onExit": exit_,
            "onUpdate": update, "parent": parent, "initialChild": initial, "enterConditions": []}


def go(tid, a, b, exit_time=None, conditions=(), event=""):
    return {"id": tid, "from": a, "to": b, "exitTime": 1 if exit_time is None else exit_time, "hasExitTime": exit_time is not None,
            "event": event, "conditions": [{"key": k, "operator": op, "value": v} for k, op, v in conditions]}


def fsm(name, initial, params, states, transitions):
    write(PROJECT / f"Assets/AI/{name}.hbstatemachine.json", {"version": 1, "name": name, "initial": initial, "parameters": params,
                                                             "states": states, "transitions": transitions})


P = lambda n, t, v: {"name": n, "type": t, "value": v}  # noqa: E731
# Enemy::Sense가 모든 적에게 같은 파라미터를 쓰므로 세 상태 머신이 같은 파라미터를 가진다
PARAMS = [P("Distance", "float", 99), P("Stunned", "bool", False), P("Ready", "bool", False), P("Next", "float", 0), P("Near", "bool", False), P("Again", "bool", False)]
stunned = [go("toStun", "any", "stun", conditions=[("Stunned", "equal", True)])]
S, M, C = "Skeleton_", "SkeletonMage_", "SkeletonCaptain_"
fsm("FSM_Skeleton", "appear", PARAMS, [
    state("appear", "등장", 120, 150, 0.6, enter="Halt", clip=S + "Walk"),
    state("chase", "추격", 360, 150, enter="Chase", clip=S + "Walk"),
    state("swing", "휘두르기", 600, 150, 0.4, enter="Chase", clip=S + "WalkAttack", loop=False),  # 걸으며 휘두름 (근접 공격 판정은 Enemy.cpp)
    state("stun", "경직", 360, 320, enter="Stagger", clip=S + "Hurt", loop=False),
], [go("appear_chase", "appear", "chase", exit_time=1), go("chase_swing", "chase", "swing", conditions=[("Near", "equal", True)]),
    go("swing_chase", "swing", "chase", exit_time=1), *stunned, go("stun_chase", "stun", "chase", conditions=[("Stunned", "equal", False)])])

fsm("FSM_SkeletonMage", "appear", PARAMS, [
    state("appear", "등장", 120, 150, 0.6, enter="Halt", clip=M + "Walk"),
    state("move", "거리 유지", 360, 150, enter="Range", clip=M + "Walk"),
    state("windup", "시전 예고", 600, 80, 0.4, enter="Windup", clip=M + "Cast", loop=False),
    state("fire", "3갈래 발사", 840, 150, 0.15, enter="Fire"),
    state("stun", "경직", 360, 320, enter="Stagger", clip=M + "Hurt", loop=False),
], [go("appear_move", "appear", "move", exit_time=1), go("move_windup", "move", "windup", conditions=[("Ready", "equal", True)]),
    go("windup_fire", "windup", "fire", exit_time=1), go("fire_move", "fire", "move", exit_time=1),
    *stunned, go("stun_move", "stun", "move", conditions=[("Stunned", "equal", False)])])

# 해골 대장 (기획서 5장, 보스답게 보강): 등장 → 맴돌며 쉬기(대검 베기 예고) → 패턴을 차례로 (Next, C++ Enemy::NextAfter가 순서를 정함)
#   0 연속 돌진  4 회전 베기  1 나선 탄막  5 충격파(바위 파편 부채꼴)  2 점프 내려찍기  6 금화 비(분노 뒤만)  3 졸개 소환
#   체력 절반 아래면 분노 (포효 자세, 빨라지고 탄·돌진·졸개가 늘어남, C++ Enemy::TakeHit). 자세 그림: tools/make_enemy_poses.py
fsm("FSM_SkeletonCaptain", "intro", PARAMS, [
    state("intro", "등장", 120, 60, 3.4, enter="Halt", clip=C + "Walk"),
    state("rest", "맴돌며 쉬기", 120, 260, 2.6, enter="Prowl", clip=C + "Walk"),  # 맴도는 동안 대검 베기 예고 (Enemy.cpp)
    state("charge", "연속 돌진", 420, 40, initial="windup"),
    state("windup", "돌진 예고", 420, 120, 0.8, enter="Windup", parent="charge", clip=C + "Dash"),
    state("dash", "돌진", 640, 120, 0.45, enter="Dash", parent="charge", clip=C + "Dash"),
    state("ring", "나선 탄막", 420, 240, initial="burst1"),
    state("burst1", "탄막 1", 420, 320, 0.4, enter="Ring", parent="ring", clip=C + "Cast", loop=False),
    state("burst2", "탄막 2", 600, 320, 0.4, enter="Ring", parent="ring", clip=C + "Cast", loop=False),
    state("burst3", "탄막 3", 780, 320, 0.5, enter="Ring", parent="ring", clip=C + "Cast", loop=False),
    state("jump", "점프 내려찍기", 420, 440, initial="jwind"),
    state("jwind", "웅크림", 420, 520, 0.55, enter="JumpWindup", parent="jump", clip=C + "JumpCrouch", loop=False),
    state("jair", "점프", 600, 520, 0.6, enter="Jump", parent="jump", clip=C + "JumpAir"),
    state("jland", "착지", 780, 520, 0.7, enter="Slam", parent="jump", clip=C + "Slam", loop=False),
    state("summon", "졸개 소환", 420, 640, 0.6, enter="Summon", clip=C + "Summon", loop=False),
    state("spin", "회전 베기", 1000, 40, initial="spinwind"),
    state("spinwind", "회전 준비", 1000, 120, 0.7, enter="SpinWindup", parent="spin", clip=C + "SlashWindup", loop=False),
    state("spinning", "회전", 1200, 120, 1.2, enter="Spin", parent="spin", clip=C + "Spin"),
    state("quake", "충격파", 1000, 240, initial="qwind"),
    state("qwind", "충격파 준비", 1000, 320, 0.6, enter="QuakeWindup", parent="quake", clip=C + "Cast", loop=False),
    state("quaking", "내리꽂기", 1200, 320, 0.7, enter="Quake", parent="quake", clip=C + "Slam", loop=False),
    state("rain", "금화 비", 1000, 440, 1.6, enter="GoldRain", clip=C + "Cast", loop=False),
], [go("intro_rest", "intro", "rest", exit_time=1),
    *[go(f"rest_{to}", "rest", to, exit_time=1, conditions=[("Next", "equal", n)])
      for n, to in [(0, "charge"), (1, "ring"), (2, "jump"), (3, "summon"), (4, "spin"), (5, "quake"), (6, "rain")]],
    go("windup_dash", "windup", "dash", exit_time=1),
    go("dash_again", "dash", "windup", exit_time=1, conditions=[("Again", "equal", True)]),
    go("dash_rest", "dash", "rest", exit_time=1, conditions=[("Again", "equal", False)]),
    go("burst1_burst2", "burst1", "burst2", exit_time=1), go("burst2_burst3", "burst2", "burst3", exit_time=1), go("burst3_rest", "burst3", "rest", exit_time=1),
    go("jwind_jair", "jwind", "jair", exit_time=1), go("jair_jland", "jair", "jland", exit_time=1), go("jland_rest", "jland", "rest", exit_time=1),
    go("summon_rest", "summon", "rest", exit_time=1),
    go("spinwind_spinning", "spinwind", "spinning", exit_time=1), go("spinning_rest", "spinning", "rest", exit_time=1),
    go("qwind_quaking", "qwind", "quaking", exit_time=1), go("quaking_rest", "quaking", "rest", exit_time=1),
    go("rain_rest", "rain", "rest", exit_time=1)])
print("BP·프리팹·상태 머신 생성 완료")

# ---- 대사 (기획서 6-6). who: 초상화 (collector·valen·sherry·alea·boss, $me는 지금 캐릭터), name: 이름표, text의 {이름}은 C++가 채움 ----
C, ME = ("collector", "수금원"), ("$me", "$me")
L = lambda who, text: {"who": who[0], "name": who[1], "text": text}  # noqa: E731
DIALOGUE = {
    "Opening1": [L(C, "어서 와. 오늘부터 여기가 네 집이야. 물론 집주인은 우리 사장님이지만."),
                 L(C, "저 위 계단 끝에 있는 게 '마몬의 입'이야. 들어간 놈들은 황금을 들고 나오거나, 아예 안 나오지.")],
    "Intro_valen": [L(ME, "...갚으면 되는 거지.")],
    "Intro_sherry": [L(ME, "술값 정도는 나오겠지?")],
    "Intro_alea": [L(ME, "확률은... 나쁘지 않네.")],
    "Opening2": [L(C, "하나만 기억해. 너무 깊이 들어가면 못 돌아와. 적당히 챙겨서, 지치기 전에 나와."),
                 L(C, "아, 튜토리얼용 제작서랑 빈 병도 챙겨 가. 공짜는 아니고, 빚에 달아 둘게.")],
    "GatherTip": [L(ME, "Q로 제작 창을 열어 보자. 약초 3개와 빈 병으로 회복 물약, 광물로 섬광탄.")],
    "Boss": [L(("boss", "{boss}"), "또 빚쟁이냐. 네 뼈도 황금으로 칠해 주마.")],
    "ReturnStart": [L(ME, "던전이 놓아주지 않는다. 문을 10번 때려 열고, 막히면 E로 섬광탄!")],
    "Settle": [L(C, "남은 빚은 {debt} G. 강화는 던전 밖에선 무뎌지는 거 알지? 남은 골드로 소파라도 바꾸든가."),
               L(C, "적당히 들어가서, 적당히 챙겨서, 지치기 전에 탈출. 그게 이 던전의 규칙이야. 쉬고 싶으면 계단 위 입구에서 하루를 마쳐.")],
}
TIPS = {  # 안내 문구 (기획서 9장), 처음 한 번만 화면 위 띠로. TipTouch<번호>는 모바일용
    "Tip0": "빚을 갚으려면 던전에 들어가야 해. 북쪽 계단으로 가자.",
    "Tip1": "마우스로 조준하고 왼쪽 클릭으로 공격해.", "TipTouch1": "공격 버튼을 누르면 가까운 적을 자동으로 조준해.",
    "Tip2": "Space로 구르면 잠깐 무적이야.", "TipTouch2": "구르기 버튼을 누르면 잠깐 무적이야.",
    "Tip3": "방을 하나 지날 때마다 피로가 쌓여. 왼쪽 막대를 봐.",
    "Tip4": "E로 채집. 무거우면 느려지고 더 빨리 지쳐.", "TipTouch4": "손 버튼으로 채집. 무거우면 느려지고 더 빨리 지쳐.",
    "Tip5": "마물 소재로 각인 결정을 만들면 무기에 능력을 새길 수 있어. 하나만, 새로 하면 덮어써져.",
    "Tip6": "대장장이에게 골드를 내면 무기를 강화할 수 있어. 단, 돌아가면 초기화돼.",
    "Tip7": "[귀환]을 얻었다. 가방(Tab)을 열고 Enter로 써서 집으로 돌아가자.", "TipTouch7": "[귀환]을 얻었다. 가방 버튼을 열고 [귀환]을 눌러 집으로 돌아가자.",
}
DIALOGUE.update({k: [L(ME, v)] for k, v in TIPS.items()})
write(PROJECT / "Assets/Data/DT_Dialogue.hbdata.json", {"version": 1, "name": "DT_Dialogue", "columns": [{"name": "lines", "type": "json"}],
                                                         "rows": {k: {"lines": v} for k, v in DIALOGUE.items()}})
