#include "Common.h"
#include <algorithm>
#include <map>
#include <random>
#include <set>
#include <sstream>
#include <string>

// =====================================================================================
// 던전 층 생성·배치
// 장면 Dungeon에 tools/gen_scene.py가 놓은 풀 (태그 Dungeon.*): 화면 밖(y -200)에 세워 두고 여기서 옮겨 쓴다 (parked는 아래 탄 풀과 같음)
static constexpr float CORRIDOR=4.f/3;  // 복도 반폭 (문 폭 2.67m = 위 문 아치 안쪽 폭, tools/make_dungeon_parts.py)

static std::vector<std::string> Split(const std::string& text,char sep){
  std::vector<std::string> out;std::stringstream ss(text);std::string item;
  while(std::getline(ss,item,sep))if(!item.empty())out.push_back(item);
  return out;
}

void Dungeon::Generate(unsigned seed,const hb::Json& floor,const hb::Json& table){
  // 엔터 더 건전·소울 나이트처럼 시작 방에서 격자 위로 가지를 뻗어 나무 모양으로 잇는다: 갈림길(최대 십자)과 막다른 방이 생기고,
  // 막다른 곳에 들어가면 왔던 길로 되돌아 나와야 한다. 가장 먼 막다른 방이 보스, 다른 막다른 방에 상점·채집.
  // 나머지는 전투방 (시작에서 멀수록 어려운 웨이브). 고리(loops)를 몇 개 더 이어 돌아가는 길도 만든다
  std::mt19937 rng(seed);
  auto pick=[&](int n){return std::uniform_int_distribution<int>(0,n-1)(rng);};
  const int count=std::max(6,int(floor.value("rooms",11.f)));
  const int loops=int(floor.value("loops",1.f));
  const float spacing=floor.value("spacing",36.f);
  std::map<std::pair<int,int>,int> cells;
  auto linkCount=[&](int i){int n=0;for(int d=0;d<4;++d)n+=rooms[i].link[d]>=0;return n;};
  auto freeDirs=[&](int i){std::vector<int> v;for(int d=0;d<4;++d)if(!cells.count({rooms[i].gx+dx[d],rooms[i].gy+dy[d]}))v.push_back(d);return v;};
  std::vector<int> dist;
  auto measure=[&](){  // 시작 방에서 몇 방 떨어졌는지 (너비 우선)
    dist.assign(rooms.size(),-1);dist[0]=0;std::vector<int> queue{0};
    for(size_t q=0;q<queue.size();++q)for(int d=0;d<4;++d){const int n=rooms[queue[q]].link[d];if(n>=0&&dist[n]<0){dist[n]=dist[queue[q]]+1;queue.push_back(n);}}};
  int shop=-1,gather=-1;
  for(int attempt=0;attempt<300;++attempt){
    rooms.clear();cells.clear();boss=shop=gather=-1;
    rooms.push_back(DungeonRoom{});cells[{0,0}]=0;
    while(int(rooms.size())<count){
      // 가지 끝(연결 1개)을 더 자주 골라 길게 뻗고, 가끔 중간 방에서 갈라짐 (3갈래 이상은 드물게)
      std::vector<int> grow;
      for(int i=0;i<int(rooms.size());++i){const int n=linkCount(i);if(freeDirs(i).empty())continue;
        grow.push_back(i);if(n<=1){grow.push_back(i);grow.push_back(i);}if(n>=3&&pick(3))grow.pop_back();}
      if(grow.empty())break;
      const int from=grow[pick(int(grow.size()))];const auto dirs=freeDirs(from);const int d=dirs[pick(int(dirs.size()))];
      DungeonRoom r;r.gx=rooms[from].gx+dx[d];r.gy=rooms[from].gy+dy[d];rooms.push_back(r);
      const int i=int(rooms.size())-1;cells[{r.gx,r.gy}]=i;rooms[from].link[d]=i;rooms[i].link[(d+2)%4]=from;
    }
    if(int(rooms.size())<count)continue;
    measure();
    std::vector<int> leaves;for(int i=1;i<int(rooms.size());++i)if(linkCount(i)==1)leaves.push_back(i);
    if(leaves.size()<3)continue;  // 보스·상점·채집 모두 막다른 방에
    std::sort(leaves.begin(),leaves.end(),[&](int x,int y){return dist[x]>dist[y];});
    if(dist[leaves[0]]<4)continue;  // 보스까지 최소 방 4개
    boss=leaves[0];const int rest=int(leaves.size())-1;const int s=1+pick(rest);shop=leaves[s];
    gather=leaves[1+(s-1+1+pick(rest-1))%rest];
    // 고리: 보스·상점·채집이 아닌 이웃 방끼리 몇 군데 더 이음 (돌아가는 길)
    std::vector<std::pair<int,int>> spots;
    for(int i=0;i<int(rooms.size());++i)for(int d:{0,1}){auto it=cells.find({rooms[i].gx+dx[d],rooms[i].gy+dy[d]});
      if(it==cells.end()||rooms[i].link[d]>=0)continue;const int j=it->second;
      if(i==boss||j==boss||i==shop||j==shop||i==gather||j==gather)continue;spots.push_back({i,d});}
    for(int k=0;k<loops&&!spots.empty();++k){const int x=pick(int(spots.size()));const auto [i,d]=spots[x];spots.erase(spots.begin()+x);
      const int j=cells[{rooms[i].gx+dx[d],rooms[i].gy+dy[d]}];rooms[i].link[d]=j;rooms[j].link[(d+2)%4]=i;}
    measure();if(dist[boss]<4)continue;  // 고리로 지름길이 생겨 보스가 가까워졌으면 다시
    break;
  }
  measure();
  // 주 경로 = 시작→보스 최단 경로 (귀환은 이 길을 거꾸로, F9는 이 순서로)
  for(int i=boss,steps=dist[boss];i>=0&&steps>=0;--steps){rooms[i].path=steps;int prev=-1;
    for(int d=0;d<4;++d){const int n=rooms[i].link[d];if(n>=0&&dist[n]==steps-1)prev=n;}i=prev;}
  for(int i=0;i<int(rooms.size());++i){
    auto& r=rooms[i];r.depth=dist[i];
    r.kind=i==0?"Start":i==boss?"Boss":i==shop?"Shop":i==gather?"Gather":"Combat";
    // 전투방 난이도: 시작에서 1방 Combat1, 2~3방 Combat2, 더 멀면 Combat3
    r.row=r.kind=="Combat"?(dist[i]<=1?"Combat1":dist[i]<=3?"Combat2":"Combat3"):r.kind;
    const hb::Json row=table.contains(r.row)?table.at(r.row):hb::Json::object();
    const int lo=int(row.value("minHalf",8.f)),hi=std::max(lo,int(row.value("maxHalf",10.f)));
    r.hw=float(lo+pick(hi-lo+1));r.hh=row.value("square",false)?r.hw:float(lo+pick(hi-lo+1));
    r.cx=r.gx*spacing;r.cy=r.gy*spacing;
    r.layout=r.kind=="Combat"?pick(6):r.kind=="Boss"?1:-1;  // 엄폐물 배치 (Build), 시작·상점·채집은 없음
  }
  gates.assign(rooms.size()*4,nullptr);
}

