# 무기소켓 유지보수 — 2026-10-13

- 현재 저장소는 독립 `.git`을 가진 `weapon-socket` 브랜치. GitHub origin은 기존 Auric_Loop.
- 사용자 수동 정리 후 플랫폼별 기존 빌드 2개, 프로젝트 전체 약 1.42GB.
- 게임 소스·에셋을 삭제/변경하지 않음. 기존 선택 이미지 select_alea/sherry/valen 수정 유지.
- `tools/build-retention.mjs`: 완료된 성공 빌드 2개 + 실패 기록 1개를 플랫폼별 보관. 새 빌드 성공 후 실행. 진행 중/알 수 없는 폴더와 다른 프로젝트 ID, 연결 폴더를 보존.
- `tools/package.mjs`, `tools/build_mobile.mjs`에 정리 연결. 현재 설치된 HBEngine 3개 버전의 tools/build-game.mjs에도 이 프로젝트 ID에 한정한 연결을 넣어 편집기 빌드 포함.
- 엔진 원본 백업: C:/Users/kirby/OneDrive/바탕 화면/maple/ㅎㅅ/저장소_독립_백업_20261013/빌드보관_엔진원본.
- 엔진을 새 버전으로 설치하면 편집기 연결은 재적용 필요. 프로젝트 패키징 스크립트 연결은 유지.
- 사용 중/권한 오류로 지우지 못한 빌드는 경고하고 보존. 알 수 없는/중단된 빌드와 엔진 C++ 캐시는 보관 제한 대상이 아님.
- 검증 PASS: 별도 임시 폴더에서 tools/check_build_retention.mjs 실행(실제 정리 + 경로/연결/미완료 보존 + 시계 오차). 현 프로젝트 보관 계획에 삭제 후보 0개.
- 검증 PASS: Git connectivity fsck, 엔진 3개 build-game.mjs와 프로젝트 스크립트 문법, git diff --check.
- 검증 PASS: 88db6de/5dc8e7 엔진 windows dry-run에서 콘텐츠 3,335개/30,717,602바이트, 소스 모듈 2개 검사.
- 검증 PASS: 남은 패키지 8개, manifest에 기록된 27,820개 파일의 크기 및 SHA-256 일치.
- 검증 PASS: 88db6de 엔진 C++ 컴파일 후 헤드리스 Hub(590개 객체), Test_Valen/Sherry/Alea(각 532개 객체), 각 3프레임.
- DEBUG_HANDOFF.md 미생성: 기존 파일이 없고 이번 검사에서 반복 실패/미해결 게임 결함이 발생하지 않음.
- 게임 미술/전체 플레이 QA와 Android/iOS 실기기 검증은 이번 유지보수 범위가 아님.
