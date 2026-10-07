#include "Common.h"
#include <algorithm>
#include <map>
#include <random>
#include <set>
#include <sstream>
#include <string>

// =====================================================================================
// 적: 행동은 상태 머신(Assets/AI/FSM_*.hbstatemachine.json)이 고르고, 상태마다 아래 함수 하나가 불린다.
// 상태 머신 파라미터: Distance(플레이어까지 거리), Stunned(경직), Ready(원거리 장전 끝), Next(보스 다음 패턴)
// =====================================================================================

void Enemy::Awake(){
  // 풀에서 다시 꺼낼 때도 불린다. 생성한 쪽이 먼저 정한 무적·경직(귀환 해골)은 지우지 않는다
  Hp=MaxHp;flash=0;burnLeft=0;ring=0;pattern=0;shotTimer=ShotInterval*0.5f;mode=Mode::Halt;burnedOut=false;
  sentStunned=sentReady=sentNear=flipped=false;dashCount=0;phase2=false;sentVelocity={9e9f,0,0};
  tint=-1;Tint(false);
  if(Parked)return;  // 화면 밖 대기 중이면 상태 머신을 켜지 않음 (꺼낼 때 다시 Awake)
  hb::States::Start(this,Brain);brainRunning=true;
}

hb::Vec3 Enemy::ToPlayer(float& distance) const{
  auto* game=TopDownShooter::Current;if(!game){distance=999;return {0,-1,0};}
  const auto d=game->PlayerPosition()-hb::Scene::GetPosition(const_cast<Enemy*>(this));distance=Length(d);return Normal(d,{0,-1,0});
}

void Enemy::Tick(float delta){
  // 매 프레임: 경직·화상·깜빡임·접촉 피해, 상태 머신 파라미터, 지금 상태(mode)에 맞는 이동
  auto* game=TopDownShooter::Current;
  float distance;const auto dir=ToPlayer(distance);
  if(stun>0)stun-=delta;
  if(flash>0&&(flash-=delta)<=0)Tint(false);
  if(burnLeft>0){burnLeft-=delta;if(!Invulnerable){Hp-=burnDamage*delta;burnedOut=Hp<=0.001f;}}
  // 상태 머신 파라미터·뒤집기는 바뀔 때만 보낸다 (적 수 × 매 프레임 명령을 줄임)
  const bool ready=KeepDistance>0&&(shotTimer-=delta)<=0,stunned=stun>0,flip=dir.x<0,near=distance<Radius+1.2f;
  if(ready!=sentReady){sentReady=ready;hb::States::SetBool(this,"Ready",ready);}
  if(near!=sentNear){sentNear=near;hb::States::SetBool(this,"Near",near);}  // 근거리 해골의 휘두르기 그림
  if(stunned!=sentStunned){sentStunned=stunned;hb::States::SetBool(this,"Stunned",stunned);}
  if(flip!=flipped){flipped=flip;hb::Sprites::SetFlip(this,flip,false);}
  const bool frozen=!game||game->Frozen();
  // 몸통 박치기: 맞히면 잠깐 물러남 (붙어서 무적이 끝나자마자 또 때리지 않게)
  if(!frozen&&stun<=0&&mode!=Mode::Jump&&distance<Radius+0.35f&&game->DamagePlayer(ContactDamage,hb::Scene::GetPosition(this))&&!Boss){
    Stun(0.6f);sentVelocity=dir*-4.f;hb::Physics::SetVelocity(this,sentVelocity);mode=Mode::Stagger;}
  if(mode==Mode::Dash||mode==Mode::Stagger||mode==Mode::Jump)return;  // 돌진·점프 속도·밀려남은 그대로 둔다
  hb::Vec3 v{0,0,0};
  if(!frozen&&stun<=0){
    if(mode==Mode::Chase)v=(detour>0?detourDir:dir)*Speed;
    else if(mode==Mode::Prowl){  // 보스: 플레이어 둘레 5m를 돌며 거리를 맞춤 (그냥 다가오기만 하지 않게)
      const hb::Vec3 side=Rotate(dir,ring%2?90.f:-90.f);v=hb::VectorMath::NormalizeVector(side+dir*std::clamp((distance-5)*0.5f,-1.f,1.f))*Speed;}
    else if(mode==Mode::Range){const float side=distance>KeepDistance+1?1.f:distance<KeepDistance-1?-1.f:0.f;v=dir*(Speed*side);}
  }
  if(Length(v-sentVelocity)>0.05f||++velocityAge>=10){sentVelocity=v;velocityAge=0;hb::Physics::SetVelocity(this,v);}  // 벽에 막혀 줄어든 속도도 가끔 다시 맞춘다
  // 막힘 확인 (0.2초마다): 가려는데 거의 못 움직였으면 0.7초 동안 왼쪽이나 오른쪽으로 비켜 돈다
  if(detour>0)detour-=delta;
  if(++stuckAge>=12){stuckAge=0;
    if(Length(v)>1&&detour<=0&&Length(hb::Physics::GetVelocity(this))<Length(v)*0.3f){detour=0.7f;detourDir=Rotate(dir,std::rand()%2?80.f:-80.f);}}
}

// 대기 중(화면 밖, 상태 머신 멈춤)이면 늦게 들어온 상태 이벤트는 무시
void Enemy::Halt(){if(Parked)return;mode=Mode::Halt;sentVelocity={0,0,0};hb::Physics::SetVelocity(this,hb::Vec3{0,0,0});}
void Enemy::Chase(){if(Parked)return;mode=Mode::Chase;Tint(false);}
void Enemy::Range(){if(Parked)return;mode=Mode::Range;}
void Enemy::Stagger(){if(Parked)return;mode=Mode::Stagger;}

