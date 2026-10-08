"""장면 JSON을 위에서 본 그림 한 장으로 그린다 (배치 확인용, 게임 실행 없이).

실행: python tools/render_scene.py Hub [px_per_m=16] [x0 y0 x1 y1]
결과: native/scene-render/<장면>.png  (git 제외 폴더)
그리는 순서는 엔진과 같다: 정렬 레이어(back → ground → overlay → default) → 순서값 → default는 정렬 기준점 y가 위인 것부터.
충돌체는 빨간 테두리로 겹쳐 그린다 (--colliders).
"""
import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw

PROJECT = Path(__file__).resolve().parent.parent / "AuricLoop"
OUT = PROJECT.parent / "native/scene-render"
LAYERS = ["back", "ground", "overlay", "default"]


def load(rel):
    return json.loads((PROJECT / rel).read_text(encoding="utf-8"))


def sprite_of(props):
    """SpriteRenderer 속성 → (그림, 너비 m, 높이 m, 피벗 오프셋 y m)"""
    if props.get("sprite"):
        s = load(props["sprite"])
        im = Image.open(PROJECT / s["texture"]).convert("RGBA")
        x, y, w, h = s["rect"]
        im = im.crop((x, im.height - y - h, x + w, im.height - y))
        ppu = s.get("pixelsPerUnit", 32)
        pivot = s.get("pivot", [0.5, 0.5])
        return im, w / ppu, h / ppu, (0.5 - pivot[1]) * h / ppu
    if props.get("texture"):
        im = Image.open(PROJECT / props["texture"]).convert("RGBA")
        ppu = props.get("pixelsPerUnit", 32) or 32
        return im, props.get("width") or im.width / ppu, props.get("height") or im.height / ppu, 0
    return None


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    name = args[0] if args else "Hub"
    scale = float(args[1]) if len(args) > 1 else 16
    scene = load(f"Assets/Scenes/{name}.hbscene.json")
    objs = {o["id"]: o for o in scene["objects"]}
    items, boxes = [], []
    for o in scene["objects"]:
        if o.get("visible") is False or o["position"][1] < -150:
            continue
        comps = {c["type"]: c for c in o.get("components", [])}
        if o.get("blueprintAsset", "").endswith("BP_Interactable.hbblueprint.json"):
            over = o.get("overrides", {}).get("components", {})
            sp = over.get("sprite", {})
            if sp.get("texture"):
                comps["SpriteRenderer"] = {"properties": {"texture": sp["texture"], "width": sp.get("width"), "height": sp.get("height"),
                                                          "sortPoint": sp.get("sortPoint", "center")}}
            col = over.get("collider")
            if col and col.get("enabled", True):
                comps["BoxCollider2D"] = {"properties": {"extent": col["extent"], "center": col["center"]}}
        x, y = o["position"][:2]
        if o.get("parent") in objs:
            px, py = objs[o["parent"]]["position"][:2]
            x, y = x + px, y + py
        sr = comps.get("SpriteRenderer")
        if sr and sr["properties"].get("visible", True) is not False:
            got = sprite_of(sr["properties"])
            if got:
                im, w, h, oy = got
                p = sr["properties"]
                cy = y + oy
                sort = {"feet": cy - h / 2, "pivot": y}.get(p.get("sortPoint"), y)
                items.append((LAYERS.index(p.get("sortingLayer", "default")) if p.get("sortingLayer", "default") in LAYERS else 3,
                              p.get("sortingOrder", 0), -sort, im, x, cy, w, h, p.get("drawMode") == "tiled", p.get("color")))
        bc = comps.get("BoxCollider2D")
        if bc:
            e, c = bc["properties"]["extent"], bc["properties"].get("center", [0, 0, 0])
            boxes.append((x + c[0] - e[0], y + c[1] - e[1], x + c[0] + e[0], y + c[1] + e[1]))
    if len(args) >= 6:
        x0, y0, x1, y1 = map(float, args[2:6])
    else:
        x0 = min(i[4] - i[6] / 2 for i in items if i[0] == 3); x1 = max(i[4] + i[6] / 2 for i in items if i[0] == 3)
        y0 = min(i[5] - i[7] / 2 for i in items if i[0] == 3); y1 = max(i[5] + i[7] / 2 for i in items if i[0] == 3)
        x0, y0, x1, y1 = x0 - 4, y0 - 4, x1 + 4, y1 + 4
    W, H = int((x1 - x0) * scale), int((y1 - y0) * scale)
    canvas = Image.new("RGBA", (W, H), (20, 24, 28, 255))
    to_px = lambda wx, wy: (int((wx - x0) * scale), int((y1 - wy) * scale))  # noqa: E731
    for layer, order, depth, im, x, cy, w, h, tiled, color in sorted(items, key=lambda i: (i[0], i[1], i[2])):
        pw, ph = max(1, round(w * scale)), max(1, round(h * scale))
        if tiled:
            tile = im.resize((max(1, round(im.width * scale / 32)), max(1, round(im.height * scale / 32))), Image.NEAREST)
            big = Image.new("RGBA", (pw, ph))
            for ty in range(0, ph, tile.height):
                for tx in range(0, pw, tile.width):
                    big.paste(tile, (tx, ty))
            im = big
        else:
            im = im.resize((pw, ph), Image.NEAREST)
        if color and color[:3] != [1, 1, 1]:
            r, g, b, a = im.split()
            im = Image.merge("RGBA", [c.point(lambda v, k=k: int(v * k)) for c, k in zip((r, g, b), color[:3])] + [a])
        left, top = to_px(x - w / 2, cy + h / 2)
        canvas.alpha_composite(im, (left, top)) if 0 <= left and 0 <= top and left + pw <= W and top + ph <= H else canvas.paste(im, (left, top), im)
    if "--colliders" in sys.argv:
        d = ImageDraw.Draw(canvas)
        for bx0, by0, bx1, by1 in boxes:
            a, b = to_px(bx0, by1)
            c, e = to_px(bx1, by0)
            d.rectangle([a, b, c, e], outline=(255, 60, 60, 255))
    OUT.mkdir(parents=True, exist_ok=True)
    path = OUT / f"{name}.png"
    canvas.convert("RGB").save(path)
    print(path, canvas.size)


main()
