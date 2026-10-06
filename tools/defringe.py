"""마젠타(#FF00FF) 배경을 지운 뒤 윤곽에 남은 보라 테두리를 없앤다.

투명한 곳에서 2칸 안쪽 픽셀 중 '배경과 섞인 색'(초록이 거의 0, 빨강≈파랑)만 마젠타 성분을 빼서 어둡게 만든다.
셰리 머리나 마법사 로브처럼 원래 보라인 색은 초록이 섞여 있어 건드리지 않는다. 반투명 분홍 찌꺼기는 지운다.

실행: python tools/defringe.py [폴더…]   (기본: AuricLoop/Assets/Sprites 전체)
make_anims·make_tiles·make_town이 저장 직전에 clean()을 부른다.
"""
import sys
from pathlib import Path

from PIL import Image


def spill(p):
    r, g, b, a = p
    return a and g <= 24 and min(r, b) > g + 16 and abs(r - b) < 60


def clean(im, depth=4):
    """RGBA 그림을 고쳐서 돌려준다. 바뀐 픽셀 수도 함께.

    투명한 곳에서 시작해 '섞인 색'만 타고 depth칸까지 번진다(확대된 3x3 픽셀 덩어리도 통째로 잡힌다)."""
    im = im.convert("RGBA")
    w, h = im.size
    px = im.load()
    front = [(x, y) for y in range(h) for x in range(w) if px[x, y][3] == 0]
    front += [(x, -1) for x in range(w)] + [(x, h) for x in range(w)] + [(-1, y) for y in range(h)] + [(w, y) for y in range(h)]  # 그림 밖도 투명으로 본다
    seen = set(front)
    changed = 0
    for _ in range(depth):
        nxt = []
        for x, y in front:
            for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                if not (0 <= nx < w and 0 <= ny < h) or (nx, ny) in seen:
                    continue
                r, g, b, a = px[nx, ny]
                if 0 < a < 200 and r > 150 and b > 150 and g < 120:
                    px[nx, ny] = (0, 0, 0, 0)
                elif spill((r, g, b, a)):
                    m = min(r, b) - g
                    px[nx, ny] = (r - m, g, b - m, a)
                else:
                    continue
                seen.add((nx, ny))
                nxt.append((nx, ny))
                changed += 1
        front = nxt
    return im, changed


def key(im):
    """마젠타 배경을 투명하게. 바깥과 이어진 배경은 지우고, 안에 갇힌 덩어리는 둘레를 본다:
    둘레가 대부분 보라(머리 하이라이트에 배경색이 샌 것)면 둘레 색으로 메우고, 아니면(팔·다리 사이 틈) 지운다."""
    im = im.convert("RGBA")
    w, h = im.size
    px = im.load()
    bg = lambda p: p[3] and p[0] > 190 and p[2] > 190 and p[1] < 90
    purple = lambda p: p[3] and p[0] > 90 and p[2] > 80 and p[1] < min(p[0], p[2]) - 30
    done = set()
    for y in range(h):
        for x in range(w):
            if (x, y) in done or not bg(px[x, y]):
                continue
            comp, stack, ring, outside = [], [(x, y)], set(), False
            done.add((x, y))
            while stack:
                cx, cy = stack.pop()
                comp.append((cx, cy))
                for q in ((cx + 1, cy), (cx - 1, cy), (cx, cy + 1), (cx, cy - 1)):
                    if not (0 <= q[0] < w and 0 <= q[1] < h):
                        outside = True
                    elif q not in done and bg(px[q]):
                        done.add(q)
                        stack.append(q)
                    elif not bg(px[q]):
                        ring.add(q)
            around = [px[q] for q in ring]
            if not outside and around and sum(map(purple, around)) * 3 >= len(around) * 2:
                fill = tuple(sorted(c[i] for c in around)[len(around) // 2] for i in range(3)) + (255,)
            else:
                fill = (0, 0, 0, 0)
            for q in comp:
                px[q] = fill
    return im


if __name__ == "__main__":
    def strip(c):
        im = Image.new("RGBA", (5, 1))
        for x in (1, 2, 3):
            im.putpixel((x, 0), c)
        return clean(im)
    assert strip((96, 0, 96, 255))[1] == 3 and strip((96, 0, 96, 255))[0].getpixel((2, 0)) == (0, 0, 0, 255)  # 섞인 테두리는 어둡게
    assert strip((170, 60, 160, 255))[1] == 0  # 진짜 보라는 그대로
    hole = Image.new("RGB", (5, 5), (255, 0, 255))
    hole.paste((170, 60, 160), (1, 1, 4, 4)); hole.putpixel((2, 2), (250, 2, 250))
    assert key(hole).getpixel((2, 2)) == (170, 60, 160, 255) and key(hole).getpixel((0, 0))[3] == 0  # 머리 속 샌 배경은 메움
    gap = Image.new("RGB", (5, 5), (255, 0, 255))
    gap.paste((20, 15, 15), (1, 1, 4, 4)); gap.putpixel((2, 2), (250, 2, 250))
    assert key(gap).getpixel((2, 2))[3] == 0  # 윤곽선에 둘러싸인 틈은 지움
    roots = [Path(a) for a in sys.argv[1:]] or [Path(__file__).resolve().parent.parent / "AuricLoop/Assets/Sprites"]
    total = files = 0
    for root in roots:
        for f in sorted(root.rglob("*.png")):
            im = Image.open(f)
            if im.mode not in ("RGBA", "LA", "P"):
                continue
            fixed, n = clean(im)
            if n:
                fixed.save(f)
                total += n
                files += 1
    print("테두리 정리:", files, "개 그림,", total, "픽셀")
