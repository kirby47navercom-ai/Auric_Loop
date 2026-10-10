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
# 순수 사인·미끄러지는 음(삐·뿅)은 기계음처럼 들려서 뺌: 걸러 낸 잡음 + 물체 공명(나무·돌·쇠의 어긋난 배음) + 작은 방 울림으로
def res(x, f, q=8):
    """좁은 대역 공명: 두드린 물체가 울리는 소리"""
    return bp(x, f * (1 - 0.5 / q), f * (1 + 0.5 / q), 2)


def thud(sec=0.18, cut=320, body=95, decay=0.04):
    """둔탁한 부딪힘: 낮게 거른 잡음 + 몸통 공명 (음높이 미끄럼 없음)"""
    n = noise(sec) * env(N(sec), 0.001, decay)
    return mix(lp(n, cut, 2) * 1.4, res(n, body, 5) * 3)


def modal(freqs, sec=0.6, decay=0.25, strike=0.25, spread=0.004):
    """두드린 쇠·유리: 어긋난 배음마다 조금씩 다른 높이·감쇠 + 때리는 순간 잡음"""
    out = np.zeros(N(sec))
    for i, f in enumerate(freqs):
        f *= 1 + rng.uniform(-spread, spread)
        out += sine(f, sec) * env(N(sec), 0.0015, decay / (1 + 0.6 * i)) / (1 + 0.7 * i)
    return mix(out, hp(noise(0.02), 2500) * env(N(0.02), 0.0005, 0.004) * strike)


def grains(sec, count, lo, hi, dec=0.004, start=0.0):
    """자잘한 알갱이 소리 (뼈 부서짐·자갈·나뭇잎): 흩어진 짧은 잡음 조각"""
    out = np.zeros(N(sec))
    for _ in range(count):
        at = N(start + rng.uniform(0, sec - start - 0.03))
        g = bp(noise(0.03), lo, hi) * env(N(0.03), 0.0005, dec) * rng.uniform(0.3, 1)
        out[at:at + len(g)] += g[:len(out) - at]
    return out


def room(x, wet=0.12):
    """작은 돌방 울림: 소리가 허공이 아니라 던전 안에서 나는 느낌"""
    return reverb(x, wet, 0.55)[:len(x) + N(0.35)]


