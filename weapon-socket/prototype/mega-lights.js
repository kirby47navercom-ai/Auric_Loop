// Power CDF keeps a uniform floor so a dim or distant light is never excluded.
export function lightDistribution(lights){
 const n=lights.length,table=new Float32Array(n*4);if(!n)return table;
 const weights=lights.map(l=>Math.max(0,(.2126*l[8]+.7152*l[9]+.0722*l[10])*l[11])),total=weights.reduce((a,b)=>a+b,0);let sum=0,previous=0,uniform=false;
 for(let i=0;i<n;i++){sum+=total>0?.99*weights[i]/total+.01/n:1/n;const upper=i===n-1?1:Math.fround(sum),pdf=upper-previous;if(!(pdf>0)){uniform=true;break;}table.set([upper,pdf,1/pdf,i],i*4);previous=upper;}
 if(uniform)for(let i=0;i<n;i++){const a=Math.fround(i/n),b=i===n-1?1:Math.fround((i+1)/n),pdf=b-a;table.set([b,pdf,1/pdf,i],i*4);}
 if(!table.every(Number.isFinite))throw Error('광원 분포가 GPU 범위를 넘었어요.');return table;
}
export function sampleLight(table,value){
 if(!table.length||!Number.isFinite(value)||value<0||value>=1)throw Error('광원 표본을 확인하세요.');let a=0,b=table.length/4-1;
 while(a<b){const m=Math.floor((a+b)/2);if(value<table[m*4])b=m;else a=m+1;}return {index:a,pdf:table[a*4+1]};
}
export const megaLightsGLSL=`
// HB_MEGALIGHTS_BEGIN
#ifdef HB_MEGALIGHTS
float hbLightBudget(){return hbPathOptions.w>0.0?min(hbGeometryLimits.w,hbPathOptions.w):hbGeometryLimits.w;}
vec2 hbSelectLight(float slot,float seed){if(hbPathOptions.w<=0.0||hbGeometryLimits.w<=hbPathOptions.w)return vec2(slot,1.0);float r=(slot+fract(sin(seed*12.9898+78.233)*43758.5453))/hbLightBudget();int a=0,b=int(hbGeometryLimits.w)-1;for(int step=0;step<24;step++){if(a>=b)break;int m=(a+b)/2;float c=hbGeometryLoad(hbGeometryLimits.z+hbGeometryLimits.w*4.0+float(m)).x;if(r<c)b=m;else a=m+1;}vec4 row=hbGeometryLoad(hbGeometryLimits.z+hbGeometryLimits.w*4.0+float(a));return vec2(float(a),1.0/(row.y*hbLightBudget()));}
#else
float hbLightBudget(){return hbGeometryLimits.w;}
vec2 hbSelectLight(float slot,float seed){return vec2(slot,1.0);}
#endif
// HB_MEGALIGHTS_END
`;
