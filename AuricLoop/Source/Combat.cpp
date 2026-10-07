#include "Common.h"
#include <algorithm>
#include <map>
#include <random>
#include <set>
#include <sstream>
#include <string>

// =====================================================================================
// 게임 규칙
// =====================================================================================

std::vector<Enemy*> TopDownShooter::Enemies() const{
  std::vector<Enemy*> list;
  for(auto* a:hb::Scene::GetAllActorsOfClass("Enemy"))if(auto* e=dynamic_cast<Enemy*>(a))if(!e->Parked)list.push_back(e);
  return list;
}

// 적도 탄처럼 장면(Dungeon)에 화면 밖으로 세워 둔 것을 꺼내 쓴다 (태그 Enemy.S·M·C). Scene::Spawn은 한 마리에 수십 ms라 웨이브마다 끊김
Enemy* TopDownShooter::SpawnEnemy(const std::string& blueprint,const hb::Vec3& at,bool invulnerable){
  std::string code;for(const auto& entry:rules->Enemies){const auto eq=entry.find('=');if(eq!=std::string::npos&&entry.substr(eq+1)==blueprint)code=entry.substr(0,eq);}
  Enemy* e=nullptr;
  if(!code.empty())for(auto* a:hb::Scene::GetActorsWithTag("Enemy."+code))if(auto* p=dynamic_cast<Enemy*>(a))if(p->Parked){e=p;break;}
  if(e){hb::Transform t;t.position=at;hb::Scene::SetTransform(e,t);e->Parked=false;e->Invulnerable=invulnerable;e->Awake();}
  else{hb::Transform t;t.position=at;e=dynamic_cast<Enemy*>(hb::Scene::Spawn(blueprint,t));if(e)e->Invulnerable=invulnerable;}  // 모자랄 때만 (끊김 감수)
  return e;
}

void TopDownShooter::ParkEnemy(Enemy* e){
  e->CancelAttack();
  const bool pooled=hb::Tags::Has(e,"Enemy.S",true)||hb::Tags::Has(e,"Enemy.M",true)||hb::Tags::Has(e,"Enemy.C",true);
  if(!pooled){hb::Scene::Destroy(e);return;}
  if(e->brainRunning){hb::States::Stop(e);e->brainRunning=false;}
  hb::Physics::SetVelocity(e,hb::Vec3{0,0,0});e->Parked=true;e->burnLeft=0;
  hb::Scene::SetPosition(e,hb::Vec3{-60.f+float(std::rand()%120),-300.f-float(std::rand()%20),0});
}

float TopDownShooter::WeaponDamage() const{
  const float base=Character==1?rules->ArrowDamage:Character==2?rules->BoltDamage:rules->SwordDamage;
  return base*(1+rules->UpgradeBonus*WeaponLevel)*(Enchant==1?1+rules->EnchantPower:1)*(Fatigue*4>=FatigueMax*3?rules->TiredAttack:1.f);  // 지치면 약해짐
}

bool TopDownShooter::DamagePlayer(int amount,const hb::Vec3& from){
  // 맞으면: 무적 시간 동안 깜빡임, 맞은 반대쪽으로 살짝 밀려남, 붉게 번쩍·화면 흔들림
  if(invulnerable>0||dodgeTimer>0||Hp<=0)return false;
  Hp-=amount;invulnerable=rules->InvulnerableTime;Sfx("Hurt");if(Hp<=0){Hp=0;gameOver=rules->RespawnDelay;}
  knock=Normal(playerAt-from,hb::Vec3{0,-1,0})*rules->HurtKnockback;knockTimer=0.12f;shake=rules->ShakeTime*2;
  Tip(2);hb::Sprites::Flash(player,0.15f,1.f);Effect("HurtClaw",hb::Vec3{playerAt.x,playerAt.y+0.6f,0.3f});
  hb::Camera::Flash(hb::Color{0.7f,0.05f,0.05f,0.3f},0.18f);Hud();
  return true;
}

