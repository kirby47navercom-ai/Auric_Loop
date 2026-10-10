import * as THREE from 'three';
import {defaultSortingLayers,sortingLayerIndex} from './sorting-layers.js';
import {TwoDShadows} from './two-d-shadows.js';
import {defaultLightBlendStyles,lightBlendModes,lightMaskChannels} from './light-blend-styles.js';
import {LightCookieArray} from './two-d-light-cookies.js';

// ponytail: at most64 active lamps per scene; spatial batches replace this ceiling when larger scenes need it.
export const light2dLimit=64;
const width=9,stride=width*4;
export function light2DUniforms(material){
  if(material.userData.hbLight2DOwner===material.uuid)return material.userData.hbLight2D;
  const uniforms={hbLight2DData:{value:null},hbLight2DShape:{value:null},hbLight2DShapeHeight:{value:1},hbLight2DCount:{value:0},hbLight2DHeight:{value:1},hbLight2DLayer:{value:0},hbLight2DOrigin:{value:new THREE.Vector2()},hbShadowAtlas:{value:null},hbShadowRects:{value:null},hbShadowBounds:{value:null},hbLight2DModes:{value:new THREE.Vector4()},hbLight2DChannels:{value:new THREE.Vector4(-1,-1,-1,-1)},hbLight2DMask:{value:null},hbLight2DHasMask:{value:0},hbLight2DMaskTransform:{value:new THREE.Matrix3()}};
  const compile=material.onBeforeCompile,key=material.customProgramCacheKey();
  Object.assign(uniforms,{hbLight2DCookies:{value:null},hbLight2DCookieSize:{value:1},hbLight2DVolume:{value:-1}});
  material.onBeforeCompile=(shader,renderer)=>{
    compile.call(material,shader,renderer);Object.assign(shader.uniforms,uniforms);
    for(const chunk of ['lights_fragment_begin','lights_fragment_maps','lights_fragment_end'])shader.fragmentShader=shader.fragmentShader.replace('#include <'+chunk+'>','');
    shader.vertexShader='varying vec2 hbLight2DWorld,hbLight2DMaskUV;\nuniform mat3 hbLight2DMaskTransform;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <project_vertex>','#include <project_vertex>\nhbLight2DWorld=(modelMatrix*vec4(transformed,1.0)).xy;\nhbLight2DMaskUV=(hbLight2DMaskTransform*vec3(uv,1.0)).xy;');
    shader.fragmentShader=`varying vec2 hbLight2DWorld,hbLight2DMaskUV;
uniform vec4 hbLight2DModes,hbLight2DChannels;
uniform sampler2D hbLight2DMask;
uniform float hbLight2DHasMask;
uniform sampler2D hbLight2DData,hbLight2DShape,hbShadowAtlas,hbShadowRects,hbShadowBounds;
uniform int hbLight2DCount;
uniform float hbLight2DHeight,hbLight2DLayer,hbLight2DShapeHeight;
uniform vec2 hbLight2DOrigin;
uniform highp sampler2DArray hbLight2DCookies;
uniform float hbLight2DCookieSize,hbLight2DVolume;
vec4 hbLight2DRead(float column,float row){return texture2D(hbLight2DData,vec2((column+0.5)/9.0,(row+0.5)/hbLight2DHeight));}
float hbLight2DTarget(float row){
  float part=floor(hbLight2DLayer/8.0);vec4 bits=hbLight2DRead(part<4.0?5.0:6.0,row);
  float channel=mod(part,4.0),value=channel<0.5?bits.x:channel<1.5?bits.y:channel<2.5?bits.z:bits.w;
  return mod(floor(value/exp2(mod(hbLight2DLayer,8.0))),2.0);
}
float hbLight2DFade(float low,float high,float value){return high-low<0.00001?step(high,value):smoothstep(low,high,value);}
float hbLight2DPolygon(vec2 point,float count,float row,float falloff){
  bool inside=false;float distanceToEdge=1e20;
  // ponytail:64 vertices per freeform lamp; cached distance fields replace per-fragment edges for larger paths.
  for(int index=0;index<64;index++){
    if(float(index)>=count)break;float next=mod(float(index)+1.0,count);
    vec2 a=texture2D(hbLight2DShape,vec2((float(index)+0.5)/64.0,(row+0.5)/hbLight2DShapeHeight)).xy;
    vec2 b=texture2D(hbLight2DShape,vec2((next+0.5)/64.0,(row+0.5)/hbLight2DShapeHeight)).xy;
    vec2 edge=b-a;float t=clamp(dot(point-a,edge)/max(dot(edge,edge),1e-20),0.0,1.0);
    distanceToEdge=min(distanceToEdge,length(point-a-t*edge));
    if((a.y>point.y)!=(b.y>point.y)&&point.x<(b.x-a.x)*(point.y-a.y)/(b.y-a.y)+a.x)inside=!inside;
  }
  return inside||distanceToEdge<0.00001?1.0:falloff<=0.0?0.0:1.0-smoothstep(0.0,falloff,distanceToEdge);
}
`+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>',`vec3 hbLight2DMultiply=vec3(0.0),hbLight2DAdd=vec3(0.0),hbLight2DAccum[4];
for(int hbStyle=0;hbStyle<4;hbStyle++)hbLight2DAccum[hbStyle]=vec3(0.0);
vec4 hbLight2DMaskValue=hbLight2DHasMask>0.5?texture2D(hbLight2DMask,hbLight2DMaskUV):vec4(1.0);
for(int hbIndex=0;hbIndex<64;hbIndex++){
  if(hbIndex>=hbLight2DCount)break;float row=float(hbIndex);if(hbLight2DVolume>=0.0&&abs(row-hbLight2DVolume)>0.5)continue;if(hbLight2DTarget(row)<0.5)continue;
  vec4 origin=hbLight2DRead(0.0,row),tint=hbLight2DRead(1.0,row);float attenuation=1.0,normalResponse=1.0,coverage=1.0,normalMode=mod(origin.w,4.0),style=mod(floor(origin.w/4.0),4.0),alphaBlend=floor(origin.w/16.0);
  vec4 extra=vec4(0.0);if(origin.z>3.5||hbLight2DVolume>=0.0)extra=hbLight2DRead(8.0,row);if(hbLight2DVolume>=0.0){normalMode=0.0;alphaBlend=0.0;}
  if(origin.z>0.5){
    vec4 range=hbLight2DRead(2.0,row),settings=hbLight2DRead(3.0,row),basis=hbLight2DRead(4.0,row);
    vec2 delta=hbLight2DWorld-origin.xy,local=vec2(dot(basis.xy,delta),dot(basis.zw,delta));float distance2d=length(local);
    if(origin.z>3.5){
      if(extra.x<0.0)continue;vec4 cookieBounds=hbLight2DRead(7.0,row);vec2 uv=(local-cookieBounds.xy)/cookieBounds.zw+0.5;
      if(any(lessThan(uv,vec2(0.0)))||any(greaterThan(uv,vec2(1.0))))continue;
      if(extra.y>0.5)uv=(min(floor(uv*hbLight2DCookieSize),vec2(hbLight2DCookieSize-1.0))+0.5)/hbLight2DCookieSize;
      vec4 cookie=texture(hbLight2DCookies,vec3(uv.x,1.0-uv.y,extra.x));tint.rgb*=cookie.rgb;attenuation=cookie.a;
    }else attenuation=pow(origin.z>2.5?(distance2d>range.z?0.0:hbLight2DPolygon(local,range.x,settings.z,range.y)):1.0-hbLight2DFade(range.x,range.y,distance2d),settings.x);
    if(hbLight2DVolume>=0.0){attenuation*=extra.z;settings.w=extra.w;}
    if(origin.z>1.5&&origin.z<2.5&&distance2d>0.00001)attenuation*=hbLight2DFade(range.z,range.w,local.y/distance2d);
    if(attenuation<=0.0)continue;coverage=attenuation;
    if(normalMode>0.5){vec2 normalDelta=origin.xy-(normalMode<1.5?hbLight2DOrigin:hbLight2DWorld);
      vec3 surfaceNormal=inverseTransformDirection(normal,viewMatrix);
      normalResponse=max(0.0,dot(surfaceNormal,normalize(vec3(normalDelta,max(0.00001,settings.y)))));attenuation*=normalResponse;coverage*=normalResponse;
    }
    if(settings.w>0.0){vec4 rect=texture2D(hbShadowRects,vec2((row+0.5)/64.0,(hbLight2DLayer+0.5)/64.0));
      if(rect.z>0.0){vec4 bounds=texture2D(hbShadowBounds,vec2((row+0.5)/64.0,0.5));vec2 uv=(hbLight2DWorld-bounds.xy)/bounds.zw+0.5;
        if(all(greaterThanEqual(uv,vec2(0.0)))&&all(lessThanEqual(uv,vec2(1.0)))){vec3 mask=texture2D(hbShadowAtlas,rect.xy+uv*rect.zw).rgb;attenuation*=1.0-settings.w*clamp(max(mask.r,mask.g*(1.0-clamp(mask.b,0.0,1.0))),0.0,1.0);}
      }
    }
  }
  vec3 contribution=tint.rgb*tint.a*attenuation;int index=int(style);
  if(alphaBlend>0.5)hbLight2DAccum[index]=contribution*normalResponse+hbLight2DAccum[index]*(1.0-clamp(coverage,0.0,1.0));else hbLight2DAccum[index]+=contribution;
}
for(int hbStyle=0;hbStyle<4;hbStyle++){
  float style=float(hbStyle);
  float mode=style<0.5?hbLight2DModes.x:style<1.5?hbLight2DModes.y:style<2.5?hbLight2DModes.z:hbLight2DModes.w;
  float channel=style<0.5?hbLight2DChannels.x:style<1.5?hbLight2DChannels.y:style<2.5?hbLight2DChannels.z:hbLight2DChannels.w;
  float mask=1.0;if(channel>=0.0){float c=mod(channel,4.0);mask=c<0.5?hbLight2DMaskValue.r:c<1.5?hbLight2DMaskValue.g:c<2.5?hbLight2DMaskValue.b:hbLight2DMaskValue.a;if(channel>3.5)mask=1.0-mask;}
  vec3 contribution=hbLight2DAccum[hbStyle]*mask;
  if(mode<0.5)hbLight2DMultiply+=contribution;else hbLight2DAdd+=contribution*(mode<1.5?1.0:-1.0);
}
outgoingLight=hbLight2DVolume>=0.0?hbLight2DAccum[0]+hbLight2DAccum[1]+hbLight2DAccum[2]+hbLight2DAccum[3]:max(vec3(0.0),diffuseColor.rgb*hbLight2DMultiply+hbLight2DAdd)+totalEmissiveRadiance;
#include <opaque_fragment>`);
  };
  material.customProgramCacheKey=()=>key+'|hb-light2d-v6';material.needsUpdate=true;material.userData.hbLight2DOwner=material.uuid;Object.defineProperty(material.userData,'hbLight2D',{value:uniforms,writable:true,configurable:true,enumerable:false});return uniforms;
}

