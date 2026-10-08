"""서 있는 물체·NPC·적 그림에 바닥 그림자를 넣고, 앞뒤 정렬 기준(발끝)을 캐릭터와 맞춘다.

실행: python tools/make_shadows.py   (그림을 새로 뽑았으면 다시 실행. 이미 처리한 그림은 건너뜀)
1) 위아래에 PAD(8px)씩 투명 여백을 더한다. 내용 가운데가 그대로라 장면·C++ 위치는 바뀌지 않는다.
   플레이어 그림(192x96)은 발끝 아래 8px 여백이 있으므로, 모든 그림을 "그림 맨 아래 = 발끝 8px 아래"로 맞추면
   엔진의 발끝 정렬(sortPoint=feet)이 캐릭터·물체에 똑같이 맞는다 (나무 밑동보다 위에 서면 나무 뒤로 감).
2) 아래 여백에 납작한 그림자 타원을 그리고 그 위에 원래 그림을 얹는다 (밑동 아래로 그림자가 깔림).
적 그림은 스프라이트 에셋(hbsprite.json)의 rect·pivot도 고쳐서 화면 위치가 그대로다.
처리한 파일은 Assets/Sprites/shadowed.json에 결과 해시로 기록 (원본이 바뀌면 다시 처리).
"""
import hashlib
import json
from pathlib import Path

from PIL import Image, ImageDraw

ASSETS = Path(__file__).resolve().parent.parent / "AuricLoop/Assets"
MANIFEST = ASSETS / "Sprites/shadowed.json"
PAD = 8
PPU_FILE = ASSETS / "Sprites/npc_ppu.json"  # tools/make_npc_sd.py: 1m당 픽셀이 32가 아닌 그림
PPU = json.loads(PPU_FILE.read_text(encoding="utf-8")) if PPU_FILE.exists() else {}
SHADOW = (6, 8, 12, 120)

# 그림자를 넣을 그림: (파일 glob, 그림자 너비 비율: 밑동 너비 기준, 음수면 그림 전체 너비 기준 - 나무는 잎 그늘). 바닥에 붙은 그림·벽에 걸린 그림은 뺌
TARGETS = [
    ("Sprites/Town/TreeRound.png", -0.8), ("Sprites/Town/TreePine.png", -0.7), ("Sprites/Town/Bush.png", 0.9),
    ("Sprites/Town/FlowerBed.png", 0.95), ("Sprites/Town/Fence.png", 0.95), ("Sprites/Town/Well.png", 0.9),
    ("Sprites/Town/Firewood.png", 0.95), ("Sprites/Town/PlayerHouse.png", 0.96), ("Sprites/Town/LoanOffice.png", 0.96),
    ("Sprites/Town/Workshop.png", 0.96), ("Sprites/Town/Shop*.png", 0.96), ("Sprites/Town/Desk.png", 0.9),
    ("Sprites/Town/PottedPlant.png", 0.8), ("Sprites/Town/Sofa*.png", 0.95),
    ("Sprites/Props/Prop_Lamp.png", 0.9), ("Sprites/Props/Prop_Bench.png", 0.95), ("Sprites/Props/Prop_NoticeBoard.png", 0.8),
    ("Sprites/Props/Prop_Pillar.png", 1.0), ("Sprites/Props/Prop_Crates*.png", 1.0), ("Sprites/Props/Prop_Barrel*.png", 1.0),
    ("Sprites/Props/Prop_LowWall.png", 1.0), ("Sprites/Props/Prop_Statue.png", 1.0), ("Sprites/Props/Prop_GoldChest.png", 1.0),
    ("Sprites/Props/Prop_Plant.png", 0.8), ("Sprites/Props/Prop_Stump.png", 0.9), ("Sprites/Props/Sign_*.png", 0.25),
    ("Sprites/NPC_Collector.png", 0.75), ("Sprites/NPC_Interior.png", 0.75), ("Sprites/NPC_Blacksmith.png", 0.75), ("Sprites/Furniture_*.png", 0.95), ("Sprites/Prop_DebtBoard.png", 0.7),
    ("Sprites/Prop_Ore.png", 0.85), ("Sprites/Prop_Herb.png", 0.7), ("Sprites/Prop_Stall.png", 0.95),
    ("Sprites/Enemies/*/*.png", 0.62),
]


def digest(im):
    return hashlib.sha256(im.tobytes() + str(im.size).encode()).hexdigest()[:16]


def shadowed(im, ratio, pad=PAD):
    w, h = im.size
    box = im.getbbox() or (0, 0, w, h)
    out = Image.new("RGBA", (w, h + 2 * pad))
    # 밑동 쪽 실제 너비 (아래 1/4에서 불투명 픽셀이 있는 가로 범위)로 그림자 폭을 정함
    alpha = im.getchannel("A")
    rows = range(max(box[1], box[3] - max(4, (box[3] - box[1]) // 4)), box[3])
    xs = [x for y in rows for x in range(w) if alpha.getpixel((x, y)) > 128]
    lo, hi = (min(xs), max(xs)) if xs else (box[0], box[2])
    cx = (lo + hi) / 2
    if ratio < 0:
        lo, hi, ratio = box[0], box[2] - 1, -ratio
    sw = max(6, (hi - lo + 1) * ratio + 4)
    sh = max(4, min(pad + 10, sw * 0.3))
    base = box[3] + pad  # 내용 맨 아래 줄 (새 그림 좌표)
    d = ImageDraw.Draw(out)
    d.ellipse([cx - sw / 2, base - sh * 0.55, cx + sw / 2, base + sh * 0.45], fill=SHADOW)
    out.alpha_composite(im, (0, pad))
    return out


def main():
    done = json.loads(MANIFEST.read_text(encoding="utf-8")) if MANIFEST.exists() else {}
    count = 0
    for pattern, ratio in TARGETS:
        for path in sorted(ASSETS.glob(pattern)):
            rel = path.relative_to(ASSETS).as_posix()
            im = Image.open(path).convert("RGBA")
            if done.get(rel) == digest(im):
                continue  # 이미 처리함
            out = shadowed(im, ratio, round(PAD * PPU.get(rel, 32) / 32))
            out.save(path)
            done[rel] = digest(Image.open(path).convert("RGBA"))
            count += 1
            # 같은 그림을 쓰는 스프라이트 에셋: rect 높이·pivot을 고쳐 화면 위치 유지
            for sprite in path.parent.glob("*.hbsprite.json"):
                s = json.loads(sprite.read_text(encoding="utf-8"))
                if s.get("texture") != "Assets/" + rel:
                    continue
                x, y, rw, rh = s["rect"]
                if rh != im.height:
                    continue
                s["rect"] = [x, y, rw, rh + 2 * PAD]
                s["pivot"] = [s["pivot"][0], (s["pivot"][1] * rh + PAD) / (rh + 2 * PAD)]
                sprite.write_text(json.dumps(s, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    MANIFEST.write_text(json.dumps(done, ensure_ascii=False, indent=1, sort_keys=True) + "\n", encoding="utf-8")
    print("그림자·여백:", count, "장 처리 /", len(done), "장 기록")


if __name__ == "__main__":
    main()