// 적 탄 패턴 (엔진 탄막 시스템). 탄 그림은 클립 SA_<이름>의 첫 장 S_<이름>_0 한 장, 맞는 대상은 플레이어(무적이 아닐 때)·방 벽·발렌 베기
static hb::Json ShotPattern(const AuricRules* rules,const hb::Vec3& origin,int count,float speed,const std::string& clip){
  const std::string c=clip.empty()?rules->EnemyShotClip:clip;
  const auto a=c.rfind("SA_"),b=c.rfind(".hbspriteanimation");
  const std::string name=a==std::string::npos||b==std::string::npos||b<a?"EnemyOrb":c.substr(a+3,b-a-3);
  return {{"origin",{origin.x,origin.y,0.15f}},{"count",count},{"speed",speed},{"lifetime",rules->EnemyShotLife},{"radius",rules->EnemyShotRadius},
    {"size",name=="BossOrb"?0.63f:0.44f},{"plane","XY"},{"texture","Assets/Sprites/FX/S_"+name+"_0.hbsprite.json"},
    {"targetTags",{"Player.Hittable","Dungeon.Cap","Dungeon.Face","Dungeon.Gate","Dungeon.GateSide","ShotGuard"}}};
}

void TopDownShooter::FireBullets(const hb::Vec3& from,const hb::Vec3& dir,int count,float spread,float speed,const std::string& clip){
  auto p=ShotPattern(rules,from+dir*0.6f,count,speed,clip);
  p["mode"]=count>1?"fan":"aim";p["direction"]={dir.x,dir.y,0};p["spread"]=std::min(360.f,spread*(count-1));  // 우리 spread는 탄 사이 각도, 엔진은 전체 각도
  pendingShots.push_back(std::move(p));Shots+=count;
}

void TopDownShooter::FireRing(const hb::Vec3& from,int count,float angle,float speed,const std::string& clip){
  auto p=ShotPattern(rules,from,count,speed,clip);p["mode"]="circle";p["angle"]=angle;
  pendingShots.push_back(std::move(p));Shots+=count;
}

void TopDownShooter::DropCoin(const hb::Vec3& at,int value){
  hb::Transform t;t.position=hb::Vec3{at.x,at.y,0.05f};
  if(auto* c=Take(coinPool,rules->CoinPrefab,t)){coins[c]=value;hb::Sprites::PlayAnimation(c,rules->CoinClip,true);}else Gold+=value;
}

void TopDownShooter::StunAll(float seconds){for(auto* e:Enemies())e->Stun(seconds);}

// 탄·골드·베기 이펙트는 장면에 미리 놓아 두고(태그 Pool.*) 화면 밖에 세워 둔다. 꺼내기·돌려놓기는 옮기기만 한다.
// 실행 중 생성(Scene::Spawn)과 엔진 풀(ActorPool)은 부를 때마다 컴포넌트를 다시 시작해 수 ms~수십 ms가 걸려 프레임이 끊긴다

hb::Actor* TopDownShooter::Take(std::vector<hb::Actor*>& pool,const std::string& prefab,const hb::Transform& at){
  if(!pool.empty()){auto* a=pool.back();pool.pop_back();hb::Scene::SetTransform(a,at);return a;}
  (void)prefab;return nullptr;  // 다 쓰고 있으면 이번 것은 건너뛴다. 게임 중 새로 만들면(Spawn) 에디터에서 하나에 수백 ms씩 멈춤
}

void TopDownShooter::Give(std::vector<hb::Actor*>& pool,hb::Actor* actor){
  if(&pool==&bulletPool||&pool==&shotPool)hb::Physics::SetVelocity(actor,hb::Vec3{0,0,0});  // 골드·이펙트는 물리 몸체가 없다
  hb::Scene::SetPosition(actor,parked);pool.push_back(actor);
}

