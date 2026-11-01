# PC 네이티브 패키지용: 움직이는 UI 그림(Assets/UI/Kit/*.webp, tools/make_title_fx.py)을 PNG 장면들로 풀어 둔다.
# 네이티브 UI(Skia)는 움직이는 WebP를 첫 장만 그려 타이틀의 동전 고리·Tap To Start·횃불·안개·반짝임이 멈춰 있거나 안 보였음 (웹뷰는 움직임).
# tools/player_patches.mjs 18번이 <패키지>/ui-anim/<이름>/frames.json을 읽어 시간에 맞는 장을 그린다 (엔진 3b0ed24는 매 장 압축 해제라 타이틀이 초당 9장).
# 메모리(램 8GB 노트북): 화면 크기 그림은 절반 해상도, 장 수는 최대 40장 (사이 장은 앞 장 시간에 합침)
# 실행: python tools/extract_ui_anim.py <출력 폴더>
import json
import struct
import sys
from pathlib import Path

from PIL import Image

KIT = Path(__file__).resolve().parent.parent / "AuricLoop/Assets/UI/Kit"
MAX_FRAMES = 40


def durations(path):
    # WebP 애니메이션 장마다 시간(ms): RIFF ANMF 조각의 12번째 바이트부터 3바이트
    data, out, i = path.read_bytes(), [], 12
    while i + 8 <= len(data):
        tag, size = data[i:i + 4], struct.unpack("<I", data[i + 4:i + 8])[0]
        if tag == b"ANMF":
            out.append(int.from_bytes(data[i + 8 + 12:i + 8 + 15], "little"))
        i += 8 + size + (size & 1)
    return out


def main(out_dir):
    out_dir = Path(out_dir)
    for webp in sorted(KIT.glob("*.webp")):
        im, ms = Image.open(webp), durations(webp)
        if getattr(im, "n_frames", 1) < 2 or len(ms) != im.n_frames:
            continue
        step = -(-im.n_frames // MAX_FRAMES)
        half = im.size[0] >= 1000  # 화면 너비 그림은 절반으로 (그릴 때 원래 크기로 늘림)
        dest = out_dir / webp.stem
        dest.mkdir(parents=True, exist_ok=True)
        frames = []
        for k in range(0, im.n_frames, step):
            im.seek(k)
            frame = im.convert("RGBA")
            if half:
                frame = frame.resize((im.size[0] // 2, im.size[1] // 2), Image.BILINEAR)
            name = f"{len(frames):03d}.png"
            frame.save(dest / name, optimize=True)
            frames.append({"file": name, "ms": sum(ms[k:k + step])})
        loop = ms[-1] < 100000  # 마지막 장을 아주 길게 둔 것(동전 터짐)은 한 번만
        (dest / "frames.json").write_text(json.dumps({"frames": frames, "loop": loop}), encoding="utf-8")
        print(webp.name, im.n_frames, "→", len(frames), "장", "반복" if loop else "한 번")


if __name__ == "__main__":
    main(sys.argv[1])
