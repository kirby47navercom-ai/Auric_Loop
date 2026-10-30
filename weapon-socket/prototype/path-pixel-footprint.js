export const pathPixelFootprintContract=Object.freeze({version:1,model:'project physical lens displacement into the screen differential frame with independently scaled dual coordinates',degenerate:'zero axes or squared sine between axes <=1e-6 return zero; scale independent',radius:'existing maximum32 pixels, unchanged',resources:'existing four differential rays and scalar radius; no extra queries, image, uniform, buffer or readback',limits:'authored/packed float representability and subtraction of already-rounded world hit points; this is a local projected footprint, not global inverse correspondence'});
// The guide already includes the shared coordinate basis through geometry.
export const pathPixelFootprintGLSL=`
vec2 hbPathOffset(vec3 x,vec3 y,vec3 delta){vec3 crossAxis=cross(hbRayUnit(x),hbRayUnit(y));if(dot(crossAxis,crossAxis)<=1e-6)return vec2(0,0);return hbRayDualCoordinates(x,y,delta);}
`;
