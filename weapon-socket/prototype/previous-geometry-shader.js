export const previousGeometryGLSL=`
#ifndef HB_GUIDE_OPAQUE
bool hbPreviousGeometryAvailable(){return hbPathFilter.w>0.0&&hbGeometryLoad(hbPathFilter.w+1.0).w>0.0&&hbGeometryLoad(hbPathFilter.w+2.0).w>0.0;}
vec4 hbPreviousGeometryTrace(vec3 origin,vec3 direction,float distance){
 if(!hbPreviousGeometryAvailable())return vec4(distance,-1,0,0);
 float pointer=hbGeometryLoad(hbPathFilter.w+1.0).w,count=hbGeometryLoad(hbPathFilter.w+2.0).w,node=0.0,closest=distance,triangle=-1.0;
 for(int priorWalk=0;priorWalk<min(4096,int(count));priorWalk++){
  if(node>=count)break;vec4 lower=hbGeometryLoad(pointer+node*3.0),upper=hbGeometryLoad(pointer+node*3.0+1.0),ids=hbGeometryLoad(pointer+node*3.0+2.0);vec2 interval=hbRayBoxInterval(origin,direction,lower.xyz,upper.xyz,closest);
  if(interval.x>interval.y){node=lower.w;continue;}
  for(int priorLeaf=0;priorLeaf<min(4,int(upper.w));priorLeaf++){float id=priorLeaf==0?ids.x:priorLeaf==1?ids.y:priorLeaf==2?ids.z:ids.w,at=hbPathFilter.w+id*3.0;vec3 a=hbGeometryLoad(at).xyz,e1=hbGeometryLoad(at+1.0).xyz,e2=hbGeometryLoad(at+2.0).xyz,coordinates=hbRayTriangleCoordinates(e1,e2,origin-a,direction);{float x=coordinates.x,y=coordinates.y,t=coordinates.z;if(x>=0.0&&y>=0.0&&x+y<=1.0&&t>hbGeometryLimits.y&&t<closest){float cutoff=hbRayCutoff(id);if(cutoff<=0.0||hbRayPreviousField1TimeLod(id,origin+direction*t,-direction,0.0,vec2(hbForward.w,1)).w>=cutoff){closest=t;triangle=id;}}}}
  node+=1.0;
 }return vec4(closest,triangle,triangle>=0.0?1.0:0.0,node>=count?1.0:0.0);
}
#endif
`;
