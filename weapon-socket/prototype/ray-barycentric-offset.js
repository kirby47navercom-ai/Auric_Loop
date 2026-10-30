import {rayCoordinateBasisGLSL} from './ray-coordinate-basis.js';
import {rayCoordinatesGPU} from './ray-coordinate-basis-gpu.js';
// Evaluate base weights and offset weights separately. A compiler can fold
// (point-origin)+offset back to point+offset-origin and erase a sub-ULP offset.
export const rayBarycentricOffsetGLSL=`${rayCoordinateBasisGLSL}
vec3 hbRayBaryOffset(float id,vec3 point,vec3 offset){
 vec3 origin,e1,e2;hbGeometryFrame(id,origin,e1,e2);vec3 delta=point-origin;
 vec2 base=hbRayCoordinates(e1,e2,delta),shift=hbRayCoordinates(e1,e2,offset);
 return vec3((1.0-base.x-base.y)-shift.x-shift.y,base+shift);
}
`;
export function rayBarycentricOffsetNode(T,record,id,point,offset){
 const e1=record(id,1).xyz.toVar(),e2=record(id,2).xyz.toVar(),delta=point.sub(record(id,0).xyz).toVar();
 const base=rayCoordinatesGPU(e1,e2,delta).toVar(),shift=rayCoordinatesGPU(e1,e2,offset).toVar();
 return T.vec3(T.float(1).sub(base.x).sub(base.y).sub(shift.x).sub(shift.y),base.add(shift));
}
