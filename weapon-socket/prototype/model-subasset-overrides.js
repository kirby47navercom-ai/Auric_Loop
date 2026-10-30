export function applyModelOverrides(group,rows,{trustedIndices=false}={}){
 const byObjectId=new Map(),byIndex=new Map(),byName=new Map(),counts=new Map();
 const add=(map,key,object)=>{if(key===undefined)return;const list=map.get(key)||[];list.push(object);map.set(key,list);};
 group.traverse(object=>{
  if(!object.isMesh&&!object.isLine&&!object.isPoints)return;
  const source=object.userData.hbModelSource;
  if(source?.format==='fbx')add(byObjectId,source.objectId,object);
  add(byIndex,source?.index,object);add(byName,source?.name??object.name,object);
 });
 for(const row of rows||[])if(['mesh','meshe'].includes(row.kind))counts.set(row.name,(counts.get(row.name)||0)+1);
 for(const row of rows||[]){
  if(!['mesh','meshe'].includes(row.kind))continue;let matches=[];
  if(trustedIndices&&row.sourceObjectId!==undefined)matches=byObjectId.get(String(row.sourceObjectId))||[];
  else if(trustedIndices&&row.sourceIndex!==undefined)matches=byIndex.get(row.sourceIndex)||[];
  else if(counts.get(row.name)===1){
   const named=byName.get(row.name)||[],source=named[0]?.userData.hbModelSource;
   // Multiple primitives from one glTF mesh are one source target. Unidentified
   // duplicate object names must not receive another object's settings.
   if(named.length===1||source?.format==='gltf'&&named.every(object=>object.userData.hbModelSource?.index===source.index))matches=named;
  }
  if(!matches.length&&Object.keys(row.overrides||{}).length)(group.userData.modelImportWarnings??=[]).push({id:row.id,name:row.name,reason:'unresolved mesh target'});
  for(const object of matches){object.userData.hbModelOverrides={...row.overrides};for(const key of ['visible','castShadow','receiveShadow'])if(typeof row.overrides?.[key]==='boolean')object[key]=row.overrides[key];}
 }
 return group;
}
