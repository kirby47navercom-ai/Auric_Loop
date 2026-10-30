export const blueprintClasses = {
  Actor: {label:'Actor', ko:'액터', icon:'cube', base:null, components:['Transform'], kind:'empty',placeable:true},
  Pawn: {label:'Pawn', ko:'폰', icon:'pawn', base:'Actor', components:['Transform','PawnMovement'],kind:'empty', placeable:true},
  Character: {label:'Character', ko:'캐릭터', icon:'character', base:'Pawn',kind:'character', components:['Transform','CapsuleCollider','MeshRenderer','Rigidbody','CharacterMovement'], placeable:true},
  SpriteActor: {label:'Sprite Actor',ko:'스프라이트 액터',icon:'image',base:'Actor',group:'2D',dimension:'2d',kind:'sprite',components:['Transform','SpriteRenderer'],placeable:true},
  Pawn2D: {label:'Pawn 2D',ko:'2D 폰',icon:'pawn',base:'Pawn',group:'2D',dimension:'2d',kind:'sprite',components:['Transform','SpriteRenderer','BoxCollider2D','Rigidbody2D','TopDownMovement2D'],defaults:{Rigidbody2D:{useGravity:false,freezeRotation:[0,0,1]}},placeable:true},
  Character2D: {label:'Character 2D',ko:'2D 플랫폼 캐릭터',icon:'character',base:'Character',group:'2D',dimension:'2d',kind:'character2d',components:['Transform','SpriteRenderer','CapsuleCollider2D','Rigidbody2D','CharacterMovement2D'],defaults:{CapsuleCollider2D:{friction:0,frictionCombine:'min'},Rigidbody2D:{freezeRotation:[0,0,1]}},placeable:true},
  TopDownCharacter2D: {label:'Top Down Character 2D',ko:'2D 탑다운 캐릭터',icon:'character',base:'Character2D',group:'2D',dimension:'2d',kind:'character2d',components:['Transform','SpriteRenderer','CircleCollider2D','Rigidbody2D','TopDownMovement2D'],defaults:{Rigidbody2D:{useGravity:false,freezeRotation:[0,0,1]}},placeable:true},
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
