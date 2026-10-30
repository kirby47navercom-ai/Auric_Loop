import {clothPins} from './cloth-config.js';
export function validRope2D(p){try{clothPins({...p,columns:p.particles,rows:1});return p.start[2]===0&&p.end[2]===0&&Math.hypot(...p.end.map((v,i)=>v-p.start[i]))>.0001&&p.force[2]===0;}catch{return false;}}
