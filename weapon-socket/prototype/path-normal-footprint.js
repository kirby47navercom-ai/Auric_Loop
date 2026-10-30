// Optional local cone support from two finite normal samples. The existing
// integrator keeps its zero-cost mode; this is not a global ray differential
// solve or a microfacet/participating-medium differential model.
export const normalFootprintModes=Object.freeze(['off','geometry','material']);
export const normalFootprintMode=value=>Math.max(0,normalFootprintModes.indexOf(value));
export const normalFootprintFlag=2097152;
export const normalFootprintGLSL=`
#if defined(HB_PATH_NORMAL_FOOTPRINT) && HB_PATH_NORMAL_FOOTPRINT > 0
#ifndef HB_NORMAL_FOOTPRINT_LIBRARY
#define HB_NORMAL_FOOTPRINT_LIBRARY 1
float hbRayNormalAngle(vec3 incident,vec3 center,vec3 candidate,float ratio,bool reflection){
if(!reflection&&ratio==1.0&&dot(incident,center)<0.0&&dot(incident,candidate)<0.0)return 0.0;
vec3 a=reflection?reflect(incident,center):refract(incident,center,ratio),b=reflection?reflect(incident,candidate):refract(incident,candidate,ratio);
if(dot(a,a)<.000001||dot(b,b)<.000001)return 1.57;
a=normalize(a);b=normalize(b);float cosine=dot(a,b);if(cosine<=0.0)return 1.57;
// Two half-angle reductions bound t by tan(pi/16); the odd series has
// <7e-13 angular truncation error. Avoid driver atan approximations whose
// small angle error becomes a visible width error over long secondary rays.
float t=length(cross(a,b))/(1.0+cosine);t/=1.0+sqrt(1.0+t*t);t/=1.0+sqrt(1.0+t*t);float z=t*t;
return min(1.57,8.0*t*(1.0+z*(-1.0/3.0+z*(1.0/5.0+z*(-1.0/7.0+z*(1.0/9.0+z*(-1.0/11.0+z*(1.0/13.0-z/15.0))))))));
}
bool hbRayFootprintMapped(float id,bool coat){float at=hbRayAttributes(id);if(at<=0.0)return false;float material=hbGeometryLoad(at+1.0).z;
#ifdef HB_PATH_ADVANCED
if(coat)return hbGeometryLoad(at+1.0).w>9.5&&hbGeometryLoad(material+19.0).z>.5;
#endif
return hbGeometryLoad(material+7.0).z>.5;}
float hbRayNormalFootprint(float id,vec3 point,vec3 view,float width,vec3 center,float ratio,bool reflection,bool coat,bool previous){
if(width<=0.0)return 0.0;bool mapped=hbRayFootprintMapped(id,coat);
#if HB_PATH_NORMAL_FOOTPRINT == 1
if(mapped)return 0.0;
#endif
vec3 geometric=previous?hbRayPreviousGeometric(id):hbRayGeometric(id);float facing=dot(geometric,view)>0.0?1.0:-1.0,span=0.0;
for(int axis=0;axis<2;axis++){vec3 offset=previous?hbRayPreviousOffset(id,view,width,float(axis)):hbRayOffset(id,view,width,float(axis)),normal;
#if HB_PATH_NORMAL_FOOTPRINT == 2
if(mapped){if(previous){
#ifdef HB_PATH_ADVANCED
if(coat)normal=hbRayPreviousCoatNormalContextLod(id,point+offset,view,width,vec2(hbForward.w,1));else
#endif
normal=hbRayPreviousNormalContextLod(id,point+offset,view,width,vec2(hbForward.w,1));
}else{
#ifdef HB_PATH_ADVANCED
if(coat)normal=hbRayCoatNormalLod(id,point+offset,view,width);else
#endif
normal=hbRayNormalLod(id,point+offset,view,width);}}
else
#endif
normal=previous?hbRayPreviousSmoothNormalOffset(id,point,offset):hbRaySmoothNormalOffset(id,point,offset);
span=max(span,hbRayNormalAngle(-view,center*facing,normal*facing,ratio,reflection));}
return span;}
#endif
#endif
`;
export function normalDirectionAngle(incident,center,candidate,ratio,reflection){
 if(!reflection&&ratio===1&&incident.reduce((s,v,i)=>s+v*center[i],0)<0&&incident.reduce((s,v,i)=>s+v*candidate[i],0)<0)return 0;
 const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],direction=n=>{const a=dot(incident,n);if(reflection)return incident.map((v,i)=>v-2*a*n[i]);const k=1-ratio*ratio*(1-a*a);return k<0?[0,0,0]:incident.map((v,i)=>ratio*v-(ratio*a+Math.sqrt(k))*n[i]);},a=direction(center),b=direction(candidate),la=Math.hypot(...a),lb=Math.hypot(...b);if(la<.001||lb<.001)return 1.57;const x=a.map(v=>v/la),y=b.map(v=>v/lb);return Math.min(1.57,Math.atan2(Math.hypot(...cross(x,y)),dot(x,y)));
}
export const normalFootprintContract=Object.freeze({version:1,modes:normalFootprintModes,default:'off',geometry:'two smooth-normal offset samples; mapped base/coat materials retain the existing cone in this mode',material:'two decoded base/coat normal samples at the current footprint; committed path uses its own geometry, view, clock and width',model:'finite local angular envelope added to the existing cone, capped at1.57; a refracted neighbour with a different TIR branch broadens to the cap',resources:'no new GPU target, uniform or readback; opt-in shader variants and up to two extra normal evaluations per selected path boundary; coating radiance also evaluates its selected center normal',limits:Object.freeze(['global curved inverse/path correspondence','full anisotropic/compound stochastic and participating-medium differentials','material-probe offsets below representable world-position ULP or across topology seams'])});