void TopDownShooter::PlayFx(const std::string& clip,float length,const hb::Vec3& at,float angle,float glow,bool flipX,bool flipY){
  hb::Transform t;t.position=at;t.rotation=hb::Vec3{0,0,angle};
  auto* a=Take(fxPool,rules->FxPrefab,t);if(!a)return;
  hb::Components::SetFloat(a,"SpriteRenderer","emissiveIntensity",glow);hb::Sprites::SetFlip(a,flipX,flipY);hb::Sprites::PlayAnimation(a,clip,false);
  fxs.push_back(Fx{a,length});
}

void TopDownShooter::Effect(const std::string& name,const hb::Vec3& at,float angle,float glow,bool flip){
  static const std::map<std::string,float> length={{"Dust",0.24f},{"BoneBurst",0.24f},{"Shockwave",0.26f},{"Muzzle",0.12f},{"CardCast",0.15f},
    {"HurtClaw",0.15f},{"CoinSparkle",0.18f},{"Spawn",0.9f},{"Hit",0.16f}};
  const auto it=length.find(name);
  PlayFx("Assets/Animations/SA_"+name+".hbspriteanimation.json",it!=length.end()?it->second:0.3f,at,angle,glow,flip);
}

void TopDownShooter::Warn(const hb::Vec3& from,const hb::Vec3& dir,float length,float seconds,float width){
  // 돌진 예고선: 장면에 놓아 둔 붉은 띠(Pool.Warn)를 돌진 방향으로 돌려 길이만큼 깔았다가 치움
  if(warnPool.empty())return;auto* a=warnPool.back();warnPool.pop_back();
  hb::Transform t;t.position=from+dir*(length/2);t.position.z=0.02f;t.rotation=hb::Vec3{0,0,Angle(dir)};hb::Scene::SetTransform(a,t);
  hb::Sprites::SetSize(a,hb::Vec2{length,width});warns.push_back({a,seconds});
}

void TopDownShooter::BossSlam(const hb::Vec3& at,int count,float speed,const std::string& clip){
  // 내려찍기: 충격파·흙먼지, 원형 탄, 크게 흔들림. 가까이 있으면 맞음
  Effect("Shockwave",hb::Vec3{at.x,at.y-0.8f,0.03f},0,0.4f);Effect("Dust",hb::Vec3{at.x-1,at.y-1,0.03f});Effect("Dust",hb::Vec3{at.x+1,at.y-1,0.03f},0,0,true);
  shake=0.45f;Sfx("Boom");
  FireRing(at,count,0,speed,clip);
  if(Length(playerAt-at)<3.0f)DamagePlayer(1,at);
}

void TopDownShooter::BossEnraged(Enemy* e){
  // 2페이즈: 포효(흔들림·붉은 번쩍), 자막
  shake=0.6f;hb::Camera::Flash(hb::Color{0.8f,0.1f,0.05f,0.45f},0.5f);Sfx("BossCharge");
  UiText("BossSub",e->DisplayName+"이(가) 분노했다!");UiVisible("BossSub",true);bannerTime=1.8f;
}

void TopDownShooter::UpdateFx(float delta){
  for(auto it=warns.begin();it!=warns.end();)
    if((it->left-=delta)<=0){hb::Scene::SetPosition(it->actor,hb::Vec3{0,-200,0});warnPool.push_back(it->actor);it=warns.erase(it);}else ++it;
  for(auto it=fxs.begin();it!=fxs.end();)
    if((it->left-=delta)<=0){Give(fxPool,it->actor);it=fxs.erase(it);}else ++it;
}

