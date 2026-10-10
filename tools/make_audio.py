"""효과음·배경음을 코드로 합성하고 엔진 오디오 에셋(.hbaudioasset.json)을 만든다.

실행: python tools/make_audio.py
결과: AuricLoop/Assets/Audio/*.wav, S_*.hbaudioasset.json
예전 8비트 사각파는 귀가 아파서(높은 배음·딱딱한 시작) 부드럽게 다시 만듦: 44.1kHz, 사인·걸러 낸 잡음·뜯는 현(Karplus-Strong),
천천히 시작해 자연스럽게 줄어드는 소리, 높은 소리를 깎는 필터와 가벼운 잔향, 전체 크기도 낮춤.
이름은 C++ TopDownShooter.h·tools/make_blueprints.py SOUNDS와 같다.
"""
import json
import wave
from pathlib import Path

import numpy as np
from scipy.signal import butter, lfilter

RATE = 44100
OUT = Path(__file__).resolve().parent.parent / "AuricLoop/Assets/Audio"
rng = np.random.default_rng(7)  # 다시 만들어도 같은 소리


def T(sec):
    return np.arange(int(sec * RATE)) / RATE


def N(sec):
    return int(sec * RATE)


def env(n, attack=0.005, decay=0.2, hold=0.0):
    """부드럽게 올라가 지수로 줄어드는 모양 (끝 10ms는 0으로 모아 딸깍 소리 없게)"""
    t = np.arange(n) / RATE
    e = np.minimum(1, t / max(attack, 1e-4)) * np.exp(-np.maximum(0, t - attack - hold) / max(decay, 1e-4))
    tail = min(n, int(0.01 * RATE))
    e[n - tail:] *= np.linspace(1, 0, tail)
    return e


def sine(f, sec):
    """f: 숫자 또는 시간마다 바뀌는 배열 (미끄러지는 음)"""
    n = N(sec)
    f = np.broadcast_to(np.asarray(f, float), (n,)) if np.ndim(f) == 0 else np.asarray(f, float)[:n]
    return np.sin(2 * np.pi * np.cumsum(f) / RATE)


def saw(f, sec):
    return 2 * ((T(sec) * f) % 1) - 1


def glide(f0, f1, sec, curve=1.0):
    k = np.linspace(0, 1, N(sec)) ** curve
    return f0 * (f1 / f0) ** k


def noise(sec):
    return rng.uniform(-1, 1, N(sec))


def lp(x, hz, order=2):
    b, a = butter(order, min(hz, RATE / 2 - 100) / (RATE / 2))
    return lfilter(b, a, x)


def hp(x, hz, order=2):
    b, a = butter(order, hz / (RATE / 2), "high")
    return lfilter(b, a, x)


def bp(x, lo, hi, order=2):
    b, a = butter(order, [lo / (RATE / 2), min(hi, RATE / 2 - 100) / (RATE / 2)], "band")
    return lfilter(b, a, x)


def pluck(f, sec, bright=0.5):
    """뜯는 현 (Karplus-Strong): 하프·기타 같은 부드러운 음"""
    n, period = N(sec), max(2, int(RATE / f))
    buf = list(lp(rng.uniform(-1, 1, period), 1500 + 5000 * bright))
    out = np.zeros(n)
    for i in range(n):
        j = i % period
        out[i] = buf[j]
        buf[j] = 0.996 * 0.5 * (buf[j] + buf[(j + 1) % period])
    return out * env(n, 0.002, sec * 0.6)


def reverb(x, wet=0.25, room=0.8):
    """간단한 잔향: 서로 다른 길이의 되먹임 지연 넷을 섞음 (꼬리 1.2초 붙음)"""
    y = np.concatenate([x, np.zeros(int(RATE * 1.2))])
    out = y * (1 - wet)
    for ms, g in ((29.7, room), (37.1, room * 0.97), (41.1, room * 0.95), (43.7, room * 0.93)):
        d = int(RATE * ms / 1000)
        a = np.zeros(d + 1); a[0] = 1; a[d] = -g
        out += lp(lfilter([1], a, y), 4500, 1) * wet / 4
    return out


def mix(*tracks):
    out = np.zeros(max(len(t) for t in tracks))
    for t in tracks:
        out[:len(t)] += t
    return out


def delay(x, sec):
    return np.concatenate([np.zeros(N(sec)), x])


