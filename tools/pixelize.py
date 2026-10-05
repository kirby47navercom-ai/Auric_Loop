"""GPT로 뽑은 '확대된 도트' 이미지를 게임용 실제 픽셀 크기로 줄인다.

python tools/pixelize.py 입력.png 출력.png --height 28        캐릭터: 배경(마젠타) 제거, 내용만 잘라 높이 28px
python tools/pixelize.py 입력.png 출력.png --tile 64           타일: 전체를 64x64로

기준: 1m = 16px (docs/데모_기획서.md 3-2)
"""
import argparse
from collections import Counter
from PIL import Image

KEY = (255, 0, 255)


def cell_size(im):
    """같은 색이 이어지는 길이의 최빈값 = 원래 도트 한 칸 크기."""
    px, (w, h) = im.load(), im.size
    runs = Counter()
    for y in range(0, h, 5):
        run = 1
        for x in range(1, w):
            a, b = px[x, y], px[x - 1, y]
            if sum(abs(a[i] - b[i]) for i in range(3)) < 30:
                run += 1
            else:
                runs[run] += 1
                run = 1
    mode = max((r for r in runs if 2 < r < 65), key=lambda r: runs[r])
    near = {r: n for r, n in runs.items() if abs(r - mode) <= 2}  # 생성 이미지는 칸 크기가 정수가 아닐 수 있음
    return sum(r * n for r, n in near.items()) / sum(near.values())


def snap(im):
    """칸 가운데 색만 뽑아 원래 해상도로 되돌린다."""
    c = cell_size(im)
    w, h = round(im.width / c), round(im.height / c)
    src = im.load()
    out = Image.new("RGB", (w, h))
    out.putdata([src[min(im.width - 1, int((x + .5) * c)), min(im.height - 1, int((y + .5) * c))] for y in range(h) for x in range(w)])
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("src")
    ap.add_argument("dst")
    ap.add_argument("--height", type=int)
    ap.add_argument("--tile", type=int)
    a = ap.parse_args()
    im = snap(Image.open(a.src).convert("RGB")).convert("RGBA")
    if a.tile:
        im = im.resize((a.tile, a.tile), Image.NEAREST)
    else:
        im.putdata([(0, 0, 0, 0) if (p[0] > 140 and p[2] > 140 and p[1] < 110) else p for p in im.get_flattened_data()])  # 마젠타와 가장자리 번짐 제거
        im = im.crop(im.getbbox())
        if a.height:
            im = im.resize((max(1, round(im.width * a.height / im.height)), a.height), Image.NEAREST)
    im.save(a.dst)
    print(a.dst, im.size)


if __name__ == "__main__":
    main()
