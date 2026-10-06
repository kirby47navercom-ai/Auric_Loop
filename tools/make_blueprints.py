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
    p.update(texture="" if asset else texture, sprite=asset, width=w, height=h, pixelsPerUnit=PPU, sortingOrder=order, color=[1, 1, 1, 1], useCustomSize=False)
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
ENEMY_EVENTS = ["Halt", "Chase", "Range", "Stagger", "Windup", "Fire", "Dash", "Ring", "Summon"]  # 상태에 들어갈 때만 (매 프레임 이동은 C++ 게임 규칙이 한 번에)
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
ENEMIES = {
    "BP_Skeleton": ("Skeleton", {"Enemy.DisplayName": "해골", "Enemy.Brain": "Assets/AI/FSM_Skeleton.hbstatemachine.json"}),
    "BP_SkeletonMage": ("SkeletonMage", {"Enemy.DisplayName": "해골 마법사", "Enemy.Brain": "Assets/AI/FSM_SkeletonMage.hbstatemachine.json",
                                                   "Enemy.KeepDistance": 6, "Enemy.GoldMin": 2, "Enemy.GoldMax": 3}),
    "BP_SkeletonCaptain": ("SkeletonCaptain", {"Enemy.DisplayName": "해골 대장", "Enemy.ShotClip": "Assets/Animations/SA_BossOrb.hbspriteanimation.json", "Enemy.Brain": "Assets/AI/FSM_SkeletonCaptain.hbstatemachine.json",
                                                        "Enemy.Boss": True, "Enemy.MaxHp": 40, "Enemy.Speed": 3.6, "Enemy.Radius": 1.4,
                                                        "Enemy.GoldMin": 30, "Enemy.GoldMax": 30}),
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
SOUNDS = [f"{k}=Assets/Audio/S_{k}.hbaudioasset.json" for k in ["Slash", "Arrow", "Bolt", "Boom", "Hit", "Kill", "Hurt", "Coin", "Dodge", "DoorHit", "DoorOpen",
                                                               "Flash", "Craft", "Gather", "Select", "BossCharge"]]
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
for name, who in (("BP_Test_Valen", 0), ("BP_Test_Sherry", 1), ("BP_Test_Alea", 2)):
    write(BP / f"{name}.hbblueprint.json", blueprint(name, "Assets/Blueprints/BP_TopDownShooter.hbblueprint.json",
                                                     defaults={"TopDownShooter.Character": who, "TopDownShooter.Seed": 7, "TopDownShooter.ShowFps": True, "TopDownShooter.MaxHp": 30}))

# ---- 던전 데이터 (편집기 데이터 표에서 고침, 다시 빌드할 필요 없음) ----
# 웨이브: | 로 웨이브를 나누고 , 로 적을 나눔. 기호는 BP_AuricRules.Enemies (S 해골, M 해골 마법사, C 해골 대장)
write(PROJECT / "Assets/Data/DA_Floor.hbdata.json", {"version": 1, "name": "DA_Floor", "fields": [
    {"name": "rooms", "type": "float", "value": 11},    # 방 수 (시작·보스·상점·채집 + 나머지 전투방). 시작에서 가지를 뻗어 나무 모양으로 이음
    {"name": "loops", "type": "float", "value": 1},     # 나무에 더 이어 붙이는 고리 수 (돌아가는 길)
    {"name": "spacing", "type": "float", "value": 36}]})  # 격자 한 칸 (m)
ROOM_COLUMNS = [("minHalf", "float"), ("maxHalf", "float"), ("square", "bool"), ("waves", "string"), ("monsterDrop", "bool")]
ROOM_ROWS = {
    "Start": (6, 6, True, "", False),
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
PARAMS = [P("Distance", "float", 99), P("Stunned", "bool", False), P("Ready", "bool", False), P("Next", "float", 0), P("Near", "bool", False)]
stunned = [go("toStun", "any", "stun", conditions=[("Stunned", "equal", True)])]
S, M, C = "Skeleton_", "SkeletonMage_", "SkeletonCaptain_"
fsm("FSM_Skeleton", "appear", PARAMS, [
    state("appear", "등장", 120, 150, 0.6, enter="Halt", clip=S + "Walk"),
    state("chase", "추격", 360, 150, enter="Chase", clip=S + "Walk"),
    state("swing", "휘두르기", 600, 150, 0.4, enter="Chase", clip=S + "Attack", loop=False),  # 붙으면 칼을 휘두름 (피해는 접촉)
    state("stun", "경직", 360, 320, enter="Stagger", clip=S + "Hurt", loop=False),
], [go("appear_chase", "appear", "chase", exit_time=1), go("chase_swing", "chase", "swing", conditions=[("Near", "equal", True)]),
    go("swing_chase", "swing", "chase", exit_time=1), *stunned, go("stun_chase", "stun", "chase", conditions=[("Stunned", "equal", False)])])

fsm("FSM_SkeletonMage", "appear", PARAMS, [
    state("appear", "등장", 120, 150, 0.6, enter="Halt", clip=M + "Walk"),
    state("move", "거리 유지", 360, 150, enter="Range", clip=M + "Walk"),
    state("windup", "시전 예고", 600, 80, 0.4, enter="Windup", clip=M + "Attack", loop=False),
    state("fire", "3갈래 발사", 840, 150, 0.15, enter="Fire"),
    state("stun", "경직", 360, 320, enter="Stagger", clip=M + "Hurt", loop=False),
], [go("appear_move", "appear", "move", exit_time=1), go("move_windup", "move", "windup", conditions=[("Ready", "equal", True)]),
    go("windup_fire", "windup", "fire", exit_time=1), go("fire_move", "fire", "move", exit_time=1),
    *stunned, go("stun_move", "stun", "move", conditions=[("Stunned", "equal", False)])])

# 해골 대장 (기획서 5장): 쉬며 추격 → 돌진(예고 1초) → 쉬기 → 원형 탄막 2회 → 쉬기 → 졸개 소환 → … (Next가 다음 패턴)
fsm("FSM_SkeletonCaptain", "intro", PARAMS, [
    state("intro", "등장 대사", 120, 60, 3.0, enter="Halt", clip=C + "Walk"),
    state("rest", "쉬며 추격", 120, 260, 1.5, enter="Chase", clip=C + "Walk"),
    state("charge", "돌진 패턴", 420, 60, initial="windup"),
    state("windup", "돌진 예고", 420, 140, 1.0, enter="Windup", parent="charge", clip=C + "Attack", loop=False),
    state("dash", "돌진", 640, 140, 0.6, enter="Dash", parent="charge", clip=C + "Walk"),
    state("ring", "탄막 패턴", 420, 300, initial="burst1"),
    state("burst1", "탄막 1", 420, 380, 0.5, enter="Ring", parent="ring", clip=C + "Attack", loop=False),
    state("burst2", "탄막 2", 640, 380, 0.5, enter="Ring", parent="ring", clip=C + "Attack", loop=False),
    state("summon", "졸개 소환", 420, 520, 0.4, enter="Summon", clip=C + "Attack", loop=False),
], [go("intro_rest", "intro", "rest", exit_time=1),
    go("rest_charge", "rest", "charge", exit_time=1, conditions=[("Next", "equal", 0)]),
    go("rest_ring", "rest", "ring", exit_time=1, conditions=[("Next", "equal", 1)]),
    go("rest_summon", "rest", "summon", exit_time=1, conditions=[("Next", "equal", 2)]),
    go("windup_dash", "windup", "dash", exit_time=1), go("dash_rest", "dash", "rest", exit_time=1),
    go("burst1_burst2", "burst1", "burst2", exit_time=1), go("burst2_rest", "burst2", "rest", exit_time=1),
    go("summon_rest", "summon", "rest", exit_time=1)])
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
write(PROJECT / "Assets/Data/DT_Dialogue.hbdata.json", {"version": 1, "name": "DT_Dialogue", "columns": [{"name": "lines", "type": "json"}],
                                                         "rows": {k: {"lines": v} for k, v in DIALOGUE.items()}})
