// Only snapshotNativeMetadata registers a fully validated, recursively frozen graph.
// Editor/mutable/untrusted frozen metadata keeps the live lookup path.
const snapshots=new WeakSet(),tables=new WeakMap();
export const nativeTypeSnapshot=metadata=>snapshots.has(metadata);
export function registerNativeTypeSnapshot(metadata){snapshots.add(metadata);}
function table(metadata){let value=tables.get(metadata);if(!value){value={};tables.set(metadata,value);}return value;}
function structs(metadata){const cache=table(metadata);if(!cache.structs){const names=new Map(),definitions=new WeakSet();for(const definition of metadata.structs||[]){names.set(definition.name,names.has(definition.name)?null:definition);definitions.add(definition);}cache.structs={names,definitions};}return cache.structs;}
export const indexedNativeStruct=(metadata,name)=>structs(metadata).names.get(name)||null;
export const nativeSnapshotDefinition=(metadata,definition)=>nativeTypeSnapshot(metadata)&&!!definition&&structs(metadata).definitions.has(definition);
export function indexedNativeEnum(metadata,name,source){const cache=table(metadata);if(!cache.enums){const names=new Map();for(const definition of metadata.enums||[]){let entry=names.get(definition.name);if(!entry){entry={unique:definition,sources:new Map()};names.set(definition.name,entry);}else entry.unique=null;entry.sources.set(definition.sourcePath,entry.sources.has(definition.sourcePath)?null:definition);}cache.enums=names;}const entry=cache.enums.get(name);return(source===undefined?entry?.unique:entry?.sources.get(source))||null;}
