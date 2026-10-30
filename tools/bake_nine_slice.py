# PC 네이티브 실행기용: 9분할(nineSlice) 그림을 위젯 크기대로 미리 늘려 둔다
# 네이티브 UI(Skia)는 9분할을 몰라 금테·명패가 통째로 늘어나 모서리가 뭉개졌음 (선택 카드·대화창·메뉴·가방)
# 결과: Assets/UI/Baked9/<그림>_<가로>x<세로>.png. tools/light_scene.mjs가 PC 빌드 때 위젯의 그림을 이 파일로 바꿈
# 실행: python tools/bake_nine_slice.py (gen_hud.py 뒤)
import json
from pathlib import Path
from PIL import Image

project = Path(__file__).resolve().parent.parent / 'AuricLoop'
out = project / 'Assets/UI/Baked9'
out.mkdir(exist_ok=True)
want = set()


def walk(n):
    if isinstance(n, list):
        for v in n:
            walk(v)
    elif isinstance(n, dict):
        p, s = n.get('properties') or {}, n.get('slot') or {}
        ns, a = p.get('nineSlice'), s.get('anchors')
        if ns and any(ns) and p.get('texture') and 'cell_' not in p['texture'] and a and a[0] == a[2] and a[1] == a[3]:  # 고정 크기 노드만 (늘어나는 앵커는 크기를 모름, 지도 칸은 C++가 크기를 바꿈)
            want.add((p['texture'], tuple(ns), int(s['offset'][2]), int(s['offset'][3])))
        for v in n.values():
            walk(v)


for f in sorted((project / 'Assets/UI').glob('W_*.hbwidget.json')):
    walk(json.loads(f.read_text(encoding='utf-8')))

kept = set()
for tex, (l, t, r, b), w, h in sorted(want):
    if w < l + r or h < t + b:
        continue
    src = Image.open(project / tex).convert('RGBA')
    sw, sh = src.size
    dst = Image.new('RGBA', (w, h))
    xs, ys = [(0, l, 0, l), (l, sw - r, l, w - r), (sw - r, sw, w - r, w)], [(0, t, 0, t), (t, sh - b, t, h - b), (sh - b, sh, h - b, h)]
    for x0, x1, dx0, dx1 in xs:
        for y0, y1, dy0, dy1 in ys:
            if x1 > x0 and y1 > y0 and dx1 > dx0 and dy1 > dy0:
                dst.paste(src.crop((x0, y0, x1, y1)).resize((dx1 - dx0, dy1 - dy0), Image.NEAREST), (dx0, dy0))
    name = f'{Path(tex).stem}_{w}x{h}.png'
    dst.save(out / name)
    kept.add(name)
for old in out.glob('*.png'):  # 더는 안 쓰는 크기는 지움
    if old.name not in kept:
        old.unlink()
print('9분할 미리 늘림:', len(kept))
