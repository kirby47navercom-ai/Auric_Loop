"""전투 HUD 위젯(W_TopDown) 생성기. UI 키트 v8 은색 테마, 기준 화면 1280x720.

실행: python tools/gen_hud.py
배치 근거: 자료/Workspace_20260920-20261004/20261003_174950350 의 play_screen 시안, docs/데모_기획서.md 8장
요소 이름은 C++ (TopDownShooter::Hud)에서 그대로 쓴다.
"""
import copy
import json
from pathlib import Path

from PIL import Image

PROJECT = Path(__file__).resolve().parent.parent / "AuricLoop"
WIDGET = PROJECT / "Assets/UI/W_TopDown.hbwidget.json"
KIT = "Assets/UI/Kit/"

w = json.loads(WIDGET.read_text(encoding="utf-8"))
base = next(n for n in w["nodes"] if n["name"] == "Title")
root = next(n for n in w["nodes"] if n["type"] == "Canvas")
nodes = [root]

CORNER = {"tl": (0, 0), "tr": (1, 0), "bl": (0, 1), "br": (1, 1), "t": (0.5, 0)}


def node(name, kind, corner, x, y, w_, h, z=10, **props):
    """corner 기준으로 (x, y)만큼 떨어진 곳에 w_ x h 크기로 둔다. 오른쪽/아래 기준이면 x, y를 안쪽으로 잰다."""
    ax, ay = CORNER[corner]
    n = copy.deepcopy(base)
    n.update(id=name, name=name, type=kind, parent="root", events={}, bindings={})
    n["slot"] = {"anchors": [ax, ay, ax, ay], "offset": [x if ax < 1 else -x, y if ay < 1 else -y, w_, h],
                 "alignment": [ax, ay], "zIndex": z, "fill": 0}
    n["properties"].update({"text": "", "texture": "", "background": "#00000000", "deviceVisibility": "all", **props})
    nodes.append(n)
    return n


def image(name, file, corner, x, y, z=10, **props):
    iw, ih = Image.open(PROJECT / KIT / file).size
    return node(name, "Image", corner, x, y, iw, ih, z, texture=KIT + file, **props)


def text(name, value, corner, x, y, w_, h, size=18, align="left", z=20):
    return node(name, "Text", corner, x, y, w_, h, z, text=value, fontSize=size, color="#fff3e5", align=align)


def touch(name, key, corner, x, y, size):
    """모바일용 투명 버튼. 그림은 같은 자리의 Image가 보여 준다."""
    return node(name, "TouchButton", corner, x, y, size, size, 30, inputKey=key, inputMode="keys",
                deviceVisibility="touch", background="#00000000", pressed="#ffffff22", hover="#00000000")


# 왼쪽 위: HP, 적재량, 피로도
image("HpBack", "hp_back.png", "tl", 24, 24)
for i in (1, 2, 3):
    image(f"HpFill{i}", f"hp_fill_{i}.png", "tl", 24 + 64, 24 + 14, z=11, visible=i == 3)
text("HpText", "3 / 3", "tl", 24 + 64, 24 + 14, 220, 28, align="center")
image("BagIcon", "icon_bag.png", "tl", 30, 92)
text("WeightText", "0 / 100", "tl", 68, 86, 160, 32)
text("GoldText", "0 G", "tl", 340, 34, 200, 32, size=18)
image("FatigueBack", "fatigue_back.png", "tl", 24, 132)
for p in range(0, 101, 10):
    image(f"Fatigue{p:03d}", f"fatigue_{p:03d}.png", "tl", 24 + 8, 132 + 8, z=11, visible=p == 0)
image("FatigueTicks", "fatigue_ticks.png", "tl", 24 + 8, 132 + 52, z=12)

# 위 가운데: 탐색 층 / 상태 문구
text("Title", "탐색", "t", 0, 18, 400, 28, size=20, align="center")
text("Floor", "1F", "t", 0, 44, 400, 22, size=14, align="center")
text("Hint", "", "t", 0, 70, 600, 24, size=15, align="center")  # 가까운 상호작용 안내 (E: 채집 등)

# 오른쪽 위: 가방, 일시정지, 미니맵 틀
image("PauseButton", "btn_pause.png", "tr", 24, 24)
image("BagButton", "btn_inventory.png", "tr", 24 + 72 + 12, 24)
image("Minimap", "minimap.png", "tr", 24, 108)

# 오른쪽 아래: 공격, 회피, 상호작용, 제작 (UI 키트 시안 배치)
image("AttackButton", "btn_attack_valen.png", "br", 40, 40)
image("DodgeButton", "btn_dodge.png", "br", 40 + 140 + 16, 24)
image("InteractButton", "btn_interact.png", "br", 40 + 140 + 4, 40 + 96 + 8)
image("CraftButton", "btn_craft.png", "br", 40 + 24, 40 + 140 + 16)
touch("AttackTouch", "LeftMouseButton", "br", 40, 40, 140)
touch("DodgeTouch", "space", "br", 40 + 140 + 16, 24, 96)
touch("InteractTouch", "e", "br", 40 + 140 + 4, 40 + 96 + 8, 88)
touch("CraftTouch", "q", "br", 40 + 24, 40 + 140 + 16, 96)

# 왼쪽 아래: 조이스틱(모바일만). 기존 Joystick 입력 노드를 키트 그림 위에 둔다.
move = copy.deepcopy(next(n for n in w["nodes"] if n["type"] == "Joystick"))
move["slot"].update(offset=[48, -48, 152, 152])
move["properties"].update(background="#00000000", deviceVisibility="touch")
image("JoystickArt", "joystick.png", "bl", 48, 48, z=19, deviceVisibility="touch")
nodes.append(move)

w["nodes"] = nodes
WIDGET.write_text(json.dumps(w, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print("HUD 갱신:", WIDGET.name, len(nodes), "nodes")