int Dungeon::RoomAt(const hb::Vec3& p) const{
  for(int i=0;i<int(rooms.size());++i)if(rooms[i].Inside(p))return i;
  return -1;
}

int Dungeon::PathRoom(int order) const{
  for(int i=0;i<int(rooms.size());++i)if(rooms[i].path==order)return i;
  return -1;
}

hb::Vec3 Dungeon::DoorPosition(int room,int dir) const{
  const auto& r=rooms[room];
  return {r.cx+dx[dir]*(r.hw+0.5f),r.cy+dy[dir]*(r.hh+0.5f),0};
}

// 반복 무늬 스프라이트 하나를 사각형 [x0,x1]×[y0,y1]에 깐다. collider: 0 없음, 1 전체, 2 아래 1m (위로 솟은 벽면)
// 반복 무늬 조각 하나를 사각형 [x0,x1]×[y0,y1]에 깐다. collider: 0 없음, 1 전체, 2 아래 1m (위로 솟은 벽면)
void Dungeon::Put(std::vector<Piece>& out,const char* tag,float x0,float y0,float x1,float y1,int collider,float z){
  if(x1-x0<0.05f||y1-y0<0.05f)return;
  auto& pool=pools[tag];if(pool.empty()){shortages++;return;}
  auto* a=pool.back();pool.pop_back();out.push_back({&pool,a});const float w=x1-x0,h=y1-y0;
  hb::Scene::SetPosition(a,hb::Vec3{(x0+x1)/2,(y0+y1)/2,z});hb::Sprites::SetSize(a,hb::Vec2{w,h});
  if(collider==1){hb::Components::SetVector(a,"BoxCollider2D","extent",hb::Vec3{w/2,h/2,0.5f});hb::Components::SetVector(a,"BoxCollider2D","center",hb::Vec3{0,0,0});}
  if(collider==2){hb::Components::SetVector(a,"BoxCollider2D","extent",hb::Vec3{w/2,0.5f,0.5f});hb::Components::SetVector(a,"BoxCollider2D","center",hb::Vec3{0,-h/2+0.5f,0});}
}

