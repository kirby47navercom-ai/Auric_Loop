"""BP·프리팹·적 상태 머신을 처음 한 번 만든다. 이후에는 편집기에서 고친다 (이 스크립트를 다시 돌리면 덮어씀).

실행: python tools/make_blueprints.py   (그다음 HBEngine runtime/node.exe tools/sync_cpp.mjs 로 C++ 사본 동기화)

  Assets/Blueprints/BP_TopDownShooter      게임 규칙 (장면마다 Director 하나). Tick → Update, 소리 이벤트 → Play Sound
  Assets/Blueprints/Enemies/BP_Enemy       적 공통: 그림·충돌·풀 + 상태 머신 상태마다 부르는 사용자 이벤트 → C++ Enemy 함수
                     BP_Skeleton / BP_SkeletonMage / BP_SkeletonCaptain   BP_Enemy 자식. 수치·그림·상태 머신만 덮어씀
  Assets/Blueprints/BP_AuricRules           밸런스·에셋 경로 (장면마다 하나, 기본값 한 곳에서 고침)
  Assets/Blueprints/BP_Interactable / BP_SpawnPoint / BP_RoomInfo
  Assets/Blueprints/BP_Test_Sherry / BP_Test_Alea   검사용 (BP_TopDownShooter 자식, 캐릭터만 다름)
  Assets/Prefabs/PF_EnemyShot / PF_PlayerShot / PF_Coin / PF_Slash   생성할 때 엔진이 알아서 풀로 재사용
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


def sprite(texture, w, h, order=2):
    p = copy.deepcopy(comp(objs["Enemy0"], "SpriteRenderer")["properties"])
    p.update(texture=texture, sprite="", width=w, height=h, pixelsPerUnit=PPU, sortingOrder=order, color=[1, 1, 1, 1], useCustomSize=False)
    return {"id": "sprite", "name": "SpriteRenderer", "type": "SpriteRenderer", "properties": p}


def box(extent, center=(0, 0, 0), trigger=False, layer=0, mask=4294967295):
    p = copy.deepcopy(comp(objs["Enemy0"], "BoxCollider2D")["properties"])
    p.update(extent=list(extent), center=list(center), trigger=trigger, layer=layer, mask=mask)
    return {"id": "collider", "name": "BoxCollider2D", "type": "BoxCollider2D", "properties": p}


def body():
    p = copy.deepcopy(comp(objs["Enemy0"], "Rigidbody2D")["properties"])
    return {"id": "body", "name": "Rigidbody2D", "type": "Rigidbody2D", "properties": p}


def pool(keep):
    return {"id": "pool", "name": "PooledActor", "type": "PooledActor", "properties": {"enabled": True, "initiallyActive": False, "maxInactive": keep}}


# ---- 게임 규칙 BP: Tick → Update(delta), 소리 이벤트 → Play Sound ----
gm = json.loads((BP / "BP_TopDownShooter.hbblueprint.json").read_text(encoding="utf-8"))
keep = {"beginPlay", "tick", "endPlay", "ev_sfx", "play_sfx", "ev_music", "stop_music", "play_music"}
gm["nodes"] = [n for n in gm["nodes"] if n["id"] in keep] + [node("tick_update", "tick", 100, 240), node("update", "nativeCall", 430, 240, nativeId="TopDownShooter.Update")]
gm["edges"] = [e for e in gm["edges"] if e["from"]["node"] in keep and e["to"]["node"] in keep] + [
    edge("tick_update", "then", "update", "exec"), edge("tick_update", "delta", "update", "delta")]
gm["variables"] = []
write(BP / "BP_TopDownShooter.hbblueprint.json", gm)

# ---- 적 ----
ENEMY_EVENTS = ["Sense", "Halt", "Chase", "Range", "Windup", "Fire", "Dash", "Ring", "Summon"]
nodes = [node("begin", "beginPlay", 60, 40), node("awake", "nativeCall", 360, 40, nativeId="Enemy.Awake")]
edges = [edge("begin", "then", "awake", "exec")]
for i, ev in enumerate(ENEMY_EVENTS):
    nodes += [node(f"ev_{ev}", "customEvent", 60, 160 + i * 110, options={"eventName": ev}),
              node(f"call_{ev}", "nativeCall", 360, 160 + i * 110, nativeId=f"Enemy.{ev}")]
    edges.append(edge(f"ev_{ev}", "then", f"call_{ev}", "exec"))
enemy_layer = dict(layer=2, mask=1 | 4)  # 벽(0)·플레이어(0)·다른 적(2)과 부딪힘. 예전엔 trigger라 벽을 지나갔음
write(BP / "Enemies/BP_Enemy.hbblueprint.json", blueprint(
    "BP_Enemy", "Enemy", [transform(), sprite("Assets/Sprites/Skeleton_Idle.png", 0.90625, 1.375), box((0.35, 0.3, 0.1), (0, -0.35, 0), **enemy_layer), body(), pool(16)],
    nodes, edges, native_from=True))
ENEMIES = {
    "BP_Skeleton": ("Skeleton_Idle.png", {"Enemy.DisplayName": "해골", "Enemy.Brain": "Assets/AI/FSM_Skeleton.hbstatemachine.json"}),
    "BP_SkeletonMage": ("SkeletonMage_Idle.png", {"Enemy.DisplayName": "해골 마법사", "Enemy.Brain": "Assets/AI/FSM_SkeletonMage.hbstatemachine.json",
                                                   "Enemy.KeepDistance": 6, "Enemy.GoldMin": 2, "Enemy.GoldMax": 3}),
    "BP_SkeletonCaptain": ("SkeletonCaptain_Idle.png", {"Enemy.DisplayName": "해골 대장", "Enemy.Brain": "Assets/AI/FSM_SkeletonCaptain.hbstatemachine.json",
                                                        "Enemy.Boss": True, "Enemy.MaxHp": 40, "Enemy.Speed": 3.6, "Enemy.Radius": 1.4,
                                                        "Enemy.GoldMin": 30, "Enemy.GoldMax": 30}),
}
from PIL import Image  # noqa: E402
for name, (texture, defaults) in ENEMIES.items():
    w, h = Image.open(PROJECT / "Assets/Sprites" / texture).size
    over = {"sprite": {"texture": f"Assets/Sprites/{texture}", "width": w / PPU, "height": h / PPU}}
    if name == "BP_SkeletonCaptain":
        over["collider"] = {"extent": [1.0, 0.8, 0.1], "center": [0, -0.6, 0]}
    write(BP / f"Enemies/{name}.hbblueprint.json", blueprint(name, "Assets/Blueprints/Enemies/BP_Enemy.hbblueprint.json", defaults=defaults, overrides=over))

# ---- 상호작용·적 등장 자리·방 정보 ----
write(BP / "BP_Interactable.hbblueprint.json", blueprint(
    "BP_Interactable", "Interactable", [transform(), sprite("Assets/Sprites/Prop_DebtBoard.png", 2, 2, order=1), box((0.8, 0.4, 0.5), (0, -0.6, 0))], native_from=True))
SOUNDS = [f"{k}=Assets/Audio/S_{k}.hbaudioasset.json" for k in ["Slash", "Arrow", "Bolt", "Boom", "Hit", "Kill", "Hurt", "Coin", "Dodge", "DoorHit", "DoorOpen",
                                                               "Flash", "Craft", "Gather", "Select", "BossCharge"]]
SOUNDS += [f"{k}=Assets/Audio/S_BGM_{k}.hbaudioasset.json" for k in ["Hub", "Dungeon", "Boss", "Return"]]
rules = blueprint("BP_AuricRules", "AuricRules", [transform()], native_from=True, defaults={
    "AuricRules.Debts": [9800, 14500, 31700],  # 기획서 6-4
    "AuricRules.CharacterSprites": ["Assets/Sprites/Valen/S_Valen_", "Assets/Sprites/Sherry/S_Sherry_", "Assets/Sprites/Alea/S_Alea_"],
    "AuricRules.Sounds": SOUNDS})
rules["settings"].update(tickEnabled=False, overlapEnabled=False)
write(BP / "BP_AuricRules.hbblueprint.json", rules)
write(BP / "BP_SpawnPoint.hbblueprint.json", blueprint("BP_SpawnPoint", "SpawnPoint", [transform()], native_from=True))
write(BP / "BP_RoomInfo.hbblueprint.json", blueprint("BP_RoomInfo", "RoomInfo", [transform()], native_from=True))
for name, who in (("BP_Test_Sherry", 1), ("BP_Test_Alea", 2)):
    write(BP / f"{name}.hbblueprint.json", blueprint(name, "Assets/Blueprints/BP_TopDownShooter.hbblueprint.json", defaults={"TopDownShooter.Character": who}))
(BP / "BP_Hub.hbblueprint.json").unlink(missing_ok=True)  # 거점도 같은 BP를 씀 (생성·찾기로 풀 배열이 필요 없음)

# ---- 생성용 프리팹 (엔진이 PooledActor로 알아서 재사용) ----
def prefab(name, obj_id, texture=None, w=None, h=None, keep_pool=64, order=3, trigger=True, layer=3, mask=4, collider=True, rigid=True):
    o = copy.deepcopy(objs[obj_id])
    o.update(id="root", name=name[3:], position=[0, 0, 0.15])
    kinds = {"Transform", "SpriteRenderer"} | ({"BoxCollider2D"} if collider else set()) | ({"Rigidbody2D"} if rigid else set())
    o["components"] = [c for c in o["components"] if c["type"] in kinds] + [pool(keep_pool)]
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
comp(data["objects"][0], "SpriteRenderer")["properties"].update(color=[0.75, 0.45, 1.0, 1], width=0.3, height=0.3)
write(shot, data)
prefab("PF_PlayerShot", "Bullet0", keep_pool=24, order=4)
data = json.loads((PROJECT / "Assets/Prefabs/PF_PlayerShot.hbprefab.json").read_text(encoding="utf-8"))
comp(data["objects"][0], "SpriteRenderer")["properties"].update(sprite="Assets/Sprites/FX/S_Arrow.hbsprite.json", texture="", color=[1, 1, 1, 1], useCustomSize=False)
comp(data["objects"][0], "BoxCollider2D")["properties"]["mask"] = 0
write(PROJECT / "Assets/Prefabs/PF_PlayerShot.hbprefab.json", data)
cw, ch = Image.open(PROJECT / "Assets/Sprites/Item_Coin.png").size
prefab("PF_Coin", "Enemy0", "Assets/Sprites/Item_Coin.png", cw / PPU, ch / PPU, keep_pool=24, order=1, collider=False, rigid=False)
sw, sh = Image.open(PROJECT / "Assets/Sprites/FX_Slash.png").size
prefab("PF_Slash", "Bullet0", "Assets/Sprites/FX_Slash.png", sw / PPU, sh / PPU, keep_pool=2, order=5, collider=False, rigid=False)

# ---- 적 행동 상태 머신 ----
def state(sid, name, x, y, duration=1.0, enter="", update="", exit_="", parent="", initial=""):
    return {"id": sid, "name": name, "x": x, "y": y, "clip": "", "loop": True, "duration": duration, "onEnter": enter, "onExit": exit_,
            "onUpdate": update, "parent": parent, "initialChild": initial, "enterConditions": []}


def go(tid, a, b, exit_time=None, conditions=(), event=""):
    return {"id": tid, "from": a, "to": b, "exitTime": 1 if exit_time is None else exit_time, "hasExitTime": exit_time is not None,
            "event": event, "conditions": [{"key": k, "operator": op, "value": v} for k, op, v in conditions]}


def fsm(name, initial, params, states, transitions):
    write(PROJECT / f"Assets/AI/{name}.hbstatemachine.json", {"version": 1, "name": name, "initial": initial, "parameters": params,
                                                             "states": states, "transitions": transitions})


P = lambda n, t, v: {"name": n, "type": t, "value": v}  # noqa: E731
# Enemy::Sense가 모든 적에게 같은 파라미터를 쓰므로 세 상태 머신이 같은 파라미터를 가진다
PARAMS = [P("Distance", "float", 99), P("Stunned", "bool", False), P("Ready", "bool", False), P("Next", "float", 0)]
stunned = [go("toStun", "any", "stun", conditions=[("Stunned", "equal", True)])]
fsm("FSM_Skeleton", "appear", PARAMS, [
    state("appear", "등장", 120, 150, 0.6, enter="Halt", update="Sense"),
    state("chase", "추격", 360, 150, update="Chase"),
    state("stun", "경직", 360, 320, enter="Halt", update="Sense"),
], [go("appear_chase", "appear", "chase", exit_time=1), *stunned, go("stun_chase", "stun", "chase", conditions=[("Stunned", "equal", False)])])

fsm("FSM_SkeletonMage", "appear", PARAMS, [
    state("appear", "등장", 120, 150, 0.6, enter="Halt", update="Sense"),
    state("move", "거리 유지", 360, 150, update="Range"),
    state("windup", "시전 예고", 600, 80, 0.4, enter="Windup", update="Sense"),
    state("fire", "3갈래 발사", 840, 150, 0.15, enter="Fire", update="Sense"),
    state("stun", "경직", 360, 320, enter="Halt", update="Sense"),
], [go("appear_move", "appear", "move", exit_time=1), go("move_windup", "move", "windup", conditions=[("Ready", "equal", True)]),
    go("windup_fire", "windup", "fire", exit_time=1), go("fire_move", "fire", "move", exit_time=1),
    *stunned, go("stun_move", "stun", "move", conditions=[("Stunned", "equal", False)])])

# 해골 대장 (기획서 5장): 쉬며 추격 → 돌진(예고 1초) → 쉬기 → 원형 탄막 2회 → 쉬기 → 졸개 소환 → … (Next가 다음 패턴)
fsm("FSM_SkeletonCaptain", "intro", PARAMS, [
    state("intro", "등장 대사", 120, 60, 3.0, enter="Halt", update="Sense"),
    state("rest", "쉬며 추격", 120, 260, 1.5, update="Chase"),
    state("charge", "돌진 패턴", 420, 60, initial="windup"),
    state("windup", "돌진 예고", 420, 140, 1.0, enter="Windup", update="Sense", parent="charge"),
    state("dash", "돌진", 640, 140, 0.6, enter="Dash", update="Sense", parent="charge"),
    state("ring", "탄막 패턴", 420, 300, initial="burst1"),
    state("burst1", "탄막 1", 420, 380, 0.5, enter="Ring", update="Sense", parent="ring"),
    state("burst2", "탄막 2", 640, 380, 0.5, enter="Ring", update="Sense", parent="ring"),
    state("summon", "졸개 소환", 420, 520, 0.4, enter="Summon", update="Sense"),
], [go("intro_rest", "intro", "rest", exit_time=1),
    go("rest_charge", "rest", "charge", exit_time=1, conditions=[("Next", "equal", 0)]),
    go("rest_ring", "rest", "ring", exit_time=1, conditions=[("Next", "equal", 1)]),
    go("rest_summon", "rest", "summon", exit_time=1, conditions=[("Next", "equal", 2)]),
    go("windup_dash", "windup", "dash", exit_time=1), go("dash_rest", "dash", "rest", exit_time=1),
    go("burst1_burst2", "burst1", "burst2", exit_time=1), go("burst2_rest", "burst2", "rest", exit_time=1),
    go("summon_rest", "summon", "rest", exit_time=1)])
print("BP·프리팹·상태 머신 생성 완료")
