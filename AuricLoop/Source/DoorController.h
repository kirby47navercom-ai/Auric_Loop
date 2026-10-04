#include <HBEngine/Game.hpp>
using namespace hb;

HB_CLASS(Blueprintable)
class DoorController : public Actor {
public:
    HB_PROPERTY(BlueprintReadWrite)
    float OpenAngle = 90.0f;

    HB_FUNCTION(BlueprintCallable, DisplayName="문 열기", Category="Door")
    void Open(float Angle);

    HB_FUNCTION(BlueprintPure, DisplayName="문 위치", Category="Door")
    Vec3 GetDoorPosition() const;

    HB_FUNCTION(BlueprintPure, DisplayName="문 대상", Category="Door")
    DoorController* GetDoorTarget() const;

    HB_FUNCTION(BlueprintNativeEvent, DisplayName="문이 열렸을 때", Category="Door")
    void OnOpened(const Vec3& Position);
};
