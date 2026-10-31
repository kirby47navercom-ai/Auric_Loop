# 번역표(tools/lang_en.json)와 위젯의 고정 문구로 AuricLoop/Source/Lang.h를 만든다
# 실행: python tools/lang_build.py  (번역이 빠진 문구가 있으면 실패. 빠진 것은 python tools/lang_extract.py로 확인)
import json
from pathlib import Path

from lang_extract import ROOT, collect

TOOLS = Path(__file__).resolve().parent
en = json.loads((TOOLS / "lang_en.json").read_text(encoding="utf-8"))
found = collect()
missing = [k for k in found if k not in en]
if missing:
    raise SystemExit("번역 없음: " + " / ".join(missing))


def lit(s):
    return json.dumps(s, ensure_ascii=False)


# 위젯 고정 문구: 언어를 바꿀 때 C++가 다시 써 넣는다 (C++가 그때그때 바꾸는 문구는 다음에 쓸 때 번역됨)
static = []
for f in ["W_Front", "W_TopDown", "W_Map", "W_Fast"]:
    for n in json.loads((ROOT / f"Assets/UI/{f}.hbwidget.json").read_text(encoding="utf-8"))["nodes"]:
        t = n.get("properties", {}).get("text", "")
        if isinstance(t, str) and t in en:
            static.append((n["name"], t))

pairs = sorted(en.items(), key=lambda kv: -len(kv[0].encode("utf-8")))  # 긴 것부터 (문장 조각 바꾸기에서 짧은 단어가 먼저 먹지 않게)
out = ["#pragma once",
       "// 생성 파일: python tools/lang_build.py (번역표 tools/lang_en.json). 직접 고치지 말 것",
       "#include <string>",
       "#include <unordered_map>",
       "#include <utility>",
       "",
       "inline int Language=0;  // 0 한국어, 1 English (타이틀 설정 탭, 저장 Auric.settings)",
       "inline const std::pair<const char*,const char*> kLangEn[]={"]
out += [f"  {{{lit(k)},{lit(v)}}}," for k, v in pairs]
out += ["};", "inline const char* kStaticTexts[][2]={"]
out += [f"  {{{lit(n)},{lit(t)}}}," for n, t in static]
out += ["};", "",
        "// 화면 글자 번역: 한국어면 그대로. 영어면 통째로 맞는 문장 → 없으면 아는 조각(긴 것부터)을 바꿔 끼움 (숫자를 붙여 만든 문구)",
        "inline std::string Tr(const std::string& s){",
        "  if(Language==0||s.empty())return s;",
        "  bool korean=false;for(unsigned char c:s)if(c>=0xEA&&c<=0xED){korean=true;break;}  // 한글 음절의 UTF-8 첫 바이트",
        "  if(!korean)return s;",
        "  static std::unordered_map<std::string,std::string> exact,cache;",
        "  if(exact.empty())for(const auto& [k,v]:kLangEn)exact.emplace(k,v);",
        "  if(auto it=exact.find(s);it!=exact.end())return it->second;",
        "  if(auto it=cache.find(s);it!=cache.end())return it->second;",
        "  std::string r=s;",
        "  for(const auto& [k,v]:kLangEn){const std::string ko=k;for(size_t p=0;(p=r.find(ko,p))!=std::string::npos;){r.replace(p,ko.size(),v);p+=std::string(v).size();}}",
        "  if(cache.size()>4000)cache.clear();",
        "  return cache[s]=r;",
        "}",
        ""]
(ROOT / "Source/Lang.h").write_text("\n".join(out), encoding="utf-8")
print("Lang.h:", len(pairs), "번역,", len(static), "고정 문구")
