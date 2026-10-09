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
ITEMS = "Assets/UI/Items/"  # 아이템 아이콘 40x40 (tools/make_icons.py). 흐려지지 않게 1배·2배로만 씀
FONT = "Assets/Fonts/DungGeunMo.ttf"  # 둥근모꼴 (픽셀 글꼴, Public Domain: Assets/Fonts/DungGeunMo_LICENSE.txt)
# 색: 본문 상아색, 강조 금색, 보조 모래색, 위험 붉은색. 패널은 짙은 남색 + 금테 + 둥근 모서리로 한 가지 모양
INK, GOLD, SAND, RED, SKY = "#f6ecd8", "#ffd56a", "#c9b48a", "#ff8a7a", "#8fd8ff"
FRAME = dict(background="#0d1419eb", borderColor="#c9a24acc", borderWidth=2, radius=8)
SOFT = dict(background="#0d1419b8", borderColor="#c9a24a55", borderWidth=1, radius=6)  # HUD 글씨 받침 (게임 화면 위)
ART = "Assets/UI/Art/"  # tools/make_ui_art.py
FRAMED = dict(texture=ART + "frame_gold.png", nineSlice=[22, 22, 22, 22], imageRendering="pixelated")    # 금테 창 (모서리 장식)
BUTTON = dict(texture=ART + "frame_button.png", nineSlice=[22, 22, 22, 22], imageRendering="pixelated")  # 버튼·칸
PLAQUE = dict(texture=ART + "plaque.png", nineSlice=[16, 16, 16, 16], imageRendering="pixelated")       # 작은 글씨 받침 (금테 나무 명패)
SIZES = {12: 14, 13: 15, 14: 16, 15: 17, 16: 18, 17: 19, 18: 20, 20: 22, 22: 26, 24: 28, 26: 30, 28: 34, 36: 42, 40: 48, 44: 52, 46: 54}

w = json.loads(WIDGET.read_text(encoding="utf-8"))
FRONT_FILE = PROJECT / "Assets/UI/W_Front.hbwidget.json"
base = next(n for n in w["nodes"] + (json.loads(FRONT_FILE.read_text(encoding="utf-8"))["nodes"] if FRONT_FILE.exists() else []) if n["name"] == "Title")
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
    if kind == "Image":
        props.setdefault("imageRendering", "pixelated")  # 도트 그림을 키워도 흐려지지 않게
    if "fontSize" in props:
        props["fontSize"] = SIZES.get(props["fontSize"], props["fontSize"])  # 픽셀 글꼴은 조금 커야 읽힘
    n["properties"].update({"text": "", "texture": "", "background": "#00000000", "deviceVisibility": "all", "font": FONT,
                            "borderWidth": 0, "radius": 0, "visible": True, "opacity": 1, **props})  # 본뜬 노드의 값을 물려받지 않게
    nodes.append(n)
    return n


def image(name, file, corner, x, y, z=10, **props):
    iw, ih = Image.open(PROJECT / KIT / file).size
    return node(name, "Image", corner, x, y, iw, ih, z, texture=KIT + file, **props)


def text(name, value, corner, x, y, w_, h, size=18, align="left", z=20):
    return node(name, "Text", corner, x, y, w_, h, z, text=value, fontSize=size, color=INK, align=align)


def touch(name, key, corner, x, y, size, devices="touch"):
    """투명 버튼. 그림은 같은 자리의 Image가 보여 준다. devices="all"이면 PC 마우스로도 누름"""
    return node(name, "TouchButton", corner, x, y, size, size, 30, inputKey=key, inputMode="keys",
                deviceVisibility=devices, background="#00000000", pressed="#ffffff22", hover="#ffffff14" if devices == "all" else "#00000000")


# 왼쪽 위: HP, 적재량, 피로도
image("HpBack", "hp_back.png", "tl", 24, 24)
for i in (1, 2, 3):
    image(f"HpFill{i}", f"hp_fill_{i}.png", "tl", 24 + 64, 24 + 14, z=11, visible=i == 3)
