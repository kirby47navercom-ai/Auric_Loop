"""해골 대장 생성 자세(베기·돌진·회전·포효 등)를 1.25배로: 머리~발 키로만 맞춰 넣어서 걷기 그림(머리가 큰 그림)보다
작아 보여, 공격할 때마다 키가 줄어드는 것처럼 보였음. 그림은 그대로 두고 pixelsPerUnit만 32/1.25로, 발끝(아래 여백 8px)은 제자리.
실행: python tools/fix_boss_scale.py  (make_enemy_poses.py·make_shadows.py 뒤에. 여러 번 돌려도 같음)
"""
import json
from pathlib import Path

FOLDER = Path(__file__).resolve().parent.parent / "AuricLoop/Assets/Sprites/Enemies/SkeletonCaptain"
POSES = ["SlashWindup", "SlashHit", "Dash", "Cast", "JumpCrouch", "JumpAir", "Slam", "Summon", "Spin_0", "Spin_1", "Spin_2", "Roar"]
SCALE, BASE, FEET = 1.25, 32, 8  # FEET: 그림 아래 그림자 여백(tools/make_shadows.py PAD) = 발끝 높이 px

for pose in POSES:
    f = FOLDER / f"S_SkeletonCaptain_{pose}.hbsprite.json"
    s = json.loads(f.read_text(encoding="utf-8"))
    h, ppu = s["rect"][3], s["pixelsPerUnit"]
    origin = (s["pivot"][1] * h - FEET) / ppu  # 발끝에서 원점까지 (m)
    s["pixelsPerUnit"] = round(BASE / SCALE, 3)
    s["pivot"] = [s["pivot"][0], round((FEET + origin * s["pixelsPerUnit"]) / h, 5)]
    f.write_text(json.dumps(s, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(len(POSES), "자세 PPU", round(BASE / SCALE, 3))
