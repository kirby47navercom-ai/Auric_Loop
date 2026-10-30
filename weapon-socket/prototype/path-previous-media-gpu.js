import * as T from 'three/tsl';import {pathMediaNode} from './path-media-gpu.js';

export function previousMediaGPU(transport,u,ray,geometry){
 const oldRay={...ray,field:(id,point,view,field,width=T.float(0))=>ray.field(id,point,view,field,width,false,T.vec2(u.forward.w,1))};
 return pathMediaNode({load:transport.load,trace:geometry.trace,ray:oldRay},u,transport.medium.enabled!==false,{prefix:'hbPreviousMedium',iorOnly:true});
}