export class TwoDLighting{
  constructor(){this.texture=null;this.shapeTexture=null;this.count=0;this.uploads=0;this.row=new Float32Array(stride);this.masks=new Uint8Array(8);this.shadows=new TwoDShadows();this.cookies=new LightCookieArray();this.modes=new THREE.Vector4();this.channels=new THREE.Vector4(-1,-1,-1,-1);}
  prepare(renderer,groups,entries,layers=defaultSortingLayers){
    const receivers=entries.filter(e=>['lit2d','volume2d'].includes(e.properties.shading)&&(Array.isArray(e.node.material)?e.node.material:[e.node.material]).some(m=>m.isMeshStandardMaterial));
    if(!receivers.length){this.dispose();return {lights:0,lightBytes:0};}
    let config,priority=-Infinity;for(const group of groups){const p=group.userData.renderer2d;if(group.userData.disposed||!p||p.enabled===false)continue;let shown=true;for(let node=group;node;node=node.parent)if(!node.visible){shown=false;break;}if(shown&&(p.priority??0)>priority){config=p;priority=p.priority??0;}}
    for(let i=0;i<4;i++){this.modes.setComponent(i,lightBlendModes.indexOf(config?.['style'+i+'Mode']??defaultLightBlendStyles[i].mode));this.channels.setComponent(i,lightMaskChannels.indexOf(config?.['style'+i+'Mask']??defaultLightBlendStyles[i].mask)-1);}
    const lights=[];
    for(const group of groups){if(group.userData.disposed||!group.userData.light2d)continue;let shown=true;for(let node=group;node;node=node.parent)if(!node.visible){shown=false;break;}if(shown&&group.userData.light2d.enabled!==false)lights.push(group);}
    // Global illumination initializes each style before ordered local lamps.
    lights.sort((a,b)=>Number(b.userData.light2d.lightType==='global')-Number(a.userData.light2d.lightType==='global')||(a.userData.light2d.lightType==='global'?0:(a.userData.light2d.lightOrder||0)-(b.userData.light2d.lightOrder||0)));
    if(lights.length>light2dLimit)throw Error('활성 2D 광원은64개까지예요.');
    const cookies=this.cookies.prepare(lights);
    const receiverLayers=new Set(receivers.filter(e=>{for(let n=e.node;n;n=n.parent)if(!n.visible)return false;return true;}).map(e=>sortingLayerIndex(layers,e.properties.sortingLayer))),shadows=this.shadows.prepare(renderer,groups,lights,receiverLayers,layers);
    const capacity=Math.max(1,2**Math.ceil(Math.log2(lights.length||1)));
    if(lights.length&&(!this.texture||this.texture.image.height!==capacity)){
      this.texture?.dispose();this.texture=new THREE.DataTexture(new Float32Array(stride*capacity),width,capacity,THREE.RGBAFormat,THREE.FloatType);this.texture.minFilter=this.texture.magFilter=THREE.NearestFilter;
    }
    const shapes=lights.filter(g=>g.userData.light2d.lightType==='freeform'),shapeCapacity=Math.max(1,2**Math.ceil(Math.log2(shapes.length||1)));
    if(shapes.length&&(!this.shapeTexture||this.shapeTexture.image.height!==shapeCapacity)){this.shapeTexture?.dispose();this.shapeTexture=new THREE.DataTexture(new Float32Array(64*2*shapeCapacity),64,shapeCapacity,THREE.RGFormat,THREE.FloatType);this.shapeTexture.minFilter=this.shapeTexture.magFilter=THREE.NearestFilter;}
    let shapeChanged=false;for(let row=0;row<shapes.length;row++)for(let i=0;i<shapes[row].userData.light2d.shapePath.length;i++)for(let axis=0;axis<2;axis++){const at=row*64*2+i*2+axis,value=Math.fround(shapes[row].userData.light2d.shapePath[i][axis]);if(this.shapeTexture.image.data[at]!==value){this.shapeTexture.image.data[at]=value;shapeChanged=true;}}
    if(this.shapeTexture&&shapeChanged){this.shapeTexture.needsUpdate=true;this.uploads++;}if(!shapes.length){this.shapeTexture?.dispose();this.shapeTexture=null;}
    let changed=false;
    for(let row=0;row<lights.length;row++){
      const group=lights[row],p=group.userData.light2d,m=group.matrixWorld.elements,det=m[0]*m[5]-m[4]*m[1];
      if(p.lightType!=='global'&&(!Number.isFinite(det)||Math.abs(det)<1e-8))throw Error('2D 광원의 XY 변환이 평면에서 사라졌어요.');
      const masks=this.masks; masks.fill(0);for(let i=0;i<Math.min(64,layers.length);i++)if(p.targetSortingLayers.includes(layers[i].id))masks[Math.floor(i/8)]|=1<<(i%8);
      const data=this.row;data[0]=m[12];data[1]=m[13];data[2]=p.lightType==='global'?0:p.lightType==='point'?1:p.lightType==='spot'?2:3;data[3]=(p.normalMode==='disabled'?0:p.normalMode==='fast'?1:2)+4*(p.blendStyle||0)+16*(p.lightType!=='global'&&p.overlapOperation==='alphaBlend'?1:0);
      if(p.lightType==='sprite')data[2]=4;
      data[4]=p.color[0];data[5]=p.color[1];data[6]=p.color[2];data[7]=p.intensity;data[8]=p.innerRadius;data[9]=p.outerRadius;data[10]=Math.cos(p.outerAngle*Math.PI/360);data[11]=Math.cos(p.innerAngle*Math.PI/360);
      data[12]=p.falloff;data[13]=p.normalDistance;data[15]=this.shadows.atlas&&p.shadows&&p.lightType!=='global'?p.shadowStrength:0;data[16]=p.lightType==='global'?1:m[5]/det;data[17]=p.lightType==='global'?0:-m[4]/det;data[18]=p.lightType==='global'?0:-m[1]/det;data[19]=p.lightType==='global'?1:m[0]/det;data.set(masks,20);
      data[14]=0;if(p.lightType==='freeform'){data[8]=p.shapePath.length;data[9]=p.shapeFalloff;data[14]=shapes.indexOf(group);data[10]=Math.max(...p.shapePath.map(point=>Math.hypot(...point)))+p.shapeFalloff;data[11]=0;}
      const cookie=group.userData.light2dCookie;data.set([...(cookie?.offset||[0,0]),...(cookie?.size||[p.cookieWidth||1,p.cookieHeight||1])],28);data.set([cookies.get(cookie?.key)??-1,cookie?.filter==='nearest'?1:0,p.volumetric?p.volumeIntensity:0,this.shadows.atlas&&p.volumetric?p.volumeShadowStrength:0],32);
      for(let i=0;i<stride;i++){const at=row*stride+i,value=Math.fround(data[i]);if(this.texture.image.data[at]!==value){this.texture.image.data[at]=value;changed=true;}}
    }
    if(this.texture&&changed){this.texture.needsUpdate=true;this.uploads++;}
    if(!lights.length){this.texture?.dispose();this.texture=null;}
    this.count=lights.length;
    for(const entry of receivers)for(const material of Array.isArray(entry.node.material)?entry.node.material:[entry.node.material]){
      if(!material.isMeshStandardMaterial)continue;
      const u=light2DUniforms(material),mask=material.hbLight2DMaskTexture;u.hbLight2DModes.value=this.modes;u.hbLight2DChannels.value=this.channels;u.hbLight2DMask.value=mask||null;u.hbLight2DHasMask.value=mask?1:0;if(mask){mask.updateMatrix();u.hbLight2DMaskTransform.value.copy(mask.matrix);}
      u.hbLight2DCookies.value=this.cookies.texture;u.hbLight2DCookieSize.value=this.cookies.size||1;u.hbLight2DVolume.value=entry.node.userData.light2dVolume?lights.indexOf(entry.node.parent):-1;
      u.hbLight2DData.value=this.texture;u.hbLight2DCount.value=this.count;u.hbLight2DHeight.value=capacity;u.hbLight2DLayer.value=sortingLayerIndex(layers,entry.properties.sortingLayer);
      u.hbLight2DShape.value=this.shapeTexture;u.hbLight2DShapeHeight.value=shapeCapacity;
      u.hbShadowAtlas.value=this.shadows.atlas?.texture||null;u.hbShadowRects.value=this.shadows.rects;u.hbShadowBounds.value=this.shadows.bounds;
      u.hbLight2DOrigin.value.set(entry.node.matrixWorld.elements[12],entry.node.matrixWorld.elements[13]);
    }
    return {lights:this.count,lightBytes:this.texture?.image.data.byteLength||0,shapeBytes:this.shapeTexture?.image.data.byteLength||0,cookieBytes:this.cookies.texture?.image.data.byteLength||0,cookieUploads:this.cookies.uploads,volumeLights:receivers.filter(e=>e.node.userData.light2dVolume&&e.node.visible).length,lightUploads:this.uploads,...shadows};
  }
  dispose(){this.texture?.dispose();this.shapeTexture?.dispose();this.texture=this.shapeTexture=null;this.count=0;this.shadows.dispose();this.cookies.dispose();}
}
