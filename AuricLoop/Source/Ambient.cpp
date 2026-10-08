#include "Common.h"
#include <algorithm>
#include <cmath>
#include <string>

// ---- 살아 있는 맵: 장면에 놓인 생물·구름 그늘을 움직인다 ----------------------------------
// 흔들리는 나무·풀, 깜빡이는 빛, 연기·잎·먼지 입자는 엔진(Animator·ParticleSystem)이 알아서 돌린다 (tools/gen_scene.py).
// 여기서는 플레이어에 반응하거나 길을 따라 움직이는 것만: 태그 Ambient.Bird·Butterfly·Cloud(거점), Ambient.Bat·Rat(던전)
//   새: 땅에서 쪼다가 가끔 콩콩 뛰고, 플레이어가 다가오거나 공격하면 날아가 화면 밖에서 사라진 뒤 안 보이는 곳에 다시 내려앉음
//   나비: 꽃 둘레를 8자로 팔랑임 / 구름 그늘: 거점 위를 천천히 흘러감
//   박쥐: 지금 방을 가끔 가로질러 날아감 / 쥐: 방 벽을 따라 쪼르르 달리다 사라짐

namespace {
const char* kTags[]={"Ambient.Bird","Ambient.Butterfly","Ambient.Cloud","Ambient.Bat","Ambient.Rat"};
float Rand(float a,float b){return a+(b-a)*float(std::rand()%10000)/10000.f;}
const hb::Vec3 kParked{0,-400,0};
}