void TopDownShooter::Prewarm(){
  bulletPool=hb::Scene::GetActorsWithTag("Pool.EnemyShot");
  shotPool=hb::Scene::GetActorsWithTag("Pool.PlayerShot");
  // 발렌 베기용 탄 지우개: 플레이어 탄 하나를 빌려 투명하게 (투명도는 렌더 재질을 다시 만들어서 로딩 중 한 번만)
  if(!shotGuard&&!shotPool.empty()){shotGuard=shotPool.back();shotPool.pop_back();hb::Tags::Add(shotGuard,"ShotGuard");
    hb::Sprites::SetColor(shotGuard,hb::Color{1,1,1,0});hb::Scene::SetPosition(shotGuard,hb::Vec3{-500,-500,0});}
  coinPool=hb::Scene::GetActorsWithTag("Pool.Coin");
  fxPool=hb::Scene::GetActorsWithTag("Pool.Fx");warnPool=hb::Scene::GetActorsWithTag("Pool.Warn");
  for(auto* tag:{"Enemy.S","Enemy.M","Enemy.C"})for(auto* a:hb::Scene::GetActorsWithTag(tag))if(auto* e=dynamic_cast<Enemy*>(a))ParkEnemy(e);
}

void TopDownShooter::KillEnemy(Enemy* e){
  const auto at=hb::Scene::GetPosition(e);Kills++;Sfx("Kill");if(waveAlive>0)waveAlive--;
  DropCoin(at,e->GoldMin+Kills%std::max(1,e->GoldMax-e->GoldMin+1));
  if(e->Boss){HasReturnItem=true;Monster++;boss=nullptr;BossHp=0;Hud();Tip(7);}
  if(monsterDrop&&fightingRoom>=0&&pending.empty()&&wave+1>=waves.size()&&Enemies().size()<=1){Monster++;Tip(5);}  // 이 방 마지막 해골은 마물 소재 확정
  PlayFx(e->DeathClip,0.9f,at,0,0,e->Flipped());  // 쓰러지는 그림은 이펙트로 (적은 바로 화면 밖 대기로)
  Effect("BoneBurst",hb::Vec3{at.x,at.y+0.2f,0.3f});shake=std::max(shake,rules->ShakeTime*1.5f);
  ParkEnemy(e);
}

bool TopDownShooter::HitEnemy(Enemy* e,const hb::Vec3& push,float damage){
  Hits++;Sfx("Hit");
  const bool crit=std::rand()%10000<int(rules->CritChance*100);  // 크리티컬: 피해 2배, 불꽃 두 겹·크게 흔들림
  if(crit){damage*=rules->CritDamage;const auto c=hb::Scene::GetPosition(e);Effect("Hit",hb::Vec3{c.x,c.y+0.4f,0.31f},45,2.f);shake=rules->ShakeTime*3;}
  // 타격감: 맞은 자리에 불꽃, 화면 살짝 흔들림, 밀려남
  const auto at=hb::Scene::GetPosition(e);
  PlayFx(rules->HitClip,0.16f,hb::Vec3{at.x-push.x*0.3f,at.y-push.y*0.3f+0.2f,0.3f},float(std::rand()%360),1.5f,false);
  shake=rules->ShakeTime;
  const bool dead=e->TakeHit(Returning?0:damage,push*rules->Knockback,rules->HitStun,Enchant==2?rules->BurnTime:0);
  if(Enchant==2)e->burnDamage=WeaponDamage()*rules->BurnRate;
  if(e->Boss)BossHp=e->Hp;
  if(dead)KillEnemy(e);
  return dead;
}