text("HpText", "3 / 3", "tl", 24 + 64, 24 + 14, 220, 28, align="center")
image("BagIcon", "icon_bag.png", "tl", 30, 92)
text("WeightText", "0 / 100", "tl", 68, 86, 160, 32)
node("GoldBack", "Image", "tl", 330, 28, 200, 44, 9, **PLAQUE)
node("WeightBack", "Image", "tl", 24, 82, 190, 40, 9, **PLAQUE)
text("GoldText", "0 G", "tl", 342, 36, 180, 32, size=18)
node("Fps", "Text", "bl", 12, 8, 160, 22, 99, text="", fontSize=14, color="#7dff9a", visible=False)  # F3 성능 표시 (왼쪽 아래 구석)
image("FatigueBack", "fatigue_back.png", "tl", 24, 132)
# 피로도: 세로 막대 하나 (C++ UI::SetValue 0~1, 아래에서 위로 참)
node("Fatigue", "ProgressBar", "tl", 24 + 8, 132 + 8, 16, 220, 11, value=0, max=1, fillDirection="bottomToTop",
     fillTexture=KIT + "fatigue_100.png", backgroundTexture="", background="#00000000", accent="#00000000")
image("FatigueTicks", "fatigue_ticks.png", "tl", 24 + 8, 132 + 52, z=12)

# 위 가운데: 상태 문구 (귀환 진행·[귀환] 획득 등 있을 때만). 지역 이름은 도착할 때 가운데에 크게 (AreaBanner)
node("AreaBack", "Image", "t", 0, 12, 420, 46, 9, visible=False, **PLAQUE)
text("Title", "", "t", 0, 20, 420, 28, size=20, align="center")
nodes[-1]["properties"]["visible"] = False
node("HintBack", "Image", "t", 0, 60, 640, 48, 9, visible=False, **FRAMED)
text("Hint", "", "t", 0, 70, 640, 30, size=18, align="center")  # 물체와 상관없는 알림 (제작 완료 등)
# 도착한 곳 이름: 가운데에 크게 떴다가 사라짐 (C++ AreaBanner). M·미니맵을 누르면 다시
node("AreaBannerBack", "Panel", "c", 0, -150, 1280, 132, 59, background="#05090ab4", visible=False)  # 글씨가 바닥 무늬에 묻히지 않게 어두운 띠
node("AreaBanner", "Text", "c", 0, -170, 900, 60, 60, text="", fontSize=44, color=GOLD, align="center", visible=False)
node("AreaBannerLine", "Panel", "c", 0, -134, 420, 2, 60, background="#c9a24acc", padding=0, visible=False)
node("AreaBannerSub", "Text", "c", 0, -112, 900, 30, 60, text="", fontSize=20, color=SAND, align="center", visible=False)
# 상호작용 말풍선: 가까운 대상 머리 위에 따라붙음 (C++가 화면 좌표로 옮기고 크기를 글자 수에 맞춤)
node("PromptBack", "Image", "c", 0, 0, 200, 40, 25, visible=False, **PLAQUE)
node("PromptKey", "Text", "c", 0, 0, 30, 28, 26, text="E", fontSize=18, color=INK, align="center", visible=False,
     background="#2a2112ff", borderColor=GOLD, borderWidth=2, radius=5)
node("PromptText", "Text", "c", 0, 0, 600, 28, 26, text="", fontSize=18, color=INK, align="left", visible=False)
node("PromptTail", "Text", "c", 0, 0, 20, 16, 26, text="▼", fontSize=12, color=GOLD, align="center", visible=False)

# 오른쪽 위: 가방, 일시정지, 미니맵 틀
image("PauseButton", "btn_pause.png", "tr", 24, 24)
image("BagButton", "btn_inventory.png", "tr", 24 + 72 + 12, 24)
image("Minimap", "minimap.png", "tr", 24, 108)
touch("MapTouch", "m", "tr", 24, 108, 152, devices="all")  # 미니맵을 누르면 지역 이름 다시 (M)

# 오른쪽 아래: 공격, 회피, 상호작용, 제작 (UI 키트 시안 배치)
image("AttackButton", "btn_attack_valen.png", "br", 40, 40, deviceVisibility="touch")  # 캐릭터·귀환 테마에 맞는 그림은 C++ UI::SetTexture
image("DodgeButton", "btn_dodge.png", "br", 40 + 140 + 16, 24, deviceVisibility="touch")
image("InteractButton", "btn_interact.png", "br", 40 + 140 + 4, 40 + 96 + 8, deviceVisibility="touch")
image("CraftButton", "btn_craft.png", "br", 40 + 24, 40 + 140 + 16, deviceVisibility="touch")  # PC에선 키보드·마우스라 숨김
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
    return panel(name, "Text", px, py, w_, h_, 42, text=value, fontSize=size, color=INK, align=align)


