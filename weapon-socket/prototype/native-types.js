export function nativeCppType(source,{enums=[],structs=[],classes=[],owner=''}={}){
 let s=source.replace(/\bconst\b|[&]/g,'').replace(/\s*::\s*/g,'::').trim(),array=false;
 const list=s.match(/^(?:std::vector|vector|Array|TArray)\s*<(.+)>$/);if(list){array=true;s=list[1].trim();}
 const find=(definitions,name)=>{name=name.replace(/^::/,'');for(let prefix=owner;prefix;prefix=prefix.includes('::')?prefix.slice(0,prefix.lastIndexOf('::')):''){const value=definitions.find(value=>value.name===prefix+'::'+name);if(value)return value;}return definitions.find(value=>value.name===name);};
 const enumeration=find(enums,s);if(enumeration)return {type:'int',array,enumName:enumeration.name};
 const structure=find(structs,s);if(structure)return {type:'record',array,structName:structure.name};
 if(s.endsWith('*')&&(find(enums,s.slice(0,-1).trim())||find(structs,s.slice(0,-1).trim())))throw Error('공개 값 자료형은 포인터 대신 값·참조로 전달하세요.');
 const key=s.replace(/^hb::/,''),type={bool:'bool',int:'int',int32:'int',int32_t:'int','std::int32_t':'int',float:'float',double:'float','std::string':'string',string:'string',String:'string',FString:'string',Vec2:'vec2',Vector2:'vec2',FVector2D:'vec2',Vec3:'vec3',Vector3:'vec3',FVector:'vec3',Color:'color',LinearColor:'color',FLinearColor:'color',Transform:'transform',FTransform:'transform',HitResult:'hit',FHitResult:'hit'}[key]||(key.endsWith('*')?'object':null);
 if(!type)throw Error('지원하지 않는 공개 자료형: '+s);
 const pointer=key.endsWith('*')?key.slice(0,-1).trim():null,reflected=pointer&&find(classes.map(c=>({name:c.cppName||c.name,shortName:c.name})),pointer);
 return {type,array,...pointer?{className:reflected?.shortName||pointer}:{}};
}