def save(name, samples, volume=1.0, loop=False):
    OUT.mkdir(parents=True, exist_ok=True)
    x = np.asarray(samples, float)
    x = x / max(1e-6, np.abs(x).max()) * 0.7  # 최고 -3dB
    with wave.open(str(OUT / f"{name}.wav"), "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(RATE)
        w.writeframes((np.clip(x, -1, 1) * 32767).astype("<i2").tobytes())
    asset = {"version": 1, "name": f"S_{name}", "clip": f"Assets/Audio/{name}.wav", "volume": volume, "pitch": 1, "loop": loop,
             "spatial": False, "autoplay": False, "refDistance": 1, "maxDistance": 100, "rolloff": 1, "mixer": "", "bus": "master"}
    (OUT / f"S_{name}.hbaudioasset.json").write_text(json.dumps(asset, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return len(x) / RATE


def whoosh(sec, lo, hi, attack=0.04):
    """바람 가르는 소리: 대역을 훑는 잡음 (조각마다 가운데 주파수를 옮김)"""
    n = noise(sec + 0.05)
    f = glide(lo, hi, sec)
    out = np.zeros(N(sec))
    step = 441
    for i in range(0, len(out), step):
        c = f[min(i, len(f) - 1)]
        seg = bp(n[max(0, i - 1764):i + step], c * 0.6, c * 1.6)
        out[i:i + step] = seg[-len(out[i:i + step]):]
    return out * env(len(out), attack, sec * 0.35)


def thump(f0=120, f1=45, sec=0.25, decay=0.08):
    return sine(glide(f0, f1, sec, 0.5), sec) * env(N(sec), 0.002, decay)


def bell(freqs, sec=0.6, decay=0.25):
    """종소리: 기음 + 어긋난 배음 둘, 높은 배음은 빨리 사라짐"""
    out = np.zeros(N(sec))
    for f in freqs:
        for h, g, dk in ((1, 1, 1), (2.76, 0.25, 0.5), (5.4, 0.08, 0.3)):
            out += g * sine(f * h, sec) * env(len(out), 0.003, decay * dk)
    return out


def burst(sec, lo, hi, decay):
    return bp(noise(sec), lo, hi) * env(N(sec), 0.001, decay)


# ---- 효과음 (크기는 hbaudioasset volume) ----
def sfx():
    d = {}
    d["Slash"] = (mix(whoosh(0.22, 700, 2600, 0.01), burst(0.05, 3000, 9000, 0.012) * 0.25), 0.5)
    d["Swing"] = (whoosh(0.28, 300, 1400, 0.05), 0.4)
    d["Arrow"] = (mix(pluck(196, 0.35, 0.3) * 0.8, whoosh(0.16, 1500, 3500, 0.005) * 0.4), 0.5)
    d["Bolt"] = (mix(sine(glide(1200, 500, 0.18), 0.18) * env(N(0.18), 0.004, 0.06) * 0.5, lp(noise(0.18), 3000) * env(N(0.18), 0.002, 0.04) * 0.3), 0.32)
    d["Hit"] = (mix(thump(160, 70, 0.14, 0.04), lp(noise(0.06), 2500) * env(N(0.06), 0.001, 0.015) * 0.6), 0.5)
    d["Impact"] = (mix(thump(110, 40, 0.3, 0.09) * 1.2, lp(noise(0.12), 1200) * env(N(0.12), 0.001, 0.035)), 0.55)
    d["Crack"] = (mix(burst(0.09, 1200, 4500, 0.02), thump(300, 150, 0.06, 0.02) * 0.4), 0.42)
    d["Kill"] = (mix(thump(130, 50, 0.3, 0.08), burst(0.16, 600, 3000, 0.05) * 0.7), 0.5)
    d["Hurt"] = (mix(thump(180, 90, 0.25, 0.08), sine(glide(420, 260, 0.25), 0.25) * env(N(0.25), 0.005, 0.08) * 0.35), 0.55)
    d["Boom"] = (reverb(mix(thump(90, 32, 0.8, 0.25) * 1.3, lp(noise(0.7), 700) * env(N(0.7), 0.004, 0.2)), 0.2), 0.5)
    d["Coin"] = (mix(bell([1318.5], 0.35, 0.12), delay(bell([1760], 0.4, 0.14), 0.06)), 0.32)
    d["Dodge"] = (whoosh(0.22, 500, 2000, 0.02), 0.42)
    d["DoorHit"] = (mix(thump(100, 60, 0.25, 0.07) * 1.1, burst(0.12, 300, 1500, 0.03)), 0.55)
    d["DoorOpen"] = (reverb(mix(thump(70, 45, 0.5, 0.2), lp(noise(0.9), 600) * env(N(0.9), 0.2, 0.3) * 0.5,
                                delay(bell([392, 523.25], 0.9, 0.35) * 0.5, 0.15)), 0.25), 0.5)
    d["Flash"] = (reverb(mix(hp(noise(0.5), 2500) * env(N(0.5), 0.002, 0.15) * 0.8, bell([2093], 0.6, 0.2) * 0.35), 0.2), 0.45)
    d["Craft"] = (reverb(mix(*[delay(bell([f], 0.6, 0.2), i * 0.08) for i, f in enumerate((523.25, 659.26, 783.99, 1046.5))]), 0.2), 0.42)
    d["Gather"] = (mix(burst(0.2, 1500, 5000, 0.06) * 0.6, delay(bell([880], 0.3, 0.1) * 0.5, 0.05)), 0.42)
    d["Select"] = (sine(988, 0.08) * env(N(0.08), 0.002, 0.025), 0.28)
    d["Type"] = (mix(lp(noise(0.03), 3000) * env(N(0.03), 0.001, 0.006) * 0.6, sine(700, 0.03) * env(N(0.03), 0.001, 0.008) * 0.3), 0.2)
    d["BossCharge"] = (reverb(mix(sine(glide(60, 140, 0.8, 2), 0.8) * env(N(0.8), 0.3, 0.4) * 0.8, lp(noise(0.8), 800) * env(N(0.8), 0.5, 0.2) * 0.4), 0.25), 0.55)
    return d


# ---- 배경음 ----
NOTE = {"C": 0, "C#": 1, "D": 2, "D#": 3, "E": 4, "F": 5, "F#": 6, "G": 7, "G#": 8, "A": 9, "A#": 10, "B": 11}


def midi(name, octave):
    return 440 * 2 ** ((NOTE[name] + 12 * (octave - 4) - 9) / 12)


def chord(root, quality, octave=3):
    third = 3 if quality == "m" else 4
    return [440 * 2 ** ((NOTE[root] + s + 12 * (octave - 4) - 9) / 12) for s in (0, third, 7)]


def epiano(f, sec, vol=0.3):
    """부드러운 전자 피아노: 기음 + 약한 2배음, 천천히 줄어듦"""
    n = N(sec)
    return (sine(f, sec) + 0.25 * sine(f * 2.001, sec) * env(n, 0.002, 0.3)) * env(n, 0.004, sec * 0.5) * vol


def soft_pad(freqs, sec, vol=0.12, cutoff=1400):
    """현악 패드: 살짝 어긋난 톱니 둘을 크게 걸러 둥글게"""
    x = np.zeros(N(sec))
    for f in freqs:
        for det in (0.997, 1.003):
            x += saw(f * det, sec)
    return lp(x, cutoff, 2) * env(len(x), sec * 0.35, sec * 2, hold=sec * 0.3) * vol


def flute(f, sec, vol=0.18):
    t = T(sec)
    vib = f * (1 + 0.004 * np.sin(2 * np.pi * 5 * t) * np.minimum(1, t / 0.25))
    return (sine(vib, sec) + 0.15 * sine(vib * 2, sec) + lp(noise(sec), 2500) * 0.04) * env(len(t), 0.06, sec * 0.8, hold=sec * 0.3) * vol


def kick(vol=0.5):
    return thump(110, 45, 0.3, 0.09) * vol


def snare(vol=0.25):
    return mix(burst(0.2, 900, 5000, 0.05), thump(200, 160, 0.1, 0.03) * 0.4) * vol


def hat(vol=0.06):
    return hp(noise(0.05), 7000) * env(N(0.05), 0.001, 0.012) * vol


def place(track, sound, at):
    i = int(at * RATE)
    end = min(len(track), i + len(sound))
    track[i:end] += sound[:end - i]


def song(bpm, chords, melody, style):
    """chords: 마디마다 (근음, 'm'|''), melody: 마디마다 8분음 8개 ('-'는 쉼). 마디 수 길이로 끝나고 잔향 꼬리를 앞에 겹쳐 반복 이음매가 맞음"""
    beat = 60 / bpm
    bar = beat * 4
    total = bar * len(chords)
    size = int((total + 3) * RATE)
    bass, keys, pads, lead, drum = (np.zeros(size) for _ in range(5))
    for b, (root, q) in enumerate(chords):
        t0 = b * bar
        place(pads, soft_pad(chord(root, q, 3), bar + 0.4, 0.10 if style != "boss" else 0.07, 1100 if style == "dungeon" else 1600), t0)
        bf = chord(root, q, 2)[0]
        if style == "boss":
            for e in range(8):
                f = bf * (2 if e % 4 == 3 else 1)
                place(bass, lp(sine(f, beat / 2) + saw(f, beat / 2) * 0.3, 900) * env(N(beat / 2), 0.004, beat * 0.25) * 0.5, t0 + e * beat / 2)
        elif style == "return":
            for e in range(8):
                place(bass, sine(bf, beat / 2) * env(N(beat / 2), 0.004, beat * 0.2) * 0.55, t0 + e * beat / 2)
        else:
            for e in (0, 2.5):
                place(bass, sine(bf, beat * 1.5) * env(N(beat * 1.5), 0.01, beat) * 0.55, t0 + e * beat)
        if style == "hub":  # 전자 피아노 화음 (엇박 섞어)
            for e in (0, 1.5, 2, 3.5):
                for f in chord(root, q, 4):
                    place(keys, epiano(f, beat * 1.4, 0.1), t0 + e * beat)
        else:  # 뜯는 하프 아르페지오
            arp = chord(root, q, 4) + [chord(root, q, 5)[0]]
            for e in range(8):
                place(keys, pluck(arp[(e if e < 4 else 7 - e) % 4], beat * 1.2, 0.35 if style == "dungeon" else 0.5) * 0.22, t0 + e * beat / 2)
        line = melody[b % len(melody)]
        for e, n in enumerate(line):
            if n == "-":
                continue
            ln = 1
            while e + ln < 8 and line[e + ln] == "-" and ln < 3:
                ln += 1
            f, sec = midi(n[:-1], int(n[-1])), beat / 2 * ln
            snd = flute(f, sec + 0.1, 0.16) if style in ("hub", "dungeon") else lp(saw(f, sec), 1800) * env(N(sec), 0.02, sec * 0.8) * 0.12
            place(lead, snd, t0 + e * beat / 2)
        for e, c in enumerate({"hub": "k-h-s-h-", "dungeon": "k---h---", "boss": "khskkhsh", "return": "khshkhsh"}[style]):
            at = t0 + e * beat / 2
            if c == "k":
                place(drum, kick(0.45 if style != "dungeon" else 0.3), at)
            elif c == "s":
                place(drum, snare(0.18 if style == "hub" else 0.25), at)
            elif c == "h":
                place(drum, hat(0.05), at)
    x = reverb(bass + keys + pads + lead * 0.9 + drum, 0.22 if style != "boss" else 0.15)
    loop = int(total * RATE)
    x[:len(x) - loop] += x[loop:]  # 잔향 꼬리를 앞에 겹쳐 반복 이음매가 자연스럽게
    return lp(x[:loop], 9000, 1)


BGM = {
    # 거점: 느긋한 C장조 (전자 피아노·플루트)
    "BGM_Hub": (lambda: song(84, [("C", ""), ("A", "m"), ("F", ""), ("G", "")] * 2,
                               [["E5", "-", "G5", "-", "C6", "-", "B5", "A5"], ["A5", "-", "-", "-", "E5", "-", "D5", "C5"],
                                ["F5", "-", "A5", "-", "C6", "-", "A5", "-"], ["G5", "-", "-", "-", "D5", "-", "-", "-"]], "hub"), 0.32),
    # 던전: 어두운 A단조 (현악 패드·하프, 북은 드물게)
    "BGM_Dungeon": (lambda: song(76, [("A", "m"), ("F", ""), ("G", ""), ("E", "m")] * 2,
                                   [["A4", "-", "-", "-", "C5", "-", "E5", "-"], ["F5", "-", "-", "-", "E5", "-", "C5", "-"],
                                    ["D5", "-", "-", "-", "B4", "-", "G4", "-"], ["E5", "-", "-", "-", "-", "-", "-", "-"]], "dungeon"), 0.3),
    # 보스: E단조, 몰아치는 베이스·북
    "BGM_Boss": (lambda: song(132, [("E", "m"), ("C", ""), ("D", ""), ("B", "m")] * 2,
                                [["E5", "-", "G5", "-", "B5", "-", "A5", "G5"], ["E5", "-", "-", "-", "C5", "-", "E5", "-"],
                                 ["F#5", "-", "A5", "-", "D6", "-", "C6", "A5"], ["B5", "-", "-", "-", "F#5", "-", "-", "-"]], "boss"), 0.28),
    # 귀환: D단조, 쫓기는 느낌
    "BGM_Return": (lambda: song(120, [("D", "m"), ("A#", ""), ("C", ""), ("A", "")] * 2,
                                  [["D5", "-", "F5", "-", "A5", "-", "G5", "F5"], ["D5", "-", "-", "-", "F5", "-", "-", "-"],
                                   ["C5", "-", "E5", "-", "G5", "-", "F5", "E5"], ["C#5", "-", "-", "-", "A4", "-", "-", "-"]], "return"), 0.28),
}

if __name__ == "__main__":
    for name, (samples, volume) in sfx().items():
        save(name, samples, volume)
    for name, (make, volume) in BGM.items():
        print(name, f"{save(name, make(), volume, loop=True):.1f}s")
    print("효과음·배경음 →", OUT)
