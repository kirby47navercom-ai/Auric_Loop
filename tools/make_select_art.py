"""캐릭터 선택 카드 그림: 게임 속 캐릭터 그림(정면 대기 자세)을 4배로 키워 넣는다.

실행: python tools/make_select_art.py && python tools/gen_hud.py  (그림 크기는 gen_hud가 읽음)
결과: Assets/UI/Kit/select_<valen|sherry|alea>.png
  발렌: ValenSocket 몸 그림 + 손 자리(Source/ValenSocket.inl kVsHands)에 검 (Screen.inl AnimateValen과 같은 방식, 아래를 보면 검 각도 -90도)
  셰리·알레아: 아트팀 모션 팩 대기 그림 (tools/make_hero_motion.py)
캐릭터 그림을 새로 뽑으면 다시 실행 (예전 회사 키트 카드 그림은 게임 속 그림과 달라 바꿈)
"""
import json
import re
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent / "AuricLoop"
SCALE = 4


def load(name):
    s = json.loads((ROOT / f"Assets/Sprites/{name}.hbsprite.json").read_text(encoding="utf-8"))
    x, y, w, h = s["rect"]
    return Image.open(ROOT / s["texture"]).convert("RGBA").crop((x, y, x + w, y + h)), s


def valen():
    body, _ = load("ValenSocket/S_VS_walk_0_0_0")  # 걷기 gait 0 · 아래(행 0) · 위상 0
    sword, s = load("ValenSocket/S_VS_Sword_F_48")  # 64방향 중 48 = -90도 (아래), 몸 앞(F)
    table = (ROOT / "Source/ValenSocket.inl").read_text(encoding="utf-8")
    hx, hy = map(int, re.search(r"kVsHands\[2\]\[4\]\[4\]\[2\]=\{\{\{\{(\d+),(\d+)\}", table).groups())  # [gait 0][행 0][위상 0]
    canvas = Image.new("RGBA", (body.width + 64, body.height + 64))
    canvas.alpha_composite(body, (32, 32))
    px, py = 32 + hx + 0.5 - s["pivot"][0] * sword.width, 32 + hy + 0.5 - (1 - s["pivot"][1]) * sword.height
    canvas.alpha_composite(sword, (round(px), round(py)))
    return canvas


arts = {"valen": valen(), "sherry": load("SherryMotion/S_SM_Idle_0_0")[0], "alea": load("AleaMotion/S_AM_Idle_0_0")[0]}
for who, im in arts.items():
    im = im.crop(im.getbbox())
    im.resize((im.width * SCALE, im.height * SCALE), Image.NEAREST).save(ROOT / f"Assets/UI/Kit/select_{who}.png")
    print(who, im.width * SCALE, im.height * SCALE)
