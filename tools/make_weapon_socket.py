"""발렌 그림 (아트팀 이동 v14-1 + 공격 v5-1, 검은 1px 외곽선): 몸·손에 단 검·손가락·검기를 게임용 스프라이트로.

실행: python tools/make_weapon_socket.py [아트팀 Textures 폴더=native/valen_v5]
입력 (공격 패키지 Unity/.../Textures 그대로): walk/·run/ (이동 레이어 64px 칸 4행 앞·왼·뒤·오른 x 4위상), Attack/ (공격 8프레임),
      weapon/valen_sword.png, valen_attack_metadata_v5.json·valen_locomotion_metadata_v14.json (손 위치)
결과: Assets/Sprites/ValenSocket/ + AuricLoop/Source/ValenSocket.inl (C++가 쓰는 손 위치·검 번호·크기)
  몸 (외곽선·하체·부속품·[왼쪽일 때 먼 손가락]·상체를 한 장으로, 반전 없음). 다리 0 앞으로·1 옆걸음 ccw·2 옆걸음 cw
    S_VS_<walk|run>_<다리>_<행>_<위상>          이동
    S_VS_A_walk_<행>_<프레임>                    서서 베기 (서 있는 위상)
    S_VS_A_run_<다리>_<행>_<위상>_<프레임>       걸으며 베기 (하체는 걷기 위상을 이어감)
    칸 아래 끝 = 발끝 (sortPoint feet), 원점은 발끝 0.95m 위 (충돌·그림자 그대로)
  검: 쥐는 곳이 원점. 그림 아래 끝으로 몸 앞뒤가 정해짐 (F는 발끝보다 아래까지, R은 발끝보다 위에서 끝남)
    S_VS_Sword_<F|R>_<0..63>  이동 중: 5.625도씩 반시계로 돌린 검 (외곽선 덧씀)
    S_VS_AW_<번호>_<F|R>      베기: 아트팀이 그린 자세 (같은 그림은 하나로)
  손가락 덮개 (검 위, 왼쪽을 볼 때는 몸에 합침): S_VS_Grip_<walk|run>_<행>_<위상>, S_VS_AG_<번호>
  검기: S_VS_Slash_<조준16>_<프레임2..4> (몸 뒤에 그림)
  대시 잔상: S_VS_Ghost_<다리>_<행>_<위상> (달리기 몸을 금빛 반투명으로)
"""
import hashlib
import json
import math
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "native/valen_v5"
OUT = ROOT / "AuricLoop/Assets/Sprites/ValenSocket"
INL = ROOT / "AuricLoop/Source/ValenSocket.inl"
PPU = 24          # 아트팀 원본은 16. 그대로면 키가 2.4m라 거리 소품(우물 2m)보다 커서 24로 (약 1.6m)
CELL, FEET = 64, 56                # 64px 칸, 발끝은 위에서 56번째 줄
ORIGIN = 0.95 * PPU                # 원점은 발끝 0.95m 위 (px)
GRIP_PAD = 24                      # 손가락 덮개를 검보다 앞에 그리려고 칸을 발끝 아래로 늘림 (검 칸은 발끝 아래 23px 이내)
ANGLES, SC = 64, 64
ROWS = ["front", "facing_left", "back", "facing_right"]
VARIANTS = ["forward", "strafe_ccw", "strafe_cw"]
OUT.mkdir(parents=True, exist_ok=True)
for old in OUT.glob("*"):
    old.unlink()


def sprite(name, png, rect, pivot):
    data = {"version": 1, "name": name, "texture": png.relative_to(ROOT / "AuricLoop").as_posix(), "pixelsPerUnit": PPU,
            "rect": [int(v) for v in rect], "pivot": [round(pivot[0], 5), round(pivot[1], 5)], "filter": "nearest", "border": [0, 0, 0, 0]}
    (OUT / f"{name}.hbsprite.json").write_text(json.dumps(data, ensure_ascii=False) + "\n", encoding="utf-8")


def img(path):
    return Image.open(SRC / path).convert("RGBA")


def cell(sheet, col, row):
    return sheet.crop((col * CELL, row * CELL, col * CELL + CELL, row * CELL + CELL))


