export function possibleCausticBoundary(triangle){
 if(triangle.rayMaterial?.fields?.includes(0))return true;
 const p=triangle.surface||{},metal=p.metalness??0,rough=p.roughness??1,transmission=p.transmission??0;
 return rough<.05&&(transmission>.5||metal>.5)||transmission*(1-metal)>.99999||metal>.99999;
}
export function packCausticTargets(triangles){
 const ids=[];for(let i=0;i<triangles.length;i++)if(possibleCausticBoundary(triangles[i]))ids.push(i);
 const data=new Float32Array(Math.ceil(ids.length/4)*4);data.fill(-1);data.set(ids);return {data,count:ids.length};
}
