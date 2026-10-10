import {MeshBasicNodeMaterial,DataTexture,DataArrayTexture,Matrix3,Vector2,Vector4,RGBAFormat,RGFormat,FloatType,LinearFilter,SRGBColorSpace,DoubleSide,CustomBlending,AddEquation,MaxEquation,OneFactor,AlwaysStencilFunc,EqualStencilFunc,NotEqualStencilFunc,ReplaceStencilOp} from 'three/webgpu';
import {wgslFn,uniform,texture,sampler,vec2,vec3,vec4,uv,positionWorld,positionGeometry,modelWorldMatrix,cameraViewMatrix,cameraProjectionMatrix,normalWorld,diffuseColor,Fn,attribute,varying,cos,sin,float} from 'three/tsl';

const fade=wgslFn('fn hbLightFade(low:f32,high:f32,value:f32)->f32{if(high-low<0.00001){return step(high,value);}return smoothstep(low,high,value);}');
const polygon=wgslFn(String.raw`
fn hbLightPolygon(shape:texture_2d<f32>,point:vec2<f32>,count:i32,row:i32,falloff:f32)->f32{
  var inside=false;var distanceToEdge=1e20;
  for(var index=0;index<64;index++){if(index>=count){break;}let next=(index+1)%count;
    let a=textureLoad(shape,vec2<i32>(index,row),0).xy;let b=textureLoad(shape,vec2<i32>(next,row),0).xy;let edge=b-a;
    let t=clamp(dot(point-a,edge)/max(dot(edge,edge),1e-20),0.0,1.0);distanceToEdge=min(distanceToEdge,length(point-a-t*edge));
    if((a.y>point.y)!=(b.y>point.y)){if(point.x<(b.x-a.x)*(point.y-a.y)/(b.y-a.y)+a.x){inside=!inside;}}
  }
  if(inside||distanceToEdge<0.00001){return 1.0;}if(falloff<=0.0){return 0.0;}return 1.0-smoothstep(0.0,falloff,distanceToEdge);
}`);
const shade=wgslFn(String.raw`
fn hbLightShade(data:texture_2d<f32>,shape:texture_2d<f32>,atlas:texture_2d<f32>,atlasSampler:sampler,rects:texture_2d<f32>,bounds:texture_2d<f32>,cookies:texture_2d_array<f32>,cookieSampler:sampler,count:i32,layer:i32,world:vec2<f32>,originPoint:vec2<f32>,normal:vec3<f32>,albedo:vec3<f32>,maskValue:vec4<f32>,modes:vec4<f32>,channels:vec4<f32>,cookieSize:f32,volume:f32)->vec3<f32>{
  var accum:array<vec3<f32>,4>;
  for(var index=0;index<64;index++){if(index>=count){break;}if(volume>=0.0&&f32(index)!=volume){continue;}
    let part=layer/8;let bits=textureLoad(data,vec2<i32>(select(6,5,part<4),index),0);let value=bits[part%4];
    if(((u32(value)>>u32(layer%8))&1u)==0u){continue;}
    let origin=textureLoad(data,vec2<i32>(0,index),0);var tint=textureLoad(data,vec2<i32>(1,index),0);
    var attenuation=1.0;var response=1.0;var coverage=1.0;var normalMode=i32(origin.w)%4;let style=(i32(origin.w)/4)%4;var alphaBlend=i32(origin.w)/16;
    var extra=vec4<f32>(0.0);if(origin.z>3.5||volume>=0.0){extra=textureLoad(data,vec2<i32>(8,index),0);}if(volume>=0.0){normalMode=0;alphaBlend=0;}
    if(origin.z>0.5){
      let range=textureLoad(data,vec2<i32>(2,index),0);var settings=textureLoad(data,vec2<i32>(3,index),0);let basis=textureLoad(data,vec2<i32>(4,index),0);
      let delta=world-origin.xy;let local=vec2<f32>(dot(basis.xy,delta),dot(basis.zw,delta));let distance=length(local);
      if(origin.z>3.5){
        if(extra.x<0.0){continue;}let box=textureLoad(data,vec2<i32>(7,index),0);var coord=(local-box.xy)/box.zw+0.5;
        if(any(coord<vec2<f32>(0.0))||any(coord>vec2<f32>(1.0))){continue;}
        if(extra.y>0.5){coord=(min(floor(coord*cookieSize),vec2<f32>(cookieSize-1.0))+0.5)/cookieSize;}
        let cookie=textureSampleLevel(cookies,cookieSampler,vec2<f32>(coord.x,1.0-coord.y),i32(extra.x),0.0);tint=vec4<f32>(tint.rgb*cookie.rgb,tint.a);attenuation=cookie.a;
      }else{
        var radial=1.0-hbLightFade(range.x,range.y,distance);
        if(origin.z>2.5){radial=0.0;if(distance<=range.z){radial=hbLightPolygon(shape,local,i32(range.x),i32(settings.z),range.y);}}
        attenuation=pow(radial,settings.x);
      }
      if(volume>=0.0){attenuation*=extra.z;settings.w=extra.w;}
      if(origin.z>1.5&&origin.z<2.5&&distance>0.00001){attenuation*=hbLightFade(range.z,range.w,local.y/distance);}
      if(attenuation<=0.0){continue;}coverage=attenuation;
      if(normalMode>0){let normalDelta=origin.xy-select(world,originPoint,normalMode==1);response=max(0.0,dot(normal,normalize(vec3<f32>(normalDelta,max(0.00001,settings.y)))));attenuation*=response;coverage*=response;}
      if(settings.w>0.0){
        let rect=textureLoad(rects,vec2<i32>(index,layer),0);
        if(rect.z>0.0){let box=textureLoad(bounds,vec2<i32>(index,0),0);let coord=(world-box.xy)/box.zw+0.5;
          if(all(coord>=vec2<f32>(0.0))&&all(coord<=vec2<f32>(1.0))){let shadow=textureSampleLevel(atlas,atlasSampler,rect.xy+vec2<f32>(coord.x,1.0-coord.y)*rect.zw,0.0).rgb;attenuation*=1.0-settings.w*clamp(max(shadow.r,shadow.g*(1.0-clamp(shadow.b,0.0,1.0))),0.0,1.0);}
        }
      }
    }
    let contribution=tint.rgb*tint.a*attenuation;
    if(alphaBlend>0){accum[style]=contribution*response+accum[style]*(1.0-clamp(coverage,0.0,1.0));}else{accum[style]+=contribution;}
  }
  var multiply=vec3<f32>(0.0);var add=vec3<f32>(0.0);var total=vec3<f32>(0.0);
  for(var style=0;style<4;style++){total+=accum[style];let mode=modes[style];let channel=channels[style];var mask=1.0;if(channel>=0.0){mask=maskValue[i32(channel)%4];if(channel>3.5){mask=1.0-mask;}}
    let contribution=accum[style]*mask;if(mode<0.5){multiply+=contribution;}else{add+=contribution*select(-1.0,1.0,mode<1.5);}
  }
  if(volume>=0.0){return total;}return max(vec3<f32>(0.0),albedo*multiply+add);
}`,[fade,polygon]);

