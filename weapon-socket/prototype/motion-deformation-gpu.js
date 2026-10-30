import {DataArrayTexture,FloatType,Vector3} from 'three/webgpu';
import * as T from 'three/tsl';
const morphTextures=new WeakMap();
function morphTexture(geometry){
 const attributes=geometry.morphAttributes.position||[],position=geometry.attributes.position,count=position.count,signature=[position,position.version,...attributes.flatMap(a=>[a,a.version])];let entry=morphTextures.get(geometry);
 if(entry&&entry.signature.length===signature.length&&signature.every((v,i)=>v===entry.signature[i]))return entry.texture;
 entry?.texture.dispose();const width=Math.min(4096,count),height=Math.ceil(count/width),data=new Float32Array(width*height*4*attributes.length);
 for(let t=0;t<attributes.length;t++)for(let i=0;i<count;i++)for(let j=0;j<3;j++)data[(t*width*height+i)*4+j]=attributes[t].getComponent(i,j)-(geometry.morphTargetsRelative?0:position.getComponent(i,j));
 const texture=new DataArrayTexture(data,width,height,attributes.length);texture.type=FloatType;texture.needsUpdate=true;morphTextures.set(geometry,{signature,texture});if(!entry)geometry.addEventListener('dispose',()=>{morphTextures.get(geometry)?.texture.dispose();morphTextures.delete(geometry);});return texture;
}
export function previousVertexNode(context){return T.Fn((_,builder)=>{
 const object=builder.object,geometry=object.geometry,p=T.attribute('position','vec3').toVar();if(!context.frame)return T.positionLocal;
 const initial=context.frame.objects.get(object);if(!initial.pose)return T.positionLocal;
 const textures=context.frame.objects.textures(initial),image=key=>{const n=T.texture(textures[key]);n.onObjectUpdate(({object})=>context.frame?.objects.textures(context.frame.objects.get(object))?.[key]||n.value);return n;};
 if(geometry.morphAttributes.position?.length){const morph=T.texture(morphTexture(geometry)),weights=image('weights');morph.onObjectUpdate(({object})=>morphTexture(object.geometry));const width=morph.value.image.width;
  for(let t=0;t<geometry.morphAttributes.position.length;t++){const packed=T.textureLoad(weights,T.ivec2(Math.floor(t/4)%4,Math.floor(t/16))),weight=packed[['x','y','z','w'][t%4]],offset=T.textureLoad(morph,T.ivec2(T.vertexIndex.mod(width),T.vertexIndex.div(width))).depth(t).xyz;p.addAssign(offset.mul(weight));}
 }
 if(object.isSkinnedMesh){const bones=image('bones'),index=T.attribute('skinIndex','uvec4'),weight=T.attribute('skinWeight','vec4'),matrix=i=>T.mat4(...[0,1,2,3].map(x=>T.textureLoad(bones,T.ivec2(x,i))));let skin=matrix(index.x).mul(weight.x);for(const k of ['y','z','w'])skin=skin.add(matrix(index[k]).mul(weight[k]));const correction=T.uniform(new Vector3().fromArray(object.bindMatrixInverse.elements.slice(12,15)));correction.onObjectUpdate(({object})=>correction.value.fromArray(context.frame?.objects.get(object).pose?.bindTranslation||[0,0,0]));p.assign(skin.mul(T.vec4(p,1)).xyz.add(correction.mul(T.float(1).sub(weight.dot(T.vec4(1))))));}
 if(object.isInstancedMesh){const instances=image('instances'),matrix=T.mat4(...[0,1,2,3].map(x=>T.textureLoad(instances,T.ivec2(x,T.instanceIndex))));p.assign(matrix.mul(T.vec4(p,1)).xyz);}
 return p;
})();}