void TopDownShooter::Slash(const hb::Vec3& position,const std::vector<Enemy*>& enemies){
  // 검 부채꼴 베기: 적에게 피해, 범위 안의 적 탄은 지움 (기획: 투사체 삭제)
  attackCooldown=rules->SwordInterval;Swings++;attackAnim=0.3f;Sfx("Slash");
  PlayFx(rules->SlashClip,0.2f,position+facing*0.9f+hb::Vec3{0,0.2f,0.2f},Angle(facing),0.5f,false,(Swings&1)!=0);  // 번갈아 위·아래로 벰  // 캐릭터 그림과 따로, 공격 방향으로 돌린 베기
  const float minDot=std::cos(rules->SwordHalfAngle*3.14159265f/180),reach=rules->SwordRange+(Enchant==3?rules->SlashExtend:0);
  auto inFan=[&](const hb::Vec3& at,float radius){const auto d=at-position;const float len=Length(d);
    return len<=reach+radius&&(len<=radius+0.75f||hb::VectorMath::DotProduct(d*(1/len),facing)>=minDot);};  // 바로 붙은 적은 방향과 관계없이 맞음
  for(auto* e:enemies){const auto at=hb::Scene::GetPosition(e);if(!inFan(at,e->Boss?e->Radius:0))continue;
    HitEnemy(e,Normal(at-position,facing),WeaponDamage());}
  HitReturnGate(position,rules->DoorReach,1);
  // 앞쪽 부채꼴을 덮는 투명 상자를 잠깐 놓아 그 안의 적 탄을 지운다 (탄막 시스템이 상자를 맞은 것으로 치고 없앰)
  if(shotGuard){hb::Transform t;t.position=position+facing*(reach*0.5f);t.position.z=0.15f;t.rotation=hb::Vec3{0,0,Angle(facing)};
    t.scale=hb::Vec3{(reach*0.5f+0.3f)/0.07f,(reach*0.75f)/0.07f,1};hb::Scene::SetTransform(shotGuard,t);guardTime=0.12f;}
}

void TopDownShooter::Shoot(const hb::Vec3& from){
  hb::Transform t;t.position=from+facing*0.8f;t.position.z=0.2f;t.rotation=hb::Vec3{0,0,Angle(facing)};
  auto* s=Take(shotPool,rules->PlayerShotPrefab,t);if(!s)return;
  hb::Sprites::PlayAnimation(s,Character==1?rules->ArrowClip:rules->CardClip,true);
  Effect(Character==1?"Muzzle":"CardCast",from+facing*1.0f+hb::Vec3{0,0.3f,0.25f},Angle(facing),1.f);Sfx(Character==1?"Arrow":"Bolt");
  hb::Physics::SetVelocity(s,facing*(Character==1?rules->ArrowSpeed:rules->BoltSpeed));
  shots[s]=rules->PlayerShotLife;shotBoom[s]=false;Swings++;
}

void TopDownShooter::UpdateShots(float delta,const std::vector<Enemy*>& enemies){
  std::vector<hb::Actor*> done;
  for(auto& [s,life]:shots){life-=delta;
    if(shotBoom[s]){if(life<=0)done.push_back(s);continue;}  // 폭발 그림을 잠깐 보여 주고 반환
    const auto p=hb::Scene::GetPosition(s);const auto dir=Normal(hb::Physics::GetVelocity(s),facing);
    const int in=fightingRoom>=0?fightingRoom:area;  // 싸우는 방(문이 잠김) 벽에 막힘
    bool wall=inDungeon&&in>=0&&!map.rooms[in].Inside(p,0.2f),hit=false;
    if(Returning&&returnRoom>=0&&map.Locked(returnRoom,returnDir)&&Length(map.DoorPosition(returnRoom,returnDir)-p)<1.5f){
      HitReturnGate(p,1.5f,Character==1?rules->ArrowDoorHits:1);wall=true;}
    for(auto* e:enemies){if(wall||(hit&&Enchant!=3))break;
      if(Length(hb::Scene::GetPosition(e)-p)<rules->PlayerShotHit+(e->Boss?e->Radius:0)){HitEnemy(e,dir,WeaponDamage());hit=true;if(e->Boss)wall=true;}}
    if(!wall&&!(hit&&Enchant!=3)&&life>0)continue;  // 각인 관통(3)이면 적을 뚫고 벽·문·보스에서 멈춤
    if(Character!=2){done.push_back(s);continue;}
    // 알레아 마탄: 작은 폭발로 주변 적에게 피해
    hb::Physics::SetVelocity(s,hb::Vec3{0,0,0});hb::Sprites::PlayAnimation(s,rules->BoomClip,false);Sfx("Boom");shotBoom[s]=true;life=0.25f;
    for(auto* e:Enemies()){const auto d=hb::Scene::GetPosition(e)-p;const float len=Length(d);
      if(len<rules->BoomRadius&&len>0.05f)HitEnemy(e,d*(1/len),rules->BoomDamage*WeaponDamage()/rules->BoltDamage);}
  }
  for(auto* s:done){Give(shotPool,s);shots.erase(s);shotBoom.erase(s);}
}

