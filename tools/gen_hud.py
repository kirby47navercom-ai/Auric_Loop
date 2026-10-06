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
node("Fps", "Text", "tl", 24, 380, 300, 26, 60, text="", fontSize=16, color="#7dff9a", visible=False)  # F3 성능 표시
image("FatigueBack", "fatigue_back.png", "tl", 24, 132)
# 피로도: 세로 막대 하나 (C++ UI::SetValue 0~1, 아래에서 위로 참)
node("Fatigue", "ProgressBar", "tl", 24 + 8, 132 + 8, 16, 220, 11, value=0, max=1, fillDirection="bottomToTop",
     fillTexture=KIT + "fatigue_100.png", backgroundTexture="", background="#00000000", accent="#00000000")
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
image("AttackButton", "btn_attack_valen.png", "br", 40, 40)  # 캐릭터·귀환 테마에 맞는 그림은 C++ UI::SetTexture
image("DodgeButton", "btn_dodge.png", "br", 40 + 140 + 16, 24)
image("InteractButton", "btn_interact.png", "br", 40 + 140 + 4, 40 + 96 + 8)
image("CraftButton", "btn_craft.png", "br", 40 + 24, 40 + 140 + 16)
touch("AttackTouch", "LeftMouseButton", "br", 40, 40, 140)  # 터치로 누르면 C++가 마지막 입력 장치(touch)를 보고 자동 조준
touch("DodgeTouch", "space", "br", 40 + 140 + 16, 24, 96)
touch("InteractTouch", "e", "br", 40 + 140 + 4, 40 + 96 + 8, 88)
touch("CraftTouch", "q", "br", 40 + 24, 40 + 140 + 16, 96)

# 귀환 중 황금 침식 테마 (UI 키트 v8 corrupted): 버튼 그림은 C++가 rot_*로 바꾼다. 체력 막대는 틀째 다른 그림이라 따로 둔다
for i in (1, 2, 3):
    image(f"RotHp{i}", f"rot_hp_{i}.png", "tl", 24, 24, z=12, visible=False)

# 미니맵 (오른쪽 위 틀 안): 방 칸 16개, 복도 막대 20개. C++ UpdateMinimap이 위치·크기·그림을 정하고 들어간 방 주변만 보임
for k in range(16):
    n = node(f"MapRoom{k}", "Image", "tr", 0, 0, 8, 8, 14, texture="Assets/UI/Map/map_room.png", visible=False)
    n["slot"]["alignment"] = [0, 0]
