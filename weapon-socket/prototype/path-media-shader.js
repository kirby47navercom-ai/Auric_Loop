// Each mesh instance is one consistently wound, closed boundary; latest entered medium wins.
export const pathMediaGLSL=`
float hbDielectricFresnel(float cosine,float ratio){float transmitted=ratio*ratio*max(0.0,1.0-cosine*cosine);if(transmitted>=1.0)return 1.0;float c=sqrt(1.0-transmitted),rs=(ratio*cosine-c)/max(.000001,ratio*cosine+c),rp=(cosine-ratio*c)/max(.000001,cosine+ratio*c);return .5*(rs*rs+rp*rp);}
#ifdef HB_PATH_MEDIA
vec4 hbMediumValueLod(float id,vec3 p,vec3 view,float width){vec4 a=hbRayField4Lod(id,p,view,width);return vec4(a.w>0.0?-log(max(a.rgb,vec3(.000001,.000001,.000001)))/a.w:vec3(0,0,0),hbRayField0Lod(id,p,view,width).w);}
vec4 hbMediumValue(float id,vec3 p,vec3 view){return hbMediumValueLod(id,p,view,0.0);}
float hbMediumID(float id){return hbGeometryLoad(hbTransport.x+id*2.0+1.0).w;}
void hbMediumSeed(vec3 origin,vec3 direction,bool shadowRay,out float ids[16],out vec4 media[16],out int count){count=0;for(int fill=0;fill<16;fill++){ids[fill]=0.0;media[fill]=vec4(0,0,0,1);}float seen[64];int seenCount=0;
 if(hbPathOptions.y<.5)return;
 // A first back-face crossing along the reverse ray means the camera starts inside that mesh.
 for(int scan=0;scan<min(64,int(hbTransport.w));scan++){vec4 hit=hbGeometryTrace(origin,-direction,hbGeometry.y);if(hit.w<.5){count=-1;return;}if(hit.z<.5)return;vec3 p=origin-direction*hit.x;float id=hbMediumID(hit.y);if(id>0.0&&(!shadowRay||hbGeometryLoad(hbTransport.x+hit.y*2.0+1.0).x>.5)){bool known=false;for(int j=0;j<seenCount;j++){if(seen[j]==id)known=true;}if(!known){seen[seenCount++]=id;if(dot(hbRayGeometric(hit.y),-direction)>0.0){if(count==16){count=-1;return;}for(int j=15;j>0;j--){if(j<=count){ids[j]=ids[j-1];media[j]=media[j-1];}}ids[0]=id;media[0]=hbMediumValue(hit.y,p,direction);count++;}}}origin=p-direction*hbGeometryLimits.y*2.0;
 }count=-1;
}
void hbMediumChange(float id,vec4 value,bool front,inout float ids[16],inout vec4 media[16],inout int count){
 if(front){if(count==16){count=-1;return;}ids[clamp(count,0,15)]=id;media[clamp(count,0,15)]=value;count++;}
 else{int found=-1;for(int j=0;j<count;j++)if(ids[j]==id)found=j;if(found<0){count=-1;return;}for(int j=0;j<15;j++)if(j>=found&&j<count-1){ids[j]=ids[j+1];media[j]=media[j+1];}count--;}
}
#else
vec4 hbMediumValueLod(float id,vec3 p,vec3 view,float width){return vec4(0,0,0,1);}
vec4 hbMediumValue(float id,vec3 p,vec3 view){return hbMediumValueLod(id,p,view,0.0);}
float hbMediumID(float id){return 0.0;}

void hbMediumSeed(vec3 o,vec3 d,bool shadowRay,out float ids[16],out vec4 media[16],out int count){count=0;for(int fill=0;fill<16;fill++){ids[fill]=0.0;media[fill]=vec4(0,0,0,1);}}
void hbMediumChange(float id,vec4 value,bool front,inout float ids[16],inout vec4 media[16],inout int count){}
#endif
`;
