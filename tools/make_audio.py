"""8비트 칩튠 효과음·배경음을 코드로 합성하고 엔진 오디오 에셋(.hbaudioasset.json)을 만든다.

실행: python tools/make_audio.py
결과: AuricLoop/Assets/Audio/*.wav, S_*.hbaudioasset.json  (파이썬 표준 라이브러리만 씀)
이름은 C++ TopDownShooter.h의 Sfx*/…Music 기본값과 같다. 다른 소리를 쓰려면 BP 기본값에서 경로만 바꾼다.
ponytail: 임시 소리. 기획서 11장 무료 BGM 모음집을 고르면 wav만 바꿔 끼운다.
"""
import json
import math
import random
import struct
import wave
from pathlib import Path

RATE = 22050
OUT = Path(__file__).resolve().parent.parent / "AuricLoop/Assets/Audio"
random.seed(7)  # 다시 만들어도 같은 소리


def square(f, t, duty=0.5):
    return 1.0 if (f * t) % 1.0 < duty else -1.0


def triangle(f, t):
    p = (f * t) % 1.0
    return 4 * p - 1 if p < 0.5 else 3 - 4 * p


def noise(_f, _t):
    return random.uniform(-1, 1)


def tone(length, wave_fn, f0, f1=None, vol=0.5, attack=0.005, decay=None, duty=0.5, vibrato=0.0):
    """f0→f1로 미끄러지는 한 음. decay가 있으면 지수 감쇠, 없으면 끝에서 짧게 줄어듦."""
    f1 = f0 if f1 is None else f1
    n = int(length * RATE)
    out, phase = [], 0.0
    for i in range(n):
        t = i / RATE
        k = i / max(1, n - 1)
        f = f0 + (f1 - f0) * k
        if vibrato:
            f *= 1 + vibrato * math.sin(2 * math.pi * 12 * t)
        phase += f / RATE
        s = wave_fn(1.0, phase, duty) if wave_fn is square else wave_fn(1.0, phase)
        env = min(1.0, t / attack) if attack else 1.0
        env *= math.exp(-t / decay) if decay else min(1.0, (length - t) / 0.01)
        out.append(s * env * vol)
    return out


def mix(*tracks):
    n = max(len(t) for t in tracks)
    return [sum(t[i] for t in tracks if i < len(t)) for i in range(n)]


def seq(*parts):
    out = []
    for p in parts:
        out += p
    return out


