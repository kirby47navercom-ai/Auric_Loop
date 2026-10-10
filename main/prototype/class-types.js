export const blueprintClasses = {
  Actor: {label:'Actor', ko:'액터', icon:'cube', base:null, components:['Transform','MeshRenderer'], placeable:true},
  Pawn: {label:'Pawn', ko:'폰', icon:'pawn', base:'Actor', components:['Transform','MeshRenderer','PawnMovement'], placeable:true},
  Character: {label:'Character', ko:'캐릭터', icon:'character', base:'Pawn', components:['Transform','CapsuleCollider','MeshRenderer','Rigidbody','CharacterMovement'], placeable:true},
  Controller: {label:'Controller', ko:'컨트롤러', icon:'controller', base:'Actor', components:[], placeable:false},
  PlayerController: {label:'Player Controller', ko:'플레이어 컨트롤러', icon:'controller', base:'Controller', components:['PlayerController'], placeable:false},
  AIController: {label:'AI Controller', ko:'AI 컨트롤러', icon:'controller', base:'Controller', components:['AIController'], placeable:false},
  GameMode: {label:'Game Mode', ko:'게임 모드', icon:'game', base:'Actor', components:['GameMode'], placeable:false},
  GameState: {label:'Game State', ko:'게임 상태', icon:'game', base:'Actor', components:['GameState'], placeable:false},
  GameInstance: {label:'Game Instance', ko:'게임 인스턴스', icon:'game', base:'Actor', components:[], placeable:false},
  PlayerState: {label:'Player State', ko:'플레이어 상태', icon:'pawn', base:'Actor', components:['PlayerState'], placeable:false},
  Component: {label:'Actor Component', ko:'액터 컴포넌트', icon:'component', base:null, components:[], placeable:false},
  SceneComponent: {label:'Scene Component', ko:'씬 컴포넌트', icon:'layers', base:'Component', components:['Transform'], placeable:false}
};
export function derivesFrom(type,base){for(let next=type;next;next=blueprintClasses[next]?.base)if(next===base)return true;return false;}
