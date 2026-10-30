// Layout metadata is separate from mutable atlas literals. Old zero metadata
// keeps the dynamic selector; new authored channel pins opt into a fixed lane.
export const rayChannelLayoutContract=Object.freeze({version:1,opcode:6,legacy:'metadata [0,0,0] keeps the atlas selector dynamic',fixed:'metadata [lane,1,0], integer lane0..3, selects an authored pin; vector input remains mutable',cache:'fixed lane participates in program identity; changing the authored pin rebuilds the program, changing ordinary values does not',compatibility:'11-integer layout and 12-float atlas instruction sizes unchanged; current native/mobile reader accepts both forms; older binaries require rebuilding for fixed metadata',resources:'no additional GPU resource, target, readback, worker or persistent cache'});
export function rayChannelMetadata(instruction){
 const lane=instruction[8];
 return instruction[0]===6&&Number.isInteger(lane)&&lane>=0&&lane<4?[lane,1,0]:[0,0,0];
}
export function rayStaticChannel(instruction){
 if(instruction[0]!==6)return null;
 const [lane,fixed,reserved]=instruction.slice(8,11);
 if(lane===0&&fixed===0&&reserved===0)return null;
 if(fixed!==1||reserved!==0||!Number.isInteger(lane)||lane<0||lane>3)throw Error('광선 채널 선택 메타데이터를 확인하세요.');
 return lane;
}