void Dungeon::Move(std::vector<Piece>& out,const char* tag,float x,float y,float z){
  auto& pool=pools[tag];if(pool.empty()){shortages++;return;}
  auto* a=pool.back();pool.pop_back();out.push_back({&pool,a});hb::Scene::SetPosition(a,hb::Vec3{x,y,z});
}

void Dungeon::Build(){
  // 풀: 장면에 화면 밖으로 세워 둔 조각들 (태그 Dungeon.*). 내 주변 방만 깔아서 개수가 적어도 됨
  for(auto* tag:{"Dungeon.Floor","Dungeon.Cap","Dungeon.Face","Dungeon.Lintel","Dungeon.Arch","Dungeon.Torch","Dungeon.Glow","Dungeon.Banner","Dungeon.Pillar",
                 "Dungeon.Crate","Dungeon.Barrel","Dungeon.LowWall","Dungeon.Statue","Dungeon.Chest","Dungeon.Rubble","Dungeon.Bones","Dungeon.Gold"})
    pools[tag]=hb::Scene::GetActorsWithTag(tag);
  gateFree=hb::Scene::GetActorsWithTag("Dungeon.Gate");sideFree=hb::Scene::GetActorsWithTag("Dungeon.GateSide");
  {auto s=hb::Scene::GetActorsWithTag("Dungeon.Stairs");stairs=s.empty()?nullptr:s.front();}
  signs=hb::Scene::GetActorsWithTag("Dungeon.Sign");
  shortages=0;placed.clear();
  {// 맵 밖: 벽 윗면 무늬를 어둡게 한 장. 맵 전체 크기로 깔면 큰 층에서 엔진의 반복 무늬 한도(1만 칸)를 넘어
   // 장면이 안 열리므로 화면보다 조금 큰 크기로 두고 카메라를 따라 무늬 한 칸(2m)씩 옮긴다 (Follow)
   auto back=hb::Scene::GetActorsWithTag("Dungeon.Background");
   backdrop=back.empty()?nullptr:back.front();backdropAt={1e9f,0,0};
   if(backdrop)hb::Sprites::SetSize(backdrop,hb::Vec2{48,32});}
  // 방마다 장식·엄폐물 자리를 한 번 정함 (방 번호로 씨앗을 줘서 다시 깔아도 같은 자리)
  const float C=CORRIDOR;
  for(int i=0;i<int(rooms.size());++i){
    auto& r=rooms[i];r.props.clear();r.blocked.clear();
    std::mt19937 rng(unsigned(i*7919+int(r.hw*31)+r.gx*17+r.gy*131));
    auto between=[&](float a,float b){return std::uniform_real_distribution<float>(a,b)(rng);};
    const float x0=r.cx-r.hw,x1=r.cx+r.hw,y0=r.cy-r.hh,y1=r.cy+r.hh;
    // 북쪽 벽 장식: 횃불·빛 (6m마다), 넓은 벽엔 깃발, 위 문엔 아치
    std::vector<std::pair<float,float>> north;
    if(r.link[0]<0)north.push_back({x0,x1});else{north.push_back({x0,r.cx-C});north.push_back({r.cx+C,x1});r.props.push_back({"Dungeon.Arch",r.cx,y1+2});}  // 아치 아랫변 = 벽 밑
    const float stairX=r.kind=="Start"?x0+3.3f:-1e9f;  // 시작 방: 북쪽 벽 왼쪽에 올라가는 계단 (그 자리엔 횃불을 두지 않음)
    for(auto [a,b]:north){for(float x=a+2.5f;x<b-1.5f;x+=6){if(std::fabs(x-stairX)<3)continue;r.props.push_back({"Dungeon.Torch",x,y1+1.1f});r.props.push_back({"Dungeon.Glow",x,y1+1.45f});}
      if(b-a>9)r.props.push_back({"Dungeon.Banner",(a+b)/2,y1+1.6f});}
    // 엄폐물 배치 (방마다 무작위 하나): 0 기둥 몇 개, 1 네 기둥, 2 가운데 상자 더미, 3 낮은 벽 두 줄(통로),
    // 4 상자·통 흩뿌리기, 5 네 귀퉁이 황금 석상 + 가운데 보물 상자. 문 앞 3.5m는 비워서 문을 막지 않음
    auto place=[&](const char* tag,float fx,float fy,float lift){
      const hb::Vec3 p{r.cx+fx,r.cy+fy,0};
      for(int d=0;d<4;++d)if(r.link[d]>=0&&std::hypot(DoorPosition(i,d).x-p.x,DoorPosition(i,d).y-p.y)<3.5f)return;
      if(!r.Inside(p,1.5f))return;
      for(auto& q:r.blocked)if(std::hypot(q.x-p.x,q.y-p.y)<1.2f)return;
      r.blocked.push_back(p);r.props.push_back({tag,p.x,p.y+lift});};
    const float W=r.hw,Hh=r.hh;
    switch(r.layout){
      case 0:{for(int k=0,n=int(between(1,3.99f));k<n;++k)place("Dungeon.Pillar",between(-W+3,W-3),between(-Hh+3,Hh-3),0.6f);}break;
      case 1:{for(float sx:{-1.f,1.f})for(float sy:{-1.f,1.f})place("Dungeon.Pillar",sx*W*0.5f,sy*Hh*0.5f,0.6f);}break;
      case 2:{for(float sx:{-0.9f,0.9f})for(float sy:{-0.7f,0.9f})place("Dungeon.Crate",sx,sy,0.7f);place("Dungeon.Barrel",2.4f,0.2f,0.5f);}break;
      case 3:{for(float sy:{-1.f,1.f})for(float x=-W*0.6f;x<=W*0.6f;x+=1.6f)if(std::fabs(x)>2.5f)place("Dungeon.LowWall",x,sy*Hh*0.4f,0.3f);}break;
      case 4:{for(int k=0;k<7;++k)place(k%2?"Dungeon.Barrel":"Dungeon.Crate",between(-W+2.5f,W-2.5f),between(-Hh+2.5f,Hh-2.5f),k%2?0.5f:0.7f);}break;
      case 5:{for(float sx:{-1.f,1.f})for(float sy:{-1.f,1.f})place("Dungeon.Statue",sx*(W-3),sy*(Hh-3),0.8f);place("Dungeon.Chest",0,0,0.4f);}break;
    }
    // 바닥 잔해·뼈, 보스·채집방엔 금화 더미
    for(int k=0,n=int(r.hw*r.hh/30);k<n;++k){const float x=between(x0+1,x1-1),y=between(y0+1,y1-1);
      if(std::fabs(x-r.cx)<2&&std::fabs(y-r.cy)<2)continue;
      if(r.kind=="Start")continue;  // 시작 방은 표지판만 (잔해가 표지판에 겹치지 않게)
      r.props.push_back({(r.kind=="Boss"||r.kind=="Gather")&&k%3==0?"Dungeon.Gold":k%2?"Dungeon.Bones":"Dungeon.Rubble",x,y});}
  }
  if(stairs)hb::Scene::SetPosition(stairs,hb::Vec3{rooms[start].cx-rooms[start].hw+3.3f,rooms[start].cy+rooms[start].hh+2,0.05f});  // 북쪽 벽 왼쪽에 박힘 (아랫변 = 벽 밑) 구석
  {// 튜토리얼 표지판: 네 문으로 가는 십자 길을 비우고 양옆에 (아래 줄 이동·공격·구르기·줍기, 위 줄 귀환·제작·가방)
   static const float at[][2]={{-5.6f,-4.6f},{-2.8f,-4.6f},{2.8f,-4.6f},{5.6f,-4.6f},{-2.8f,3.4f},{2.8f,3.4f},{5.6f,3.4f}};
   const auto& r=rooms[start];
   for(size_t i=0;i<signs.size()&&i<7;++i)hb::Scene::SetPosition(signs[i],hb::Vec3{r.cx+at[i][0],r.cy+at[i][1],0.05f});}
  Show(start);
}