void TopDownShooter::UpdateAmbient(float delta,const hb::Vec3& at,bool attacking){
  if(!ambientReady){ambientReady=true;
    for(int kind=0;kind<5;++kind)for(auto* a:hb::Scene::GetActorsWithTag(kTags[kind])){
      Critter c;c.a=a;c.kind=kind;c.home=c.at=hb::Scene::GetPosition(a);c.timer=Rand(0.5f,4.f);c.t=Rand(0,10);
      if(kind>=3){c.at=kParked;hb::Scene::SetPosition(a,kParked);c.timer=Rand(3,10);}  // 던전 생물은 숨겨 두고 가끔 나옴
      critters.push_back(c);}}
  if(critters.empty())return;
  const float vh=rules->CameraSize,vw=vh*16.f/9.f;
  auto visible=[&](const hb::Vec3& p){return std::abs(p.x-cameraAt.x)<vw+1&&std::abs(p.y-cameraAt.y)<vh+1;};
  for(auto& c:critters){
    c.t+=delta;c.timer-=delta;
    switch(c.kind){
    case 0:{  // 새
      const float near=Length(c.at-at);
      if(c.state==0){  // 땅: 쪼기 (애니메이션은 장면의 Animator), 가끔 뜀, 가까이 오면 날아감
        if(near<2.6f||(attacking&&near<5)){c.state=1;c.vel=Normal(c.at-at,hb::Vec3{1,0,0})*5+hb::Vec3{0,3.5f,0};c.timer=3;
          hb::Sprites::PlayAnimation(c.a,"Assets/Animations/SA_BirdFly.hbspriteanimation.json",true);
          hb::Sprites::SetFlip(c.a,c.vel.x<0,false);break;}
        if(c.timer<=0){c.timer=Rand(1.5f,4.f);const hb::Vec3 hop{Rand(-0.5f,0.5f),Rand(-0.3f,0.3f),0};
          if(Length(c.at+hop-c.home)<2.5f){c.at=c.at+hop;hb::Scene::SetPosition(c.a,c.at);hb::Sprites::SetFlip(c.a,hop.x<0,false);}}}
      else if(c.state==1){  // 날아감: 위로 휘며 빨라짐 → 화면 밖이면 숨김
        c.vel=c.vel*(1+delta*0.6f)+hb::Vec3{0,delta*2,0};c.at=c.at+c.vel*delta;hb::Scene::SetPosition(c.a,c.at);
        if(c.timer<=0||!visible(c.at)){c.state=2;c.timer=Rand(6,14);hb::Scene::SetPosition(c.a,kParked);}}
      else if(c.timer<=0){  // 다시 앉기: 원래 자리 근처가 화면 밖이고 플레이어와 멀 때만 (갑자기 생기는 게 보이지 않게)
        const hb::Vec3 spot=c.home+hb::Vec3{Rand(-1.5f,1.5f),Rand(-1,1),0};
        if(!visible(spot)&&Length(spot-at)>8){c.state=0;c.at=spot;hb::Scene::SetPosition(c.a,spot);
          hb::Sprites::PlayAnimation(c.a,"Assets/Animations/SA_BirdIdle.hbspriteanimation.json",true);}
        else c.timer=2;}
      break;}
    case 1:{  // 나비: 집 둘레 8자
      if(!visible(c.home))break;
      const hb::Vec3 p=c.home+hb::Vec3{std::sin(c.t*0.9f)*1.3f,std::sin(c.t*1.8f)*0.5f+0.6f+std::sin(c.t*5.3f)*0.08f,0};
      if((p.x<c.at.x)!=c.flip){c.flip=p.x<c.at.x;hb::Sprites::SetFlip(c.a,c.flip,false);}
      c.at=p;hb::Scene::SetPosition(c.a,p);break;}
    case 2:{  // 구름 그늘: 동쪽으로 흐르고 거점 동쪽 끝을 지나면 서쪽에서 다시
      if(int(c.t*20)%3)break;  // 아주 느리니 세 번에 한 번만 옮김
      c.at.x=c.home.x+std::fmod(c.t*0.35f+1000,110.f);if(c.at.x>66)c.at.x-=110;
      hb::Scene::SetPosition(c.a,c.at);break;}
    case 3:{  // 박쥐: 방 하나를 가로질러 날아감
      if(area<0||area>=(int)map.rooms.size()||fightingRoom>=0&&c.state==0)break;  // 싸우는 중엔 새로 나오지 않음
      const auto& room=map.rooms[area];
      if(c.state==0&&c.timer<=0){c.state=1;const bool left=std::rand()%2;
        c.at={left?room.cx-room.hw-1:room.cx+room.hw+1,room.cy+Rand(-room.hh*0.6f,room.hh*0.8f),0.5f};c.vel={left?6.f:-6.f,Rand(-0.6f,0.6f),0};
        c.home=c.at;c.t=0;hb::Sprites::SetFlip(c.a,!left,false);}
      if(c.state==1){c.at=c.at+c.vel*delta;const hb::Vec3 p=c.at+hb::Vec3{0,std::sin(c.t*7)*0.35f,0};hb::Scene::SetPosition(c.a,p);
        if(std::abs(c.at.x-room.cx)>room.hw+2){c.state=0;c.timer=Rand(8,20);hb::Scene::SetPosition(c.a,kParked);}}
      break;}
    case 4:{  // 쥐: 북쪽 벽 밑을 따라 달리다 사라짐
      if(area<0||area>=(int)map.rooms.size())break;
      const auto& room=map.rooms[area];
      if(c.state==0&&c.timer<=0&&fightingRoom<0){c.state=1;const bool right=std::rand()%2;
        c.at={room.cx+Rand(-room.hw*0.7f,room.hw*0.7f),room.cy+room.hh-0.35f,0};c.vel={right?4.5f:-4.5f,0,0};c.timer=Rand(0.8f,1.4f);
        hb::Sprites::SetFlip(c.a,!right,false);}
      if(c.state==1){c.at=c.at+c.vel*delta;hb::Scene::SetPosition(c.a,c.at);
        if(c.timer<=0||Length(c.at-at)<1.5f){c.state=0;c.timer=Rand(10,25);hb::Scene::SetPosition(c.a,kParked);}}
      break;}
    }
  }
}
