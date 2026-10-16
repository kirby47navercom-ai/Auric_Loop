"""셰리·알레아 그림 (아트팀 모션 팩: 알레아 v3, 셰리 v11) → 게임용 스프라이트·이펙트·C++ 좌표.

실행: python tools/make_hero_motion.py [--prune]   (입력: native/alea_v3, native/sherry_v11 = 팩의 manifest.json + 쓰는 PNG)
  --prune: native/ 안에서 이 도구가 읽지 않는 PNG를 지움 (저장소에 쓰는 것만 남김)
팩 규칙 (README_ko.txt): 80x64 칸, 발 기준 (40,58), 4방향 (아래·왼·위·오른쪽, 반전 없음)
  걸으며 공격 = 공격 프레임의 상체 레이어 + 지금 걷기 프레임의 다리·골반 레이어, 상체에는 걷기 바운스를 한 번만 더함
결과: Assets/Sprites/<Alea|Sherry>Motion/
  body.png (프레임 모음, 같은 그림은 한 칸) + S_<C>M_<클립>_<행>_<프레임>[_W<걷기 위상>].hbsprite.json
    행: 0 아래 · 1 왼쪽 · 2 위 · 3 오른쪽 (Screen.inl AnimateMotion, 발렌 소켓과 같은 순서)
    알레아: Idle·Walk·Run·Attack(6)  셰리: Idle·Walk·Run·Charge(6 핵심 자세)·Hold(당기는 중 4)·Ready(다 당김 4)
  이펙트: 알레아 마탄·지팡이 섬광·명중 폭발, 셰리 화살(보통·다 당김)·발사 섬광·차징 빛 → Assets/Animations/SA_*.hbspriteanimation.json
  AuricLoop/Source/HeroMotion.inl: 크기(PPU)·원점·발사 자리·차징 빛 자리
"""
import hashlib
import json
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / "AuricLoop/Assets"
DIRS = ["down", "left", "up", "right"]  # 행 번호 순서
LEGS = ("leg_left", "leg_right", "pelvis")
FOOT = 59  # 발바닥 아래 끝 (발 기준점 58번째 줄 아래)
# 키(1.6~1.7m)가 예전 그림과 같게: 셰리 47px, 알레아 43px (모자 포함)
HEROES = {"Alea": {"pack": "alea_v3", "ppu": 26}, "Sherry": {"pack": "sherry_v11", "ppu": 29}}
used = set()


def load(pack, rel):
    used.add((pack / rel).resolve())
    return Image.open(pack / rel).convert("RGBA")


def compose(pack, frame, walk=None, bob=0):
    """frame의 레이어를 draw_order대로. walk가 있으면 다리·골반은 walk 프레임 것, 나머지는 bob px 아래로"""
    out = Image.new("RGBA", (80, 64))
    for name in frame["draw_order"]:
        src = walk if walk is not None and name in LEGS else frame
        ref = src["layer_refs"].get(name)
        if not ref:
            continue
        layer = load(pack, ref["png"])
        out.alpha_composite(layer, (0, bob if walk is not None and name not in LEGS else 0))
    return out


def top(img):
    box = img.getchannel("A").getbbox()
    return box[1] if box else 0


