import * as THREE from 'three/webgpu';
import {materialTextureTypes,textureNodeType,texturePlaceholder} from './texture-assets.js';
import {materialTextureBindings} from './material-texture-bindings.js';
import {MeshPhysicalNodeMaterial,DataTexture,TextureLoader,Color,Vector2,Vector3,Vector4,NoColorSpace,RepeatWrapping,ClampToEdgeWrapping,DoubleSide,FrontSide} from 'three/webgpu';
import * as T from 'three/tsl';
import {materialParameterKey,materialTextureParameter,resolveMaterialInputs,resolveMaterialAttributes,materialDefaults,materialGraph,materialCatalog,materialNodeKey,materialPins,normalizedMaterialEdges,validMaterialGraph,surfaceInputs} from './material-runtime.js';

const specs=new Map(materialCatalog.map(s=>[s.key,s]));
const vector=(value,size)=>Array.from({length:size},(_,i)=>Array.isArray(value)?value[i]??value[0]:value);
const valueNode=(value,type)=>typeof value==='string'?T.vec3(new Color(value)):type==='float'?T.float(Array.isArray(value)?value[0]:value):T[type](...vector(value,Number(type.slice(3))));
const cast=(node,type,target)=>type===target?node:target==='float'?node.x:type==='float'?T[target](node):Number(type.slice(3))>Number(target.slice(3))?node['xyzw'.slice(0,Number(target.slice(3)))]:T[target](node,...Array(Number(target.slice(3))-Number(type.slice(3))).fill(0));
const smooth=(a,b,v)=>{const x=v.sub(a).div(b.sub(a).max(1e-6)).clamp(0,1);return x.mul(x).mul(x.mul(-2).add(3));};
const hash=p=>p.dot(T.vec2(127.1,311.7)).sin().mul(43758.5453).fract();
const noise=p=>{const i=p.floor(),f=p.fract(),u=f.mul(f).mul(f.mul(-2).add(3));return T.mix(T.mix(hash(i),hash(i.add(T.vec2(1,0))),u.x),T.mix(hash(i.add(T.vec2(0,1))),hash(i.add(1)),u.x),u.y);};