void Dungeon::PlaceRoom(int i){
  auto& out=placed[i];auto& r=rooms[i];const float C=CORRIDOR,x0=r.cx-r.hw,x1=r.cx+r.hw,y0=r.cy-r.hh,y1=r.cy+r.hh;
  Put(out,"Dungeon.Floor",x0,y0,x1,y1,0,0.f);
  // 북쪽 벽: 위로 솟은 벽면 3m (아래 1m만 막힘), 남쪽 벽(윗면 1m), 서·동 벽(윗면, 북쪽 벽면 높이까지). 문 자리는 비움
  if(r.link[0]<0)Put(out,"Dungeon.Face",x0,y1,x1,y1+3,2,0.02f);else{Put(out,"Dungeon.Face",x0,y1,r.cx-C,y1+3,2,0.02f);Put(out,"Dungeon.Face",r.cx+C,y1,x1,y1+3,2,0.02f);}
  if(r.link[2]<0)Put(out,"Dungeon.Cap",x0-1,y0-1,x1+1,y0,1,0.03f);else{Put(out,"Dungeon.Cap",x0-1,y0-1,r.cx-C,y0,1,0.03f);Put(out,"Dungeon.Cap",r.cx+C,y0-1,x1+1,y0,1,0.03f);
    Put(out,"Dungeon.Lintel",r.cx-C,y0-1,r.cx+C,y0,0,0.04f);}  // 남쪽 문: 벽 밑으로 지나감
  for(int side:{3,1}){const float a=side==3?x0-1:x1,b=a+1;
    if(r.link[side]<0)Put(out,"Dungeon.Cap",a,y0,b,y1+3,1,0.03f);else{Put(out,"Dungeon.Cap",a,y0,b,r.cy-C,1,0.03f);Put(out,"Dungeon.Cap",a,r.cy+C,b,y1+3,1,0.03f);
      Put(out,"Dungeon.Lintel",a,r.cy-C,b,r.cy+C,0,0.04f);}}  // 서·동 문: 벽 밑으로 지나감
  for(const auto& p:r.props)Move(out,p.tag,p.x,p.y);
}