class Atlas:
    def __init__(self, hero, ppu):
        self.hero, self.ppu, self.cells, self.index, self.names = hero, ppu, [], {}, {}

    def add(self, name, img):
        key = hashlib.sha1(img.tobytes()).hexdigest()
        if key not in self.index:
            self.index[key] = len(self.cells)
            self.cells.append(img)
        self.names[name] = self.index[key]

    def write(self, folder):
        cols = 16
        rows = (len(self.cells) + cols - 1) // cols
        sheet = Image.new("RGBA", (cols * 80, rows * 64))
        for i, c in enumerate(self.cells):
            sheet.paste(c, ((i % cols) * 80, (i // cols) * 64))
        sheet.save(folder / "body.png", optimize=True)
        pivot = round((64 - FOOT + 0.95 * self.ppu) / 64, 5)  # 원점 = 발끝 0.95m 위 (충돌·그림자 그대로)
        for name, i in self.names.items():
            sprite(folder, name, "body.png", self.ppu, [(i % cols) * 80, (i // cols) * 64, 80, 64], [0.5, pivot])
        return len(self.cells)


def sprite(folder, name, texture, ppu, rect, pivot):
    rel = folder.relative_to(ASSETS.parent).as_posix()
    (folder / f"{name}.hbsprite.json").write_text(json.dumps({"version": 1, "name": name, "texture": f"{rel}/{texture}", "pixelsPerUnit": ppu,
        "rect": rect, "pivot": pivot, "filter": "nearest", "border": [0, 0, 0, 0]}), encoding="utf-8")


def fx(folder, pack, name, pngs, ppu, pivot_xy, durations, loop=False):
    """이펙트 그림 여러 장 → 스프라이트 + 애니메이션 (pivot_xy: 그림 위에서 px)"""
    frames = []
    for i, png in enumerate(pngs):
        img = load(pack, png)
        img.save(folder / f"{name}_{i}.png", optimize=True)
        sprite(folder, f"S_{name}_{i}", f"{name}_{i}.png", ppu, [0, 0, img.width, img.height],
               [round(pivot_xy[0] / img.width, 5), round(1 - pivot_xy[1] / img.height, 5)])
        frames.append({"sprite": f"{folder.relative_to(ASSETS.parent).as_posix()}/S_{name}_{i}.hbsprite.json", "duration": durations[i] / 1000})
    (ASSETS / f"Animations/SA_{name}.hbspriteanimation.json").write_text(json.dumps(
        {"version": 1, "name": f"SA_{name}", "frames": frames, "loop": loop, "playRate": 1}, indent=2), encoding="utf-8")


def bobs(pack, clips, d):
    """걷기 위상별 상체 바운스 (px, 아래로 +): 걷기 프레임 머리 위끝 - 대기 머리 위끝"""
    idle = clips[f"idle_{d}"]["frames"][0]
    head0 = top(load(pack, idle["layer_refs"]["head"]["png"]))
    return [top(load(pack, f["layer_refs"]["head"]["png"])) - head0 for f in clips[f"walk_{d}"]["frames"]]


def build(hero, cfg):
    pack = ROOT / "native" / cfg["pack"]
    m = json.loads((pack / "manifest.json").read_text(encoding="utf-8"))
    used.add((pack / "manifest.json").resolve())
    clips, ppu = m["clips"], cfg["ppu"]
    folder = ASSETS / f"Sprites/{hero}Motion"
    folder.mkdir(parents=True, exist_ok=True)
    for old in folder.glob("*"):
        old.unlink()
    atlas, p = Atlas(hero, ppu), f"S_{hero[0]}M_"
    attacks = {"Alea": [("Attack", "attack_{}")], "Sherry": [("Charge", "charge_keyposes_{}"), ("Hold", "charge_hold_{}"), ("Ready", "ready_hold_{}")]}[hero]
    for row, d in enumerate(DIRS):
        atlas.add(f"{p}Idle_{row}_0", compose(pack, clips[f"idle_{d}"]["frames"][0]))
        for gait in ("Walk", "Run"):
            for i, f in enumerate(clips[f"{gait.lower()}_{d}"]["frames"]):
                atlas.add(f"{p}{gait}_{row}_{i}", compose(pack, f))
        walk, bob = clips[f"walk_{d}"]["frames"], bobs(pack, clips, d)
        for label, key in attacks:
            for i, f in enumerate(clips[key.format(d)]["frames"]):
                atlas.add(f"{p}{label}_{row}_{i}", compose(pack, f))
                for w in range(4):
                    atlas.add(f"{p}{label}_{row}_{i}_W{w}", compose(pack, f, walk[w], bob[w]))
    cells = atlas.write(folder)
    origin = FOOT - 0.95 * ppu  # 칸 위에서 원점까지 px
    if hero == "Alea":
        pr, ef = m["projectiles"], m["effects"]
        muzzle = [pr[d]["spawn_socket_xy"] for d in DIRS]
        fx(folder, pack, "AleaBolt", [f["png"] for f in pr["right"]["frames"]], ppu, pr["right"]["pivot_xy"], [f["duration_ms"] for f in pr["right"]["frames"]], True)
        fx(folder, pack, "AleaCast", [f["png"] for f in ef["muzzle"]["frames"]], ppu, ef["muzzle"]["pivot_xy"], [f["duration_ms"] for f in ef["muzzle"]["frames"]])
        # 명중 폭발 500ms → 게임 폭발 0.25초에 맞춰 반으로 (Combat.cpp UpdateShots)
        fx(folder, pack, "AleaImpact", [f["png"] for f in ef["impact"]["frames"]], ppu, ef["impact"]["pivot_xy"], [f["duration_ms"] / 2 for f in ef["impact"]["frames"]])
        extra = ""
    else:
        pr = m["projectile"]["directions"]
        muzzle = [pr[d]["neutral_projectile_socket_xy"] for d in DIRS]
        r = pr["right"]
        fx(folder, pack, "SherryArrow", [r["normal_asset"]["png"]], ppu, r["projectile_alignment_pivot_xy"], [100], True)
        fx(folder, pack, "SherryArrowFull", [r["charged_asset"]["png"]], ppu, r["projectile_alignment_pivot_xy"], [100], True)
        fx(folder, pack, "SherryRelease", [x["png"] for x in r["release_fx"]], ppu, r["fx_pivot_xy"], m["projectile"].get("release_fx_durations_ms") or [30] * 4)
        c = m["charge_fx"]
        fx(folder, pack, "SherryCharge", [f["png"] for f in c["frames"]], ppu, c["pivot_xy"], [f["duration_ms"] for f in c["frames"]])
        fx(folder, pack, "SherryReady", [f["png"] for f in c["ready_loop"]], ppu, c["pivot_xy"], [f.get("duration_ms", 160) for f in c["ready_loop"]], True)
        # 차징 빛 자리: 당기는 자세의 활 쥔 손 (왼손 joints 마지막 점, 위를 보면 드러난 활 끝)
        hand = [clips[f"charge_hold_{d}"]["frames"][0]["joints"]["left"][2] for d in DIRS]
        extra = "static const float kSherryChargeFx[4][2]={" + ",".join(f"{{{x},{y}}}" for x, y in hand) + "};  // 차징 빛 (px, 칸 기준)\n"
    return cells, ppu, origin, muzzle, extra


def main():
    lines = ["#pragma once  // tools/make_hero_motion.py가 만듦 (손으로 고치지 않음): 셰리·알레아 모션 팩 그림 크기·발사 자리\n",
             "// 행 0 아래 · 1 왼쪽 · 2 위 · 3 오른쪽. 좌표는 80x64 칸의 px (오른쪽 +x, 아래 +y)\n"]
    ppus, origins, muzzles, extras = [], [], [], ""
    for hero, cfg in HEROES.items():
        cells, ppu, origin, muzzle, extra = build(hero, cfg)
        print(hero, "칸", cells, "PPU", ppu)
        ppus.append(ppu); origins.append(origin); muzzles.append(muzzle); extras += extra
    # 0 셰리 · 1 알레아 (Character-1)
    order = [1, 0]
    lines.append(f"static const float kHmPPU[2]={{{ppus[order[0]]}.f,{ppus[order[1]]}.f}},kHmOriginTop[2]={{{origins[order[0]]:.3f}f,{origins[order[1]]:.3f}f}};  // [0] 셰리 [1] 알레아\n")
    lines.append("static const float kHmMuzzle[2][4][2]={" + ",".join("{" + ",".join(f"{{{x},{y}}}" for x, y in muzzles[k]) + "}" for k in order) + "};  // 화살 받침 · 지팡이 보석\n")
    lines.append(extras)
    (ROOT / "AuricLoop/Source/HeroMotion.inl").write_text("".join(lines), encoding="utf-8")
    if "--prune" in sys.argv:
        for cfg in HEROES.values():
            for f in (ROOT / "native" / cfg["pack"]).rglob("*.png"):
                if f.resolve() not in used:
                    f.unlink()
        for cfg in HEROES.values():
            for d in sorted((ROOT / "native" / cfg["pack"]).rglob("*"), reverse=True):
                if d.is_dir() and not any(d.iterdir()):
                    d.rmdir()


main()