def sfx():
    d = {}
    METAL = [1, 2.76, 5.40, 8.93]
    d["Slash"] = (room(mix(whoosh(0.22, 700, 2600, 0.01), modal([2400 * m for m in METAL[:3]], 0.25, 0.06, 0.4) * 0.12)), 0.5)
    d["Swing"] = (room(whoosh(0.28, 300, 1400, 0.05)), 0.4)
    d["Arrow"] = (room(mix(pluck(196, 0.3, 0.3) * 0.7, whoosh(0.16, 1500, 3500, 0.005) * 0.5)), 0.5)
    d["Bolt"] = (room(mix(whoosh(0.16, 900, 2600, 0.004) * 0.8, thud(0.08, 600, 180, 0.015) * 0.4)), 0.32)
    d["Hit"] = (room(mix(thud(0.14, 500, 160, 0.03), grains(0.06, 3, 1500, 4000, 0.003) * 0.5)), 0.5)
    d["Impact"] = (room(thud(0.3, 260, 80, 0.07) * 1.2), 0.55)
    d["Crack"] = (room(mix(grains(0.08, 6, 1200, 4500, 0.004), thud(0.05, 900, 300, 0.01) * 0.4)), 0.42)
    d["Kill"] = (room(mix(thud(0.25, 300, 110, 0.06), grains(0.4, 18, 900, 3500, 0.006, 0.03) * 0.8)), 0.5)
    d["Hurt"] = (room(mix(thud(0.2, 400, 140, 0.05), bp(noise(0.18), 500, 1600) * env(N(0.18), 0.01, 0.06) * 0.5)), 0.55)
    d["Boom"] = (reverb(mix(thud(0.8, 180, 55, 0.22) * 1.4, lp(noise(0.9), 600) * env(N(0.9), 0.004, 0.25) * 0.8,
                            grains(0.6, 14, 800, 3000, 0.008, 0.05) * 0.3), 0.2), 0.5)
    d["Coin"] = (room(mix(modal([2350 * m for m in (1, 2.32, 4.25, 6.63)], 0.4, 0.12, 0.3),
                          delay(modal([2780 * m for m in (1, 2.32, 4.25)], 0.35, 0.1, 0.25) * 0.6, 0.055))), 0.32)
    d["Dodge"] = (room(mix(whoosh(0.2, 500, 2000, 0.02), bp(noise(0.12), 300, 1200) * env(N(0.12), 0.01, 0.03) * 0.4)), 0.42)
    d["DoorHit"] = (room(mix(thud(0.25, 300, 100, 0.06) * 1.1, modal([180, 413, 760], 0.3, 0.06, 0.2) * 0.35)), 0.55)
    creak = lp(noise(0.9), 500) * env(N(0.9), 0.15, 0.35) * (0.6 + 0.4 * np.sin(2 * np.pi * 7 * T(0.9)))
    d["DoorOpen"] = (reverb(mix(thud(0.4, 220, 70, 0.12), creak * 0.7, delay(modal([220 * m for m in METAL], 0.9, 0.3, 0.2) * 0.25, 0.08)), 0.25), 0.5)
    d["Flash"] = (reverb(mix(thud(0.2, 900, 200, 0.03) * 0.8, bp(noise(0.5), 1200, 4500) * env(N(0.5), 0.002, 0.1) * 0.6), 0.2), 0.45)
    d["Craft"] = (reverb(mix(*[delay(modal([f, f * 2.76], 0.6, 0.2, 0.15), i * 0.08) for i, f in enumerate((523.25, 659.26, 783.99, 1046.5))]), 0.2), 0.42)
    leaves = bp(noise(0.3), 1500, 5000) * env(N(0.3), 0.01, 0.08) * (0.5 + 0.5 * rng.uniform(0, 1, N(0.3)) ** 3)
    d["Gather"] = (room(mix(leaves * 0.7, grains(0.25, 8, 2000, 6000, 0.003) * 0.6)), 0.42)
    d["Select"] = (mix(bp(noise(0.02), 2000, 5000) * env(N(0.02), 0.0005, 0.003) * 0.6, modal([1250, 3100], 0.05, 0.012, 0) * 0.5), 0.28)
    d["Type"] = (mix(bp(noise(0.02), 1800, 4500) * env(N(0.02), 0.0005, 0.0025) * 0.7, modal([900], 0.03, 0.006, 0) * 0.3), 0.2)
    rumble = lp(noise(0.9), 220) * np.linspace(0.2, 1, N(0.9)) * env(N(0.9), 0.4, 0.3)
    d["BossCharge"] = (reverb(mix(rumble * 1.4, grains(0.9, 10, 500, 2000, 0.01, 0.2) * 0.3), 0.25), 0.55)
    # 걸음·적 탄·소환·문 잠김·방 클리어·눈알 충전·창 열기·소재 줍기
    d["Step"] = (room(mix(thud(0.07, 900, 110, 0.012) * 0.7, grains(0.05, 3, 2500, 6000, 0.002) * 0.25), 0.08), 0.16)
    d["Shot"] = (room(mix(whoosh(0.14, 400, 1300, 0.006), thud(0.06, 700, 220, 0.012) * 0.3)), 0.24)
    shimmer = bp(noise(0.6), 1500, 4000) * env(N(0.6), 0.35, 0.15) * (0.6 + 0.4 * np.sin(2 * np.pi * 11 * T(0.6)))
    d["Spawn"] = (reverb(mix(shimmer * 0.6, whoosh(0.5, 200, 700, 0.3) * 0.6), 0.25), 0.34)
    d["Lock"] = (room(mix(thud(0.35, 260, 85, 0.09) * 1.1, modal([196 * m for m in METAL], 0.5, 0.14, 0.3) * 0.35, grains(0.2, 8, 1500, 5000, 0.004, 0.02) * 0.4)), 0.5)
    d["Clear"] = (reverb(mix(*[delay(modal([f, f * 2.76], 0.5, 0.18, 0.15), i * 0.07) for i, f in enumerate((659.26, 783.99, 987.77))]), 0.2), 0.38)
    d["Charge"] = (room(whoosh(0.45, 400, 2500, 0.35) * 0.9), 0.3)
    flap = mix(bp(noise(0.05), 500, 3000) * env(N(0.05), 0.002, 0.012), delay(bp(noise(0.05), 400, 2500) * env(N(0.05), 0.002, 0.01) * 0.6, 0.04))
    d["Open"] = (room(flap, 0.08), 0.3)
    d["Pickup"] = (room(mix(bp(noise(0.08), 600, 3000) * env(N(0.08), 0.003, 0.02) * 0.6, delay(modal([1568, 3700], 0.25, 0.07, 0.2) * 0.5, 0.03))), 0.3)
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
