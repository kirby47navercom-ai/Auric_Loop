export const probeLightmapMixPolicy=Object.freeze({beginRoughness:.1,endRoughness:.3,maximumWeight:1000,minimumReference:1e-4,luminance:Object.freeze([.2126,.7152,.0722]),defaultEnabled:false});
export function probeLightmapMixScale(baked,capture,roughness,enabled=true){
 if(!enabled)return 1;
 if(!Number.isFinite(roughness)||![baked,capture].every(v=>v&&v.length>=3&&[0,1,2].every(k=>Number.isFinite(v[k]))))throw Error('반사·라이트맵 혼합의 유한한 RGB와 거칠기가 필요해요.');
 const luminance=v=>Math.max(0,v[0])*.2126+Math.max(0,v[1])*.7152+Math.max(0,v[2])*.0722,weight=roughness<=.1?0:roughness>=.3?1:(roughness-.1)/.2,ratio=Math.min(1000,luminance(baked)/Math.max(1e-4,luminance(capture)));
 return 1+(ratio-1)*weight;
}

export const probeLightmapMixGLSL=String.raw`
uniform bool hbProbeLightmapMixing;
float hbProbeLightmapScale(vec3 captureIrradiance,float roughness){
#ifdef USE_LIGHTMAP
 if(hbProbeLightmapMixing&&lightMapIntensity>0.0&&roughness>0.1){
  vec3 baked=max(texture2D(lightMap,vLightMapUv).rgb*lightMapIntensity,vec3(0));
  float reference=max(dot(max(captureIrradiance,vec3(0)),vec3(.2126,.7152,.0722)),.0001);
  float ratio=min(1000.0,dot(baked,vec3(.2126,.7152,.0722))/reference);
  return mix(1.0,ratio,clamp((roughness-.1)/.2,0.0,1.0));
 }
#endif
 return 1.0;
}
`;

// Per-fragment state is written by the raster entry, never shared across pixels.
export const probeLightmapMixHLSL=String.raw`
static float3 hbProbeBakedIrradiance=0;
static bool hbProbeLightmapMixing=false;
float hbProbeLightmapScale(float3 captureIrradiance,float roughness){
 if(!hbProbeLightmapMixing||roughness<=.1)return 1;
 float reference=max(dot(max(captureIrradiance,0),float3(.2126,.7152,.0722)),.0001);
 float ratio=min(1000.0,dot(max(hbProbeBakedIrradiance,0),float3(.2126,.7152,.0722))/reference);
 return lerp(1.0,ratio,saturate((roughness-.1)/.2));
}
`;
