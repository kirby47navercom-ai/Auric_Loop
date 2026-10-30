import {rayCoordinateBasisGLSL} from './ray-coordinate-basis.js';
import {rayCoordinatesGPU} from './ray-coordinate-basis-gpu.js';
// UV is affine on a triangle. Derive its offsets directly instead of adding
// a sub-ULP footprint to a large world point and losing the texture gradient.
export const rayUVFootprintContract=Object.freeze({version:1,model:'triangle-affine UV differentials from relative edges; base UV interpolation unchanged',triangleCoordinates:'legacy dot basis for well-conditioned faces; independently scaled dual basis for tiny/skinny faces; base and sub-ULP offsets evaluated separately, including shared local geometry',contexts:Object.freeze(['current geometry','committed geometry']),coordinatePropagation:'relative finite differences; direct affine identities and stable piecewise/periodic/root/length differences; shifted-input fallback for other operations',stableOperations:Object.freeze(['uv','worldPosition','add','subtract','multiply','tilingOffset','panner','lerp','oneMinus','dot','cross','combine','channel','cast','worldNormal','absolute','min','max','clamp','saturate','floor','ceil','fraction','step','sign','sine','cosine','squareRoot','length','normalize','divide','distance','rotateUV','reflect','eyeUV','power','exp2','log2','smoothstep','normalMap','fresnel','radialGradient','linearGradient','noise','checker']),helperCompilation:'GL/HLSL helpers gated by register-version-aware coordinate ancestors from existing programs; legacy standalone opcode union remains compatible; transitive dependencies checked once at module load, no per-frame scan; HB_RAY_DERIVATIVES_ALL is a debug-only full-library override',normalFootprint:'triangle-local barycentric offsets, applied separately from the absolute world point; current and committed smooth-normal decoders',sampledCoordinates:'texture ancestors re-sample shifted coordinate/layer with the incoming footprint held fixed; register-version-aware propagation across every texture family',approximations:Object.freeze(['sampled-coordinate subtraction can lose sub-ULP texture-value changes; sampler boundaries and format precision remain observable','view direction is held fixed across the cone']),resources:'no additional textures, targets, uniforms or readbacks',remaining:Object.freeze(['procedural hash remains backend-dependent; cell indices/neighbor hashes beyond representable integer precision and finite positive power/log/float intermediate range limits remain','unrepresentable authored UV/time values and extreme intermediate ranges'])});
export const rayUVFootprintGLSL=`${rayCoordinateBasisGLSL}
void hbRayUVFootprint(float id,vec3 point,vec3 view,float width,out vec2 uv,out vec2 uvX,out vec2 uvY){
 float at=hbRayAttributes(id);uv=vec2(0,0);uvX=uv;uvY=uv;if(at<=0.0)return;
 vec3 origin,e1,e2;hbGeometryFrame(id,origin,e1,e2);vec3 normal=hbRayGeometric(id),t=cross(normal,view);
 if(dot(t,t)<.000001)t=cross(normal,abs(normal.z)<.9?vec3(0,0,1):vec3(0,1,0));t=normalize(t);
 vec3 dx=t*width,dy=cross(normal,t)*(width/max(.01,abs(dot(normal,view))));
 vec4 first=hbGeometryLoad(at);vec2 last=hbGeometryLoad(at+1.0).xy,base=hbRayCoordinates(e1,e2,point-origin);
 uv=first.xy*(1.0-base.x-base.y)+first.zw*base.x+last*base.y;
 vec2 du=first.zw-first.xy,dv=last-first.xy,x=hbRayCoordinates(e1,e2,dx),y=hbRayCoordinates(e1,e2,dy);
 uvX=du*x.x+dv*x.y;uvY=du*y.x+dv*y.y;
}
`;

export function rayUVDifferentialsNode(T,fn,load,attributes,record,offset){
 return fn('hbRayUVDifferentials','vec4',[['id','float'],['view','vec3'],['width','float']],([id,view,width])=>{
  const at=attributes(id).toVar(),result=T.vec4(0).toVar();
  T.If(at.greaterThan(0),()=>{
   const e1=record(id,1).xyz.toVar(),e2=record(id,2).xyz.toVar(),first=load(at).toVar(),du=first.zw.sub(first.xy),dv=load(at.add(1)).xy.sub(first.xy);
   for(const axis of [0,1]){const delta=offset(id,view,width,T.float(axis)),coordinates=rayCoordinatesGPU(e1,e2,delta).toVar();result[axis?'zw':'xy'].assign(du.mul(coordinates.x).add(dv.mul(coordinates.y)));}
  });return result;
 });
}
