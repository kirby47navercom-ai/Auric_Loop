import * as T from 'three/tsl';

// Append F to A: A(F(p)). This equals the old reverse walk over stored planes.
export function virtualGuideFrame(){return {x:T.vec3(1,0,0).toVar(),y:T.vec3(0,1,0).toVar(),z:T.vec3(0,0,1).toVar(),offset:T.vec3(0).toVar()};}
export const virtualGuidePoint=(frame,p)=>frame.x.mul(p.x).add(frame.y.mul(p.y)).add(frame.z.mul(p.z)).add(frame.offset);
export function appendVirtualGuideFrame(frame,p,n,eta,reflection){
 const reflect=()=>{const v=frame.x.mul(n.x).add(frame.y.mul(n.y)).add(frame.z.mul(n.z)).toVar();frame.offset.addAssign(v.mul(n.dot(p).mul(2)));frame.x.subAssign(v.mul(n.x.mul(2)));frame.y.subAssign(v.mul(n.y.mul(2)));frame.z.subAssign(v.mul(n.z.mul(2)));};
 if(reflection===true){reflect();return;}
 T.If(reflection,reflect).Else(()=>{const shift=frame.x.mul(p.x).add(frame.y.mul(p.y)).add(frame.z.mul(p.z)).mul(T.float(1).sub(eta)).toVar();frame.offset.addAssign(shift);frame.x.mulAssign(eta);frame.y.mulAssign(eta);frame.z.mulAssign(eta);});
}

export const virtualGuideGLSL=`
struct HBPathVirtualFrame{vec3 x;vec3 y;vec3 z;vec3 offset;};
HBPathVirtualFrame hbPathVirtualIdentity(){HBPathVirtualFrame f;f.x=vec3(1,0,0);f.y=vec3(0,1,0);f.z=vec3(0,0,1);f.offset=vec3(0,0,0);return f;}
vec3 hbPathVirtualPoint(HBPathVirtualFrame f,vec3 p){return f.x*p.x+f.y*p.y+f.z*p.z+f.offset;}
void hbPathVirtualAppend(inout HBPathVirtualFrame f,vec3 p,vec3 n,float eta,bool reflection){
 if(reflection){vec3 v=f.x*n.x+f.y*n.y+f.z*n.z;f.offset+=v*(2.0*dot(n,p));f.x-=v*(2.0*n.x);f.y-=v*(2.0*n.y);f.z-=v*(2.0*n.z);}
 else{f.offset+=(f.x*p.x+f.y*p.y+f.z*p.z)*(1.0-eta);f.x*=eta;f.y*=eta;f.z*=eta;}
}
`;
