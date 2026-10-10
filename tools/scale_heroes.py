"""셰리·알레아 크기 (발렌 1.6m에 맞춤): 스프라이트 에셋의 pixelsPerUnit을 바꾸고, 원점(발끝 0.95m 위)이 그대로 발끝 위 0.95m에 오도록 pivot을 고친다.

실행: python tools/scale_heroes.py  (여러 번 돌려도 같음. tools/make_shadows.py 뒤에 돌림)
C++ Screen.inl Muzzle의 kHeroPPU와 같은 값을 쓴다.
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent / "AuricLoop/Assets/Sprites"
PPU = {"Sherry": 41, "Alea": 42}  # 원래 32: 셰리 2.06m → 1.6m, 알레아(모자) 2.25m → 1.7m

for who, ppu in PPU.items():
    n = 0
    for f in sorted((ROOT / who).glob("S_*.hbsprite.json")):
        s = json.loads(f.read_text(encoding="utf-8"))
        h = s["rect"][3]
        feet = s["pivot"][1] * h - 0.95 * s["pixelsPerUnit"]  # 칸 아래에서 발끝까지 px
        s["pixelsPerUnit"] = ppu
        s["pivot"] = [s["pivot"][0], round((feet + 0.95 * ppu) / h, 5)]
        f.write_text(json.dumps(s, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        n += 1
    print(who, n, "장 PPU", ppu)