def save(name, samples, volume=1.0, loop=False):
    OUT.mkdir(parents=True, exist_ok=True)
    peak = max(1e-6, max(abs(s) for s in samples))
    scale = 0.9 / peak if peak > 0.9 else 1.0
    with wave.open(str(OUT / f"{name}.wav"), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(RATE)
        w.writeframes(b"".join(struct.pack("<h", int(max(-1, min(1, s * scale)) * 32767)) for s in samples))
    asset = {"version": 1, "name": f"S_{name}", "clip": f"Assets/Audio/{name}.wav", "volume": volume, "pitch": 1, "loop": loop,
             "spatial": False, "autoplay": False, "refDistance": 1, "maxDistance": 100, "rolloff": 1, "mixer": "", "bus": "master"}
    (OUT / f"S_{name}.hbaudioasset.json").write_text(json.dumps(asset, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return len(samples) / RATE


# ---- 효과음 ----
SFX = {
    "Slash": (mix(tone(0.12, noise, 0, vol=0.35, decay=0.04), tone(0.1, square, 900, 300, vol=0.25, duty=0.25, decay=0.05)), 0.6),
    "Arrow": (mix(tone(0.09, square, 500, 1400, vol=0.3, duty=0.125, decay=0.05), tone(0.06, noise, 0, vol=0.2, decay=0.02)), 0.6),
    "Bolt": (tone(0.1, square, 1500, 700, vol=0.25, duty=0.25, decay=0.05), 0.35),
    "Boom": (mix(tone(0.3, noise, 0, vol=0.5, decay=0.08), tone(0.25, square, 140, 60, vol=0.3, decay=0.08)), 0.5),
    "Hit": (tone(0.07, square, 240, 110, vol=0.35, duty=0.25, decay=0.03), 0.5),
    "Kill": (seq(tone(0.05, noise, 0, vol=0.4, decay=0.02), tone(0.05, noise, 0, vol=0.3, decay=0.02), tone(0.12, square, 330, 80, vol=0.3, decay=0.05)), 0.6),
    "Hurt": (tone(0.22, square, 320, 140, vol=0.4, duty=0.5, decay=0.1, vibrato=0.08), 0.7),
    "Coin": (seq(tone(0.06, square, 988, vol=0.3, duty=0.25), tone(0.14, square, 1319, vol=0.3, duty=0.25, decay=0.07)), 0.5),
    "Dodge": (tone(0.18, noise, 0, vol=0.3, attack=0.06, decay=0.06), 0.5),
    "DoorHit": (mix(tone(0.12, noise, 0, vol=0.4, decay=0.03), tone(0.12, triangle, 95, 70, vol=0.6, decay=0.05)), 0.7),
    "DoorOpen": (seq(*[tone(0.07, square, f, vol=0.3, duty=0.25) for f in (392, 523, 659, 784)]), 0.6),
    "Flash": (mix(tone(0.4, noise, 0, vol=0.35, decay=0.12), tone(0.35, square, 1800, 3000, vol=0.15, duty=0.125, decay=0.1)), 0.6),
    "Craft": (seq(*[tone(0.07, triangle, f, vol=0.5) for f in (523, 659, 784)], tone(0.18, triangle, 1047, vol=0.5, decay=0.1)), 0.6),
    "Gather": (seq(tone(0.06, triangle, 440, vol=0.5, decay=0.04), tone(0.1, triangle, 660, vol=0.5, decay=0.06)), 0.6),
    "Select": (tone(0.04, square, 880, vol=0.25, duty=0.25), 0.4),
    "Type": (tone(0.025, square, 620, vol=0.18, duty=0.125, decay=0.012), 0.25),
    "Swing": (tone(0.16, noise, 0, vol=0.32, attack=0.03, decay=0.05), 0.45),  # 적이 휘두르는 바람 소리
    "Crack": (mix(tone(0.07, noise, 0, vol=0.5, decay=0.015), tone(0.05, square, 900, 300, vol=0.25, duty=0.25, decay=0.02)), 0.55),  # 뼈가 부서지는 소리
    "Impact": (mix(tone(0.1, noise, 0, vol=0.45, decay=0.02), tone(0.14, square, 140, 60, vol=0.4, duty=0.5, decay=0.05)), 0.6),  # 묵직하게 맞음  # 대화 글자마다 (C++가 음높이를 조금씩 바꿈)
    "BossCharge": (tone(0.6, square, 70, 160, vol=0.4, duty=0.5, attack=0.1, vibrato=0.05), 0.7),
}

# ---- 배경음: 화음 진행 + 베이스 + 아르페지오 + 북 (반복 이음매가 맞게 마디 단위) ----
NOTE = {"C": 0, "C#": 1, "D": 2, "D#": 3, "E": 4, "F": 5, "F#": 6, "G": 7, "G#": 8, "A": 9, "A#": 10, "B": 11}


def hz(name, octave):
    return 440 * 2 ** ((NOTE[name] + 12 * (octave - 4) - 9) / 12)


def song(bpm, chords, lead, arp_duty=0.25, drums="kh", swing=1.0):
    """chords: 마디마다 (근음, 'm'|'') / lead: 마디마다 8분음표 8개 (음이름+옥타브 또는 '-')"""
    beat = 60 / bpm
    eighth = beat / 2
    bass, arp, mel, drum = [], [], [], []
    for bar, (root, quality) in enumerate(chords):
        third = 3 if quality == "m" else 4
        tones = [NOTE[root], NOTE[root] + third, NOTE[root] + 7, NOTE[root] + 12]
        for e in range(8):
            f_bass = 440 * 2 ** ((tones[0] + 12 * (2 - 4) - 9) / 12)
            bass += tone(eighth, triangle, f_bass if e % 2 == 0 else f_bass * 2, vol=0.45, attack=0.005)
            semis = tones[(e if e < 4 else 7 - e) % 4]
            arp += tone(eighth, square, 440 * 2 ** ((semis + 12 * (5 - 4) - 9) / 12), vol=0.08, duty=arp_duty, decay=eighth * 0.6)
            k = drums[e % len(drums)]
            if k == "k":
                drum += tone(eighth, triangle, 120, 40, vol=0.6, decay=0.05)
            elif k == "h":
                drum += tone(eighth, noise, 0, vol=0.12, decay=0.015)
            elif k == "s":
                drum += tone(eighth, noise, 0, vol=0.3, decay=0.06)
            else:
                drum += [0.0] * int(eighth * RATE)
        for e, n in enumerate(lead[bar % len(lead)]):
            if n == "-":
                mel += [0.0] * int(eighth * RATE)
            else:
                mel += tone(eighth, square, hz(n[:-1], int(n[-1])), vol=0.16, duty=0.5, decay=eighth * 1.2, vibrato=0.004)
    return mix(bass, arp, mel, drum)


BGM = {
    # 거점: 느긋한 C장조
    "BGM_Hub": (song(92, [("C", ""), ("A", "m"), ("F", ""), ("G", "")] * 2,
                     [["E5", "-", "G5", "-", "C6", "-", "B5", "A5"], ["A5", "-", "E5", "-", "C5", "-", "D5", "E5"],
                      ["F5", "-", "A5", "-", "C6", "-", "A5", "F5"], ["G5", "-", "B5", "-", "D6", "-", "-", "-"]], drums="k-h-k-h-"), 0.35),
    # 던전: A단조, 조금 빠르게
    "BGM_Dungeon": (song(118, [("A", "m"), ("F", ""), ("G", ""), ("E", "m")] * 4,
                         [["A4", "-", "C5", "E5", "-", "D5", "C5", "B4"], ["A4", "-", "F4", "A4", "C5", "-", "-", "-"],
                          ["B4", "-", "D5", "G5", "-", "F5", "E5", "D5"], ["E5", "-", "B4", "-", "G#4", "-", "-", "-"]], drums="khskkhsh"), 0.3),
    # 보스: E단조, 빠르고 강하게
    "BGM_Boss": (song(150, [("E", "m"), ("C", ""), ("D", ""), ("B", "m")] * 4,
                      [["E5", "E5", "G5", "E5", "B5", "A5", "G5", "F#5"], ["E5", "-", "C5", "E5", "G5", "-", "E5", "-"],
                       ["F#5", "F#5", "A5", "F#5", "D6", "C6", "A5", "F#5"], ["B5", "-", "F#5", "-", "D5", "-", "B4", "-"]], arp_duty=0.125, drums="kskskkss"), 0.32),
    # 귀환: D단조, 쫓기는 느낌
    "BGM_Return": (song(140, [("D", "m"), ("A#", ""), ("C", ""), ("A", "")] * 4,
                        [["D5", "-", "F5", "-", "A5", "G5", "F5", "E5"], ["D5", "-", "A#4", "-", "D5", "F5", "-", "-"],
                         ["C5", "-", "E5", "-", "G5", "F5", "E5", "D5"], ["C#5", "-", "E5", "-", "A5", "-", "-", "-"]], arp_duty=0.125, drums="khkskhks"), 0.32),
}

if __name__ == "__main__":
    for name, (samples, volume) in SFX.items():
        save(name, samples, volume)
    for name, (samples, volume) in BGM.items():
        print(name, f"{save(name, samples, volume, loop=True):.1f}s")
    print("효과음", len(SFX), "배경음", len(BGM), "→", OUT)
