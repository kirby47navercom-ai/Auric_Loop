// Keep ordinary triangles on the existing dot-product path. Rescale each edge
// separately before using a cross/dual basis for tiny or ill-conditioned ones.
// GLSL dynamic vec3 indexing becomes a switch on ANGLE/D3D. Emit the same
// three axes in order, matching the existing TSL implementation.
const boxAxesGLSL=['x','y','z'].map(axis=>`{
  if(abs(direction.${axis})<1e-30){if(origin.${axis}<lower.${axis}||origin.${axis}>upper.${axis})farAt=-1.0;}
  else{float a=(lower.${axis}-origin.${axis})/direction.${axis},b=(upper.${axis}-origin.${axis})/direction.${axis};nearAt=max(nearAt,min(a,b));farAt=min(farAt,max(a,b));}
 }`).join('\n');
export const rayCoordinateBasisGLSL=`
#ifndef HB_RAY_COORDINATE_BASIS
#define HB_RAY_COORDINATE_BASIS 1
vec3 hbRayUnit(vec3 v){float scale=max(max(abs(v.x),abs(v.y)),abs(v.z));return scale>0.0?normalize(v/scale):vec3(0,0,0);}
vec3 hbRayFrameNormal(vec3 a,vec3 b){return hbRayUnit(cross(hbRayUnit(a),hbRayUnit(b)));}
bool hbRayFrameValid(vec3 a,vec3 b){vec3 n=cross(hbRayUnit(a),hbRayUnit(b));return dot(n,n)>1e-24;}
void hbRayScaleFrame(inout vec3 a,inout vec3 b){float scale=max(max(max(abs(a.x),abs(a.y)),abs(a.z)),max(max(abs(b.x),abs(b.y)),abs(b.z)));if(scale>0.0){a/=scale;b/=scale;}}
vec2 hbRayDualCoordinates(vec3 e1,vec3 e2,vec3 delta){
 float s1=max(max(abs(e1.x),abs(e1.y)),abs(e1.z)),s2=max(max(abs(e2.x),abs(e2.y)),abs(e2.z));
 if(s1<=0.0||s2<=0.0)return vec2(0,0);
 vec3 x=e1/s1,y=e2/s2,n=cross(x,y);float determinant=dot(n,n);
 if(determinant<=1e-30)return vec2(0,0);
 return vec2(dot(delta/s1,cross(y,n)),dot(delta/s2,cross(n,x)))/determinant;
}
vec2 hbRayCoordinates(vec3 e1,vec3 e2,vec3 delta){
 float a=dot(e1,e1),b=dot(e1,e2),c=dot(e2,e2),den=a*c-b*b;
 if(den>1e-18&&den>1e-5*a*c){float d=dot(delta,e1),e=dot(delta,e2);return vec2(c*d-b*e,a*e-b*d)/den;}
 return hbRayDualCoordinates(e1,e2,delta);
}
vec3 hbRayTriangleCoordinates(vec3 e1,vec3 e2,vec3 delta,vec3 direction){
 vec3 p=cross(direction,e2);float determinant=dot(e1,p);
 if(abs(determinant)>1e-7){vec3 q=cross(delta,e1);return vec3(dot(delta,p),dot(direction,q),dot(e2,q))/determinant;}
 vec3 normal=hbRayFrameNormal(e1,e2);float facing=dot(normal,hbRayUnit(direction));
 if(dot(normal,normal)<.5||abs(facing)<=1e-7)return vec3(-1,-1,-1);
 float distance=-dot(delta,normal)/dot(direction,normal);
 vec2 weights=hbRayCoordinates(e1,e2,delta)+hbRayCoordinates(e1,e2,direction*distance);
 return vec3(weights,distance);
}
vec2 hbRayBoxInterval(vec3 origin,vec3 direction,vec3 lower,vec3 upper,float distance){
 float nearAt=0.0,farAt=distance;
 ${boxAxesGLSL}return vec2(nearAt,farAt);
}
#endif
`;
