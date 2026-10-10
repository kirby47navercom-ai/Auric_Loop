"""정산 동전이 아래부터 차오르는 그림 21장 (0%, 5%, ... 100%). C++ UpdateSettle이 금액 비율에 맞는 장을 SettleCoinBack에 넣음.

실행: python tools/make_coin_fill.py  (tools/make_ui_art.py의 coin_empty·coin_full을 씀)
예전엔 진행 막대 원형 채우기라 동전이 왼쪽·오른쪽 반으로 갈라져 보였음. 차오르는 줄은 동전 도트 크기(4px)에 맞추고 맨 윗줄을 밝게
"""
from pathlib import Path

import numpy as np
from PIL import Image

ART = Path(__file__).resolve().parent.parent / "AuricLoop/Assets/UI/Art"
empty = np.array(Image.open(ART / "coin_empty.png").convert("RGBA"))
full = np.array(Image.open(ART / "coin_full.png").convert("RGBA"))
ys = np.nonzero(full[..., 3].max(1))[0]
top, bottom, PX = ys.min(), ys.max() + 1, 4
for k in range(21):
    level = bottom - round((bottom - top) * k / 20 / PX) * PX  # 이 줄 아래가 금
    out = empty.copy()
    out[level:] = full[level:]
    if 0 < k < 20:  # 출렁이는 금 수면: 한 도트 줄을 밝게
        surf = out[level:level + PX]
        mask = full[level:level + PX, :, 3] > 0
        surf[mask, :3] = np.minimum(255, surf[mask, :3].astype(int) + 60)
    Image.fromarray(out).save(ART / f"coin_fill_{k:02d}.png")
print("동전 채움 21장")