// Reuse the GL light-data/atlas owners. The texture fallbacks keep GPU bindings valid with zero lamps.
export function gpuLight2DUniforms(material,fallbacks){
  if(material.userData.hbLight2DOwner===material.uuid)return material.userData.hbLight2D;
  const u={},nodes={};
  const map=(key,kind)=>{
    let fallback=fallbacks.get(key);if(!fallback){if(kind==='array'){fallback=new DataArrayTexture(new Uint8Array([255,255,255,255]),1,1,1);fallback.colorSpace=SRGBColorSpace;}
    else fallback=new DataTexture(kind==='shape'?new Float32Array(2):kind==='data'?new Float32Array(4):new Uint8Array([255,255,255,255]),1,1,kind==='shape'?RGFormat:RGBAFormat,kind==='data'||kind==='shape'?FloatType:undefined);
    if(kind==='image'||kind==='array')fallback.minFilter=fallback.magFilter=LinearFilter;fallback.needsUpdate=true;fallbacks.set(key,fallback);}const node=texture(fallback);nodes[key]=node;u[key]={get value(){return node.value;},set value(value){node.value=value||fallback;}};
  };
  for(const [key,kind] of [['hbLight2DData','data'],['hbLight2DShape','shape'],['hbShadowAtlas','image'],['hbShadowRects','data'],['hbShadowBounds','data'],['hbLight2DCookies','array'],['hbLight2DMask','image']])map(key,kind);
  for(const [key,value,type] of [['hbLight2DCount',0,'int'],['hbLight2DLayer',0,'int'],['hbLight2DOrigin',new Vector2()],['hbLight2DModes',new Vector4()],['hbLight2DChannels',new Vector4(-1,-1,-1,-1)],['hbLight2DHasMask',0],['hbLight2DMaskTransform',new Matrix3()],['hbLight2DCookieSize',1],['hbLight2DVolume',-1]])u[key]=uniform(value,type);
  for(const key of ['hbLight2DHeight','hbLight2DShapeHeight'])u[key]={value:1};
  const mask=nodes.hbLight2DMask.uv(u.hbLight2DMaskTransform.mul(vec3(uv(),1)).xy);
  material.lights=false;material.setupOutgoingLight=()=>shade(nodes.hbLight2DData,nodes.hbLight2DShape,nodes.hbShadowAtlas,sampler(nodes.hbShadowAtlas),nodes.hbShadowRects,nodes.hbShadowBounds,nodes.hbLight2DCookies,sampler(nodes.hbLight2DCookies),u.hbLight2DCount,u.hbLight2DLayer,positionWorld.xy,u.hbLight2DOrigin,normalWorld,diffuseColor.rgb,u.hbLight2DHasMask.greaterThan(.5).select(mask,vec4(1)),u.hbLight2DModes,u.hbLight2DChannels,u.hbLight2DCookieSize,u.hbLight2DVolume);
  material.userData.hbLight2DOwner=material.uuid;Object.defineProperty(material.userData,'hbLight2D',{value:u,writable:true,configurable:true,enumerable:false});
  return u;
}

