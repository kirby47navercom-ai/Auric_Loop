"""아트팀 눈알 적 v5 → 게임 스프라이트·애니메이션·레이저 (C++ Enemy Laser).

실행: python tools/make_eyeball.py [원본 폴더=native/eyeball_v5]
입력: idle·move·transition·attack_sheet_80.png (80px 칸, 행 정면·후면·왼쪽·오른쪽, 기준점 40,32 = 눈 가운데), laser/ (start·body·end 4장씩),
      animation.json (프레임 시간, 발사점)
결과: Assets/Sprites/Enemies/Eyeball/ (칸 아래를 눈 가운데 24px 아래로 잘라 앞뒤 정렬이 공중에 뜬 눈의 그림자 자리에 맞게, 원점 = 눈 가운데)
      Assets/Animations/SA_Eyeball_<Idle|Move|Charge|Fire|Recover|Death>_<F|B|L|R>  (공격 11프레임을 모으기 0~3·발사 4~6·회복 7~10으로)
      Assets/Sprites/Enemies/Eyeball/S_Laser_<Start|Body|End>_<0..3> (몸통은 왼쪽 끝이 원점, C++가 길이만큼 늘림)
      AuricLoop/Source/EyeballLayout.inl (방향별 발사점, m)
"""
import json
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "native/eyeball_v5"
OUT = ROOT / "AuricLoop/Assets/Sprites/Enemies/Eyeball"
ANIM = ROOT / "AuricLoop/Assets/Animations"
PPU, CELL, CX, CY, BELOW = 32, 80, 40, 32, 24
DIRS = "FBLR"  # 시트 행 순서: 정면·후면·왼쪽·오른쪽
OUT.mkdir(parents=True, exist_ok=True)
meta = json.loads((SRC / "animation.json").read_text(encoding="utf-8"))
ms = meta["durations_ms"]


def sprite(name, png, rect, pivot):
    data = {"version": 1, "name": name, "texture": png.relative_to(ROOT / "AuricLoop").as_posix(), "pixelsPerUnit": PPU,
            "rect": list(rect), "pivot": [round(pivot[0], 5), round(pivot[1], 5)], "filter": "nearest", "border": [0, 0, 0, 0]}
    (OUT / f"{name}.hbsprite.json").write_text(json.dumps(data, ensure_ascii=False) + "\n", encoding="utf-8")


def clip(name, frames, loop):
    data = {"version": 1, "name": name, "loop": loop, "playRate": 1,
            "frames": [{"sprite": f"Assets/Sprites/Enemies/Eyeball/{s}.hbsprite.json", "duration": round(d / 1000, 3)} for s, d in frames]}
    (ANIM / f"{name}.hbspriteanimation.json").write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


# 몸: 시트마다 한 장 (칸 위 0 ~ 눈 가운데 아래 24px)
H = CY + BELOW
for kind in ("idle", "move", "transition", "attack"):
    sheet = Image.open(SRC / f"{kind}_sheet_80.png").convert("RGBA")
    cols = sheet.width // CELL
    out = Image.new("RGBA", (sheet.width, H * 4))
    for r in range(4):
        out.paste(sheet.crop((0, r * CELL, sheet.width, r * CELL + H)), (0, r * H))
    png = OUT / f"eyeball_{kind}.png"
    out.save(png)
    for r, d in enumerate(DIRS):
        for c in range(cols):
            sprite(f"S_Eyeball_{kind}_{d}_{c}", png, (c * CELL, r * H, CELL, H), (CX / CELL, BELOW / H))
for d in DIRS:
    clip(f"SA_Eyeball_Idle_{d}", [(f"S_Eyeball_idle_{d}_{c}", ms["idle"][c]) for c in range(4)], True)
    clip(f"SA_Eyeball_Move_{d}", [(f"S_Eyeball_move_{d}_{c}", ms["move"][c]) for c in range(6)], True)
    clip(f"SA_Eyeball_Charge_{d}", [(f"S_Eyeball_attack_{d}_{c}", ms["attack"][c]) for c in range(4)], False)
    clip(f"SA_Eyeball_Fire_{d}", [(f"S_Eyeball_attack_{d}_{c}", ms["attack"][c]) for c in range(4, 7)], False)
    clip(f"SA_Eyeball_Recover_{d}", [(f"S_Eyeball_attack_{d}_{c}", ms["attack"][c]) for c in range(7, 11)], False)
    clip(f"SA_Eyeball_Death_{d}", [(f"S_Eyeball_transition_{d}_{c}", 90) for c in (3, 2, 1, 0)], False)
clip("SA_Eyeball_Death", [(f"S_Eyeball_transition_F_{c}", 90) for c in (3, 2, 1, 0)], False)  # 쓰러질 때 (BP DeathClip, 방향 없음)

# 레이저: 4장씩 한 줄로
for part, pivot in (("start", (0.5, 0.5)), ("body", (0, 0.5)), ("end", (0.5, 0.5))):
    ims = [Image.open(SRC / f"laser/{part}_{i:02d}.png").convert("RGBA") for i in range(4)]
    w, h = ims[0].size
    out = Image.new("RGBA", (w, h * 4))
    for i, im in enumerate(ims):
        out.paste(im, (0, i * h))
    png = OUT / f"laser_{part}.png"
    out.save(png)
    for i in range(4):
        sprite(f"S_Laser_{part.title()}_{i}", png, (0, i * h, w, h), pivot)

# 발사점 (발사 프레임 6, 방향별): 눈 가운데 기준 m
emit = []
for r in range(4):
    ex, ey = meta["frames"]["attack"][r][6]["emitter"]
    emit.append(f"{{{(ex - CX) / PPU:.3f}f,{(CY - ey) / PPU:.3f}f}}")
(ROOT / "AuricLoop/Source/EyeballLayout.inl").write_text(
    "#pragma once  // tools/make_eyeball.py가 만듦: 눈알 레이저 발사점 (눈 가운데 기준 m) [정면·후면·왼쪽·오른쪽]\n"
    f"static const float kEyeEmit[4][2]={{{','.join(emit)}}};\n"
    f"static const float kEyeLaserWidth={meta.get('laser_thickness', 16) / PPU:.3f}f;\n", encoding="utf-8")
print("눈알: 시트 4, 애니메이션", 6 * 4, "레이저 12")
