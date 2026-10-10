"""지도 그림 (C++ DrawMap): 방 칸(가장자리 2px 테, nineSlice 3), 복도, 내 위치, 특별한 방 아이콘 (12px).

실행: python tools/make_map_art.py → Assets/UI/Map/
  cell_current(지금 방, 금빛) · cell_visited(가 본 방) · cell_seen(이어진 줄만 아는 방) · cell_boss(보스방) · cell_corr(복도) · map_here(나)
  icon_boss(해골) · icon_shop(금화) · icon_gather(곡괭이) · icon_start(올라가는 계단)
"""
from pathlib import Path

from PIL import Image

OUT = Path(__file__).resolve().parent.parent / "AuricLoop/Assets/UI/Map"


def cell(name, fill, edge, dark=(10, 14, 18)):
    im = Image.new("RGBA", (12, 12), dark + (255,))
    for y in range(1, 11):
        for x in range(1, 11):
            im.putpixel((x, y), (edge if x in (1, 10) or y in (1, 10) else fill) + (255,))
    im.save(OUT / f"{name}.png")


cell("cell_current", (226, 180, 72), (255, 240, 190))
cell("cell_visited", (70, 98, 106), (138, 172, 178))
cell("cell_seen", (30, 42, 48), (78, 104, 112))
cell("cell_boss", (96, 30, 30), (200, 70, 60))
Image.new("RGBA", (4, 4), (110, 140, 146, 255)).save(OUT / "cell_corr.png")


def icon(name, rows, colors):
    im = Image.new("RGBA", (len(rows[0]), len(rows)))
    for y, row in enumerate(rows):
        for x, ch in enumerate(row):
            if ch in colors:
                im.putpixel((x, y), colors[ch] + (255,))
    im.save(OUT / f"{name}.png")


K = (12, 10, 10)
icon("map_here", ["  KKKK  ", " KWWWWK ", "KWWWWWWK", "KWWWWWWK", "KWWWWWWK", "KWWWWWWK", " KWWWWK ", "  KKKK  "], {"K": K, "W": (255, 255, 255)})
icon("icon_boss", ["   KKKKKK   ", "  KWWWWWWK  ", " KWWWWWWWWK ", " KWKKWWKKWK ", " KWKKWWKKWK ", " KWWWWWWWWK ", "  KWWKKWWK  ", "  KWWWWWWK  ", "   KWKWKWK  ", "   KKKKKK   ", "            ", "            "],
     {"K": K, "W": (238, 226, 214)})
icon("icon_shop", ["   KKKKKK   ", "  KYYYYYYK  ", " KYYGGGGYYK ", "KYYGYYYYGYYK", "KYYGYYYYYYYK", "KYYYGGGGYYYK", "KYYYYYYYGYYK", "KYYGYYYYGYYK", " KYYGGGGYYK ", "  KYYYYYYK  ", "   KKKKKK   ", "            "],
     {"K": K, "Y": (240, 196, 80), "G": (150, 100, 30)})
icon("icon_gather", ["            ", "  KKKKKKK   ", " KSSSSSSSK  ", "  KKKKKSSK  ", "      KSK   ", "     KBK    ", "    KBK     ", "   KBK      ", "  KBK       ", " KBK        ", " KK         ", "            "],
     {"K": K, "S": (200, 210, 214), "B": (150, 100, 60)})
icon("icon_start", ["            ", "     KK     ", "    KWWK    ", "   KWWWWK   ", "  KKKWWKKK  ", "    KWWK    ", "  KKKKKKKK  ", "  KWWWWWWK  ", "KKKKKKKKKKK ", "KWWWWWWWWWK ", "KKKKKKKKKKK ", "            "],
     {"K": K, "W": (230, 236, 240)})
print("지도 그림")
