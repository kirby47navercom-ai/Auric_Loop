#pragma once  // tools/make_hero_motion.py가 만듦 (손으로 고치지 않음): 셰리·알레아 모션 팩 그림 크기·발사 자리
// 행 0 아래 · 1 왼쪽 · 2 위 · 3 오른쪽. 좌표는 80x64 칸의 px (오른쪽 +x, 아래 +y)
static const float kHmPPU[2]={29.f,26.f},kHmOriginTop[2]={31.450f,34.300f};  // [0] 셰리 [1] 알레아
static const float kHmMuzzle[2][4][2]={{{43,42},{25,41},{39,34},{55,41}},{{21,37},{16,36},{58,24},{58,36}}};  // 화살 받침 · 지팡이 보석
static const float kSherryChargeFx[4][2]={{44,44},{26,41},{36,35},{54,41}};  // 차징 빛 (px, 칸 기준)
