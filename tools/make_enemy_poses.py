"""적·보스 공격 자세 그림을 게임 스프라이트·클립으로 넣는다 (Codex 이미지 생성 → 도트 격자 복원).

실행: python tools/make_enemy_poses.py [생성 그림 폴더=native/enemy-poses] && python tools/make_shadows.py
입력 (마젠타 배경, 오른쪽을 보는 옆모습): skel_*.png, mage_*.png, boss_*.png
1) 도트 한 칸 크기를 찾아 원래 격자로 되돌리고(tools/pixelize.py snap) 마젠타·테두리 찌꺼기를 지운다
2) 캐릭터마다 기준 자세 하나를 지금 게임 그림(Attack_0)의 키에 맞춰 같은 배율로 줄인다 (자세끼리 크기 유지)
3) 지금 걷기 그림과 같은 캔버스·발끝 위치(피벗)로 놓는다 → 바꿔 끼워도 발이 뜨거나 가라앉지 않음
4) 그림이 없으면 지금 공격 그림으로 대신 만든다 (코드·상태 머신은 같은 이름을 씀)
결과: Assets/Sprites/Enemies/<적>/<적>_<자세>.png + S_*.hbsprite.json, Assets/Animations/SA_<적>_<자세>.hbspriteanimation.json
"""
import json
import sys
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
from defringe import clean  # noqa: E402
from pixelize import snap  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / "AuricLoop/Assets"
SRC = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "native/enemy-poses"
PAD = 8  # tools/make_shadows.py 여백

# 적: (기준 자세 파일, {자세 이름: 생성 파일}, {클립 이름: [(자세, 초)], 반복})
ENEMIES = {
    "Skeleton": ("skel_windup.png", {
        "SlashWindup": "skel_windup.png", "LungeReady": "skel_lunge_ready.png", "Lunge": "skel_lunge.png",
        "LeapCrouch": "skel_leap_crouch.png", "LeapAir": "skel_leap_air.png", "LeapLand": "skel_leap_land.png"}, {}),
    "SkeletonMage": ("mage_cast_ready.png", {"CastReady": "mage_cast_ready.png", "Cast": "mage_cast.png"},
                     {"Cast": ([("CastReady", 0.25), ("Cast", 0.2)], False)}),
    "SkeletonCaptain": ("boss_summon.png", {
        "SlashWindup": "boss_slash_windup.png", "SlashHit": "boss_slash_hit.png", "Dash": "boss_dash.png", "Cast": "boss_cast.png",
        "JumpCrouch": "boss_jump_crouch.png", "JumpAir": "boss_jump_air.png", "Slam": "boss_slam.png", "Summon": "boss_summon.png",
        "Spin_0": "boss_spin_1.png", "Spin_1": "boss_spin_2.png", "Spin_2": "boss_spin_3.png", "Roar": "boss_roar.png"}, {
        "Slash": ([("SlashHit", 0.3)], False), "Dash": ([("Dash", 0.3)], True), "Cast": ([("Cast", 0.3)], False),
        "JumpCrouch": ([("JumpCrouch", 0.3)], False), "JumpAir": ([("JumpAir", 0.3)], True), "Slam": ([("Slam", 0.3)], False),
        "Summon": ([("Summon", 0.3)], False), "Spin": ([("Spin_0", 0.07), ("Spin_1", 0.07), ("Spin_2", 0.07)], True),
        "SlashWindup": ([("SlashWindup", 0.3)], False), "Roar": ([("Roar", 0.3)], False)}),
}


def load_sprite(path):
    s = json.loads(path.read_text(encoding="utf-8"))
    return s, Image.open(ASSETS.parent / s["texture"]).convert("RGBA")


def unpadded(who, pose):
    """지금 그림(그림자 여백 포함)에서 여백 전 캔버스 크기와 피벗"""
    s, im = load_sprite(ASSETS / f"Sprites/Enemies/{who}/S_{who}_{pose}.hbsprite.json")
    h0 = s["rect"][3] - 2 * PAD
    p0 = (s["pivot"][1] * s["rect"][3] - PAD) / h0
    return im.crop((0, PAD, im.width, im.height - PAD)), h0, p0


