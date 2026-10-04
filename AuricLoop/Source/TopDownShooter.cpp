#include "TopDownShooter.h"
void TopDownShooter::Update(float delta,const std::vector<hb::Actor*>& bullets,const std::vector<hb::Actor*>& enemies){
  for(auto it=lifetime.begin();it!=lifetime.end();){it->second-=delta;if(it->second<=0){hb::ActorPool::Release(it->first);it=lifetime.erase(it);}else ++it;}
  auto* player=hb::Gameplay::GetPlayerPawn();if(!player)return;
  const auto position=hb::Scene::GetPosition(player);
  hb::Vec3 direction{hb::Input::GetAxis("d")-hb::Input::GetAxis("a"),hb::Input::GetAxis("w")-hb::Input::GetAxis("s"),0};
  if(hb::VectorMath::VectorLengthSquared(direction)>.01f)facing=hb::VectorMath::NormalizeVector(direction);
  hb::Vec3 aim;if(hb::Input::GetMouseWorldPosition(hb::Vec3{0,0,1},position,aim)){
    direction=aim-position;if(hb::VectorMath::VectorLengthSquared(direction)>.01f)facing=hb::VectorMath::NormalizeVector(direction);
  }
  hb::Sprites::SetFlip(player,facing.x<0,false);
  cooldown-=delta;if(hb::Input::IsKeyDown("LeftMouseButton")&&cooldown<=0){
    hb::Transform spawn;spawn.position=position+facing*.55f;
    if(auto* bullet=hb::ActorPool::Acquire(bullets,spawn)){hb::Physics::SetVelocity(bullet,facing*12);lifetime[bullet]=1.5f;cooldown=.09f;}
  }
  for(auto* enemy:enemies){if(!hb::ActorPool::IsActive(enemy))continue;
    const auto enemyPosition=hb::Scene::GetPosition(enemy);hb::Physics::SetVelocity(enemy,hb::VectorMath::NormalizeVector(position-enemyPosition)*1.2f);
    for(auto* bullet:bullets)if(hb::ActorPool::IsActive(bullet)&&hb::VectorMath::DistanceSquared(enemyPosition,hb::Scene::GetPosition(bullet))<.25f){
      hb::ActorPool::Release(bullet);lifetime.erase(bullet);hb::ActorPool::Release(enemy);lifetime[enemy]=2;break;
    }
  }
  for(auto* enemy:enemies)if(!hb::ActorPool::IsActive(enemy)&&lifetime.find(enemy)==lifetime.end()){
    hb::Transform spawn;spawn.position=hb::Vec3{-6,4,.1f};hb::ActorPool::Acquire(std::vector<hb::Actor*>{enemy},spawn);
  }
}
