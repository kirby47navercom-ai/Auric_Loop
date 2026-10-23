"""게임 효과음·배경음악을 HBmusic(git/HBmusic, Stable Audio 3 로컬 생성기)으로 만든 소리로 넣는다.

1) HBmusic에서 아래 프롬프트로 생성해 WAV 저장 (효과음 모드 / BGM은 루프 켜고 60초). 파일 이름은 SOUNDS의 원본 이름
2) python tools/import_hbmusic.py <WAV 폴더> [ffmpeg 경로]
  효과음: 앞 무음을 자르고, 꼬리가 -45dB 아래로 내려가면 80ms 페이드로 끊고, 모노 44.1kHz 16비트·최고 -3dB → <이름>.wav
  배경음악: HBmusic이 이어 붙인 루프 그대로 모노 OGG(Vorbis q4) → BGM_<이름>.ogg (WAV면 곡당 10MB라 APK·폴더가 커짐.
    휴대폰은 엔진이 소리를 전부 풀어 메모리에 들고 있어서(PCM 캐시 32MB) 스테레오 60초면 곡당 21MB → 모노로 절반)
결과: AuricLoop/Assets/Audio/ + S_<이름>.hbaudioasset.json (볼륨은 기존 에셋 값 유지, 새 소리는 표의 값)
BP_AuricRules.Sounds는 tools/make_blueprints.py가 에셋에서 읽음
"""
import json
import subprocess
import sys
import wave
from pathlib import Path

import numpy as np

OUT = Path(__file__).resolve().parent.parent / "AuricLoop/Assets/Audio"
RATE = 44100
# 게임 이름: (HBmusic 원본 이름, 길이 초, 새 소리 볼륨, 프롬프트)
SFX = {
    "Slash": ("slash", 1, 0.5, "Quick sharp sword slash whoosh with a metallic ring, fantasy action game, short"),
    "Arrow": ("arrow", 1, 0.5, "Bow string release twang with an arrow whooshing away, short"),
    "Bolt": ("bolt", 1, 0.32, "Small magic bolt cast, sparkly arcane zap, short and bright"),
    "Boom": ("boom", 2, 0.5, "Small magic explosion burst, punchy fiery blast with crackle, short"),
    "Hit": ("hit", 1, 0.5, "Sword hitting bone, punchy impact with crunchy crack, fighting game hit"),
    "Kill": ("kill", 1, 0.5, "Skeleton shattering into pieces, bones breaking and scattering on stone, short"),
    "Hurt": ("hurt", 1, 0.55, "Heavy body blow, deep punchy thud of a character taking damage, no voice"),
    "Coin": ("coin", 1, 0.32, "Single gold coin pickup chime, bright metallic ding, game sound"),
    "Dodge": ("dodge", 1, 0.42, "Quick dash whoosh, fast air swipe, short"),
    "DoorHit": ("doorhit", 1, 0.55, "Weapon striking a heavy wooden dungeon door, thick wooden thud with rattle"),
    "DoorOpen": ("dooropen", 2, 0.5, "Heavy stone dungeon gate grinding open, deep rumble"),
    "Flash": ("flash", 2, 0.45, "Flashbang grenade blast, loud sharp bang followed by high pitched ringing"),
    "Craft": ("craft", 2, 0.42, "Crafting at an anvil, a few hammer clinks then a magical sparkle"),
    "Gather": ("gather", 1, 0.42, "Picking herbs from the ground, leafy rustle and a soft pluck"),
    "Select": ("select", 1, 0.28, "Game menu select, short soft wooden click"),
    "BossCharge": ("bosscharge", 2, 0.55, "Dark energy charging up, rising ominous whoosh, monster preparing a big attack"),
    "Step": ("step", 1, 0.16, "Single footstep on a stone floor, soft leather boot"),
    "Shot": ("shot", 1, 0.24, "Enemy dark magic orb fired, short whoosh with a low hum"),
    "Spawn": ("spawn", 2, 0.34, "Dark magic portal summoning monsters, swirling whoosh with a deep thrum"),
    "Lock": ("lock", 1, 0.5, "Heavy iron bars slamming shut, dungeon gate clang"),
    "Clear": ("clear", 2, 0.38, "Short triumphant bright chime arpeggio, fantasy game success jingle"),
    "Charge": ("charge", 1, 0.3, "Magical energy charging, short rising hum with sparkles"),
    "Open": ("open", 1, 0.3, "Opening a leather bag, soft cloth rustle and a buckle click"),
    "Pickup": ("pickup", 1, 0.3, "Picking up an item, bright short sparkle pop"),
    "Type": ("type", 1, 0.2, "Single tiny soft typewriter key tick"),
    "Swing": ("swing", 1, 0.4, "Heavy weapon swing whoosh, short"),
    "Impact": ("impact", 1, 0.55, "Heavy punch impact thump with small debris, short"),
    "Crack": ("crack", 1, 0.42, "Bone cracking snap, crunchy and short"),
    "BossSlam": ("boss_slam", 2, 0.75, "Huge heavy greatsword smashing into stone ground, deep booming impact, rocks and debris cracking, dark fantasy boss attack, punchy and close"),
    "BossSwing": ("boss_swing", 1, 0.6, "Massive heavy greatsword swing whoosh, thick air cut, dark fantasy boss melee attack, short and punchy"),
    "BossDash": ("boss_dash", 2, 0.55, "Heavy armored warrior charging forward fast, rushing whoosh with metal armor rattle and stomping footsteps"),
    "BossRoar": ("boss_roar", 3, 0.7, "Undead skeleton king furious roar, deep monstrous growl with rattling bones and echo in a stone dungeon"),
    "BossQuake": ("boss_wave", 2, 0.7, "Ground shockwave of rocks bursting out of the earth in a line, rumbling crack and stone debris, powerful"),
    "CoinRain": ("coin_rain", 2, 0.6, "Heavy pile of gold coins falling from above and crashing on stone floor, metallic jingling impact"),
    "KillImpact": ("kill_impact", 1, 0.7, "Anime style impact hit, extremely sharp punchy crack with deep bass thump and short glassy shatter, fighting game finishing hit"),
    "Finisher": ("finisher", 3, 0.8, "Cinematic slow motion finishing blow, huge deep boom impact with reverse whoosh before it and long dark reverb tail"),
}
BGM = {  # HBmusic BGM 모드, 루프 켬, 60초
    "Title": ("bgm_title", 0.3, "Majestic mysterious fantasy title screen theme, shimmering golden harp and celesta arpeggios, warm strings and soft choir, slow tempo, hopeful yet ominous, treasure dungeon adventure"),
    "Hub": ("bgm_hub", 0.32, "Cozy melancholic fantasy village theme, acoustic guitar, flute and light strings, gentle, medium tempo, warm"),
    "Dungeon": ("bgm_dungeon", 0.3, "Dark fantasy dungeon exploration music, tense low strings, pulsing percussion, mysterious, medium tempo"),
    "Boss": ("bgm_boss", 0.28, "Epic dark fantasy boss battle music, heavy drums, aggressive low brass and choir, fast tempo, intense"),
    "Return": ("bgm_return", 0.28, "Urgent escape music, fast tempo, driving percussion and staccato strings, tense chase out of a collapsing golden dungeon"),
}


