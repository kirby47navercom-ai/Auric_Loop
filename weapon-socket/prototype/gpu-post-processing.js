import {Vector4,RenderTarget,HalfFloatType,DataTexture,RGBAFormat,UnsignedByteType,LinearFilter} from 'three/webgpu';
import * as T from 'three/tsl';
import {fxaa} from 'three/addons/tsl/display/FXAANode.js';
import {packedPostProcess,lookupSize} from './post-processing.js';

export function gpuPostProcessing(source,chromatic,options={}){
 const uniforms=Object.fromEntries(Object.entries(packedPostProcess()).map(([k,v])=>[k,T.uniform(new Vector4(...v))]));
 const {grade,filter,effects,vignette,vignetteColor,balance,lift,gamma,gain,lens,bokeh,focus,occlusion,lookup,camera,exposure,adapt}=uniforms,uv=T.uv(),sampled=chromatic||options.depth||options.exposure,input=sampled?T.convertToTexture(source):source,depth=options.depth;
 const owned=[],neutral=new DataTexture(new Uint8Array([255,255,255,255]),1,1,RGBAFormat,UnsignedByteType);neutral.minFilter=neutral.magFilter=LinearFilter;neutral.needsUpdate=true;const lut=T.texture(neutral);let meter=null,history=null;
 const linear=d=>camera.z.greaterThan(.5).select(T.mix(camera.x,camera.y,d),camera.x.mul(camera.y).div(camera.y.sub(d.mul(camera.y.sub(camera.x))).max(.000001)));
 const depthAt=at=>linear(depth.sample(at.clamp(0,1)).r);
 const screen=T.Fn(([at])=>{
  const c=input.sample(at).rgb.toVar();if(depth){const z=depthAt(at).toVar();
   T.If(focus.w.greaterThan(0),()=>{const distanceRadius=z.sub(focus.x).abs().div(focus.y.max(.001)).clamp(0,1).mul(focus.z),diameter=lens.x.mul(lens.x).mul(T.float(1).sub(focus.x.div(z.max(.000001))).abs()).div(lens.y.mul(focus.x.sub(lens.x).max(.000001))),radius=lens.w.greaterThan(.5).select(diameter.div(lens.z).mul(T.screenSize.y).mul(.5).min(focus.z),distanceRadius),sum=c.toVar(),total=T.float(1).toVar();
    T.Loop({start:0,end:32,type:'int',condition:'<',name:'dofSample'},({dofSample:i})=>{T.If(T.float(i).greaterThanEqual(bokeh.w),()=>{T.Break();});const a=T.float(i).mul(2.39996323).add(bokeh.y),halfAngle=T.float(Math.PI).div(bokeh.x.max(3)),phase=a.sub(bokeh.y).add(halfAngle).mod(halfAngle.mul(2)).sub(halfAngle),shape=bokeh.x.greaterThanEqual(3).select(T.mix(halfAngle.cos().div(phase.cos()),1,bokeh.z),1),offset=T.vec2(a.cos(),a.sin()).mul(T.float(i).add(.5).div(bokeh.w).sqrt()).mul(shape).mul(radius).div(T.screenSize),other=at.add(offset).clamp(0,1),weight=depthAt(other).lessThan(z.sub(z.mul(.01).max(.02))).select(0,1);sum.addAssign(input.sample(other).rgb.mul(weight));total.addAssign(weight);});c.assign(T.mix(c,sum.div(total),focus.w));});
   T.If(occlusion.z.greaterThan(0).and(depth.sample(at).r.lessThan(.99999)),()=>{const occ=T.float(0).toVar(),delta=occlusion.x.mul(T.screenSize.y).mul(camera.w).div(camera.z.greaterThan(.5).select(1,z.max(.01))).max(1).div(T.screenSize);
    T.Loop(8,({i})=>{const a=T.float(i).mul(.785398163),d=z.sub(depthAt(at.add(T.vec2(a.cos(),a.sin()).mul(delta)).clamp(0,1)));occ.addAssign(T.step(occlusion.y,d).mul(T.float(1).sub(d.smoothstep(0,occlusion.x.mul(2)))));});c.mulAssign(T.float(1).sub(occ.mul(.125).mul(occlusion.z)).max(0));});}
  return c;
 });
 let c=sampled?screen(uv):input.rgb;
 if(chromatic){const delta=uv.sub(.5).mul(effects.z.mul(.015));c=T.vec3(screen(uv.add(delta).clamp(0,1)).r,c.g,screen(uv.sub(delta).clamp(0,1)).b);}
 if(options.exposure){
  history=new RenderTarget(1,1,{type:HalfFloatType,depthBuffer:false});const previous=T.texture(history.texture);
  const metering=T.Fn(()=>{const sum=T.float(0).toVar();T.Loop(64,({i})=>{const fi=T.float(i),at=T.vec2(fi.mod(8),fi.div(8).floor()).add(.5).div(8),y=(options.meterSource||input).sample(at).rgb.dot(T.vec3(.2126,.7152,.0722)).max(.00001);sum.addAssign(y.log2());});const target=exposure.w.log2().sub(sum.div(64)).clamp(exposure.y,exposure.z),old=previous.sample(T.vec2(.5)).r,speed=target.greaterThan(old).select(adapt.x,adapt.y),value=adapt.w.lessThan(.5).select(target,T.mix(old,target,T.float(1).sub(speed.mul(adapt.z).negate().exp())));return T.vec4(value,0,0,1);});
  meter=T.rtt(metering(),1,1,{type:HalfFloatType,depthBuffer:false});owned.push(meter);c=c.mul(meter.sample(T.vec2(.5)).r.mul(exposure.x).exp2());
 }
 c=c.mul(grade.x.exp2()).mul(filter.rgb).mul(T.vec3(balance.x,balance.y.negate(),balance.x.negate()).exp2());c=c.add(lift.rgb).max(0).pow(T.vec3(1).div(gamma.rgb.max(.1))).mul(gain.rgb).sub(.18).mul(grade.y).add(.18).max(0);
 const y=c.dot(T.vec3(.2126,.7152,.0722));c=T.mix(T.vec3(y),c,grade.z);const axis=T.vec3(.577350269),a=grade.w;c=c.mul(a.cos()).add(axis.cross(c).mul(a.sin())).add(axis.mul(axis.dot(c)).mul(T.float(1).sub(a.cos()))).max(0);
 const d=uv.sub(vignette.xy).mul(2),radius=T.vec2(d.x.mul(vignette.z.greaterThan(.5).select(T.screenSize.x.div(T.screenSize.y),1)),d.y).length(),fade=radius.smoothstep(T.float(1).sub(effects.y.max(.001)),1).mul(effects.x);c=T.mix(c,vignetteColor.rgb,fade);
 const noise=uv.mul(T.screenSize).floor().add(vignette.w.mul(60).floor()).dot(T.vec2(12.9898,78.233)).sin().mul(43758.5453).fract().sub(.5);c=c.add(noise.mul(effects.w.mul(.08))).max(0);
 let node=T.vec4(c,input.a);
 if(options.renderer){
  node=T.toneMapping(options.renderer.toneMapping,T.toneMappingExposure,node);const mapped=T.Fn(([color])=>{const result=color.toVar();T.If(lookup.x.greaterThan(0).and(lookup.y.greaterThanEqual(2)),()=>{const n=lookup.y,b=color.b.clamp(0,1).mul(n.sub(1)),slice=b.floor(),at=color.rg.clamp(0,1).mul(n.sub(1)).add(.5).div(T.vec2(n.mul(n),n)),lo=lut.sample(at.add(T.vec2(slice.div(n),0))).rgb,hi=lut.sample(at.add(T.vec2(slice.add(1).min(n.sub(1)).div(n),0))).rgb;result.assign(T.mix(color,T.mix(lo,hi,b.fract()),lookup.x));});return result;});
  node=T.renderOutput(T.vec4(mapped(node.rgb),node.a),0,options.renderer.outputColorSpace);
  if(options.aa){const target=T.convertToTexture(node);owned.push(target);node=T.mix(node,fxaa(target),occlusion.w);}
 }
 if(input.isRTTNode)owned.push(input);
 let time=0,scene=null,viewCamera=null;
 return {node,dispose(){for(const target of new Set(owned)){target.renderTarget.dispose();target._quadMesh?.material.dispose();}history?.dispose();neutral.dispose();},after(renderer){if(meter){renderer.copyTextureToTexture(meter.value,history.texture);uniforms.adapt.value.w=1;}},update(p,nextTime,view,world){const packed=packedPostProcess(p,nextTime,view),map=world?.userData.hbPostLookup?.(p?.colorLookup);packed.lookup[1]=lookupSize(map);lut.value=map||neutral;packed.adapt[2]=Math.min(.1,Math.max(0,nextTime-time));packed.adapt[3]=scene===world&&viewCamera===view&&nextTime>=time?uniforms.adapt.value.w:0;for(const [k,v]of Object.entries(packed))uniforms[k].value.fromArray(v);time=nextTime;scene=world;viewCamera=view;}};
}