panel_image("CraftPanel", "craft_panel.png", 0, 0, z=40)
panel_text("CraftTitle", "제작", 32, 32, 300, 28, size=22)
panel_text("CraftSub", "1~5 선택 · Enter 제작 · Q 닫기", 32, 70, 400, 22, size=13)
SLOTS = [(32, 128), (148, 128), (264, 128), (32, 244), (148, 244)]  # 키트 slot_01~05
ICONS = ["potion", "flash", "crystal_power", "crystal_burn", "crystal_pierce"]
for i, ((sx, sy), icon) in enumerate(zip(SLOTS, ICONS), 1):
    panel(f"CraftIcon{i}", "Image", sx + 12, sy + 12, 80, 80, 41, texture=ITEMS + icon + ".png")
    panel_text(f"CraftKey{i}", str(i), sx + 8, sy + 4, 20, 18, size=12)
    t = panel(f"CraftSlot{i}", "TouchButton", sx, sy, 104, 104, 44, inputKey=str(i), inputMode="keys",
              background="#00000000", pressed="#ffffff22", hover="#ffffff11")
panel_image("CraftSelect", "craft_select.png", *SLOTS[0], z=43)  # 선택 테두리 하나를 C++ UI::SetPosition으로 옮김
panel("CraftDetail", "Image", 476, 172, 80, 80, 41, texture=ITEMS + "potion.png")  # 설명 아이콘: C++ UI::SetTexture
panel_text("CraftName", "회복 물약", 480, 136, 380, 26, size=20)
panel_text("CraftEffect", "체력 1 회복", 568, 190, 300, 22)
panel_text("CraftType", "소모 아이템", 568, 220, 300, 20, size=13)
panel_text("CraftNeed", "필요 소재", 480, 272, 300, 22)
for k in (1, 2):  # 필요 소재 두 칸: 아이콘 + 가진 수 / 필요한 수 (모자라면 붉은 글씨)
    panel(f"CraftCostBox{k}", "Image", 480 + (k - 1) * 190, 300, 176, 52, 41, **BUTTON)
    panel(f"CraftCostIcon{k}", "Image", 486 + (k - 1) * 190, 306, 40, 40, 42, texture=ITEMS + "herb.png")
    panel_text(f"CraftCostText{k}", "", 534 + (k - 1) * 190, 314, 130, 26, size=17)
panel("CraftConfirmBack", "Image", 480, 384, 380, 64, 42, **FRAMED)  # 키트 버튼 그림 위에 금테 버튼
panel("CraftConfirm", "Text", 480, 400, 380, 32, 43, text="제작하기", fontSize=20, color=GOLD, align="center")
panel("CraftConfirmButton", "TouchButton", 480, 384, 380, 64, 44, inputKey="enter", inputMode="keys",
      background="#00000000", pressed="#ffffff22", hover="#ffffff11")
panel("CraftClose", "TouchButton", 820, 24, 72, 72, 44, inputKey="q", inputMode="keys",
      background="#00000000", pressed="#ffffff22", hover="#ffffff11")

# ---- 대화창 (기획서 6-5): 아래 가운데, 초상화·이름·본문·넘김 표시. 처음엔 숨김 ----
DW, DH = 1000, 170


def dialog(name, kind, px, py, w_, h_, z, **props):
    n = node(name, kind, "b", 0, 0, w_, h_, z, visible=False, **props)
    n["slot"].update(anchors=[0.5, 1, 0.5, 1], alignment=[0, 0], offset=[px - DW / 2, -(DH + 24) + py, w_, h_])
    return n


