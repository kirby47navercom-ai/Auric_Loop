import {proceduralDifferentialGLSL,proceduralDifferentialExpressions,proceduralDifferentialNode} from './ray-procedural-differentials.js';
// Store offsets, not shifted absolute values. Affine graph operations can then
// preserve a sub-ULP footprint even when their base coordinate is very large.
import {nonlinearDifferentialGLSL,nonlinearDifferentialExpressions,nonlinearDifferentialNode} from './ray-nonlinear-differentials.js';
const zero='vec4(0,0,0,0)';
export const rayDifferentialGLSL=`
vec4 hbRayDeltaMin(vec4 a,vec4 b,vec4 da,vec4 db){vec4 result;for(int hbLane=0;hbLane<4;hbLane++)result[hbLane]=a[hbLane]<=b[hbLane]?min(da[hbLane],b[hbLane]-a[hbLane]+db[hbLane]):min(a[hbLane]-b[hbLane]+da[hbLane],db[hbLane]);return result;}
vec4 hbRayDeltaMax(vec4 a,vec4 b,vec4 da,vec4 db){vec4 result;for(int hbLane=0;hbLane<4;hbLane++)result[hbLane]=a[hbLane]<=b[hbLane]?max(a[hbLane]-b[hbLane]+da[hbLane],db[hbLane]):max(da[hbLane],b[hbLane]-a[hbLane]+db[hbLane]);return result;}
vec4 hbRayDeltaAbs(vec4 a,vec4 da){vec4 result;for(int hbLane=0;hbLane<4;hbLane++)result[hbLane]=a[hbLane]>=0.0?(da[hbLane]>=-a[hbLane]?da[hbLane]:-2.0*a[hbLane]-da[hbLane]):(da[hbLane]>=-a[hbLane]?2.0*a[hbLane]+da[hbLane]:-da[hbLane]);return result;}
float hbRayDeltaLength(vec4 a,vec4 da){float old=length(a),next=length(a+da);return (2.0*dot(a,da)+dot(da,da))/max(old+next,1e-30);}
vec4 hbRayDeltaSqrt(vec4 a,vec4 da){vec4 z=vec4(0,0,0,0),d=hbRayDeltaMax(a,z,da,z),old=sqrt(max(a,z)),next=sqrt(max(a+da,z));return d/max(old+next,vec4(1e-30,1e-30,1e-30,1e-30));}
vec4 hbRayDeltaNormalize(vec4 a,vec4 da){float old=length(a),d=hbRayDeltaLength(a,da);float delta=old>=.000001?max(d,.000001-old):max(old-.000001+d,0.0),den=max(length(a+da),.000001);return da/den-(a/max(old,.000001))*(delta/den);}
vec4 hbRayDeltaDivide(vec4 a,vec4 b,vec4 da,vec4 db){vec4 result;for(int hbLane=0;hbLane<4;hbLane++){bool oldClamp=abs(b[hbLane])<.000001,nextClamp=abs(b[hbLane]+db[hbLane])<.000001;float old=oldClamp?.000001:b[hbLane],next=nextClamp?.000001:b[hbLane]+db[hbLane],change=oldClamp?(nextClamp?0.0:b[hbLane]-.000001+db[hbLane]):(nextClamp?.000001-b[hbLane]:db[hbLane]);result[hbLane]=(da[hbLane]-(a[hbLane]/old)*change)/next;}return result;}
vec4 hbRayDeltaRotate(vec4 a,vec4 b,vec4 c,vec4 da,vec4 db,vec4 dc){vec2 p=a.xy-c.xy,dp=da.xy-dc.xy;float cs=cos(b.x),sn=sin(b.x),halfSin=sin(db.x*.5),ds=cs*sin(db.x)-2.0*sn*halfSin*halfSin,dsCos=-sn*sin(db.x)-2.0*cs*halfSin*halfSin;return vec4(cs*dp.x-sn*dp.y+dsCos*p.x-ds*p.y+dsCos*dp.x-ds*dp.y+dc.x,sn*dp.x+cs*dp.y+ds*p.x+dsCos*p.y+ds*dp.x+dsCos*dp.y+dc.y,0,0);}
vec4 hbRayDeltaReflect(vec4 a,vec4 b,vec4 da,vec4 db){vec3 n=b.xyz/max(length(b.xyz),1e-30);float den=max(length(b.xyz+db.xyz),1e-30),dl=hbRayDeltaLength(vec4(b.xyz,0),vec4(db.xyz,0));vec3 dn=db.xyz/den-n*(dl/den);float base=dot(a.xyz,n),change=dot(a.xyz,dn)+dot(da.xyz,n)+dot(da.xyz,dn);return vec4(da.xyz-2.0*(change*n+base*dn+change*dn),0);}
vec4 hbRayDeltaEyeUV(vec4 a,vec4 b,vec4 c,vec4 d,vec4 da,vec4 db,vec4 dc,vec4 dd){vec4 z=vec4(0,0,0,0),one=vec4(1,1,1,1),den=vec4(max(abs(b.z),.1),max(abs(b.z),.1),max(abs(b.z),.1),max(abs(b.z),.1)),ad=hbRayDeltaAbs(b,db),dden=hbRayDeltaMax(vec4(abs(b.z),abs(b.z),abs(b.z),abs(b.z)),vec4(.1,.1,.1,.1),vec4(ad.z,ad.z,ad.z,ad.z),z);float cv=max(c.x,0.0),dv=clamp(d.x,0.0,1.0),cd=hbRayDeltaMax(c,z,dc,z).x,ddv=hbRayDeltaMin(max(d,z),one,hbRayDeltaMax(d,z,dd,z),z).x,f=cv*dv,df=cv*ddv+dv*cd+cd*ddv;vec2 q=b.xy/den.xy,dq=hbRayDeltaDivide(b,den,db,dden).xy;return vec4(da.xy-q*df-dq*f-dq*df,0,0);}
`+nonlinearDifferentialGLSL+proceduralDifferentialGLSL;
export const rayDifferentialExpressions=Object.freeze({
 constant:zero,time:zero,viewDirection:zero,store:zero,
 uv:'vec4(uvDelta,0,0)',worldPosition:'vec4(pointDelta,0)',worldNormal:'vec4(normalDelta,0)',
 channel:'vec4(aDelta[int(value.x)],aDelta[int(value.x)],aDelta[int(value.x)],aDelta[int(value.x)])',
 combine:'vec4(aDelta.x,bDelta.x,cDelta.x,dDelta.x)',cast:'aDelta',
 add:'aDelta+bDelta',subtract:'aDelta-bDelta',oneMinus:'-aDelta',
 multiply:'a*bDelta+b*aDelta+aDelta*bDelta',
 tilingOffset:'a*bDelta+b*aDelta+aDelta*bDelta+cDelta',
 panner:'aDelta+b*cDelta.x+bDelta*c.x+bDelta*cDelta.x',
 lerp:'aDelta+(bDelta-aDelta)*c.x+(b-a)*cDelta.x+(bDelta-aDelta)*cDelta.x',
 dot:'hbRayScalar(dot(a.xyz,bDelta.xyz)+dot(aDelta.xyz,b.xyz)+dot(aDelta.xyz,bDelta.xyz))',
 cross:'vec4(cross(a.xyz,bDelta.xyz)+cross(aDelta.xyz,b.xyz)+cross(aDelta.xyz,bDelta.xyz),0)',
 absolute:'hbRayDeltaAbs(a,aDelta)',
 min:'hbRayDeltaMin(a,b,aDelta,bDelta)',max:'hbRayDeltaMax(a,b,aDelta,bDelta)',
 clamp:'hbRayDeltaMin(max(a,b),c,hbRayDeltaMax(a,b,aDelta,bDelta),cDelta)',
 saturate:'hbRayDeltaMin(max(a,vec4(0,0,0,0)),vec4(1,1,1,1),hbRayDeltaMax(a,vec4(0,0,0,0),aDelta,vec4(0,0,0,0)),vec4(0,0,0,0))',
 floor:'floor(fract(a)+aDelta)',ceil:'ceil(fract(a)+aDelta)-ceil(fract(a))',
 fraction:'aDelta-floor(fract(a)+aDelta)',
 step:'step(vec4(0,0,0,0),(b-a)+(bDelta-aDelta))-step(a,b)',
 sign:'step(-a,aDelta)-step(aDelta,-a)-sign(a)',
 sine:'cos(a)*sin(aDelta)-2.0*sin(a)*sin(aDelta*.5)*sin(aDelta*.5)',
 cosine:'-sin(a)*sin(aDelta)-2.0*cos(a)*sin(aDelta*.5)*sin(aDelta*.5)',
 squareRoot:'hbRayDeltaSqrt(a,aDelta)',
 length:'meta.w<1.5?hbRayScalar(hbRayDeltaAbs(a,aDelta).x):hbRayScalar(hbRayDeltaLength(a,aDelta))',
 normalize:'meta.w<1.5?hbRayScalar(step(-a.x,aDelta.x)-step(aDelta.x,-a.x)-sign(a.x)):hbRayDeltaNormalize(a,aDelta)',
 divide:'hbRayDeltaDivide(a,b,aDelta,bDelta)',
 distance:'hbRayScalar(hbRayDeltaLength(vec4(a.xyz-b.xyz,0),vec4(aDelta.xyz-bDelta.xyz,0)))',
 rotateUV:'hbRayDeltaRotate(a,b,c,aDelta,bDelta,cDelta)',
 reflect:'hbRayDeltaReflect(a,b,aDelta,bDelta)',
 eyeUV:'hbRayDeltaEyeUV(a,b,c,d,aDelta,bDelta,cDelta,dDelta)',
 ...proceduralDifferentialExpressions,...nonlinearDifferentialExpressions
});
export function rayDifferentialExpression(operation,expression){
 return rayDifferentialExpressions[operation]??'('+expression.replace(/\b([abcd])\b/g,k=>'('+k+'+'+k+'Delta)')+')-v';
}
export const rayDifferentialAxis=(expression,axis)=>expression.replace(/\b([abcd]|uv|point|normal)Delta\b/g,(_,name)=>name+axis);
export function rayDifferentialNode(T,operation,base,delta,context,fallback){
 const[a,b,c,d]=base,[da,db,dc,dd]=delta;
 // ConditionalNode needs scalar conditions; vector conditions can select a
 // whole branch and lose per-channel comparisons on the generated backend.
 const lanes=callback=>T.vec4(...['x','y','z','w'].map(callback));
 const minLane=(a,b,da,db)=>a.lessThanEqual(b).select(T.min(da,b.sub(a).add(db)),T.min(a.sub(b).add(da),db));
 const maxLane=(a,b,da,db)=>a.lessThanEqual(b).select(T.max(a.sub(b).add(da),db),T.max(da,b.sub(a).add(db)));
 const absLane=(a,da)=>{const positive=da.greaterThanEqual(a.negate());return a.greaterThanEqual(0).select(positive.select(da,a.mul(-2).sub(da)),positive.select(a.mul(2).add(da),da.negate()));};
 const minDelta=(a,b,da,db)=>lanes(k=>minLane(a[k],b[k],da[k],db[k]));
 const maxDelta=(a,b,da,db)=>lanes(k=>maxLane(a[k],b[k],da[k],db[k]));
 const absDelta=(a,da)=>lanes(k=>absLane(a[k],da[k]));
 const lengthDelta=(a,da)=>a.dot(da).mul(2).add(da.dot(da)).div(a.length().add(a.add(da).length()).max(1e-30));
 const signDelta=(a,da)=>T.step(a.negate(),da).sub(T.step(da,a.negate())).sub(a.sign());
 const divideLane=(a,b,da,db)=>{const oldClamp=b.abs().lessThan(.000001),nextClamp=b.add(db).abs().lessThan(.000001),old=oldClamp.select(.000001,b),next=nextClamp.select(.000001,b.add(db)),change=oldClamp.select(nextClamp.select(0,b.sub(.000001).add(db)),nextClamp.select(T.float(.000001).sub(b),db));return da.sub(a.div(old).mul(change)).div(next);};
 const divideDelta=(a,b,da,db)=>lanes(k=>divideLane(a[k],b[k],da[k],db[k]));
 switch(operation){
  case'constant':case'time':case'viewDirection':return T.vec4(0);
  case'uv':return T.vec4(context[0],0,0);
  case'worldPosition':return T.vec4(context[1],0);
  case'worldNormal':return T.vec4(context[2],0);
  case'channel':return T.vec4(Number.isInteger(context[5])?da['xyzw'[context[5]]]:da.element(T.int(context[3].x)));
  case'combine':return T.vec4(da.x,db.x,dc.x,dd.x);
  case'cast':return da;
  case'add':return da.add(db);
  case'subtract':return da.sub(db);
  case'oneMinus':return da.negate();
  case'multiply':return a.mul(db).add(b.mul(da)).add(da.mul(db));
  case'tilingOffset':return a.mul(db).add(b.mul(da)).add(da.mul(db)).add(dc);
  case'panner':return da.add(b.mul(dc.x)).add(db.mul(c.x)).add(db.mul(dc.x));
  case'lerp':return da.add(db.sub(da).mul(c.x)).add(b.sub(a).mul(dc.x)).add(db.sub(da).mul(dc.x));
  case'dot':return T.vec4(a.xyz.dot(db.xyz).add(da.xyz.dot(b.xyz)).add(da.xyz.dot(db.xyz)));
  case'cross':return T.vec4(a.xyz.cross(db.xyz).add(da.xyz.cross(b.xyz)).add(da.xyz.cross(db.xyz)),0);
  case'absolute':return absDelta(a,da);
  case'min':return minDelta(a,b,da,db);
  case'max':return maxDelta(a,b,da,db);
  case'clamp':return minDelta(T.max(a,b),c,maxDelta(a,b,da,db),dc);
  case'saturate':return minDelta(a.max(0),T.vec4(1),maxDelta(a,T.vec4(0),da,T.vec4(0)),T.vec4(0));
  case'floor':return a.fract().add(da).floor();
  case'ceil':return a.fract().add(da).ceil().sub(a.fract().ceil());
  case'fraction':return da.sub(a.fract().add(da).floor());
  case'step':return T.step(T.vec4(0),b.sub(a).add(db.sub(da))).sub(T.step(a,b));
  case'sign':return signDelta(a,da);
  case'sine':return a.cos().mul(da.sin()).sub(a.sin().mul(2).mul(da.mul(.5).sin()).mul(da.mul(.5).sin()));
  case'cosine':return a.sin().negate().mul(da.sin()).sub(a.cos().mul(2).mul(da.mul(.5).sin()).mul(da.mul(.5).sin()));
  case'squareRoot':return maxDelta(a,T.vec4(0),da,T.vec4(0)).div(a.max(0).sqrt().add(a.add(da).max(0).sqrt()).max(1e-30));
  case'length':return (context[4]?.w??T.float(4)).lessThan(1.5).select(T.vec4(absDelta(a,da).x),T.vec4(lengthDelta(a,da)));
  case'normalize':{const old=a.length(),d=lengthDelta(a,da),change=old.greaterThanEqual(.000001).select(d.max(T.float(.000001).sub(old)),old.sub(.000001).add(d).max(0)),den=a.add(da).length().max(.000001),result=da.div(den).sub(a.div(old.max(.000001)).mul(change.div(den)));return (context[4]?.w??T.float(4)).lessThan(1.5).select(T.vec4(signDelta(a,da).x),result);}
  case'divide':return divideDelta(a,b,da,db);
  case'distance':return T.vec4(lengthDelta(T.vec4(a.xyz.sub(b.xyz),0),T.vec4(da.xyz.sub(db.xyz),0)));
  case'rotateUV':{const p=a.xy.sub(c.xy),dp=da.xy.sub(dc.xy),cs=b.x.cos(),sn=b.x.sin(),h=db.x.mul(.5).sin(),ds=cs.mul(db.x.sin()).sub(sn.mul(2).mul(h).mul(h)),dcs=sn.negate().mul(db.x.sin()).sub(cs.mul(2).mul(h).mul(h));return T.vec4(cs.mul(dp.x).sub(sn.mul(dp.y)).add(dcs.mul(p.x)).sub(ds.mul(p.y)).add(dcs.mul(dp.x)).sub(ds.mul(dp.y)).add(dc.x),sn.mul(dp.x).add(cs.mul(dp.y)).add(ds.mul(p.x)).add(dcs.mul(p.y)).add(ds.mul(dp.x)).add(dcs.mul(dp.y)).add(dc.y),0,0);}
  case'reflect':{const n=b.xyz.div(b.xyz.length().max(1e-30)),den=b.xyz.add(db.xyz).length().max(1e-30),dl=lengthDelta(T.vec4(b.xyz,0),T.vec4(db.xyz,0)),dn=db.xyz.div(den).sub(n.mul(dl.div(den))),base=a.xyz.dot(n),change=a.xyz.dot(dn).add(da.xyz.dot(n)).add(da.xyz.dot(dn));return T.vec4(da.xyz.sub(n.mul(change).add(dn.mul(base)).add(dn.mul(change)).mul(2)),0);}
  case'eyeUV':{const z=T.float(0),den=b.z.abs().max(.1).toVar(),dden=maxLane(b.z.abs(),T.float(.1),absLane(b.z,db.z),z).toVar(),cv=c.x.max(0).toVar(),dv=d.x.clamp(0,1).toVar(),cd=maxLane(c.x,z,dc.x,z).toVar(),ddv=minLane(d.x.max(0),T.float(1),maxLane(d.x,z,dd.x,z),z).toVar(),f=cv.mul(dv).toVar(),df=cv.mul(ddv).add(dv.mul(cd)).add(cd.mul(ddv)).toVar(),q=b.xy.div(den).toVar(),dq=T.vec2(divideLane(b.x,den,db.x,dden),divideLane(b.y,den,db.y,dden)).toVar();return T.vec4(da.xy.sub(q.mul(df)).sub(dq.mul(f)).sub(dq.mul(df)),0,0);}
  default:return proceduralDifferentialNode(T,operation,base,delta)??nonlinearDifferentialNode(T,operation,base,delta,{lanes,minLane,maxLane,lengthDelta,divideLane})??fallback();
 }
}