// The same persisted graph, pin types, defaults and validation feed GLSL and TSL.
export function createGPUMaterial(data,{fileUrl=path=>'/api/file?path='+encodeURIComponent(path),onError=()=>{},renderer}={}){
  data=resolveMaterialAttributes(resolveMaterialInputs(structuredClone(data)));data.surface??={};const graph=data.graph||materialGraph();if(!validMaterialGraph(graph))throw Error('머테리얼 그래프 검증 실패');if(graph.mode==='function'||graph.nodes.some(n=>materialNodeKey(n)==='functionCall'))throw Error('머테리얼 함수를 resolveMaterialAsset으로 먼저 불러오세요.');
  const surface={...materialDefaults,...data.surface},edges=normalizedMaterialEdges(graph),nodes=new Map(graph.nodes.map(n=>[n.id,n])),cache=new Map(),textureBindings=materialTextureBindings(THREE,{resources:data.textureAssets,fileUrl,renderer,onError}),loading=[],parameters=new Map(),surfaceUniforms=new Map(),clock=T.uniform(0);let disposed=false;
  const uniformValue=(value,type)=>T.uniform(type==='float'?value:new ({vec2:Vector2,vec3:Vector3,vec4:Vector4}[type])(...value),type);
  const surfaceValue=input=>{const raw=surface[input.key];if(typeof raw==='number'){const u=uniformValue(raw,'float');surfaceUniforms.set(input.key,u);return u;}return valueNode(raw,input.type);};
  const expression=(id,output='value')=>{
    const token=id+':'+output;if(cache.has(token))return cache.get(token);const node=nodes.get(id),key=materialNodeKey(node),pins=materialPins(node,graph),type=pins.outputs.find(p=>p.id===output)?.type||'float';let code;
    if(key==='legacyColor')code=valueNode(surface.color,'vec3');
    else if(key==='legacyRough'){code=surfaceUniforms.get('roughness')||uniformValue(surface.roughness,'float');surfaceUniforms.set('roughness',code);}
    else if(['scalar','vector2','vector3','vector4','color','scalarParameter','vectorParameter'].includes(key)){
      const value=data.parameters?.[materialParameterKey(node)]??node.value??.5;if(key.endsWith('Parameter')){let list=parameters.get(materialParameterKey(node));if(!list){list=[];parameters.set(materialParameterKey(node),list);}code=uniformValue(value,type);list.push(code);}else code=valueNode(value,type);
    }else if(key==='uv')code=T.uv();else if(key==='time')code=clock;else if(key==='worldPosition')code=T.positionWorld;else if(key==='worldNormal')code=T.normalWorld.normalize();else if(key==='viewDirection')code=T.cameraPosition.sub(T.positionWorld).normalize();
    else{
      const args={};for(const input of specs.get(key).inputs.filter(p=>p.id!=='textureObject')){const edge=edges.find(e=>e.to.node===id&&e.to.pin===input.id),target=input.type==='numeric'?(key==='length'?materialPins({...node,key:'normalize'},graph).outputs[0].type:type):input.type;
        if(edge){const linked=expression(edge.from.node,edge.from.pin);args[input.id]=cast(linked.code,linked.type,target);}else if(key==='fresnel'&&input.id==='normal'&&node.inputValues?.normal===undefined)args.normal=T.normalWorld.normalize();else if(key==='fresnel'&&input.id==='view'&&node.inputValues?.view===undefined)args.view=T.cameraPosition.sub(T.positionWorld).normalize();else if(input.id==='direction'&&key==='sampleCube'&&node.inputValues?.direction===undefined)args.direction=T.normalWorld.normalize();else if(input.id==='uv'&&input.type==='vec2'&&node.inputValues?.uv===undefined)args.uv=T.uv();else if(input.id==='time'&&node.inputValues?.time===undefined)args.time=clock;else args[input.id]=valueNode(node.inputValues?.[input.id]??input.value??0,target);
      }
      const {a,b,value:v}=args;
      if(materialTextureTypes[textureNodeType(key)]?.sample===key){
        const rgbaKey=id+':rgba';let sample=cache.get(rgbaKey);if(!sample){const parameter=materialTextureParameter(node),path=data.parameters?.[parameter]??node.texture;if(!path&&!parameter)code=T.vec4(1);else{
          const type=textureNodeType(key),placeholder=texturePlaceholder(THREE,type);const sampleNode=type==='texturecube'?T.cubeTexture(placeholder,T.vec3(args.direction.x.negate(),args.direction.yz),args.lod.max(0)):type==='texturearray'?T.texture(placeholder,args.uv).depth(args.index.add(.5).floor().toInt()):type==='texture3d'?T.texture3D(placeholder,args.uv):T.texture(placeholder,args.uv);
          loading.push(textureBindings.add({path,type,parameter,wrap:node.wrap,placeholder},map=>sampleNode.value=map));
          code=node.colorSpace==='linear'?sampleNode:T.vec4(T.sRGBTransferEOTF(sampleNode.rgb),sampleNode.a);
        }sample={code,type:'vec4'};cache.set(rgbaKey,sample);}code=output==='rgba'?sample.code:sample.code[output];
      }else if(key==='split')code=v[output];else if(key==='combine')code=T[type](...['x','y','z','w'].slice(0,Number(type.slice(3))).map(k=>args[k]));
      else if(key==='fresnel')code=T.float(1).sub(args.normal.normalize().dot(args.view.normalize()).clamp(0,1)).pow(args.power.max(.0001)).mul(T.float(1).sub(args.base)).add(args.base);
      else if(key==='noise')code=noise(args.uv.mul(args.scale));else if(key==='checker')code=args.uv.mul(args.scale).floor().dot(T.vec2(1)).mod(2);
      else if(key==='radialGradient')code=T.float(1).sub(args.uv.sub(args.center).length().div(args.radius.max(1e-6))).clamp(0,1);
      else if(key==='linearGradient')code=args.uv.sub(.5).dot(T.vec2(args.angle.cos(),args.angle.sin())).add(.5).clamp(0,1);
      else if(key==='normalize')code=type==='float'?v.sign():v.normalize();
      else if(key==='length')code=materialPins({...node,key:'normalize'},graph).outputs[0].type==='float'?v.abs():v.length();
      else if(['cosine','sine','floor','ceil','sign','exp2','absolute','fraction'].includes(key))code=v[({cosine:'cos',sine:'sin',absolute:'abs',fraction:'fract'})[key]||key]();
      else if(key==='log2'||key==='squareRoot')code=v.max(key==='log2'?1e-6:0)[key==='log2'?'log2':'sqrt']();
      else if(key==='smoothstep')code=smooth(args.min,args.max,v);
      else if(['cross','distance','dot','min','max','step'].includes(key))code=T[key](a,b);
      else if(key==='reflect')code=T.reflect(args.direction,args.normal.normalize());
      else if(['add','subtract','multiply','divide'].includes(key))code=a[({add:'add',subtract:'sub',multiply:'mul',divide:'div'})[key]](key==='divide'?T.mix(valueNode(1e-6,type),b,T.step(valueNode(1e-6,type),b.abs())):b);
      else if(key==='power')code=a.max(0).pow(b);else if(key==='lerp')code=T.mix(a,b,args.alpha);else if(key==='clamp')code=v.clamp(args.min,args.max);else if(key==='saturate')code=v.clamp(0,1);else if(key==='oneMinus')code=valueNode(1,type).sub(v);
      else if(key==='normalMap')code=T.vec3(v.xy.mul(2).sub(1).mul(args.strength),v.z.mul(2).sub(1)).normalize();
      else if(key==='tilingOffset')code=args.uv.mul(args.tiling).add(args.offset);else if(key==='panner')code=args.uv.add(args.speed.mul(args.time));
      else if(key==='rotateUV'){const p=args.uv.sub(args.center),c=args.angle.cos(),s=args.angle.sin();code=T.vec2(c.mul(p.x).sub(s.mul(p.y)),s.mul(p.x).add(c.mul(p.y))).add(args.center);}else throw Error('미지원 머테리얼 노드: '+key);
    }
    const result={code,type};cache.set(token,result);return result;
  };
  const output=graph.nodes.find(n=>materialNodeKey(n)==='surface'),values={},connected=new Set();for(const input of surfaceInputs){const edge=edges.find(e=>e.to.node===output.id&&e.to.pin===input.id);if(edge){connected.add(input.id);const linked=expression(edge.from.node,edge.from.pin);values[input.id]=cast(linked.code,linked.type,input.type);}else values[input.id]=surfaceValue(input);}
  const material=new MeshPhysicalNodeMaterial({color:'#ffffff',transparent:surface.blendMode==='translucent',alphaTest:surface.blendMode==='masked'?surface.alphaTest:0,side:surface.doubleSided?DoubleSide:FrontSide});
  const emission=T.uniform(surface.emissiveIntensity);surfaceUniforms.set('emissiveIntensity',emission);
  material.colorNode=values.baseColor;material.roughnessNode=values.roughness.clamp(0,1);material.metalnessNode=values.metallic.clamp(0,1);material.opacityNode=values.opacity;material.emissiveNode=values.emissive.mul(emission);material.aoNode=values.ao.clamp(0,1);material.iorNode=values.ior.clamp(1,2.5);
  if(connected.has('normal'))material.normalNode=T.TBNViewMatrix.mul(values.normal.normalize()).normalize();
  if(connected.has('clearcoat')||surface.clearcoat>0){material.clearcoatNode=values.clearcoat.clamp(0,1);material.clearcoatRoughnessNode=values.clearcoatRoughness.clamp(0,1);}
  if(connected.has('transmission')||surface.transmission>0)material.transmissionNode=values.transmission.clamp(0,1);
  const baseDispose=material.dispose.bind(material);material.dispose=()=>{if(disposed)return;disposed=true;textureBindings.dispose();baseDispose();};
  material.userData={...material.userData,hbMaterial:true,hbGPU:true,materialSource:data,ready:Promise.all(loading),updateTime:time=>clock.value=time,materialState:()=>({time:clock.value}),updateFloat:(key,value)=>{const list=parameters.get(key);if(list){if(list.some(n=>typeof n.value!=='number'))throw Error('Float 파라미터가 아니에요.');list.forEach(n=>n.value=value);data.parameters={...data.parameters,[key]:value};return true;}const property={Roughness:'roughness',Metallic:'metalness',Opacity:'opacity',EmissiveIntensity:'emissiveIntensity'}[key]||key,u=surfaceUniforms.get(property);if(!u)return false;u.value=value;data.surface[property]=value;return true;}};
  material.userData.textureState=textureBindings.state;material.userData.prepareTexture=async(key,path,resources)=>{const transaction=await textureBindings.prepare(key,path,resources),commit=transaction.commit;transaction.commit=()=>{if(!commit())return false;data.parameters={...data.parameters,[key]:path};data.textureAssets=Object.fromEntries(textureBindings.state().bindings.filter(b=>b.type!=='texture2d').map(b=>[b.path,resources?.[b.path]??data.textureAssets?.[b.path]]));return true;};return transaction;};
  material.clone=()=>createGPUMaterial(data,{fileUrl,onError,renderer});return material;
}
