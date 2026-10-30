import {sharedRayRecordsGLSL} from './shared-ray-record-gl.js';
import {rayMaterialGLSL} from './ray-material-shader.js';
import {megaLightsGLSL} from './mega-lights.js';
export const geometryGIGLSL=`
vec3 hbGeometryVisibility(vec3 origin,vec3 direction,float distance);
vec3 hbGeometryVisibilityLod(vec3 origin,vec3 direction,float distance,float width);
vec4 hbGeometryRawLoad(float index){
#ifdef HB_WEBGL_RAY_DATA
 // Numeric atlas reads never need implicit screen derivatives inside BVH loops.
 return texelFetch(hbGeometryScene,ivec2(mod(index,hbGeometryInfo.x),floor(index/hbGeometryInfo.x)),0);
#else
 return texture2D(hbGeometryScene,(vec2(mod(index,hbGeometryInfo.x),floor(index/hbGeometryInfo.x))+.5)/hbGeometryInfo.xy);
#endif
}
#ifndef HB_GEOMETRY_SHARED
vec4 hbGeometryLoad(float index){return hbGeometryRawLoad(index);}
vec4 hbGeometryVertexLoad(float index){return hbGeometryRawLoad(index);}
#else
vec4 hbGeometryLoad(float index){float count=hbGeometryRecords.x;return hbGeometryRawLoad(index>=hbGeometryInfo.w+count*6.0?index-count:index);}
vec4 hbGeometryVertexLoad(float index){float count=hbGeometryRecords.x,start=hbGeometryInfo.w;
 if(count>.5&&index>=start&&index<start+count*6.0){float id=floor((index-start)/6.0),slot=index-start-id*6.0,at=start+id*5.0;vec4 r=hbGeometryRawLoad(at);
  if(slot<3.0){if(r.x<hbGeometryRecords.z||r.x+2.0>=hbGeometryRecords.y||r.y<0.0||r.y+2.0>=start||r.x!=floor(r.x)||r.y!=floor(r.y))return vec4(0,0,0,0);vec3 v=hbGeometryRawLoad(r.x+slot-count).xyz;vec4 x=hbGeometryRawLoad(r.y),y=hbGeometryRawLoad(r.y+1.0),z=hbGeometryRawLoad(r.y+2.0);return vec4(dot(x.xyz,v)+(slot<.5?x.w:0.0),dot(y.xyz,v)+(slot<.5?y.w:0.0),dot(z.xyz,v)+(slot<.5?z.w:0.0),slot<.5?r.z:slot<1.5?r.w:hbGeometryRawLoad(at+1.0).w);}
  return slot<3.5?vec4(hbGeometryRawLoad(at+1.0).xyz,hbGeometryRawLoad(at+2.0).w):slot<4.5?vec4(hbGeometryRawLoad(at+2.0).xyz,hbGeometryRawLoad(at+3.0).w):vec4(hbGeometryRawLoad(at+3.0).xyz,hbGeometryRawLoad(at+4.0).x);
 }return hbGeometryRawLoad(index>=start+count*6.0?index-count:index);
}
#endif
${sharedRayRecordsGLSL}
${rayMaterialGLSL}
float hbGeometryTriangleCone(vec3 origin,vec3 direction,vec3 localOrigin,vec3 localDirection,float triangle,vec2 rayCone){float at=hbGeometryInfo.w+triangle*6.0;vec3 a,e1,e2,o=origin,d=direction;
#ifdef HB_GEOMETRY_SHARED
float reference=hbGeometryRawLoad(hbGeometryInfo.w+triangle*5.0).x;if(reference<hbGeometryRecords.z||reference+2.0>=hbGeometryRecords.y||reference!=floor(reference))return -1.0;float pointer=reference-hbGeometryRecords.x;a=hbGeometryRawLoad(pointer).xyz;e1=hbGeometryRawLoad(pointer+1.0).xyz;e2=hbGeometryRawLoad(pointer+2.0).xyz;o=localOrigin;d=localDirection;
#else
a=hbGeometryRawLoad(at).xyz;e1=hbGeometryRawLoad(at+1.0).xyz;e2=hbGeometryRawLoad(at+2.0).xyz;
#endif
vec3 coordinates=hbRayTriangleCoordinates(e1,e2,o-a,d);float u=coordinates.x,v=coordinates.y,t=coordinates.z;if(u<0.0||v<0.0||u+v>1.0||t<=hbGeometryLimits.y)return -1.0;float cutoff=hbRayCutoff(triangle);if(cutoff>0.0&&hbRayField1(triangle,origin+direction*t,-direction).w<cutoff)return -1.0;return t;}
#ifndef HB_GEOMETRY_HIERARCHY
vec4 hbGeometryTraceCone(vec3 origin,vec3 direction,float distance,vec2 rayCone){float node=0.0,closest=distance,triangle=-1.0;
 for(int walk=0;walk<min(4096,int(hbGeometryLimits.x));walk++){if(node>=hbGeometryInfo.z)break;vec4 lower=hbGeometryLoad(node*3.0),upper=hbGeometryLoad(node*3.0+1.0);vec2 interval=hbRayBoxInterval(origin,direction,lower.xyz,upper.xyz,closest);if(interval.x>interval.y){node=lower.w;continue;}float count=hbGeometryLoad(node*3.0+2.0).x;for(int j=0;j<min(4,int(count));j++){float id=upper.w+float(j),t=hbGeometryTriangleCone(origin,direction,origin,direction,id,rayCone);if(t>0.0&&t<closest){closest=t;triangle=id;}}node+=1.0;}
 return vec4(closest,triangle,triangle>=0.0?1.0:0.0,node>=hbGeometryInfo.z?1.0:0.0);
}
#else
vec4 hbGeometryTraceCone(vec3 origin,vec3 direction,float distance,vec2 rayCone){float node=0.0,topEnd=hbGeometryInfo.z>0.0?hbGeometryLoad(0.0).w:0.0,end=topEnd,returnNode=-1.0,base=0.0,closest=distance,triangle=-1.0;vec3 rayOrigin=origin,rayDirection=direction;
 for(int walk=0;walk<min(4096,int(hbGeometryLimits.x));walk++){if(node>=end){if(returnNode<0.0)break;node=returnNode;returnNode=-1.0;end=topEnd;base=0.0;rayOrigin=origin;rayDirection=direction;if(node>=end)break;}vec4 lower=hbGeometryLoad(node*3.0),upper=hbGeometryLoad(node*3.0+1.0),meta=hbGeometryLoad(node*3.0+2.0);vec2 interval=hbRayBoxInterval(rayOrigin,rayDirection,lower.xyz,upper.xyz,closest);if(interval.x>interval.y){node=lower.w;continue;}if(meta.x<0.0){vec4 x=hbGeometryLoad(meta.y*3.0),y=hbGeometryLoad(meta.y*3.0+1.0),z=hbGeometryLoad(meta.y*3.0+2.0);rayOrigin=vec3(dot(x.xyz,origin)+x.w,dot(y.xyz,origin)+y.w,dot(z.xyz,origin)+z.w);rayDirection=vec3(dot(x.xyz,direction),dot(y.xyz,direction),dot(z.xyz,direction));returnNode=lower.w;node=upper.w;end=meta.w;base=meta.z;continue;}for(int j=0;j<min(4,int(meta.x));j++){float id=base+upper.w+float(j),t=hbGeometryTriangleCone(origin,direction,rayOrigin,rayDirection,id,rayCone);if(t>0.0&&t<closest){closest=t;triangle=id;}}node+=1.0;}
 bool complete=returnNode<0.0?node>=topEnd:node>=end&&returnNode>=topEnd;return vec4(closest,triangle,triangle>=0.0?1.0:0.0,complete?1.0:0.0);
}
#endif
vec4 hbGeometryTrace(vec3 origin,vec3 direction,float distance){return hbGeometryTraceCone(origin,direction,distance,vec2(0,0));}
${megaLightsGLSL}
vec3 hbGeometryLightingLod(vec3 point,vec3 normal,float triangle,float width){float at=hbGeometryInfo.w+triangle*6.0;vec3 color=hbRayField1Lod(triangle,point,normal,width).rgb,result=hbRayField2Lod(triangle,point,normal,width).rgb;
 for(int light=0;light<int(hbLightBudget());light++){vec2 choice=hbSelectLight(float(light),dot(point,vec3(17.719,113.13,31.7))+hbPath.w);float base=hbGeometryLimits.z+choice.x*4.0;vec4 p=hbGeometryLoad(base),d=hbGeometryLoad(base+1.0),c=hbGeometryLoad(base+2.0),cone=hbGeometryLoad(base+3.0);vec3 delta=p.xyz-point;float distance=length(delta),attenuation=1.0;vec3 direction=p.w<.5?normalize(d.xyz):delta/max(distance,.000001);
  if(p.w>.5){attenuation=1.0/max(pow(distance,cone.z),.01);if(d.w>0.0)attenuation*=pow(clamp(1.0-pow(distance/d.w,4.0),0.0,1.0),2.0);if(p.w>1.5)attenuation*=smoothstep(cone.x,max(cone.x+.00001,cone.y),dot(-direction,normalize(d.xyz)));}
  float cosine=max(dot(normal,direction),0.0);if(cosine>0.0&&attenuation>0.0){vec4 shadow=hbGeometryTrace(point+normal*hbGeometryLimits.y*2.0,direction,p.w<.5?hbGeometry.y:max(0.0,distance-hbGeometryLimits.y*2.0));vec3 visibility=hbTransport.y>.5?hbGeometryVisibilityLod(point+normal*hbGeometryLimits.y*2.0,direction,p.w<.5?hbGeometry.y:max(0.0,distance-hbGeometryLimits.y*2.0),width):(shadow.z<.5&&shadow.w>.5?vec3(1,1,1):vec3(0,0,0));if(hbTransport.y>.5&&(cone.w<.5||hbGeometryLoad(hbTransport.x+triangle*2.0+1.0).y<.5))visibility=vec3(1,1,1);float diffuse=hbTransport.y>.5?1.0-hbRayField0Lod(triangle,point,normal,width).x:1.0;result+=color*c.rgb*c.w*(cosine*attenuation*choice.y*.318309886*diffuse)*visibility;}
 }return result;
}
vec3 hbGeometryHemisphere(vec3 normal,float angle,float radius){vec3 tangent=normalize(cross(normal,abs(normal.z)<.9?vec3(0,0,1):vec3(0,1,0))),bitangent=cross(normal,tangent);return normalize(normal*sqrt(1.0-radius)+(tangent*cos(angle)+bitangent*sin(angle))*sqrt(radius));}
vec3 hbGeometryIndirect(vec3 point,vec3 normal){vec3 total=vec3(0,0,0);for(int sampleIndex=0;sampleIndex<16;sampleIndex++){if(float(sampleIndex)>=hbGeometry.w)break;float phase=float(sampleIndex)*2.39996323+.392699;vec3 direction=hbGeometryHemisphere(normal,phase,(float(sampleIndex)+.5)/hbGeometry.w),origin=point+normal*hbGeometryLimits.y*2.0,throughput=vec3(1,1,1),sum=vec3(0,0,0);
  vec2 rayCone=vec2(0,.5);bool alive=true;for(int bounce=0;bounce<min(4,int(hbGeometry.z))&&alive;bounce++){vec4 hit=hbGeometryTraceCone(origin,direction,hbGeometry.y,rayCone);if(hit.z<.5||hit.w<.5)alive=false;else{rayCone.x+=rayCone.y*hit.x;vec3 p=origin+direction*hit.x,n=hbRayNormalLod(hit.y,p,-direction,rayCone.x);if(dot(n,direction)>0.0)n=-n;sum+=throughput*hbGeometryLightingLod(p,n,hit.y,rayCone.x);throughput*=hbRayField1Lod(hit.y,p,-direction,rayCone.x).xyz*(hbTransport.y>.5?1.0-hbRayField0Lod(hit.y,p,-direction,rayCone.x).x:1.0);origin=p+n*hbGeometryLimits.y*2.0;direction=hbGeometryHemisphere(n,phase+float(bounce+1)*1.618034,.5);}}
  total+=sum;
 }return total*(3.141592654/max(1.0,hbGeometry.w));
}
`;