def generated(file):
    im = snap(Image.open(SRC / file).convert("RGB")).convert("RGBA")
    im.putdata([(0, 0, 0, 0) if (p[0] > 180 and p[2] > 180 and p[1] < 110) else p for p in im.get_flattened_data()])
    im, _ = clean(im, purple=False)
    return im.crop(im.getbbox())


FIX = {("SkeletonCaptain", "Roar"): 0.78}  # 머리를 잘못 재는 자세 보정 (포효: 입을 벌려 해골이 작게 잡힘)


def write_sprite(who, pose, im, pivot_y):
    folder = ASSETS / f"Sprites/Enemies/{who}"
    png = folder / f"{who}_{pose}.png"
    im.save(png)
    data = {"version": 1, "name": f"S_{who}_{pose}", "texture": png.relative_to(ASSETS.parent).as_posix(), "pixelsPerUnit": 32,
            "rect": [0, 0, im.width, im.height], "pivot": [0.5, round(pivot_y, 4)], "filter": "nearest", "border": [0, 0, 0, 0]}
    (folder / f"S_{who}_{pose}.hbsprite.json").write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def skull(im):
    """해골 머리: 가장 큰 밝은 덩어리. (크기, 맨 위 y)"""
    px = im.load()
    w, h = im.size
    white = {(x, y) for y in range(h) for x in range(w) if px[x, y][3] > 128 and min(px[x, y][:3]) > 150}
    best, seen = [], set()
    for start in white:
        if start in seen:
            continue
        stack, blob = [start], []
        seen.add(start)
        while stack:
            x, y = stack.pop()
            blob.append((x, y))
            for n in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                if n in white and n not in seen:
                    seen.add(n)
                    stack.append(n)
        if len(blob) > len(best):
            best = blob
    xs, ys = [x for x, _ in best], [y for _, y in best]
    return ((max(xs) - min(xs) + 1) + (max(ys) - min(ys) + 1)) / 2, min(ys)


def body(im):
    """머리 꼭대기(해골 맨 위)부터 발끝까지 키"""
    return im.getbbox()[3] - skull(im)[1]


for who, (ref_file, poses, clips) in ENEMIES.items():
    walk, h0, p0 = unpadded(who, "Walk_0")
    attack, _, _ = unpadded(who, "Attack_0")
    have = (SRC / ref_file).exists()
    # 크기: 새 자세끼리는 머리 크기로 맞추고(생성 그림마다 그려진 크기가 달라서), 전체는 기준 자세(서 있는 자세)의
    # 머리~발 키를 걷기 그림과 같게 (새 그림이 걷기 그림보다 머리 비율이 작아 머리로만 맞추면 몸이 커짐)
    ref = generated(ref_file) if have else None
    ref_head = skull(ref)[0] if ref else 1
    G = body(walk.crop(walk.getbbox())) / body(ref) if ref else 1
    feet = p0 * h0  # 캔버스 맨 아래에서 원점까지 (px). 새 캔버스도 이 거리를 지킴
    made = []
    for pose, file in poses.items():
        if (SRC / file).exists():
            g = generated(file)
            scale = G * ref_head / skull(g)[0] * FIX.get((who, pose), 1)
            g = g.resize((max(1, round(g.width * scale)), max(1, round(g.height * scale))), Image.NEAREST)
            made.append(pose)
        else:
            g = attack.crop(attack.getbbox())  # 아직 그림이 없으면 지금 공격 그림
        w, h = max(walk.width, g.width + 4), max(h0, g.height)
        canvas = Image.new("RGBA", (w, h))
        canvas.alpha_composite(g, ((w - g.width) // 2, h - g.height))  # 발끝을 캔버스 맨 아래(지금 그림과 같은 줄)에
        write_sprite(who, pose, canvas, feet / h)
    for name, (frames, loop) in clips.items():
        data = {"version": 1, "name": f"SA_{who}_{name}", "loop": loop, "playRate": 1,
                "frames": [{"sprite": f"Assets/Sprites/Enemies/{who}/S_{who}_{pose}.hbsprite.json", "duration": d} for pose, d in frames]}
        (ASSETS / f"Animations/SA_{who}_{name}.hbspriteanimation.json").write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(who, "배율", round(G, 3), "새 자세", len(made), "/", len(poses), "(나머지는 지금 공격 그림으로 대신)")
