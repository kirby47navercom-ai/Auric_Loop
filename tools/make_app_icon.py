# 앱 아이콘: 타이틀 그림(Kit/title_v2.png)의 로고 부분을 잘라 안드로이드 밀도별 PNG와 윈도우 .ico를 만든다
# 결과는 UI/Kit(회사 그림이라 저장소에 안 올림)에 둠: app_icon.png(512), app_icon_<크기>.png, app_icon.ico
# 실행: python tools/make_app_icon.py
from pathlib import Path
from PIL import Image

kit = Path(__file__).resolve().parent.parent / 'AuricLoop/Assets/UI/Kit'
art = Image.open(kit / 'title_v2.png').convert('RGBA').crop((460, 10, 1200, 750))  # 로고와 동전, 아래 "Tap To Start" 글자는 뺌
art.resize((512, 512), Image.LANCZOS).save(kit / 'app_icon.png')
for size in (48, 72, 96, 144, 192):  # mdpi ~ xxxhdpi 런처 아이콘
    art.resize((size, size), Image.LANCZOS).save(kit / f'app_icon_{size}.png')
art.resize((256, 256), Image.LANCZOS).save(kit / 'app_icon.ico', sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
