"""거점·던전 NPC(수금원·세공사·대장장이)를 플레이어와 같은 SD 그림체로 넣는다.

실행: python tools/make_npc_sd.py [생성 그림 폴더=native/npc-source] && python tools/make_shadows.py && python tools/make_ambient.py && python tools/gen_scene.py
입력: npc_collector.png / npc_interior.png / npc_blacksmith.png (Codex 이미지 생성, 마젠타 배경, 플레이어 그림을 그림체 기준으로)
1) 생성 그림의 도트 한 칸 크기를 찾아 원래 격자로 되돌리고(tools/pixelize.py snap) 마젠타를 지운다. 해상도는 줄이지 않는다.
2) 키는 그림을 줄이지 않고 PPU(1m당 픽셀)로 맞춘다 → Assets/Sprites/npc_ppu.json. gen_scene·make_shadows·make_ambient가 읽음
"""
import json
import sys
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
from defringe import clean  # noqa: E402
from pixelize import snap  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
SPRITES = ROOT / "AuricLoop/Assets/Sprites"
SRC = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "native/npc-source"
# 이름: (파일, 화면 키 m). 플레이어 실루엣 키는 2m
NPCS = {"Collector": ("npc_collector.png", 2.05), "Interior": ("npc_interior.png", 2.0), "Blacksmith": ("npc_blacksmith.png", 2.3)}

ppu = {}
for name, (file, height) in NPCS.items():
    im = snap(Image.open(SRC / file).convert("RGB")).convert("RGBA")
    im.putdata([(0, 0, 0, 0) if (p[0] > 180 and p[2] > 180 and p[1] < 110) else p for p in im.get_flattened_data()])
    im, _ = clean(im, purple=False)  # 윤곽에 남은 마젠타 섞인 점
    im = im.crop(im.getbbox())
    im.save(SPRITES / f"NPC_{name}.png")
    ppu[f"Sprites/NPC_{name}.png"] = round(im.height / height, 3)
    print(name, im.size, "PPU", ppu[f"Sprites/NPC_{name}.png"])
(SPRITES / "npc_ppu.json").write_text(json.dumps(ppu, indent=1) + "\n", encoding="utf-8")