def read(path):
    with wave.open(str(path)) as w:
        rate, ch, width = w.getframerate(), w.getnchannels(), w.getsampwidth()
        data = np.frombuffer(w.readframes(w.getnframes()), {2: "<i2", 4: "<i4"}[width]).astype(float) / (2 ** (8 * width - 1))
    assert rate == RATE, (path, rate)
    return data.reshape(-1, ch).mean(1)


def tidy(x):
    level = 20 * np.log10(np.abs(x) + 1e-9)
    start = max(0, int(np.argmax(level > -30)) - int(0.005 * RATE))
    x = x[start:]
    win = int(0.02 * RATE)
    rms = np.array([np.sqrt(np.mean(x[i:i + win] ** 2)) for i in range(0, len(x), win)])
    loud = np.nonzero(20 * np.log10(rms + 1e-9) > -45)[0]
    end = min(len(x), (loud[-1] + 1) * win + int(0.08 * RATE)) if len(loud) else len(x)
    x = x[:end].copy()
    fade = min(len(x), int(0.08 * RATE))
    x[-fade:] *= np.linspace(1, 0, fade)
    return x / max(1e-6, np.abs(x).max()) * 0.7


def asset(name, clip, volume, loop):
    path = OUT / f"S_{name}.hbaudioasset.json"
    if path.exists():
        volume = json.loads(path.read_text(encoding="utf-8")).get("volume", volume)  # 이미 맞춰 둔 볼륨은 유지
    data = {"version": 1, "name": f"S_{name}", "clip": clip, "volume": volume, "pitch": 1, "loop": loop,
            "spatial": False, "autoplay": False, "refDistance": 1, "maxDistance": 100, "rolloff": 1, "mixer": "", "bus": "master"}
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def main():
    src = Path(sys.argv[1])
    ffmpeg = sys.argv[2] if len(sys.argv) > 2 else "ffmpeg"
    for name, (raw, _, volume, _) in SFX.items():
        x = tidy(read(src / f"{raw}.wav"))
        with wave.open(str(OUT / f"{name}.wav"), "wb") as w:
            w.setnchannels(1); w.setsampwidth(2); w.setframerate(RATE)
            w.writeframes((np.clip(x, -1, 1) * 32767).astype("<i2").tobytes())
        asset(name, f"Assets/Audio/{name}.wav", volume, False)
        print(name, f"{len(x) / RATE:.2f}s")
    for name, (raw, volume, _) in BGM.items():
        out = OUT / f"BGM_{name}.ogg"
        subprocess.run([ffmpeg, "-v", "error", "-y", "-i", str(src / f"{raw}.wav"), "-ac", "1", "-c:a", "libvorbis", "-q:a", "4", str(out)], check=True)
        (OUT / f"BGM_{name}.wav").unlink(missing_ok=True)
        asset(f"BGM_{name}", f"Assets/Audio/BGM_{name}.ogg", volume, True)
        print("BGM", name, f"{out.stat().st_size // 1024}KB")


main()