void Dungeon::PlaceCorridor(int i,int d){
  // 북쪽(d 0)·동쪽(d 1) 복도만 단위로 둠 (반대쪽은 상대 방의 북·동 복도)
  auto& out=placed[1000+i*4+d];const auto& r=rooms[i];const float C=CORRIDOR;
  if(d==0){const auto& n=rooms[r.link[0]];const float bottom=r.cy+r.hh,top=n.cy-n.hh;
    Put(out,"Dungeon.Floor",r.cx-C,bottom,r.cx+C,top,0,0.f);Put(out,"Dungeon.Cap",r.cx-C-1,bottom,r.cx-C,top-1,1,0.03f);Put(out,"Dungeon.Cap",r.cx+C,bottom,r.cx+C+1,top-1,1,0.03f);}
  else{const auto& e=rooms[r.link[1]];const float left=r.cx+r.hw,right=e.cx-e.hw;
    Put(out,"Dungeon.Floor",left,r.cy-C,right,r.cy+C,0,0.f);Put(out,"Dungeon.Face",left+1,r.cy+C,right-1,r.cy+C+3,2,0.02f);Put(out,"Dungeon.Cap",left+1,r.cy-C-1,right-1,r.cy-C,1,0.03f);}
}

void Dungeon::Show(int center){
  // 지금 방과 이웃 방, 그 방들에 붙은 복도만 남기고 나머지 조각은 화면 밖 풀로 돌려놓는다
  std::set<int> near{center};for(int d=0;d<4;++d)if(rooms[center].link[d]>=0)near.insert(rooms[center].link[d]);
  std::set<int> want(near.begin(),near.end());
  for(int i=0;i<int(rooms.size());++i)for(int d:{0,1})if(rooms[i].link[d]>=0&&(near.count(i)||near.count(rooms[i].link[d])))want.insert(1000+i*4+d);
  for(auto it=placed.begin();it!=placed.end();)
    if(!want.count(it->first)){for(auto& p:it->second){hb::Scene::SetPosition(p.actor,hb::Vec3{0,-200,0});p.pool->push_back(p.actor);}it=placed.erase(it);}else ++it;
  for(int u:want)if(!placed.count(u)){if(u<1000)PlaceRoom(u);else PlaceCorridor((u-1000)/4,(u-1000)%4);}
}

