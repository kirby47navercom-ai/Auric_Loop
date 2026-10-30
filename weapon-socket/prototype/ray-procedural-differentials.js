// Preserve the base operation and carry only relative changes through its cell
// coordinates. Hash precision remains the authored backend's precision.
export const proceduralDifferentialGLSL=`
float hbRayDeltaNoiseHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
vec4 hbRayDeltaNoiseCorners(vec2 cell){return vec4(hbRayDeltaNoiseHash(cell),hbRayDeltaNoiseHash(cell+vec2(1,0)),hbRayDeltaNoiseHash(cell+vec2(0,1)),hbRayDeltaNoiseHash(cell+vec2(1,1)));}
float hbRayDeltaNoiseCell(vec2 f,vec2 df,vec4 h,vec4 dh){
 vec2 u=f*f*(vec2(3,3)-2.0*f),du=df*(6.0*f*(vec2(1,1)-f)+df*(vec2(3,3)-6.0*f-2.0*df));
 float low=mix(h.x,h.y,u.x),high=mix(h.z,h.w,u.x),dl=dh.x+(dh.y-dh.x)*u.x+(h.y-h.x)*du.x+(dh.y-dh.x)*du.x,dhh=dh.z+(dh.w-dh.z)*u.x+(h.w-h.z)*du.x+(dh.w-dh.z)*du.x;
 return dl+(dhh-dl)*u.y+(high-low)*du.y+(dhh-dl)*du.y;
}
vec2 hbRayDeltaNoiseAnchored(vec2 edge,vec2 corner,vec4 h){
 if(corner.x>.5)h=h.yxwz;if(corner.y>.5)h=h.zwxy;
 vec2 w=edge*edge*(vec2(3,3)-2.0*abs(edge));float residual=(h.y-h.x)*w.x+(h.z-h.x)*w.y+(h.w-h.y-h.z+h.x)*w.x*w.y;return vec2(h.x,residual);
}
float hbRayDeltaNoise(vec4 a,vec4 b,vec4 da,vec4 db){
 vec2 p=a.xy*b.x,dp=a.xy*db.x+da.xy*b.x+da.xy*db.x,cell=floor(p),f=fract(p),stepCell=floor(f+dp);vec4 h=hbRayDeltaNoiseCorners(cell);
 if(stepCell.x==0.0&&stepCell.y==0.0)return hbRayDeltaNoiseCell(f,dp,h,vec4(0,0,0,0));
 vec2 oldCorner=step(vec2(.5,.5),f),nextCorner=step(vec2(.5,.5),(f-stepCell)+dp),oldPair=hbRayDeltaNoiseAnchored(f-oldCorner,oldCorner,h),nextPair=hbRayDeltaNoiseAnchored((f-(stepCell+nextCorner))+dp,nextCorner,hbRayDeltaNoiseCorners(cell+stepCell));
 return (nextPair.x-oldPair.x)+(nextPair.y-oldPair.y);
}
float hbRayDeltaChecker(vec4 a,vec4 b,vec4 da,vec4 db){
 vec2 p=a.xy*b.xy,dp=a.xy*db.xy+da.xy*b.xy+da.xy*db.xy,steps=floor(fract(p)+dp);vec2 oldCells=floor(p);oldCells-=2.0*floor(oldCells*.5);float old=oldCells.x+oldCells.y;old-=2.0*floor(old*.5);vec2 parity=steps-2.0*floor(steps*.5);float next=old+parity.x+parity.y;return next-2.0*floor(next*.5)-old;
}
`;
export const proceduralDifferentialExpressions=Object.freeze({noise:'hbRayScalar(hbRayDeltaNoise(a,b,aDelta,bDelta))',checker:'hbRayScalar(hbRayDeltaChecker(a,b,aDelta,bDelta))'});
export function noiseCellDifferentialNode(T,f,df,h,dh){
 const u=f.mul(f).mul(T.vec2(3).sub(f.mul(2))).toVar(),du=df.mul(f.mul(6).mul(T.vec2(1).sub(f)).add(df.mul(T.vec2(3).sub(f.mul(6)).sub(df.mul(2))))).toVar(),low=T.mix(h.x,h.y,u.x).toVar(),high=T.mix(h.z,h.w,u.x).toVar(),dl=dh.x.add(dh.y.sub(dh.x).mul(u.x)).add(h.y.sub(h.x).mul(du.x)).add(dh.y.sub(dh.x).mul(du.x)).toVar(),dhigh=dh.z.add(dh.w.sub(dh.z).mul(u.x)).add(h.w.sub(h.z).mul(du.x)).add(dh.w.sub(dh.z).mul(du.x)).toVar();
 return dl.add(dhigh.sub(dl).mul(u.y)).add(high.sub(low).mul(du.y)).add(dhigh.sub(dl).mul(du.y));
}
export function proceduralDifferentialNode(T,operation,[a,b],[da,db]){
 if(operation!=='noise'&&operation!=='checker')return null;
 const noise=operation==='noise',p=a.xy.mul(noise?b.x:b.xy).toVar(),dp=a.xy.mul(noise?db.x:db.xy).add(da.xy.mul(noise?b.x:b.xy)).add(da.xy.mul(noise?db.x:db.xy)).toVar(),f=p.fract().toVar(),steps=f.add(dp).floor().toVar();
 if(!noise){const cells=p.floor().mod(2).toVar(),sum=cells.x.add(cells.y).toVar(),old=sum.sub(sum.mul(.5).floor().mul(2)).toVar(),parity=steps.sub(steps.mul(.5).floor().mul(2)).toVar(),next=old.add(parity.x).add(parity.y).toVar();return T.vec4(next.sub(next.mul(.5).floor().mul(2)).sub(old));}
 const hash=p=>p.dot(T.vec2(127.1,311.7)).sin().mul(43758.5453).fract(),corners=p=>T.vec4(hash(p),hash(p.add(T.vec2(1,0))),hash(p.add(T.vec2(0,1))),hash(p.add(T.vec2(1,1)))),cell=p.floor().toVar(),h=corners(cell).toVar(),result=T.float(0).toVar();
 T.If(steps.x.equal(0).and(steps.y.equal(0)),()=>{result.assign(noiseCellDifferentialNode(T,f,dp,h,T.vec4(0)));}).Else(()=>{
  const anchored=(edge,corner,values)=>{const x=corner.x.greaterThan(.5).select(values.yxwz,values).toVar(),v=corner.y.greaterThan(.5).select(x.zwxy,x).toVar(),w=edge.mul(edge).mul(T.vec2(3).sub(edge.abs().mul(2))).toVar();return T.vec2(v.x,v.y.sub(v.x).mul(w.x).add(v.z.sub(v.x).mul(w.y)).add(v.w.sub(v.y).sub(v.z).add(v.x).mul(w.x).mul(w.y)));},oldCorner=T.step(T.vec2(.5),f).toVar(),nextCorner=T.step(T.vec2(.5),f.sub(steps).add(dp)).toVar(),oldPair=anchored(f.sub(oldCorner),oldCorner,h).toVar(),nextPair=anchored(f.sub(steps.add(nextCorner)).add(dp),nextCorner,corners(cell.add(steps))).toVar();result.assign(nextPair.x.sub(oldPair.x).add(nextPair.y.sub(oldPair.y)));
 });return T.vec4(result);
}