for k in range(20):
    n = node(f"MapLink{k}", "Image", "tr", 0, 0, 4, 4, 13, texture="Assets/UI/Map/map_link.png", visible=False)
    n["slot"]["alignment"] = [0, 0]

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
panel_image("CraftSelect", "craft_select.png", *SLOTS[0], z=43)  # 선택 테두리 하나를 C++ UI::SetPosition으로 옮김
iw, ih = Image.open(PROJECT / KIT / "craft_detail_potion.png").size
panel_image("CraftDetail", "craft_detail_potion.png", 480 + (72 - iw) // 2, 176 + (72 - ih) // 2)  # 설명 아이콘: SetTexture·SetSize·SetPosition
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
iw, ih = Image.open(PROJECT / KIT / "portrait_collector.png").size  # 말하는 사람 초상화 하나: C++가 그림·크기·위치를 바꿈
dialog("DialogPortrait", "Image", 26 + (120 - iw) // 2, 25 + (120 - ih) // 2, iw, ih, 52, texture=KIT + "portrait_collector.png")
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

# ---- 캐릭터 선택 (기획서 2장 흐름 2): 타이틀 다음. 카드를 누르면 1·2·3 키, 결정은 Enter ----
CARDS = [("valen", "발렌", "검 · 부채꼴 베기, 적 탄환을 지움", 9800),
         ("sherry", "셰리", "활 · 1초 장전, 한 발이 강함", 14500),
         ("alea", "알레아", "마탄 · 연사, 닿으면 작은 폭발", 31700)]
full("SelectBack", "Panel", 80, background="#0b1314f2", visible=False)
node("SelectTitle", "Text", "c", 0, -300, 600, 40, 81, text="누구의 빚을 갚을까?", fontSize=28, color="#ffd666", align="center", visible=False)
for i, (who, name, weapon, debt) in enumerate(CARDS):
    cx = (i - 1) * 340
    node(f"SelectPick{i}", "Panel", "c", cx, 10, 312, 432, 81, background="#ffd666cc", visible=False)
    node(f"SelectCard{i}", "Panel", "c", cx, 10, 300, 420, 82, background="#1b2a2bff", visible=False)
    iw, ih = Image.open(PROJECT / KIT / f"select_{who}.png").size
    node(f"SelectArt{i}", "Image", "c", cx, -60, iw, ih, 83, texture=KIT + f"select_{who}.png", visible=False)
    node(f"SelectName{i}", "Text", "c", cx, 110, 280, 32, 83, text=f"{i + 1}. {name}", fontSize=24, color="#fff3e5", align="center", visible=False)
    node(f"SelectWeapon{i}", "Text", "c", cx, 150, 280, 26, 83, text=weapon, fontSize=14, color="#cdb98a", align="center", visible=False)
    node(f"SelectDebt{i}", "Text", "c", cx, 186, 280, 26, 83, text=f"빚 {debt:,} G", fontSize=16, color="#ff8a7a", align="center", visible=False)
    node(f"SelectTouch{i}", "TouchButton", "c", cx, 10, 300, 420, 84, inputKey=str(i + 1), inputMode="keys",
         background="#00000000", pressed="#ffffff22", hover="#ffffff11", visible=False)
node("SelectHint", "Text", "c", 0, 270, 700, 26, 81, text="1·2·3 또는 A·D로 고르고 Enter·E로 결정", fontSize=15, color="#cdb98a", align="center", visible=False)
node("SelectConfirm", "TouchButton", "c", 0, 312, 240, 48, 84, text="결정", fontSize=18, inputKey="enter", inputMode="keys",
     background="#3a4a3aee", pressed="#ffffff33", hover="#ffffff22", visible=False)

# ---- 엔딩 카드 (기획서 2장 흐름 13, 8장): 키아트·로고 위에 Coming Soon. 아무 키나 누르면 타이틀로 ----
full("EndingBack", "Panel", 97, background="#05090aff", visible=False)
full("EndingArt", "Image", 98, texture=KIT + "title_v2.png", visible=False)
full("EndingShade", "Panel", 99, background="#05090aee", visible=False)
nodes[-1]["slot"]["anchors"] = [0, 0.74, 1, 1]  # 타이틀 그림의 "Tap To Start" 줄을 가림
node("EndingTitle", "Text", "c", 0, 225, 800, 60, 100, text="Coming Soon", fontSize=40, color="#ffd666", align="center", visible=False)
node("EndingText", "Text", "c", 0, 275, 900, 30, 100, text="", fontSize=18, color="#fff3e5", align="center", visible=False)
node("EndingHint", "Text", "c", 0, 318, 600, 26, 100, text="아무 키나 눌러 처음으로", fontSize=15, color="#cdb98a", align="center", visible=False)

# ---- 보스 등장 컷신 (위아래 검은 띠·이름 자막)과 보스 체력 막대 ----
n = node("CineTop", "Panel", "t", 0, 0, 0, 90, 65, background="#000000ff", visible=False)
n["slot"].update(anchors=[0, 0, 1, 0], offset=[0, 0, 0, 90], alignment=[0, 0])
n = node("CineBottom", "Panel", "b", 0, 0, 0, 90, 65, background="#000000ff", visible=False)
n["slot"].update(anchors=[0, 1, 1, 1], offset=[0, -90, 0, 90], alignment=[0, 0])
node("BossName", "Text", "c", 0, 150, 900, 60, 66, text="해골 대장", fontSize=46, color="#ffd666", align="center", visible=False)
node("BossSub", "Text", "c", 0, 205, 900, 30, 66, text="", fontSize=20, color="#ff9a7a", align="center", visible=False)
node("BossBarName", "Text", "t", 0, 96, 520, 22, 22, text="", fontSize=15, color="#ffd666", align="center", visible=False)
node("BossBarBack", "Panel", "t", 0, 120, 520, 16, 21, background="#1a0d0dcc", visible=False)
node("BossBar", "ProgressBar", "t", 0, 122, 514, 12, 22, value=1, max=1, fillDirection="leftToRight", fillTexture="", backgroundTexture="",
     background="#00000000", accent="#e04a3aff", visible=False)

# ---- 안내 문구 띠 (기획서 9장) ----
node("TipBack", "Panel", "t", 0, 140, 760, 44, 30, background="#0b1314dd", visible=False)
node("Tip", "Text", "t", 0, 150, 740, 26, 31, text="", fontSize=17, color="#ffe9a8", align="center", visible=False)

# ---- 가방 (Tab) ----
node("BagPanel", "Panel", "c", 0, -40, 620, 260, 45, background="#16222ae6", visible=False)
node("BagTitle", "Text", "c", 0, -150, 580, 32, 46, text="가방", fontSize=22, color="#ffd666", align="center", visible=False)
for i in range(5):
    node(f"BagRow{i}", "Text", "c", 0, -105 + i * 36, 580, 28, 46, text="", fontSize=17, color="#ffd666" if i == 4 else "#fff3e5", align="center", visible=False)
node("BagHint", "Text", "c", 0, 70, 580, 22, 46, text="Tab: 닫기", fontSize=13, color="#cdb98a", align="center", visible=False)
touch("BagTouch", "tab", "tr", 24 + 72 + 12, 24, 72)
n = node("BagUseTouch", "TouchButton", "c", 0, 39, 580, 34, 47, inputKey="enter", inputMode="keys", deviceVisibility="touch",
         background="#00000000", pressed="#ffffff22", hover="#00000000", visible=False)  # 가방이 열렸을 때만 ([귀환] 줄 터치)

# ---- 일시정지 (Esc·P, 모바일 일시정지 버튼) ----
touch("PauseTouch", "escape", "tr", 24, 24, 72)
full("PauseBack", "Panel", 85, background="#05090ac8", visible=False)
node("PauseTitle", "Text", "c", 0, -60, 600, 50, 86, text="일시정지", fontSize=36, color="#ffd666", align="center", visible=False)
node("PauseResume", "Text", "c", 0, 10, 600, 30, 86, text="Esc · P : 계속하기", fontSize=20, color="#fff3e5", align="center", visible=False)
node("PauseQuit", "Text", "c", 0, 50, 600, 30, 86, text="F12 : 처음으로", fontSize=17, color="#cdb98a", align="center", visible=False)
node("PauseResumeTouch", "TouchButton", "c", 0, 10, 300, 40, 87, inputKey="escape", inputMode="keys", deviceVisibility="touch",
     background="#ffffff11", pressed="#ffffff33", hover="#00000000", visible=False)
node("PauseQuitTouch", "TouchButton", "c", 0, 50, 300, 34, 87, inputKey="F12", inputMode="keys", deviceVisibility="touch",
     background="#ffffff11", pressed="#ffffff33", hover="#00000000", visible=False)

# ---- 쓰러짐 (기획서 2장 게임 오버): 화면을 붉게 덮고 문구 ----
full("KoBack", "Panel", 70, background="#2a0508dd", visible=False)
node("KoTitle", "Text", "c", 0, -30, 900, 60, 71, text="쓰러졌다", fontSize=44, color="#ff7a6a", align="center", visible=False)
node("KoSub", "Text", "c", 0, 30, 900, 30, 71, text="", fontSize=18, color="#fff3e5", align="center", visible=False)

# ---- 정산 화면 (기획서 6-4): 줄마다 나타나고 남은 빚 숫자가 줄어듦. C++ UpdateSettle ----
full("SettleBack", "Panel", 72, background="#05090ad0", visible=False)
node("SettlePanel", "Panel", "c", 0, 0, 640, 470, 73, background="#16222acc", visible=False)
node("SettleTitle", "Text", "c", 0, -195, 600, 40, 74, text="정산", fontSize=28, color="#ffd666", align="center", visible=False)
for i in range(7):
    node(f"SettleRow{i}", "Text", "c", 0, -140 + i * 34, 560, 30, 74, text="", fontSize=18, color="#ffd666" if i in (4, 6) else "#fff3e5", align="center", visible=False)
node("SettleDebt", "Text", "c", 0, 120, 600, 40, 74, text="", fontSize=26, color="#ff8a7a", align="center", visible=False)
node("SettleNote", "Text", "c", 0, 165, 600, 24, 74, text="", fontSize=14, color="#cdb98a", align="center", visible=False)
node("SettleHint", "Text", "c", 0, 205, 600, 24, 74, text="E · 클릭 · Enter: 확인", fontSize=15, color="#7dd9ff", align="center", visible=False)

w["nodes"] = nodes
WIDGET.write_text(json.dumps(w, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print("제작 창·대화창·타이틀·캐릭터 선택 추가:", len(nodes), "nodes")
