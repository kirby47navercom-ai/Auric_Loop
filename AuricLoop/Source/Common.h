#pragma once
#include "TopDownShooter.h"
#include <cmath>

// 여러 .cpp가 함께 쓰는 작은 도우미 (수학·이름표·입력)
inline const char* koreanNames[]={"발렌","셰리","알레아"};
inline const char* faces[]={"valen","sherry","alea"};
inline const char* weapons[]={"검","활","지팡이"};
inline float Length(const hb::Vec3& v){return std::sqrt(hb::VectorMath::VectorLengthSquared(v));}
inline hb::Vec3 Normal(const hb::Vec3& v,const hb::Vec3& fallback){const float l=Length(v);return l>.01f?v*(1/l):fallback;}
inline hb::Vec3 Rotate(const hb::Vec3& v,float degrees){const float r=degrees*3.14159265f/180,c=std::cos(r),s=std::sin(r);return {v.x*c-v.y*s,v.x*s+v.y*c,0};}
inline float Angle(const hb::Vec3& d){return std::atan2(d.y,d.x)*180/3.14159265f;}
inline const hb::Vec3 parked{0,-200,0};

// 아무 키·마우스 버튼·터치를 이번 프레임에 눌렀는지. 일시정지·운영자 키는 빼고, move=false면 이동 키도 뺀다 (대화 중 걷다가 넘어가지 않게)
inline bool AnyPressed(bool move){
  if(!hb::Input::AnyKeyPressed())return false;
  for(auto* k:{"escape","p","tab","F3","F9","F10","F12"})if(hb::Input::WasPressedThisFrame(k))return false;
  if(!move)for(auto* k:{"w","a","s","d"})if(hb::Input::WasPressedThisFrame(k))return false;
  return true;
}
