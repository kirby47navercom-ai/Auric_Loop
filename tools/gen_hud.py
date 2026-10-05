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

CORNER = {"tl": (0, 0), "tr": (1, 0), "bl": (0, 1), "br": (1, 1), "t": (0.5, 0), "c": (0.5, 0.5), "b": (0.5, 1)}


def node(name, kind, corner, x, y, w_, h, z=10, **props):
    """corner 기준으로 (x, y)만큼 떨어진 곳에 w_ x h 크기로 둔다. 오른쪽/아래 기준이면 x, y를 안쪽으로 잰다."""
    ax, ay = CORNER[corner]
    n = copy.deepcopy(base)
    n.update(id=name, name=name, type=kind, parent="root", events={}, bindings={})
    n["slot"] = {"anchors": [ax, ay, ax, ay], "offset": [-x if ax == 1 else x, -y if ay == 1 else y, w_, h],
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

# ---- 제작 창 (Q). UI 키트 v8 crafting 배치 그대로, 화면 가운데. 처음엔 숨김 ----
PW, PH = 920, 516  # craft_panel.png 크기


def panel(name, kind, px, py, w_, h_, z, **props):
    """제작 창 안쪽 좌표(px, py)로 둔다. 화면 가운데 기준."""
    n = node(name, kind, "c", px - PW / 2, py - PH / 2, w_, h_, z, visible=False, **props)
    n["slot"]["alignment"] = [0, 0]
    return n


def panel_image(name, file, px, py, z=41):
    iw, ih = Image.open(PROJECT / KIT / file).size
    return panel(name, "Image", px, py, iw, ih, z, texture=KIT + file)


def panel_text(name, value, px, py, w_, h_, size=16, align="left"):
    return panel(name, "Text", px, py, w_, h_, 42, text=value, fontSize=size, color="#fff3e5", align=align)


panel_image("CraftPanel", "craft_panel.png", 0, 0, z=40)
panel_text("CraftTitle", "제작", 32, 32, 300, 28, size=22)
panel_text("CraftSub", "제작서를 보유한 아이템  (1~5 선택, Enter 제작, Q 닫기)", 32, 70, 400, 22, size=13)
SLOTS = [(32, 128), (148, 128), (264, 128), (32, 244), (148, 244)]  # 키트 slot_01~05
ICONS = ["craft_item_potion.png", "craft_item_flash.png", "craft_item_crystal.png", "craft_item_crystal.png", "craft_item_crystal.png"]
for i, ((sx, sy), icon) in enumerate(zip(SLOTS, ICONS), 1):
    iw, ih = Image.open(PROJECT / KIT / icon).size
    panel_image(f"CraftIcon{i}", icon, sx + (104 - iw) // 2, sy + (104 - ih) // 2)
    panel_text(f"CraftKey{i}", str(i), sx + 8, sy + 4, 20, 18, size=12)
    t = panel(f"CraftSlot{i}", "TouchButton", sx, sy, 104, 104, 44, inputKey=str(i), inputMode="keys",
              background="#00000000", pressed="#ffffff22", hover="#ffffff11")
panel_image("CraftSelect", "craft_select.png", 32, 128, z=43)
panel_text("CraftName", "회복 물약", 480, 136, 380, 26, size=20)
panel_text("CraftEffect", "체력 1 회복", 568, 190, 300, 22)
panel_text("CraftType", "소모 아이템", 568, 220, 300, 20, size=13)
panel_text("CraftNeed", "필요 소재", 480, 272, 300, 22)
panel_text("CraftCost", "약초 0 / 3    빈 병 1 / 1", 480, 312, 380, 22)
panel_text("CraftConfirm", "제작하기", 480, 400, 380, 30, size=18, align="center")
panel("CraftConfirmButton", "TouchButton", 480, 384, 380, 64, 44, inputKey="enter", inputMode="keys",
      background="#00000000", pressed="#ffffff22", hover="#ffffff11")
panel("CraftClose", "TouchButton", 820, 24, 72, 72, 44, inputKey="q", inputMode="keys",
      background="#00000000", pressed="#ffffff22", hover="#ffffff11")
panel_text("CraftFooter", "제작 중에도 전투가 계속됩니다", 480, 462, 380, 20, size=12)

# ---- 대화창 (기획서 6-5): 아래 가운데, 초상화·이름·본문·넘김 표시. 처음엔 숨김 ----
DW, DH = 1000, 170


def dialog(name, kind, px, py, w_, h_, z, **props):
    n = node(name, kind, "b", 0, 0, w_, h_, z, visible=False, **props)
    n["slot"].update(anchors=[0.5, 1, 0.5, 1], alignment=[0, 0], offset=[px - DW / 2, -(DH + 24) + py, w_, h_])
    return n


dialog("DialogBox", "Image", 0, 0, DW, DH, 50, texture=KIT + "dialog_box.png")
dialog("DialogPortraitFrame", "Image", 20, 19, 132, 132, 51, texture=KIT + "dialog_portrait_frame.png")
for who in ("collector", "valen", "boss"):  # 엔진 UI는 실행 중 그림을 바꿀 수 없어 말하는 사람마다 하나씩 두고 보이기만 바꾼다
    iw, ih = Image.open(PROJECT / KIT / f"portrait_{who}.png").size
    dialog(f"DialogPortrait_{who}", "Image", 26 + (120 - iw) // 2, 25 + (120 - ih) // 2, iw, ih, 52, texture=KIT + f"portrait_{who}.png")
dialog("DialogName", "Text", 172, 22, 400, 28, 52, text="수금원", fontSize=20, color="#ffd666")
dialog("DialogText", "Text", 172, 58, 790, 90, 52, text="", fontSize=18, color="#fff3e5")
dialog("DialogNext", "Text", DW - 60, DH - 44, 40, 28, 52, text="▼", fontSize=18, color="#ffd666")
dialog("DialogTouch", "TouchButton", 0, 0, DW, DH, 53, inputKey="e", inputMode="keys",
       background="#00000000", pressed="#ffffff11", hover="#00000000")


# ---- 타이틀·로딩 (자료: 타이틀 시안 v2, 로딩 화면 초안 금화 GIF). 화면 전체를 덮는다 ----
def full(name, kind, z, **props):
    n = node(name, kind, "tl", 0, 0, 0, 0, z, **props)
    n["slot"].update(anchors=[0, 0, 1, 1], offset=[0, 0, 0, 0], alignment=[0, 0])
    return n


full("TitleBack", "Panel", 90, background="#05090aff")
full("TitleScreen", "Image", 91, texture=KIT + "title_v2.png")
hint = node("TitleHint", "Text", "b", 0, 0, 600, 30, 92, text="클릭하거나 아무 키나 눌러 시작", fontSize=16, color="#cdb98a", align="center")
hint["slot"].update(anchors=[0.5, 1, 0.5, 1], alignment=[0.5, 1], offset=[0, -40, 600, 30])
full("LoadingBack", "Panel", 95, background="#0d1716ff")
node("LoadingCoin", "Image", "c", 0, -40, 144, 144, 96, texture=KIT + "loading_coin.gif")
node("LoadingText", "Text", "c", 0, 70, 300, 30, 96, text="Loading...", fontSize=20, color="#fff3e5", align="center")

w["nodes"] = nodes
WIDGET.write_text(json.dumps(w, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print("제작 창·대화창·타이틀 추가:", len(nodes), "nodes")