class Sheet:
    """칸을 차곡차곡 붙이는 한 장 (가로 cols칸)"""
    def __init__(self, name, w, h, cols=32):
        self.name, self.w, self.h, self.cols, self.cells = name, w, h, cols, []

    def add(self, im):
        self.cells.append(im)
        k = len(self.cells) - 1
        return (k % self.cols) * self.w, (k // self.cols) * self.h

    def save(self):
        rows = (len(self.cells) + self.cols - 1) // self.cols
        out = Image.new("RGBA", (self.cols * self.w, rows * self.h))
        for k, im in enumerate(self.cells):
            out.paste(im, ((k % self.cols) * self.w, (k // self.cols) * self.h))
        out.save(OUT / f"{self.name}.png")
        return OUT / f"{self.name}.png"


def body(layers):
    c = Image.new("RGBA", (CELL, CELL))
    for im in layers:
        c.alpha_composite(im)
    return c.crop((0, 0, CELL, FEET))


def outlined(im):
    """바깥에 검은 1px (아트팀 외곽선과 같게)"""
    a = np.array(im)
    m = a[..., 3] > 0
    g = m.copy()
    g[1:] |= m[:-1]; g[:-1] |= m[1:]; g[:, 1:] |= m[:, :-1]; g[:, :-1] |= m[:, 1:]
    a[g & ~m] = (0, 0, 0, 255)
    return Image.fromarray(a, "RGBA")


def sword_sprite(name, png, im, x, y, pivot_top, pivot_left):
    """쥐는 곳(칸 위에서 pivot_top px) 아래로 그림이 내려가는 만큼 칸을 남긴 두 장. F는 발끝보다 아래(16px+)까지, R은 발끝보다 위(8px)에서 끝남"""
    b = im.getbbox()
    need = max(0, (b[3] if b else 0) - pivot_top)
    for side, least in (("F", 16), ("R", 8)):
        h = min(CELL, math.ceil(pivot_top + max(least, need)))
        sprite(f"{name}_{side}" if not name.endswith("_") else f"{name}{side}", png, (x, y, CELL, h), (pivot_left / CELL, (h - pivot_top) / h))


# ---- 몸 ----
L = {g: {v: img(f"{g}/{g}_lower_{v}.png") for v in VARIANTS} for g in ("walk", "run")}
acc = {g: img(f"{g}/{g}_fixed_accessories.png") for g in ("walk", "run")}
upper = {g: img(f"{g}/{g}_upper_body.png") for g in ("walk", "run")}
grip = {g: img(f"{g}/{g}_grip_overlay.png") for g in ("walk", "run")}
outl = {(g, v): img(f"{g}/{g}_outline_{v}.png") for g in ("walk", "run") for v in VARIANTS}
a_up = {g: img(f"Attack/{g}_attack_upper_4dir_all_phases.png") for g in ("walk", "run")}
a_grip = {g: img(f"Attack/{g}_attack_grip_4dir_all_phases.png") for g in ("walk", "run")}
a_outl = {(g, v): img(f"Attack/{g}_attack_outline_{v}.png") for g in ("walk", "run") for v in VARIANTS}

pending, sheets = [], {}
for g in ("walk", "run"):
    sh = sheets[g] = Sheet(f"body_{g}", CELL, FEET)
    for v_i, v in enumerate(VARIANTS):
        for r in range(4):
            for ph in range(4):
                lay = [cell(outl[(g, v)], ph, r), cell(L[g][v], ph, r), cell(acc[g], ph, r)]
                if r == 1:
                    lay.append(cell(grip[g], ph, r))  # 왼쪽을 보면 검 든 손이 먼 쪽: 손가락이 윗몸 뒤
                lay.append(cell(upper[g], ph, r))
                pending.append((g, f"S_VS_{g}_{v_i}_{r}_{ph}", sh.add(body(lay))))
# 베기 몸: 서서(걷기 그림의 서 있는 위상, 앞다리) / 걸으며(달리기, 다리 3종 x 위상 4)
sh = sheets["attack"] = Sheet("body_attack", CELL, FEET)
for g, vs, moving in (("walk", [0], False), ("run", [0, 1, 2], True)):
    for v_i in vs:
        v = VARIANTS[v_i]
        for r in range(4):
            for ph in (range(4) if moving else [0 if r == 2 else 1]):
                for f in range(8):
                    i = ph * 8 + f
                    lay = [cell(a_outl[(g, v)], i, r), cell(L[g][v], ph, r), cell(acc[g], ph, r)]
                    if r == 1:
                        lay.append(cell(a_grip[g], i, r))
                    lay.append(cell(a_up[g], i, r))
                    name = f"S_VS_A_run_{v_i}_{r}_{ph}_{f}" if moving else f"S_VS_A_walk_{r}_{f}"
                    pending.append(("attack", name, sh.add(body(lay))))
paths = {k: s.save() for k, s in sheets.items()}
for key, name, (x, y) in pending:
    sprite(name, paths[key], (x, y, CELL, FEET), (0.5, ORIGIN / FEET))

# 대시 잔상: 달리기 몸을 금빛 반투명으로 (자리 같음)
a = np.array(Image.open(paths["run"])).astype(float)
a[..., 0] = a[..., 0] * 0.2 + 255 * 0.8; a[..., 1] = a[..., 1] * 0.2 + 240 * 0.8; a[..., 2] = a[..., 2] * 0.2 + 185 * 0.8; a[..., 3] *= 0.5
Image.fromarray(a.astype("uint8"), "RGBA").save(OUT / "ghost_run.png")
for key, name, (x, y) in pending:
    if name.startswith("S_VS_run_"):
        sprite(name.replace("S_VS_run_", "S_VS_Ghost_"), OUT / "ghost_run.png", (x, y, CELL, FEET), (0.5, ORIGIN / FEET))

# ---- 손가락 덮개 (검 위). 이동 + 베기 (같은 그림은 하나로) ----
gsh = Sheet("grip", CELL, FEET + GRIP_PAD)
gpend, gid = [], {}


def grip_cell(im):
    c = Image.new("RGBA", (CELL, FEET + GRIP_PAD))
    c.paste(im.crop((0, 0, CELL, FEET)), (0, 0))
    return c


for g in ("walk", "run"):
    for r in (0, 2, 3):
        for ph in range(4):
            gpend.append((f"S_VS_Grip_{g}_{r}_{ph}", gsh.add(grip_cell(cell(grip[g], ph, r)))))
attack_grip = [[[[-1] * 8 for _ in range(4)] for _ in range(4)] for _ in range(2)]
for gi, g in enumerate(("walk", "run")):
    for r in (0, 2, 3):
        for ph in range(4):
            for f in range(8):
                im = grip_cell(cell(a_grip[g], ph * 8 + f, r))
                if im.getbbox() is None:
                    continue
                h = hashlib.md5(im.tobytes()).hexdigest()
                if h not in gid:
                    gid[h] = len(gid)
                    gpend.append((f"S_VS_AG_{gid[h]}", gsh.add(im)))
                attack_grip[gi][r][ph][f] = gid[h]
gpath = gsh.save()
for name, (x, y) in gpend:
    sprite(name, gpath, (x, y, CELL, FEET + GRIP_PAD), (0.5, (GRIP_PAD + ORIGIN) / (FEET + GRIP_PAD)))

# ---- 검 ----
# 이동 중: 원본 검을 8배로 키워 쥐는 곳 둘레로 돌린 뒤 줄이고 외곽선 (64방향, 쥐는 곳은 칸 가운데 32,32)
sw = Image.open(SRC / "weapon/valen_sword.png").convert("RGBA")
K = 8
big = sw.resize((sw.width * K, sw.height * K), Image.NEAREST)
wsh, wpend = Sheet("sword", SC, SC, cols=16), []
for i in range(ANGLES):
    canvas = Image.new("RGBA", (SC * K, SC * K))
    canvas.alpha_composite(big, (round(SC * K / 2 - 5.5 * K), round(SC * K / 2 - 6.5 * K)))
    c = outlined(canvas.rotate(i * 360 / ANGLES, resample=Image.NEAREST, center=(SC * K / 2, SC * K / 2)).resize((SC, SC), Image.NEAREST))
    wpend.append((i, c, wsh.add(c)))
wpath = wsh.save()
for i, c, (x, y) in wpend:
    sword_sprite(f"S_VS_Sword_", wpath, c, x, y, 32, 32)
    for side in "FR":  # 이름을 S_VS_Sword_<F|R>_<i>로
        src = OUT / f"S_VS_Sword_{side}.hbsprite.json"
        src.rename(OUT / f"S_VS_Sword_{side}_{i}.hbsprite.json")
# 베기: 아트팀 자세 (행 x 조준16 x 위상 x 프레임 → 같은 그림만 남김). 쥐는 곳은 칸 위에서 32.5px, 왼쪽에서 32.5px
ash, apend = Sheet("sword_attack", CELL, CELL), []
wid, attack_weapon = {}, [[[[[0] * 8 for _ in range(4)] for _ in range(16)] for _ in range(4)] for _ in range(2)]
for gi, g in enumerate(("walk", "run")):
    for r, rn in enumerate(ROWS):
        sheet = img(f"Attack/{g}_attack_weapon_{rn}.png")
        for aim in range(16):
            for ph in range(4):
                for f in range(8):
                    c = cell(sheet, ph * 8 + f, aim)
                    h = hashlib.md5(c.tobytes()).hexdigest()
                    if h not in wid:
                        wid[h] = len(wid)
                        apend.append((wid[h], c, ash.add(c)))
                    attack_weapon[gi][r][aim][ph][f] = wid[h]
apath = ash.save()
for k, c, (x, y) in apend:
    sword_sprite(f"S_VS_AW_{k}", apath, c, x, y, 32.5, 32.5)

# ---- 검기 (프레임 2·3·4만 보임) ----
slash = img("Attack/sharp_fan_slash_16dir_8frames.png")
ssh, spend = Sheet("slash", CELL, CELL, cols=16), []
for aim in range(16):
    for f in (2, 3, 4):
        spend.append((f"S_VS_Slash_{aim}_{f}", ssh.add(cell(slash, f, aim))))
spath = ssh.save()
for name, (x, y) in spend:
    sprite(name, spath, (x, y, CELL, CELL), (0.5, 0.5))

# ---- C++ 표 ----
meta = json.loads((SRC / "valen_attack_metadata_v5.json").read_text(encoding="utf-8"))
loco = json.loads((SRC / "valen_locomotion_metadata_v14.json").read_text(encoding="utf-8"))["weapon"]["hand_anchors"]
arr = lambda x: "{" + ",".join(arr(v) for v in x) + "}" if isinstance(x, list) else str(x)  # noqa: E731
ah = [[[meta["hand_anchors"][g][rn][ph] for ph in range(4)] for rn in ROWS] for g in ("walk", "run")]
lh = [[loco[g][rn] for rn in ROWS] for g in ("walk", "run")]
INL.write_text(
    "#pragma once  // tools/make_weapon_socket.py가 만듦 (손으로 고치지 않음): 발렌 그림 크기·손 위치·베기 검 번호\n"
    f"static const float kVsPPU={PPU}.f,kVsOriginTop={FEET - ORIGIN:.3f}f;  // 64px 칸 위에서 원점까지 px (발끝 0.95m 위)\n"
    f"static const float kVsAttackMs[8]={{{','.join(str(d) for d in meta['durations_ms'])}}};\n"
    f"static const int kVsHands[2][4][4][2]={arr(lh)};  // [걷기·달리기][앞·왼·뒤·오른][위상] 손 픽셀\n"
    f"static const int kVsAttackHands[2][4][4][8][2]={arr(ah)};  // [걷기·달리기][행][위상][베기 프레임]\n"
    f"static const short kVsAttackWeapon[2][4][16][4][8]={arr(attack_weapon)};  // S_VS_AW_<번호>\n"
    f"static const short kVsAttackGrip[2][4][4][8]={arr(attack_grip)};  // S_VS_AG_<번호>, -1이면 없음\n",
    encoding="utf-8")
print("몸", len(pending), "손가락", len(gpend), "베기 검", len(wid), "검기", len(spend), "크기 PPU", PPU)