dialog("DialogBox", "Image", 0, 0, DW, DH, 50, **FRAMED)
dialog("DialogPortraitFrame", "Image", 20, 19, 132, 132, 51, texture=KIT + "dialog_portrait_frame.png")
iw, ih = Image.open(PROJECT / KIT / "portrait_collector.png").size  # 말하는 사람 초상화 하나: C++가 그림·크기·위치를 바꿈
dialog("DialogPortrait", "Image", 26 + (120 - iw) // 2, 25 + (120 - ih) // 2, iw, ih, 52, texture=KIT + "portrait_collector.png")
dialog("DialogNameTag", "Image", 150, -26, 220, 52, 53, texture=ART + "ribbon.png")  # 불투명 (뒤 대화창 테두리가 비치지 않게)
dialog("DialogName", "Text", 150, -22, 220, 30, 54, text="수금원", fontSize=19, color="#fff3e5", align="center")  # 리본 위 이름
dialog("DialogText", "Text", 176, 34, 780, 110, 52, text="", fontSize=18, color=INK, wrap=True, align="left")
dialog("DialogNext", "Text", DW - 56, DH - 46, 40, 30, 52, text="▼", fontSize=18, color=GOLD)
dialog("DialogTouch", "TouchButton", 0, 0, DW, DH, 53, inputKey="e", inputMode="keys",
       background="#00000000", pressed="#ffffff11", hover="#00000000")


# ---- 타이틀·로딩 (자료: 타이틀 시안 v2, 로딩 화면 초안 금화 GIF). 화면 전체를 덮는다 ----
def full(name, kind, z, **props):
    n = node(name, kind, "tl", 0, 0, 0, 0, z, **props)
    n["slot"].update(anchors=[0, 0, 1, 1], offset=[0, 0, 0, 0], alignment=[0, 0])
    return n


full("TitleBack", "Panel", 90, background="#05090aff")
full("TitleScreen", "Image", 91, texture=KIT + "title_plate.png")  # 로고를 지운 바탕 (tools/make_title_fx.py). 로고는 아래 조각들이 차례로 나타나 만듦
# 시작 연출 조각 (tools/make_title_fx.py title_layout.json): 글자 하나씩 → 땅(흰 번쩍) → 동전 튀어나옴 → 고리·별 → Tap To Start
LAYOUT = json.loads((PROJECT / KIT / "title_layout.json").read_text(encoding="utf-8"))
def piece(name, it, z):
    n = node(name, "Image", "tl", it["x"], it["y"], it["w"], it["h"], z, texture=KIT + it["name"] + ".png", opacity=0)
    n["slot"]["alignment"] = [0.5, 0.5]
piece("TitleRing", LAYOUT["ring"], 92)
for k, it in enumerate(LAYOUT["coins"]):
    piece(f"TitleCoin{k}", it, 93)
for k, it in enumerate(LAYOUT["letters"]):
    piece(f"TitleLetter{k}", it, 94)
piece("TitleTap", LAYOUT["tap"], 94)
full("TitleFlash", "Panel", 98, background="#fff6dcff", opacity=0)
# 타이틀 그림 위에 살아 있는 층: 횃불 빛(깜빡임), 별 반짝임, 떠오르는 금가루. 위치는 title_v2.png(1273x718)를 1280x720에 깐 좌표
TITLE_FX = [("TitleTorchL", "fx_torch_glow.png", 42, 205, 92), ("TitleTorchR", "fx_torch_glow.png", 1222, 205, 92)] + [
    (f"TitleStar{k}", "fx_star.png", x, y, 93) for k, (x, y) in enumerate([(572, 102), (388, 192), (757, 208), (903, 255), (712, 492), (452, 560), (858, 120)])] + [
    (f"TitleDust{k}", "fx_dust.png", 0, 0, 93) for k in range(8)]
# 분위기 층 (tools/make_title_fx.py, C++ TitleFx가 움직임): 아치 빛줄기, 로고를 훑는 금빛, 바닥 안개 두 겹(이어 붙인 두 장씩), 횃불 불티, 처음 검은 화면
n = node("TitleRays", "Image", "tl", 640, 0, 720, 600, 92, texture=KIT + "fx_rays.png", opacity=0)
n["slot"]["alignment"] = [0.5, 0]
node("TitleShine", "Image", "tl", 340, 150, 590, 380, 92, texture=KIT + "title_shine_0.png", visible=False)
for k in range(2):
    node(f"TitleFogA{k}", "Image", "tl", 1280 * k, 480, 1280, 240, 92, texture=KIT + "fx_fog_a.png", opacity=0.8)
    node(f"TitleFogB{k}", "Image", "tl", 1280 * k, 530, 1280, 240, 94, texture=KIT + "fx_fog_b.png", opacity=0.55)
for k in range(10):
    n = node(f"TitleEmber{k}", "Image", "tl", 0, 0, 6, 6, 93, texture=KIT + "fx_ember.png", opacity=0)
    n["slot"]["alignment"] = [0.5, 0.5]
full("TitleFade", "Panel", 99, background="#05090aff")
# "Tap To Start" 뒤에서 숨 쉬는 금빛 (C++ TitleFx가 움직임)
n = node("TitleTapShade", "Image", "tl", 643, 608, 520, 110, 90, texture="Assets/Sprites/FX/FX_Glow.png", opacity=0)  # 글씨 뒤 금빛 (깜빡이듯 번짐)
n["slot"]["alignment"] = [0.5, 0.5]
for name, file, x, y, z in TITLE_FX:
    iw, ih = Image.open(PROJECT / KIT / file).size
    n = node(name, "Image", "tl", x, y, iw, ih, z, texture=KIT + file)
    n["slot"]["alignment"] = [0.5, 0.5]
# 조작 안내 (타이틀 아래): 키 모양 상자 + 짧은 이름. 방향키가 아니라 WASD
KEYS = [(["W", "A", "S", "D"], "이동"), (["좌클릭"], "공격"), (["Space"], "대시"), (["E"], "상호작용"), (["Tab"], "가방"), (["Q"], "제작"), (["M"], "지도"), (["Esc"], "메뉴")]
def keycap(name, label, x, y, w_):
    node(name, "Text", "b", x, y, w_, 28, 94, text=label, fontSize=14, color=INK, align="center",
         background="#1a2228ff", borderColor="#c9a24a", borderWidth=2, radius=5, padding=3)


kw_of = lambda k: 26 if len(k) == 1 else 14 + sum(16 if ord(ch) > 0x3000 else 9 for ch in k)  # noqa: E731  한글은 글자가 넓음
widths = [sum(kw_of(k) for k in keys) + 4 * (len(keys) - 1) + 8 + 16 * len(label) for keys, label in KEYS]
x = -(sum(widths) + 28 * (len(KEYS) - 1)) / 2
for g, ((keys, label), gw) in enumerate(zip(KEYS, widths)):
    cx = x
    for k, key in enumerate(keys):
        kw = kw_of(key)
        keycap(f"TitleKey{g}_{k}", key, cx + kw / 2, 26, kw)
        cx += kw + 4
    node(f"TitleKeyName{g}", "Text", "b", cx + 4 + 8 * len(label), 30, 16 * len(label) + 4, 22, 94, text=label, fontSize=14, color=SAND, align="left")
    x += gw + 28
for n in nodes:  # "b" 기준 x는 가운데에서의 거리
    if n["id"].startswith("TitleKey"):
        n["slot"]["alignment"] = [0.5, 1]
# 회사 로고 화면 (Phase 0): 밝은 바탕에 Mastiff 로고가 떠올랐다가 검게 사라짐. 로고 그림은 공개 저장소에 올리지 않는 Kit 폴더에만
full("LoadingBack", "Panel", 95, background="#f3f0eaff")
n = node("LoadingLogo", "Image", "c", 0, 0, 380, 328, 96, texture=KIT + "mastiff_logo.png", opacity=0, imageRendering="auto")
n["slot"]["alignment"] = [0.5, 0.5]
full("LoadingFade", "Panel", 97, background="#05090aff")

# ---- 캐릭터 선택 (기획서 2장 흐름 2): 타이틀 다음. 카드를 누르면 1·2·3 키, 결정은 Enter ----
CARDS = [("valen", "발렌", "검 · 부채꼴 베기, 적 탄환을 지움", 9800),
         ("sherry", "셰리", "활 · 1초 장전, 한 발이 강함", 14500),
         ("alea", "알레아", "마탄 · 연사, 닿으면 작은 폭발", 31700)]
full("SelectBack", "Panel", 80, background="#0b1314ff", visible=False)  # 불투명 (뒤 HUD가 비치지 않게)
node("SelectTitle", "Text", "c", 0, -300, 600, 40, 81, text="캐릭터 선택", fontSize=28, color=GOLD, align="center", visible=False)
for i, (who, name, weapon, debt) in enumerate(CARDS):
    cx = (i - 1) * 340
    node(f"SelectPick{i}", "Panel", "c", cx, 10, 316, 436, 81, background="#ffd56a30", borderColor=GOLD, borderWidth=4, radius=14, visible=False)
    node(f"SelectCard{i}", "Image", "c", cx, 10, 300, 420, 82, visible=False, **FRAMED)
    iw, ih = Image.open(PROJECT / KIT / f"select_{who}.png").size
    node(f"SelectArt{i}", "Image", "c", cx, -60, iw, ih, 83, texture=KIT + f"select_{who}.png", visible=False)
    node(f"SelectName{i}", "Text", "c", cx, 110, 280, 32, 83, text=f"{i + 1}. {name}", fontSize=24, color=INK, align="center", visible=False)
    node(f"SelectWeapon{i}", "Text", "c", cx, 150, 280, 26, 83, text=weapon, fontSize=14, color=SAND, align="center", visible=False)
    node(f"SelectDebt{i}", "Text", "c", cx, 186, 280, 26, 83, text=f"빚 {debt:,} G", fontSize=16, color=RED, align="center", visible=False)
    node(f"SelectTouch{i}", "TouchButton", "c", cx, 10, 300, 420, 84, inputKey=str(i + 1), inputMode="keys",
         background="#00000000", pressed="#ffffff22", hover="#ffffff11", visible=False)
node("SelectConfirm", "TouchButton", "c", 0, 312, 240, 50, 84, text="결정", fontSize=18, color=GOLD, inputKey="enter", inputMode="keys",
     background="#2a2112f2", borderColor=GOLD, borderWidth=2, radius=8, pressed="#ffd56a44", hover="#ffd56a22", visible=False)

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
node("BossName", "Text", "c", 0, 235, 900, 60, 66, text="해골 대장", fontSize=46, color="#ffd666", align="center", visible=False)
node("BossSub", "Text", "c", 0, 285, 900, 30, 66, text="", fontSize=20, color="#ff9a7a", align="center", visible=False)
node("BossBarName", "Text", "t", 0, 96, 520, 22, 22, text="", fontSize=15, color="#ffd666", align="center", visible=False)
node("BossBarBack", "Panel", "t", 0, 119, 524, 18, 21, background="#1a0d0dcc", borderColor="#c9a24a99", borderWidth=1, radius=4, visible=False)
node("BossBar", "ProgressBar", "t", 0, 122, 514, 12, 22, value=1, max=1, fillDirection="leftToRight", fillTexture="", backgroundTexture="",
     background="#00000000", accent="#e04a3aff", visible=False)

# ---- 안내 문구 띠 (기획서 9장) ----
node("TipBack", "Image", "t", 0, 136, 800, 56, 30, visible=False, **FRAMED)
node("Tip", "Text", "t", 0, 151, 760, 28, 31, text="", fontSize=17, color="#ffe9a8", align="center", visible=False)

# ---- 가방 (Tab): 위 줄은 소재·아이템 칸(아이콘·개수·이름), 아래 줄은 무기·각인·[귀환], 오른쪽 아래 적재량 막대 ----
BAG_ITEMS = [("ore", "광물"), ("herb", "약초"), ("bone", "마물 소재"), ("bottle", "빈 병"), ("flash", "섬광탄"), ("gold", "골드")]
node("BagPanel", "Image", "c", 0, -20, 680, 400, 45, visible=False, **FRAMED)
node("BagTitle", "Text", "c", 0, -180, 600, 32, 46, text="가방", fontSize=22, color=GOLD, align="center", visible=False)
for i, (icon, label) in enumerate(BAG_ITEMS):
    x = -250 + i * 100
    node(f"BagSlot{i}", "Image", "c", x, -100, 88, 88, 46, visible=False, **BUTTON)
    node(f"BagIcon{i}", "Image", "c", x, -100, 80, 80, 47, texture=ITEMS + icon + ".png", visible=False)
    node(f"BagCount{i}", "Text", "c", x + 10, -74, 56, 22, 48, text="0", fontSize=16, color=INK, align="right", visible=False)
    node(f"BagName{i}", "Text", "c", x, -44, 96, 20, 47, text=label, fontSize=13, color=SAND, align="center", visible=False)
node("BagGearTitle", "Text", "c", -250, -2, 120, 20, 46, text="장비", fontSize=14, color=GOLD, align="left", visible=False)
for k, (icon, label) in enumerate([("sword", "무기"), ("crystal_power", "각인"), ("scroll", "[귀환]")]):
    x = -250 + k * 100
    node(f"BagGearSlot{k}", "Image", "c", x, 62, 88, 88, 46, visible=False, **BUTTON)
    node(f"BagGearIcon{k}", "Image", "c", x, 62, 80, 80, 47, texture=ITEMS + icon + ".png", visible=False)
    node(f"BagGearBadge{k}", "Text", "c", x + 10, 88, 56, 22, 48, text="", fontSize=16, color=GOLD, align="right", visible=False)
    node(f"BagGearName{k}", "Text", "c", x, 118, 120, 20, 47, text=label, fontSize=13, color=SAND, align="center", visible=False)
node("BagWeightText", "Text", "c", 150, 40, 300, 22, 46, text="적재량 0 / 100", fontSize=15, color=INK, align="left", visible=False)
node("BagWeightBack", "Panel", "c", 150, 70, 300, 18, 46, background="#05090acc", borderColor="#c9a24a88", borderWidth=1, radius=4, visible=False)
node("BagWeight", "ProgressBar", "c", 150, 70, 294, 12, 47, value=0, max=1, fillDirection="leftToRight", fillTexture="", backgroundTexture="",
     background="#00000000", accent="#e0b040ff", visible=False)
node("BagUseText", "Text", "c", 150, 108, 300, 22, 46, text="", fontSize=15, color=GOLD, align="left", visible=False)
node("BagHint", "Text", "c", 0, 150, 600, 22, 46, text="Tab: 닫기", fontSize=13, color=SAND, align="center", visible=False)
touch("BagTouch", "tab", "tr", 24 + 72 + 12, 24, 72, devices="all")
n = node("BagUseTouch", "TouchButton", "c", -50, 62, 84, 84, 49, inputKey="enter", inputMode="keys", deviceVisibility="touch",
         background="#00000000", pressed="#ffffff22", hover="#00000000", visible=False)  # 가방이 열렸을 때만 ([귀환] 줄 터치)

# ---- 일시정지 (Esc·P, 모바일 일시정지 버튼) ----
touch("PauseTouch", "escape", "tr", 24, 24, 72, devices="all")
full("MenuBack", "Panel", 85, background="#05090ad8", visible=False)
node("MenuPanel", "Image", "c", 0, 8, 440, 350, 85, visible=False, **FRAMED)
node("MenuTitle", "Text", "c", 0, -112, 380, 40, 86, text="메뉴", fontSize=28, color=GOLD, align="center", visible=False)
MENU = [("MenuResume", "계속하기", "escape"), ("MenuVolume", "효과음", ""), ("MenuQuit", "메인 화면으로", "F12")]
for i, (name, label, key) in enumerate(MENU):
    y = -42 + i * 66
    node(name + "Back", "Image", "c", 0, y, 340, 52, 86, visible=False, **PLAQUE)
    node(name, "Text", "c", 0, y - 1, 320, 30, 87, text=label, fontSize=20, color=INK, align="center", visible=False)
    if key:
        node(name + "Touch", "TouchButton", "c", 0, y, 340, 52, 88, inputKey=key, inputMode="keys",
             background="#00000000", pressed="#ffd56a33", hover="#ffd56a18", visible=False)
for side, key, dx in (("Down", "[", -140), ("Up", "]", 140)):  # 효과음 크기 ◀ ▶
    node(f"MenuVol{side}", "TouchButton", "c", dx, 24, 52, 52, 88, inputKey=key, inputMode="keys", text="◀" if side == "Down" else "▶",
         fontSize=18, color=GOLD, background="#00000000", pressed="#ffd56a33", hover="#ffd56a18", visible=False)
node("MenuSelect", "Panel", "c", 0, -42, 348, 60, 86, background="#00000000", borderColor=GOLD, borderWidth=3, radius=10, visible=False)  # 고른 줄 테두리
node("MenuHelp", "Text", "c", 0, 140, 400, 22, 86, text="W·S 고르기  ·  A·D 크기  ·  Enter 결정", fontSize=13, color=SAND, align="center", visible=False)

# ---- 쓰러짐 (기획서 2장 게임 오버): 화면을 붉게 덮고 문구 ----
full("KoBack", "Panel", 70, background="#2a0508dd", visible=False)
node("KoTitle", "Text", "c", 0, -30, 900, 60, 71, text="쓰러졌다", fontSize=44, color="#ff7a6a", align="center", visible=False)
node("KoSub", "Text", "c", 0, 30, 900, 30, 71, text="", fontSize=18, color="#fff3e5", align="center", visible=False)

# ---- 정산 화면 (기획서 6-4): 가운데 큰 동전. 위에 늘어선 소재·골드 아이콘이 하나씩 동전으로 날아 들어가 동전이 금으로 차오르고,
#      마지막에 빚 상환분이 동전에서 빠져나가 아래 명패로 날아가며 남은 빚이 줄어든다 (C++ UpdateSettle)
full("SettleBack", "Panel", 72, background="#05090af5", visible=False)
node("SettleGlow", "Image", "c", 0, -10, 420, 420, 72, texture="Assets/Sprites/FX/FX_Glow.png", opacity=0.55, visible=False)  # 동전 뒤 금빛
node("SettleRibbon", "Image", "c", 0, -268, 400, 68, 73, texture=ART + "ribbon.png", visible=False)
node("SettleTitle", "Text", "c", 0, -276, 400, 30, 74, text="", fontSize=20, color="#fff3e5", align="center", visible=False)
node("SettleCoinBack", "Image", "c", 0, -10, 192, 192, 73, texture=ART + "coin_empty.png", visible=False)
node("SettleCoin", "ProgressBar", "c", 0, -10, 192, 192, 74, value=0, max=1, fillDirection="radial", fillTexture=ART + "coin_full.png",
     backgroundTexture="", background="#00000000", accent="#00000000", visible=False)
node("SettleCoinText", "Text", "c", 0, 112, 360, 36, 75, text="", fontSize=28, color=GOLD, align="center", visible=False)
for k, (icon, label) in enumerate([("ore", "광물"), ("herb", "약초"), ("bone", "마물 소재"), ("gold", "골드")]):
    x = -270 + k * 180
    node(f"SettleIcon{k}", "Image", "c", x, -180, 64, 64, 76, texture=ITEMS + icon + ".png", visible=False)
    node(f"SettleCount{k}", "Text", "c", x, -134, 170, 24, 76, text="", fontSize=15, color=INK, align="center", visible=False)
node("SettleRepay", "Text", "c", 0, 150, 300, 30, 77, text="", fontSize=22, color=RED, align="center", visible=False)
node("SettlePlaque", "Image", "c", 0, 214, 360, 68, 73, texture=ART + "plaque.png", visible=False)
node("SettleDebt", "Text", "c", 0, 205, 340, 34, 74, text="", fontSize=24, color="#ff8a7a", align="center", visible=False)
node("SettleHint", "Text", "c", 0, 300, 600, 24, 74, text="E · 클릭 · Enter", fontSize=15, color=SKY, align="center", visible=False)

FRONT = ("Title", "Loading", "Select", "Ending", "Menu")  # C++ TopDownShooter::UiInstance와 같은 접두어
is_front = lambda n: n["name"].startswith(FRONT) and n["name"] != "Title"  # noqa: E731  "Title"은 HUD의 지역 이름
front = [n for n in nodes[1:] if is_front(n)]
w["nodes"] = [n for n in nodes if not is_front(n)]
WIDGET.write_text(json.dumps(w, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
f = copy.deepcopy(w)
f.update(name="W_Front", nodes=[copy.deepcopy(root)] + front)
(PROJECT / "Assets/UI/W_Front.hbwidget.json").write_text(json.dumps(f, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print("HUD", len(w["nodes"]), "nodes / front", len(f["nodes"]), "nodes")
