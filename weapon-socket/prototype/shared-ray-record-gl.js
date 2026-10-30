// A fixed slot keeps scalar/material reads out of the position decoder in nested ray programs.
export const sharedRayRecordsGLSL=`
void hbGeometryFrame(float id,out vec3 origin,out vec3 e1,out vec3 e2){
#ifndef HB_GEOMETRY_SHARED
 float at=hbGeometryInfo.w+id*6.0;origin=hbGeometryRawLoad(at).xyz;e1=hbGeometryRawLoad(at+1.0).xyz;e2=hbGeometryRawLoad(at+2.0).xyz;
#else
 vec4 r=hbGeometryRawLoad(hbGeometryInfo.w+id*5.0);origin=vec3(0,0,0);e1=origin;e2=origin;
 if(r.x<hbGeometryRecords.z||r.x+2.0>=hbGeometryRecords.y||r.y<0.0||r.y+2.0>=hbGeometryInfo.w||r.x!=floor(r.x)||r.y!=floor(r.y))return;
 vec3 a=hbGeometryRawLoad(r.x-hbGeometryRecords.x).xyz,b=hbGeometryRawLoad(r.x+1.0-hbGeometryRecords.x).xyz,c=hbGeometryRawLoad(r.x+2.0-hbGeometryRecords.x).xyz;
 vec4 x=hbGeometryRawLoad(r.y),y=hbGeometryRawLoad(r.y+1.0),z=hbGeometryRawLoad(r.y+2.0);
 origin=vec3(dot(x.xyz,a)+x.w,dot(y.xyz,a)+y.w,dot(z.xyz,a)+z.w);
 e1=vec3(dot(x.xyz,b),dot(y.xyz,b),dot(z.xyz,b));e2=vec3(dot(x.xyz,c),dot(y.xyz,c),dot(z.xyz,c));
#endif
}
vec4 hbGeometryPosition(float id,float slot){
#ifndef HB_GEOMETRY_SHARED
 return hbGeometryRawLoad(hbGeometryInfo.w+id*6.0+slot);
#else
 float at=hbGeometryInfo.w+id*5.0;vec4 r=hbGeometryRawLoad(at);if(r.x<hbGeometryRecords.z||r.x+2.0>=hbGeometryRecords.y||r.y<0.0||r.y+2.0>=hbGeometryInfo.w||r.x!=floor(r.x)||r.y!=floor(r.y))return vec4(0,0,0,0);
 vec3 v=hbGeometryRawLoad(r.x+slot-hbGeometryRecords.x).xyz;vec4 x=hbGeometryRawLoad(r.y),y=hbGeometryRawLoad(r.y+1.0),z=hbGeometryRawLoad(r.y+2.0);return vec4(dot(x.xyz,v)+(slot<.5?x.w:0.0),dot(y.xyz,v)+(slot<.5?y.w:0.0),dot(z.xyz,v)+(slot<.5?z.w:0.0),slot<.5?r.z:slot<1.5?r.w:hbGeometryRawLoad(at+1.0).w);
#endif
}
`+Array.from({length:6},(_,slot)=>slot<3?`vec4 hbGeometryRecord${slot}(float id){return hbGeometryPosition(id,${slot}.0);}\n`:`vec4 hbGeometryRecord${slot}(float id){
#ifndef HB_GEOMETRY_SHARED
 return hbGeometryRawLoad(hbGeometryInfo.w+id*6.0+${slot}.0);
#else
 float at=hbGeometryInfo.w+id*5.0;return vec4(hbGeometryRawLoad(at+${slot-2}.0).xyz,hbGeometryRawLoad(at+${slot-1}.0).${slot===5?'x':'w'});
#endif
}
`).join('\n');
