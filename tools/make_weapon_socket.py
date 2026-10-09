"""발렌 손 소켓 무기 (소울 나이트·엔터 더 건전식): 아트팀 v14 몸 그림 + 손에 따로 단 검을 64방향으로 돌린 그림.

실행: python tools/make_weapon_socket.py [v14 Textures 폴더=native/valen_v14]
입력: walk/·run/ (lower_forward, fixed_accessories, upper_body, grip_overlay: 4행 front·facing_left·back·facing_right x 4위상, 64px 칸),
      weapon/valen_sword.png (32x12, 쥐는 곳 픽셀 (5,6), 칼끝이 오른쪽)
결과: Assets/Sprites/ValenSocket/
  body_walk.png·body_run.png + S_VS_<walk|run>_<다리>_<행>_<위상>: 몸 (반전 없음). 다리 0 앞으로·1 옆걸음 ccw·2 옆걸음 cw.
        칸 아래 끝 = 발끝 (sortPoint feet가 발에 맞음), 원점은 발끝 0.95m 위 (지금 플레이어와 같아 충돌·그림자 그대로)
  grip_walk.png·grip_run.png + S_VS_Grip_<walk|run>_<행>_<위상>: 검 손잡이를 덮는 손가락 (앞·뒤·오른쪽, 왼쪽은 몸에 합침).
        검보다 앞에 그려지게 칸을 발끝 24px 아래까지 둠 (검 칸은 발끝 아래 23px 이내)
  sword.png + S_VS_Sword_<F|R>_<0..63>: 쥐는 곳이 원점인 검, 5.625도씩 반시계. 그림 아래 끝으로 앞뒤가 정해지므로
        F(몸 앞)는 쥐는 곳 15px 아래까지, R(몸 뒤)는 8px 아래까지 칸을 둔다 (손은 발끝 9~14px 위 → F는 발보다 아래, R은 위)
  손 위치(몸 원점 기준 m)는 C++ (Screen.inl kHands)
"""
import json
import math
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "native/valen_v14"
OUT = ROOT / "AuricLoop/Assets/Sprites/ValenSocket"
PPU, CELL, FEET, ORIGIN = 16, 64, 56, 0.95 * 16  # 발끝 줄 56, 원점은 그 15.2px 위
ANGLES, SC = 64, 64  # 검 방향 수, 검 칸
GRIP_PAD = 24  # ponytail: 손가락 덮개가 1.5m 아래 물체보다 앞에 그려질 수 있음 (작은 손이라 둠), 거슬리면 엔진에 정렬 오프셋 요청
OUT.mkdir(parents=True, exist_ok=True)


def sprite(name, png, rect, pivot):
    data = {"version": 1, "name": name, "texture": png.relative_to(ROOT / "AuricLoop").as_posix(), "pixelsPerUnit": PPU,
            "rect": rect, "pivot": [round(pivot[0], 5), round(pivot[1], 5)], "filter": "nearest", "border": [0, 0, 0, 0]}
    (OUT / f"{name}.hbsprite.json").write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


for gait in ("walk", "run"):
    layer = lambda n: Image.open(SRC / gait / f"{gait}_{n}.png").convert("RGBA")  # noqa: E731
    acc, upper, grip = layer("fixed_accessories"), layer("upper_body"), layer("grip_overlay")
    lowers = [layer("lower_forward"), layer("lower_strafe_ccw"), layer("lower_strafe_cw")]
    sheet = Image.new("RGBA", (CELL * 4, FEET * 12))
    grips = Image.new("RGBA", (CELL * 4, (FEET + GRIP_PAD) * 4))
    for row in range(4):
        for phase in range(4):
            box = (phase * CELL, row * CELL, phase * CELL + CELL, row * CELL + FEET)
            for v, lower in enumerate(lowers):
                cell = Image.new("RGBA", (CELL, FEET))
                # 왼쪽 볼 때는 무기 손이 먼 쪽: 쥔 손가락이 윗몸 뒤라 몸에 합침 (그 밖엔 따로 검 위에)
                for im in (lower, acc, grip, upper) if row == 1 else (lower, acc, upper):
                    cell.alpha_composite(im.crop(box))
                y = (v * 4 + row) * FEET
                sheet.paste(cell, (phase * CELL, y))
                sprite(f"S_VS_{gait}_{v}_{row}_{phase}", OUT / f"body_{gait}.png", [phase * CELL, y, CELL, FEET], (0.5, ORIGIN / FEET))
            y = row * (FEET + GRIP_PAD)
            grips.paste(grip.crop(box), (phase * CELL, y))
            sprite(f"S_VS_Grip_{gait}_{row}_{phase}", OUT / f"grip_{gait}.png", [phase * CELL, y, CELL, FEET + GRIP_PAD],
                   (0.5, (GRIP_PAD + ORIGIN) / (FEET + GRIP_PAD)))
    sheet.save(OUT / f"body_{gait}.png")
    if gait == "run":  # 대시 잔상: 금빛으로 물들인 반투명 몸 (C++ Ghost), 이름은 몸과 같은 자리
        ghost = sheet.copy()
        ghost.putdata([(int(r * 0.2 + 255 * 0.8), int(g * 0.2 + 240 * 0.8), int(b * 0.2 + 185 * 0.8), int(al * 0.5))
                       for r, g, b, al in sheet.get_flattened_data()])
        ghost.save(OUT / "ghost_run.png")
        for v in range(3):
            for row in range(4):
                for phase in range(4):
                    sprite(f"S_VS_Ghost_{v}_{row}_{phase}", OUT / "ghost_run.png", [phase * CELL, (v * 4 + row) * FEET, CELL, FEET], (0.5, ORIGIN / FEET))
    grips.save(OUT / f"grip_{gait}.png")

# 검: 8배로 키워 쥐는 곳 둘레로 돌린 뒤 다시 줄임 (도트가 뭉개지지 않게 가장 가까운 픽셀)
sword = Image.open(SRC / "weapon/valen_sword.png").convert("RGBA")
K = 8
big = sword.resize((sword.width * K, sword.height * K), Image.NEAREST)
grip = (5.5 * K, 6.5 * K)
atlas = Image.new("RGBA", (SC * 8, SC * 8))
for i in range(ANGLES):
    canvas = Image.new("RGBA", (SC * K, SC * K))
    canvas.alpha_composite(big, (round(SC * K / 2 - grip[0]), round(SC * K / 2 - grip[1])))
    cell = canvas.rotate(i * 360 / ANGLES, resample=Image.NEAREST, center=(SC * K / 2, SC * K / 2)).resize((SC, SC), Image.NEAREST)
    x, y = (i % 8) * SC, (i // 8) * SC
    atlas.paste(cell, (x, y))
    bottom = (cell.getbbox() or (0, 0, 0, SC // 2))[3] - SC // 2  # 쥐는 곳 아래로 그림이 내려가는 길이
    for side, least in (("F", 15), ("R", 8)):
        below = min(SC // 2, max(least, bottom))
        sprite(f"S_VS_Sword_{side}_{i}", OUT / "sword.png", [x, y, SC, SC // 2 + below], (0.5, below / (SC // 2 + below)))
atlas.save(OUT / "sword.png")
print("몸 96장, 손가락 32장, 검", ANGLES, "방향 x 앞뒤")
