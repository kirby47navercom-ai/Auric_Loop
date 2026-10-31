# 화면에 나오는 한글 문구를 모두 모은다 (번역표 tools/lang_en.json에 빠진 것 찾기용)
# 실행: python tools/lang_extract.py  → 번역이 없는 문구를 출력. 문구를 고치거나 더하면 번역을 넣고 python tools/lang_build.py
import glob
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent / "AuricLoop"
KO = re.compile("[가-힣]")
LIT = re.compile(r'"((?:[^"\\\n]|\\.)*)"')


def collect():
    found = {}

    def add(s, src):
        if isinstance(s, str) and KO.search(s):
            found.setdefault(s, src)

    for f in ["W_Front", "W_TopDown", "W_Map", "W_Fast"]:
        p = ROOT / f"Assets/UI/{f}.hbwidget.json"
        if p.exists():
            for n in json.loads(p.read_text(encoding="utf-8"))["nodes"]:
                add(n.get("properties", {}).get("text", ""), "W:" + n["name"])
    d = json.loads((ROOT / "Assets/Data/DT_Dialogue.hbdata.json").read_text(encoding="utf-8"))
    for r, row in d["rows"].items():
        for line in row.get("lines", []):
            add(line.get("name", ""), "D:" + r)
            add(line.get("text", ""), "D:" + r)
    for f in sorted(glob.glob(str(ROOT / "Assets/Scenes/*.hbscene.json"))):
        for o in json.loads(Path(f).read_text(encoding="utf-8")).get("objects", []):
            add(o.get("overrides", {}).get("nativeProperties", {}).get("Text"), "S:" + o.get("name", ""))
    for f in glob.glob(str(ROOT / "Assets/Blueprints/Enemies/*.json")):
        for m in re.findall(r'"DisplayName"\s*:\s*"([^"]+)"', Path(f).read_text(encoding="utf-8")):
            add(m, "E")
    for f in sorted(glob.glob(str(ROOT / "Source/*.cpp")) + glob.glob(str(ROOT / "Source/*.inl")) + [str(ROOT / "Source/Common.h")]):
        if f.endswith("Lang.inl"):
            continue
        for line in Path(f).read_text(encoding="utf-8").splitlines():
            if "DisplayName=" in line or "KoreanName=" in line or line.strip().startswith("//"):
                continue
            code = re.sub(r"//[^\"]*$", "", line)
            for m in LIT.findall(code):
                add(m, "C:" + Path(f).name)
    return found


if __name__ == "__main__":
    found = collect()
    en_path = ROOT.parent / "tools/lang_en.json"
    en = json.loads(en_path.read_text(encoding="utf-8")) if en_path.exists() else {}
    missing = [k for k in found if k not in en]
    print(len(found), "문구,", len(missing), "번역 없음")
    for k in missing:
        print(found[k][:24].ljust(24), "|", k)
