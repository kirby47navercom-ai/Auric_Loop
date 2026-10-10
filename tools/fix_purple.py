"""캐릭터 그림에 남은 마젠타(배경) 찌꺼기를 없앤다.

- 초록이 거의 없는 마젠타 점(g<=20): 배경 #FF00FF가 섞인 색이라 어떤 캐릭터든 회색(밝기 유지)으로
- 셰리: 보라는 머리카락에만 있어야 함. 머리 아래(그림 높이 52% 아래)의 보라(망토 끝·다리 옆)는 배경이 번진 것 → 망토 회색으로
실행: python tools/fix_purple.py  (여러 번 돌려도 같음)
"""
from pathlib import Path

from PIL import Image

A = Path(__file__).resolve().parent.parent / "AuricLoop/Assets"


def grey(r, g, b, a):
    v = (r + g + b) // 3
    return (v, min(255, v + 3), max(0, v - 4), a)


def fix(path, below=None):
    im = Image.open(path).convert("RGBA")
    px = im.load()
    w, h = im.size
    n = 0
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if not a:
                continue
            purple = r > g + 40 and b > g + 40
            if (purple and g <= 20) or (below is not None and purple and y > h * below):
                px[x, y] = grey(r, g, b, a)
                n += 1
    if n:
        im.save(path)
    return n


if __name__ == "__main__":
    for who in ("valen", "alea"):
        print(who, fix(A / f"UI/Kit/select_{who}.png"))
    print("sherry select", fix(A / "UI/Kit/select_sherry.png", 0.52))
    print("sherry sprites", sum(fix(f, 0.52) for f in sorted((A / "Sprites/Sherry").glob("*.png"))))
