import {blueprintClasses} from './class-types.js';
import {componentDefaults} from './scene-components.js';

export function blueprintClassDefinition(name,native){const seen=new Set();for(let i=0;name&&i<64;i++){if(Object.hasOwn(blueprintClasses,name))return blueprintClasses[name];if(seen.has(name))break;seen.add(name);name=native?.classes?.find(c=>c.name===name)?.base;}return null;}
export function blueprintClassComponents(name,native){const definition=blueprintClassDefinition(name,native);if(!definition)return [];return definition.components.map((type,i)=>({id:'component_'+i,name:type,type,properties:{...componentDefaults(type),...structuredClone(definition.defaults?.[type]||{})}}));}
export function blueprintClassKind(name,components=[],native){const definition=blueprintClassDefinition(name,native);if(definition?.kind)return definition.kind;if(name==='Character')return 'character';return components.some(c=>c.type==='SpriteRenderer')?'sprite':components.some(c=>c.type==='MeshRenderer')?'cube':'empty';}