void Enemy::Windup(){if(Parked)return;
  // 공격 예고: 멈추고 붉게. 보스는 돌진 방향을 정하고 붉은 예고선을 바닥에 그림
  Halt();float distance;dashDir=ToPlayer(distance);
  Tint(true);flash=0;
  if(Boss)if(auto* game=TopDownShooter::Current){game->Sfx("BossCharge");game->Warn(hb::Scene::GetPosition(this),dashDir,DashSpeed*0.45f+1,phase2?0.5f:0.8f);}
}

void Enemy::NextPattern(int next){pattern=next;hb::States::SetFloat(this,"Next",float(pattern));}

void Enemy::Prowl(){if(Parked)return;mode=Mode::Prowl;ring++;Tint(false);}

void Enemy::JumpWindup(){if(Parked)return;
  // 점프 준비: 웅크리고, 내려찍을 자리(지금 플레이어 자리)에 붉은 마법진
  Halt();jumpTarget=TopDownShooter::Current?TopDownShooter::Current->PlayerPosition():hb::Scene::GetPosition(this);
  if(auto* game=TopDownShooter::Current){game->Effect("Spawn",hb::Vec3{jumpTarget.x,jumpTarget.y-0.5f,0.02f},0,1.f);game->Sfx("BossCharge");}
}

void Enemy::Jump(){if(Parked)return;if(TopDownShooter::Current&&TopDownShooter::Current->Frozen()){Halt();return;}
  // 뛰어오름: 흙먼지, 0.6초에 착지 자리로 (공중에선 몸통 박치기 없음)
  mode=Mode::Jump;if(auto* game=TopDownShooter::Current)game->Effect("Dust",hb::Scene::GetPosition(this)+hb::Vec3{0,-1.2f,0});
  sentVelocity=(jumpTarget-hb::Scene::GetPosition(this))*(1/0.6f);sentVelocity.z=0;hb::Physics::SetVelocity(this,sentVelocity);
}

void Enemy::Slam(){if(Parked)return;
  Halt();
  if(auto* game=TopDownShooter::Current)game->BossSlam(hb::Scene::GetPosition(this),phase2?20:14,ShotSpeed*0.9f,ShotClip);
  NextPattern(3);
}

void Enemy::Fire(){if(Parked)return;
  Halt();Tint(false);
  auto* game=TopDownShooter::Current;if(!game||game->Frozen())return;
  float distance;const auto dir=ToPlayer(distance);
  game->FireBullets(hb::Scene::GetPosition(this),dir,ShotCount,ShotSpread,ShotSpeed,ShotClip);
  shotTimer=ShotInterval;
}

void Enemy::Dash(){if(Parked)return;if(TopDownShooter::Current&&TopDownShooter::Current->Frozen()){Halt();return;}
  mode=Mode::Dash;Tint(false);
  sentVelocity=dashDir*DashSpeed;hb::Physics::SetVelocity(this,sentVelocity);
  // 보스는 연속 돌진 (2번, 분노하면 3번) 뒤 다음 패턴
  const bool again=Boss&&++dashCount<(phase2?3:2);hb::States::SetBool(this,"Again",again);
  if(!again){dashCount=0;NextPattern(1);}
  if(auto* game=TopDownShooter::Current)game->Effect("Dust",hb::Scene::GetPosition(this)+hb::Vec3{0,-1,0});
}

void Enemy::Ring(){if(Parked)return;
  // 나선 탄막: 세 번 쏘며 매번 12도씩 돌려서 소용돌이처럼 (분노하면 더 촘촘히)
  Halt();auto* game=TopDownShooter::Current;
  if(game&&!game->Frozen())game->FireRing(hb::Scene::GetPosition(this),RingCount,ring*12.f,ShotSpeed,ShotClip);
  if(++ring%3==0)NextPattern(2);
}

void Enemy::Summon(){if(Parked)return;
  Halt();const auto at=hb::Scene::GetPosition(this);
  for(int i=0;i<SummonCount+(phase2?1:0);++i){hb::Transform t;t.position=at+hb::Vec3{i%2?2.5f:-2.5f,-1.5f-i/2,0};
    if(auto* game=TopDownShooter::Current)if(auto* e=game->SpawnEnemy(SummonBlueprint,t.position,false))e->Stun(0.5f);}
  NextPattern(0);
}

void Enemy::Stun(float seconds){stun=std::max(stun,seconds);sentVelocity={0,0,0};hb::Physics::SetVelocity(this,hb::Vec3{0,0,0});}

bool Enemy::TakeHit(float damage,const hb::Vec3& push,float stunSeconds,float burnSeconds){
  if(!Invulnerable){Hp-=damage;if(burnSeconds>0){burnLeft=burnSeconds;}}
  // 맞은 순간 하얗게 번쩍, 보스가 아니면 밀려나며 잠깐 경직(상태 머신이 맞는 그림)
  if(flash<=0){hb::Sprites::Flash(this,0.08f,Boss?0.45f:0.65f);flash=Boss?0.2f:0.1f;}  // 연타 중엔 번쩍임을 띄엄띄엄 (계속 하얗게 덮이지 않게)
  if(!Boss){stun=std::max(stun,stunSeconds);sentVelocity=push;hb::Physics::SetVelocity(this,sentVelocity);}
  else if(!phase2&&Hp<=MaxHp*0.5f&&Hp>0.001f){  // 보스 2페이즈: 체력 절반 아래면 분노 (빨라지고 탄이 늘어남)
    phase2=true;Speed*=1.25f;DashSpeed*=1.15f;RingCount+=4;if(auto* game=TopDownShooter::Current)game->BossEnraged(this);}
  return Hp<=0.001f;  // 소수 오차로 0에 못 닿는 경우
}
