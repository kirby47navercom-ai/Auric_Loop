// Opposing filtered normals can cancel exactly. Use the neutral tangent normal
// instead of asking a driver to normalize a zero vector.
export const normalMapContract=Object.freeze({version:2,encoding:'RGB [0,1] to signed tangent XYZ; strength multiplies XY before normalization',zeroLength:'neutral tangent normal [0,0,1]',normalization:'GPU max-component scaling before length preserves directions when squared length would overflow or underflow; CPU uses double hypot; finite representable intermediate components required',filtering:'normalize after filtering; do not normalize encoded RGB as color',backends:Object.freeze(['cpu','d3d11','webgl2','webgpu']),resources:'no additional textures, GPU targets, readbacks or per-frame CPU work'});
export function decodeNormalMap(value,strength=1){
 const n=[(value[0]*2-1)*strength,(value[1]*2-1)*strength,value[2]*2-1],length=Math.hypot(...n);
 return length>0?n.map(v=>v/length):[0,0,1];
}
export const normalMapGLSL='vec3 hbDecodeNormalMap(vec3 value,float strength){vec3 n=vec3((value.xy*2.0-1.0)*strength,value.z*2.0-1.0);float scale=max(abs(n.x),max(abs(n.y),abs(n.z)));if(scale<=0.0)return vec3(0,0,1);n/=scale;return n/length(n);}\n';
export function normalMapNode(T,value,strength){
 const n=T.vec3(value.xy.mul(2).sub(1).mul(strength),value.z.mul(2).sub(1)),scale=n.x.abs().max(n.y.abs()).max(n.z.abs()),scaled=n.div(scale.greaterThan(0).select(scale,T.float(1))),size=scaled.length();
 return scale.greaterThan(0).select(scaled.div(size.max(1e-20)),T.vec3(0,0,1));
}

export const normalFrameGLSL=`
vec3 hbFrameUnit(vec3 v,vec3 fallback){float s=max(abs(v.x),max(abs(v.y),abs(v.z)));if(!(s>0.0)||any(isnan(v))||any(isinf(v)))return fallback;v/=s;return v/length(v);}
vec3 hbMaterialNormalFrame(vec3 eye,vec3 normal,vec3 mapN,vec2 uv){vec3 n=hbFrameUnit(normal,vec3(0,0,1)),q0=dFdx(eye),q1=dFdy(eye);vec2 st0=dFdx(uv),st1=dFdy(uv);if(all(equal(mapN.xy,vec2(0))))return mapN.z<0.0?-n:n;float determinant=st0.x*st1.y-st0.y*st1.x;if(determinant==0.0||isnan(determinant)||isinf(determinant))return n;vec3 s=q0*st1.t-q1*st0.t,t=-q0*st1.s+q1*st0.s;if(!(max(abs(s.x),max(abs(s.y),abs(s.z)))>0.0)||!(max(abs(t.x),max(abs(t.y),abs(t.z)))>0.0))return n;s=hbFrameUnit(s,vec3(0));t=hbFrameUnit(t,vec3(0));return hbFrameUnit(mat3(s,t,n)*hbFrameUnit(mapN,vec3(0,0,1)),n);}
`;
export function materialNormalFrameNode(T,mapN){
 const unit=(value,fallback)=>{const scale=value.x.abs().max(value.y.abs()).max(value.z.abs()),valid=scale.greaterThan(0).and(value.x.abs().lessThanEqual(3.402823466e38)).and(value.y.abs().lessThanEqual(3.402823466e38)).and(value.z.abs().lessThanEqual(3.402823466e38)),scaled=value.div(valid.select(scale,T.float(1))),length=scaled.length();return valid.select(scaled.div(length.greaterThan(0).select(length,T.float(1))),fallback);};
 return T.Fn(builder=>{const n=unit(T.normalViewGeometry,T.vec3(0,0,1)).toVar(),neutral=mapN.x.equal(0).and(mapN.y.equal(0)),straight=mapN.z.lessThan(0).select(n.negate(),n),hasUV=builder.hasGeometryAttribute('uv'),hasTangent=builder.hasGeometryAttribute('tangent');if(!hasUV&&!hasTangent)return neutral.select(straight,n);let validFrame=T.bool(true);if(hasUV&&!hasTangent){const a=T.dFdx(T.uv()),b=T.dFdy(T.uv()),determinant=a.x.mul(b.y).sub(a.y.mul(b.x));validFrame=determinant.notEqual(0).and(determinant.abs().lessThanEqual(3.402823466e38));}const mapped=T.TBNViewMatrix.mul(unit(mapN,T.vec3(0,0,1))).toVar();return neutral.select(straight,validFrame.select(unit(mapped,n),n));})();
}
