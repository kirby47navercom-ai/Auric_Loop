import {rayOutputInstructions} from './ray-program-liveness.js';
import {rayProgramFieldMask} from './ray-materials.js';
// Resolve register versions/output overwrites before asking whether a value
// depends on committed UV/time/world/normal/view inputs.
export function rayFieldUsesFrame(program,field,channels=[0,1,2,3]){
 if(!Number.isInteger(field)||field<0||field>9||!Array.isArray(channels)||channels.some(c=>!Number.isInteger(c)||c<0||c>3))throw Error('이전 표면 의존성 필드를 확인하세요.');
 if(!(rayProgramFieldMask(program)&(1<<field)))return false;
 const live=rayOutputInstructions(program.instructions,channels);
 return program.instructions.some((i,n)=>live.has(n)&&i[0]>=1&&i[0]<=5);
}
export const rayHistoryValueFields=Object.freeze([0,1,2,4,5,6,7,8,9]);
export const rayGuidePreviousFields=programs=>rayHistoryValueFields.filter(field=>programs.some(p=>rayFieldUsesFrame(p,field)));
export const rayPreviousProgramRequired=p=>!!(rayProgramFieldMask(p)&8)||rayHistoryValueFields.some(field=>rayFieldUsesFrame(p,field));

// Animated visibility/emission changes affect paths that never hit that surface.
// Keep the global reset for those channels and for CPU-only/transparent graphs.
export function rayMaterialTimeHistoryCompatible(material){
 const field=(index,channels)=>!!material.programs[index]?.length&&rayFieldUsesFrame({fields:[index],instructions:material.programs[index]},index,channels);
 return !material.cpuTimeDependent&&!material.transmission&&!field(1,[3])&&!field(2,[0,1,2]);
}
