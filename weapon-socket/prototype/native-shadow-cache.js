const kinds={mesh:'meshes',meshVertices:'meshes',program:'programs',instances:'instances',deformation:'deformations'};
export class NativeShadowCache{
 constructor(){this.clear();}
 clear(){this.serial=0;this.resources=new Map();this.draws=new Map();this.stamps=[];}
 draw(id,draw,signature,animated=false){const old=this.draws.get(id);if(old?.signature===signature&&old.animated===animated)return;const dependencies=[['meshes',draw.mesh],['programs',draw.program],['instances',draw.instances],['deformations',draw.deformation],...[...(draw.maps||[]),...(draw.programMaps||[])].map(id=>['textures',id])].filter(([,id])=>id).map(([kind,id])=>kind+':'+id);this.draws.set(id,{signature,animated,dependencies,revision:++this.serial});}
 prepare(records,resources,parameters,poses,remove=[]){
  if(!records.length){this.clear();return [];}
  for(const id of remove)this.draws.delete(id);
  for(const r of resources)this.resources.set((kinds[r.kind]||'textures')+':'+r.id,++this.serial);
  for(const r of parameters)this.resources.set('programs:'+r.id,++this.serial);
  for(const r of poses)this.resources.set('deformations:'+r.id,++this.serial);
  for(const draw of this.draws.values())if(draw.animated)draw.revision=++this.serial;
  const next=records.map(record=>JSON.stringify([record.packed,record.casters.map(id=>{const d=this.draws.get(id);return [id,d?Math.max(d.revision,...d.dependencies.map(key=>this.resources.get(key)||0)):0];})])),dirty=next.flatMap((s,i)=>s!==this.stamps[i]?[i]:[]);this.stamps=next;return dirty;
 }
 release(released){for(const[kind,ids]of Object.entries(released))for(const id of ids)this.resources.delete(kind+':'+id);}
}
