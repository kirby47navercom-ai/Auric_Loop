#include "DoorController.h"

void DoorController::Open(float Angle) {
    Scene::SetRotation(this, {0, Math::Clamp(Angle, 0, OpenAngle), 0});
    OnOpened(Scene::GetPosition(this));
}

Vec3 DoorController::GetDoorPosition() const { return transform.position; }
DoorController* DoorController::GetDoorTarget() const { return const_cast<DoorController*>(this); }
void DoorController::OnOpened(const Vec3&) { }