export function gpuShadowMaterials(){
  const fill=mode=>{
    const m=new MeshBasicNodeMaterial({depthTest:false,depthWrite:false,side:DoubleSide,toneMapped:false,colorWrite:mode!=='reset',blending:CustomBlending,blendEquation:mode==='unshadow'?AddEquation:MaxEquation,blendSrc:OneFactor,blendDst:OneFactor,stencilWrite:mode!=='self',stencilFunc:AlwaysStencilFunc,stencilRef:mode==='reset'?0:1,stencilZPass:ReplaceStencilOp}),fallback=new DataTexture(new Uint8Array([255,255,255,255]),1,1);fallback.needsUpdate=true;
    const map=texture(fallback),u={hasMap:uniform(false,'bool'),transform:uniform(new Matrix3()),opacity:uniform(1),cutoff:uniform(0)};u.map={get value(){return map.value;},set value(value){map.value=value||fallback;}};m.uniforms=u;
    const world=modelWorldMatrix.mul(vec4(positionGeometry,1));m.vertexNode=cameraProjectionMatrix.mul(cameraViewMatrix).mul(vec4(world.xy,0,1));
    m.fragmentNode=Fn(()=>{const alpha=u.opacity.mul(u.hasMap.select(map.uv(u.transform.mul(vec3(uv(),1)).xy).a,float(1)));alpha.lessThanEqual(u.cutoff).discard();return mode==='self'?vec4(alpha,0,0,0):vec4(0,0,alpha,0);})();
    const dispose=m.dispose.bind(m);m.dispose=()=>{fallback.dispose();dispose();};return m;
  };
  const project=green=>{
    const m=new MeshBasicNodeMaterial({depthTest:false,depthWrite:false,side:DoubleSide,toneMapped:false,blending:CustomBlending,blendEquation:MaxEquation,blendSrc:OneFactor,blendDst:OneFactor,stencilWrite:true,stencilRef:1,stencilFunc:green?EqualStencilFunc:NotEqualStencilFunc}),u={origin:uniform(new Vector2()),distance:uniform(1),softness:uniform(0)};m.uniforms=u;
    const anchor=modelWorldMatrix.mul(vec4(positionGeometry,1)).xy,delta=anchor.sub(u.origin),ray=delta.length().greaterThan(.00001).select(delta.normalize(),vec2(0,1)),angle=attribute('turn','float').mul(u.softness).mul(.261799388),rotated=vec2(cos(angle).mul(ray.x).sub(sin(angle).mul(ray.y)),sin(angle).mul(ray.x).add(cos(angle).mul(ray.y))),extrude=attribute('extrude','float');
    m.vertexNode=cameraProjectionMatrix.mul(cameraViewMatrix).mul(vec4(anchor.add(rotated.mul(extrude).mul(u.distance)),0,1));
    const projected=varying(extrude),coverage=varying(attribute('weight','float')),shade=projected.greaterThan(.00001).select(float(1).sub(float(1).sub(coverage).div(projected)),float(1)).clamp(0,1);
    m.fragmentNode=green?vec4(0,shade,0,0):vec4(shade,0,0,0);return m;
  };
  return {self:fill('self'),unshadow:fill('unshadow'),reset:fill('reset'),project:project(false),inside:project(true)};
}

