// Candidate distance is max(bbox lower bound, field lower bound). Strict-closer
// replacement keeps the first tie, so equal bounds and a zero best cannot improve.
// Packed scalar volumes and rigid-instance BVH; independent of screen visibility.
export const meshDistanceFieldGLSL=`
vec4 hbDFLoad(float index){float h=floor(hbAmbientAO.w/4096.0),w=hbAmbientAO.w-h*4096.0;if(w<.5)w=4096.0;
#if defined(HB_D3D_DISTANCE_FIELD_DATA)
 return hbDistanceFieldScene.Load(int3(int2(index-floor(index/w)*w,floor(index/w)),0));
#elif defined(HB_WEBGL_RAY_DATA)
 return texelFetch(hbDistanceFieldScene,ivec2(index-floor(index/w)*w,floor(index/w)),0);
#else
 return texture2D(hbDistanceFieldScene,(vec2(index-floor(index/w)*w,floor(index/w))+.5)/vec2(w,h));
#endif
}
float hbDFBox(vec3 p,vec3 lo,vec3 hi){return length(max(max(lo-p,p-hi),vec3(0.0,0.0,0.0)));}
// Divide the integer scalar address before conversion: float loses lanes above 2^24.
float hbDFScalarInteger(float base,int index){int group=index/4,lane=index-group*4;vec4 v=hbDFLoad(base+3.0+float(group));return lane==0?v.x:lane==1?v.y:lane==2?v.z:v.w;}
float hbDFScalar(float base,float index){return hbDFScalarInteger(base,int(index));}
vec2 hbDFDistance(vec3 p,float maximum){vec4 root=hbDFLoad(0.0);float node=0.0,best=maximum,error=0.0;
 while(node<root.x){if(best<=0.0)break;vec4 lo=hbDFLoad(root.y+node*3.0),hi=hbDFLoad(root.y+node*3.0+1.0),meta=hbDFLoad(root.y+node*3.0+2.0);if(hbDFBox(p,lo.xyz,hi.xyz)>=best){node=lo.w;continue;}
  for(int item=0;item<int(meta.x);item++){if(best<=0.0)break;float at=root.z+(hi.w+float(item))*6.0;vec4 a=hbDFLoad(at),b=hbDFLoad(at+1.0);float minimum=hbDFBox(p,a.xyz,b.xyz);if(minimum>=best)continue;vec4 rx=hbDFLoad(at+2.0),ry=hbDFLoad(at+3.0),rz=hbDFLoad(at+4.0),info=hbDFLoad(at+5.0),lower=hbDFLoad(a.w),upper=hbDFLoad(a.w+1.0),dims=hbDFLoad(a.w+2.0);vec3 local=vec3(dot(rx.xyz,p)+rx.w,dot(ry.xyz,p)+ry.w,dot(rz.xyz,p)+rz.w);float value=0.0;if(dims.w>.5){vec3 q=abs(local-(lower.xyz+upper.xyz)*.5)-(upper.xyz-lower.xyz)*.5;value=length(max(q,vec3(0.0,0.0,0.0)))+min(max(q.x,max(q.y,q.z)),0.0);}else{vec3 coord=clamp((local-lower.xyz)/(upper.xyz-lower.xyz)*(dims.xyz-1.0),vec3(0.0,0.0,0.0),dims.xyz-1.0),cell=floor(coord),f=coord-cell;
   for(int corner=0;corner<8;corner++){float cz=floor(float(corner)*.25),cy=floor((float(corner)-cz*4.0)*.5),cx=float(corner)-cz*4.0-cy*2.0;vec3 bit=vec3(cx,cy,cz),q=min(cell+bit,dims.xyz-1.0),weight=mix(1.0-f,f,bit);value+=hbDFScalarInteger(a.w,int(q.x)+(int(q.y)+int(q.z)*int(dims.y))*int(dims.x))*weight.x*weight.y*weight.z;}}
   float distance=max(minimum,(value-lower.w)*b.w);if(distance<best){best=distance;error=info.x;}
  }node+=1.0;
 }return vec2(best,error);
}
float hbDFAmbient(vec3 p,vec3 n){float radius=hbAmbientAO.x;vec2 local=hbDFDistance(p,radius);float offset=max(hbAmbientAO.y,local.y*2.0);vec3 origin=p+n*offset,tangent=normalize(cross(n,abs(n.z)<.9?vec3(0.0,0.0,1.0):vec3(0.0,1.0,0.0))),bitangent=cross(n,tangent);float sum=0.0;
 for(int cone=0;cone<6;cone++){float angle=float(cone)*1.0471975512+.31;vec3 direction=normalize(n*.75+(tangent*cos(angle)+bitangent*sin(angle))*.661437828);float t=max(offset,radius/128.0),visibility=1.0;
  for(int march=0;march<48;march++){if(t>=radius||visibility<.005)break;vec2 d=hbDFDistance(origin+direction*t,radius);float coneRadius=max(radius/256.0,t*.32);visibility=min(visibility,clamp(d.x/coneRadius,0.0,1.0));t+=max(d.x*.75,radius/128.0);}
  sum+=visibility;
 }return clamp((1.0-sum/6.0)*hbAmbientAO.z,0.0,1.0);
}
`;
