// Levels start at half resolution; odd trailing rows/columns stay in the hierarchy.
export function depthHierarchyLayout(width,height){
 if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1)throw Error('Hi-Z 크기를 확인하세요.');
 const levels=[];let w=width,h=height,y=0;do{w=Math.ceil(w/2);h=Math.ceil(h/2);levels.push({width:w,height:h,y});y+=h;}while(w>1||h>1);
 return {width:levels[0].width,height:y,levels};
}
export const hierarchyGLSL=`
vec2 hbDepthRange(vec2 uv,float level){vec2 size=ceil(hbScreenSize*.5);float offset=0.0;for(int j=1;j<16;j++){if(float(j)>=level)break;offset+=size.y;size=ceil(size*.5);}return texture2D(hbDepthHierarchy,(vec2(floor(clamp(uv,0.0,.999999)*hbScreenSize/exp2(level)).x,floor(clamp(uv,0.0,.999999)*hbScreenSize/exp2(level)).y+offset)+.5)/hbHierarchy.xy).rg;}
bool hbEmptySegment(vec3 start,vec3 end){if(hbHierarchy.w<.5||!hbInside(start)||!hbInside(end))return false;
 vec2 lo=min(start.xy,end.xy),hi=max(start.xy,end.xy);float footprint=max((hi.x-lo.x)*hbScreenSize.x,(hi.y-lo.y)*hbScreenSize.y),level=clamp(ceil(log2(max(2.0,footprint)))+1.0,1.0,hbHierarchy.z);
 float nearDepth=min(min(hbDepthRange(lo,level).x,hbDepthRange(hi,level).x),min(hbDepthRange(vec2(lo.x,hi.y),level).x,hbDepthRange(vec2(hi.x,lo.y),level).x));return max(start.z,end.z)<nearDepth;
}
`;