void Dungeon::Lock(int room,bool locked,int only){
  const auto& r=rooms[room];
  for(int d=0;d<4;++d){if(r.link[d]<0||(only>=0&&d!=only))continue;
    auto& g=gates[room*4+d];auto& pool=d%2?sideFree:gateFree;
    if(locked&&!g&&!pool.empty()){g=pool.back();pool.pop_back();
      const float x0=r.cx-r.hw,x1=r.cx+r.hw,y0=r.cy-r.hh,y1=r.cy+r.hh;
      // 위 문은 아치 안의 큰 철창, 아래 문은 낮은 철창, 옆문은 옆에서 본 철창 (철창 그림·충돌은 장면 풀에 정해 둠)
      const hb::Vec3 at=d==0?hb::Vec3{r.cx,y1+1.5f,0.06f}:d==2?hb::Vec3{r.cx,y0-0.4f,0.06f}:hb::Vec3{d==1?x1+0.5f:x0-0.5f,r.cy+0.1f,0.06f};
      hb::Scene::SetPosition(g,at);const float w=CORRIDOR*2+0.2f;  // 문 폭에 맞춘 철창
      if(d==0){hb::Sprites::SetSize(g,hb::Vec2{w,3});hb::Components::SetVector(g,"BoxCollider2D","center",hb::Vec3{0,-1,0});hb::Components::SetVector(g,"BoxCollider2D","extent",hb::Vec3{w/2,0.5f,0.5f});}
      if(d==2){hb::Sprites::SetSize(g,hb::Vec2{w,1.6f});hb::Components::SetVector(g,"BoxCollider2D","center",hb::Vec3{0,0,0});hb::Components::SetVector(g,"BoxCollider2D","extent",hb::Vec3{w/2,0.5f,0.5f});}
      if(d%2){hb::Sprites::SetSize(g,hb::Vec2{1,w+0.4f});hb::Components::SetVector(g,"BoxCollider2D","extent",hb::Vec3{0.5f,w/2,0.5f});}}
    else if(!locked&&g){hb::Scene::SetPosition(g,parked);pool.push_back(g);g=nullptr;}
  }
}

hb::Json Dungeon::Describe() const{
  hb::Json list=hb::Json::array();
  if(shortages)list.push_back({{"kind","Shortage"},{"count",shortages}});  // 조각 풀 부족 (tools/gen_scene.py 개수 늘리기)
  for(const auto& r:rooms)list.push_back({{"kind",r.kind},{"row",r.row},{"x",r.cx},{"y",r.cy},{"hw",r.hw},{"hh",r.hh},{"path",r.path},{"state",r.state},{"links",{r.link[0],r.link[1],r.link[2],r.link[3]}}});
  return list;
}

void Dungeon::FollowBackdrop(const hb::Vec3& camera){
  // 무늬가 미끄러지지 않게 2m(무늬 한 칸) 단위로만 따라가고, 칸이 바뀔 때만 엔진에 보낸다
  if(!backdrop)return;
  const hb::Vec3 snap{std::round(camera.x/2)*2,std::round(camera.y/2)*2,-1};
  if(snap.x==backdropAt.x&&snap.y==backdropAt.y)return;
  backdropAt=snap;hb::Scene::SetPosition(backdrop,snap);
}