void TopDownShooter::Separate(const std::vector<Enemy*>& list,const hb::Vec3& player){
  // 적 몸은 서로 밀지 않아서 한 자리에 겹쳐 쌓인다. 겹친 만큼 반씩 벌리고, 플레이어 위로 올라온 적은 밖으로 민다
  std::vector<hb::Vec3> at;at.reserve(list.size());for(auto* e:list)at.push_back(hb::Scene::GetPosition(e));
  std::vector<bool> moved(list.size(),false);
  for(size_t i=0;i<list.size();++i){
    for(size_t j=i+1;j<list.size();++j){
      auto d=at[i]-at[j];d.z=0;const float len=Length(d),need=list[i]->Radius+list[j]->Radius;
      if(len>=need)continue;
      const auto n=len>0.01f?d*(1/len):Rotate(hb::Vec3{1,0,0},float(i*97%360));const float push=(need-len)*0.5f;
      const float wi=list[i]->Boss?0.f:1.f,wj=list[j]->Boss?0.f:1.f,sum=std::max(0.01f,wi+wj);  // 보스는 밀리지 않음
      at[i]=at[i]+n*(2*push*wi/sum);at[j]=at[j]-n*(2*push*wj/sum);moved[i]=moved[i]||wi>0;moved[j]=moved[j]||wj>0;}
    if(list[i]->Boss)continue;
    auto d=at[i]-player;d.z=0;const float len=Length(d),need=list[i]->Radius*0.6f;  // 플레이어와는 반쯤 겹쳐도 됨 (완전히 밀어 내면 문 앞을 막고 길을 가로막음)
    if(len<need){at[i]=at[i]+(len>0.01f?d*(1/len):hb::Vec3{1,0,0})*(need-len);moved[i]=true;}
  }
  for(size_t i=0;i<list.size();++i)if(moved[i])hb::Scene::SetPosition(list[i],at[i]);
}

void TopDownShooter::KeepInside(Enemy* e) const{
  // 돌진·도약·밀려남으로 벽을 뚫고 나간 적은 싸우는 방 안 가장 가까운 자리로 (방은 철창으로 잠겨 있음)
  if(!inDungeon||fightingRoom<0||fightingRoom>=int(map.rooms.size())||e->Parked)return;
  const auto& room=map.rooms[fightingRoom];const float m=e->Radius+0.2f;
  auto p=hb::Scene::GetPosition(e);if(room.Inside(p,m))return;
  p.x=std::clamp(p.x,room.cx-room.hw+m,room.cx+room.hw-m);p.y=std::clamp(p.y,room.cy-room.hh+m,room.cy+room.hh-m);
  hb::Scene::SetPosition(e,p);
}

void TopDownShooter::UpdateBullets(float delta,const hb::Vec3& position){
  (void)position;
  for(const auto& p:pendingShots)hb::Projectiles::Fire(p);
  pendingShots.clear();
  // 구르기·무적 중엔 플레이어 태그를 빼서 탄이 지나가게
  const bool hittable=Hp>0&&invulnerable<=0&&dodgeTimer<=0;
  if(hittable!=playerHittable){playerHittable=hittable;if(hittable)hb::Tags::Add(player,"Player.Hittable");else hb::Tags::Remove(player,"Player.Hittable");}
  for(const auto& h:hb::Projectiles::TakeHits())
    if(h.value("target","")=="Player"&&!Frozen()){const auto& at=h["position"];DamagePlayer(1,hb::Vec3{at[0].get<float>(),at[1].get<float>(),0});}
  if(guardTime>0&&(guardTime-=delta)<=0)hb::Scene::SetPosition(shotGuard,hb::Vec3{-500,-500,0});
}
