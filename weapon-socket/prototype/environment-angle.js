// Octant reduction keeps |t| <= tan(pi/8); the alternating remainder is <= |t|^17/17.
// Avoid driver acos/atan2 approximations shifting high-frequency HDRI texels.
export const environmentAngleGLSL=`
float hbEnvironmentAtan2(float y,float x){float ax=abs(x),ay=abs(y),r=min(ax,ay)/max(max(ax,ay),1e-30);bool fold=r>.4142135623730951;float t=fold?(r-1.0)/(r+1.0):r,s=t*t;
float a=t*(1.0+s*(-.3333333333333333+s*(.2+s*(-.14285714285714285+s*(.1111111111111111+s*(-.09090909090909091+s*(.07692307692307693+s*(-.06666666666666667))))))));
if(fold)a+=.7853981633974483;if(ay>ax)a=1.5707963267948966-a;if(x<0.0)a=3.141592653589793-a;if(y<0.0)a=-a;return a;}
`;
