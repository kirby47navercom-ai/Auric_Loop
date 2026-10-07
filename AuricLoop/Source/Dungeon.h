#pragma once
#include <HBEngine/Game.hpp>
#include <string>
#include <vector>

// 던전 한 층 (BP가 아닌 보통 C++ 타입). 구현은 Dungeon.cpp
// 던전 한 층을 엔터 더 건전·소울 나이트처럼 매번 무작위로 만든다.
//   1) 시작 방에서 격자 위로 가지를 뻗어 나무 모양(갈림길·막다른 방)으로 잇고, 가장 먼 막다른 방을 보스로 (Generate)
//   2) 방·복도의 바닥과 벽은 장면(Dungeon)에 화면 밖으로 세워 둔 반복 무늬 스프라이트를 옮기고 크기만 바꿔 깐다 (Build)
// 방 종류·크기·웨이브는 데이터 에셋(Assets/Data/DA_Floor, DT_Rooms)에서 고친다.

struct DungeonRoom{
  std::string kind;              // Start, Combat, Gather, Shop, Boss
  std::string row;               // DT_Rooms 행 이름 (Combat1, Branch, …)
  int gx=0,gy=0;                 // 격자 칸
  float cx=0,cy=0,hw=6,hh=6;     // 가운데, 반너비·반높이 (m)
  int path=-1;                   // 시작→보스 최단 경로에서의 순서 (경로 밖 방은 -1)
  int depth=0;                   // 시작 방에서 몇 방 떨어졌는지
  int layout=0;                  // 엄폐물 배치 (Dungeon::Build)
  bool seen=false,visited=false; // 미니맵: 들어간 방과 그 이웃만 보임
  int link[4]={-1,-1,-1,-1};     // 북·동·남·서로 이어진 방 번호
  int state=0;                   // 0 처음, 1 전투 중, 2 끝
  bool returned=false;           // 귀환 페이즈에 지나감
  std::vector<hb::Vec3> blocked; // 엄폐물 자리 (적 등장 자리에서 뺌)
  struct Prop{const char* tag;float x,y;};
  std::vector<Prop> props;       // 이 방에 놓을 장식·엄폐물 (Build에서 한 번 정하고, 가까워지면 깔기)
  bool Inside(const hb::Vec3& p,float margin=0) const{
    return p.x>cx-hw+margin&&p.x<cx+hw-margin&&p.y>cy-hh+margin&&p.y<cy+hh-margin;}
};

class Dungeon{
public:
  std::vector<DungeonRoom> rooms;
  int start=0,boss=-1;
  hb::Actor* stairs=nullptr;     // 시작 방의 거점 계단

  // floor: DA_Floor (rooms 방 수, loops 고리 수, spacing 격자 간격), table: DT_Rooms 전체 (행 → minHalf, maxHalf, waves …)
  void Generate(unsigned seed,const hb::Json& floor,const hb::Json& table);
  void Build();                  // 풀 찾기·배경·방마다 장식 자리 정하기, 시작 방 주변 깔기
  void Show(int center);         // center 방과 이웃 방·그 복도만 깔고, 나머지는 풀로 회수 (오브젝트 수·충돌 계산을 줄임)
  int RoomAt(const hb::Vec3& p) const;                       // 방 안이면 번호, 복도·밖이면 -1
  int PathRoom(int order) const;                             // 주 경로 order번째 방
  hb::Vec3 DoorPosition(int room,int dir) const;             // 문 자리 (방 가장자리 가운데)
  void Lock(int room,bool locked,int only=-1);               // 방 문 잠그기 (only: 그 방향 하나만)
  bool Locked(int room,int dir) const{return gates[room*4+dir]!=nullptr;}
  hb::Json Describe() const;                                 // 검사·디버그용 배치 요약

  static constexpr int dx[4]={0,1,0,-1},dy[4]={1,0,-1,0};
private:
  std::vector<hb::Actor*> gates;                             // 방*4+방향 → 잠긴 문 (열리면 nullptr)
  struct Piece{std::vector<hb::Actor*>* pool;hb::Actor* actor;};
  std::map<int,std::vector<Piece>> placed;                   // 깐 단위(방 i, 복도 1000+i*4+방향)별 조각
  std::map<std::string,std::vector<hb::Actor*>> pools;       // 태그 → 남은 조각
  int shortages=0;                                           // 풀이 모자라 못 깐 조각 (Describe → 검사)
  void Put(std::vector<Piece>& out,const char* tag,float x0,float y0,float x1,float y1,int collider,float z);
  void Move(std::vector<Piece>& out,const char* tag,float x,float y,float z=0.05f);
  void PlaceRoom(int i);
  void PlaceCorridor(int i,int d);
  std::vector<hb::Actor*> gateFree,sideFree;                 // 남은 철창 (위·아래 문용, 옆문용)
};
