import * as T from 'three/tsl';
import {gpuFn} from './gpu-function-scope.js';
import {rayUnitGPU,rayDualCoordinatesGPU} from './ray-coordinate-basis-gpu.js';
export const pathPixelOffsetGPU=gpuFn(([x,y,delta])=>{
 const crossAxis=rayUnitGPU(x).cross(rayUnitGPU(y)).toVar(),result=T.vec2(0).toVar();
 T.If(crossAxis.dot(crossAxis).greaterThan(1e-6),()=>{result.assign(rayDualCoordinatesGPU(x,y,delta));});return result;
}).setLayout({name:'hbPathOffset',type:'vec2',inputs:[{name:'x',type:'vec3'},{name:'y',type:'vec3'},{name:'delta',type:'vec3'}]});
