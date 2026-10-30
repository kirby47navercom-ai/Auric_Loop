export const pathMicrofacetGLSL=`
vec3 hbPathFrame(vec3 n){return normalize(cross(n,abs(n.z)<.9?vec3(0,0,1):vec3(0,1,0)));}
vec3 hbPathVisibleNormal(vec3 n,vec3 view,vec3 tangent,vec2 axes,float angle,float radius){
 vec3 bitangent=cross(n,tangent),v=normalize(vec3(dot(view,tangent)*axes.x,dot(view,bitangent)*axes.y,max(.000001,dot(view,n))));
 vec3 x=dot(v.xy,v.xy)>.000001?normalize(vec3(-v.y,v.x,0)):vec3(1,0,0),y=cross(v,x);float a=sqrt(radius)*cos(angle),blend=(1.0+v.z)*.5,b=(1.0-blend)*sqrt(max(0.0,1.0-a*a))+blend*sqrt(radius)*sin(angle);
 vec3 h=x*a+y*b+v*sqrt(max(0.0,1.0-a*a-b*b));return normalize(tangent*(h.x*axes.x)+bitangent*(h.y*axes.y)+n*max(.000001,h.z));
}
#ifdef HB_PATH_ROUGH_DIELECTRIC
vec4 hbPathDielectric(vec3 n,vec3 view,vec3 light,float rough,float ratio,float radianceScale){
 float nv=dot(n,view),nl=dot(n,light);if(nv<=0.0||abs(nl)<.000001)return vec4(0,0,0,0);bool reflection=nl>0.0;vec3 sum=reflection?view+light:view+light/max(.000001,ratio);if(dot(sum,sum)<.00000001)return vec4(0,0,0,0);vec3 h=normalize(sum);if(dot(h,n)<0.0)h=-h;float vh=dot(view,h),lh=dot(light,h);if(vh<=0.0||(reflection?lh<=0.0:lh>=0.0))return vec4(0,0,0,0);
 float alpha=rough*rough,a2=alpha*alpha,nh=max(0.0,dot(n,h)),den=nh*nh*(a2-1.0)+1.0,d=a2/max(.000000000001,3.141592654*den*den),gv=hbPathSmith(nv,a2),gl=hbPathSmith(abs(nl),a2),g=1.0/max(.000001,1.0/max(.000001,gv)+1.0/max(.000001,gl)-1.0),f=hbDielectricFresnel(vh,ratio),normalPDF=d*gv*vh/max(.000001,nv),value,pdf;
 if(reflection){value=f*d*g/max(.000001,4.0*nv*nl);pdf=f*normalPDF/max(.000001,4.0*vh);}else{float jac=lh+vh*ratio,j2=jac*jac;if(j2<.000000000001)return vec4(0,0,0,0);value=(1.0-f)*d*g*abs(lh*vh)/(max(.000001,abs(nv*nl))*j2)*radianceScale;pdf=(1.0-f)*normalPDF*abs(lh)/j2;}
 return vec4(vec3(value,value,value),pdf);
}
#endif
`;
