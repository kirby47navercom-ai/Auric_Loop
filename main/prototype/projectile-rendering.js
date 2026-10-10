import * as THREE from 'three';

export function projectileRenderer({scene,fileUrl,readAsset,error=console.error,createMaterial}){
  const batches=new Map();let disposed=false;
  const release=batch=>{batch.disposed=true;batch.mesh.removeFromParent();batch.geometry.dispose();batch.material.uniforms.map.value?.dispose();batch.material.dispose();};
  async function texture(style,batch){const material=batch.material;
    if(!style.texture)return;let path=style.texture;
    try{let rect=null;if(/\.hbsprite\.json$/i.test(path)){const sprite=await readAsset(path);path=sprite.texture;rect=sprite.rect;}

      const map=await new THREE.TextureLoader().loadAsync(fileUrl(path));if(disposed||batch.disposed){map.dispose();return;}if(rect){const [x,y,w,h]=rect;material.uniforms.uvRect.value.set(x/map.image.width,1-(y+h)/map.image.height,w/map.image.width,h/map.image.height);material.uniforms.shape.value.set(w/Math.max(w,h),h/Math.max(w,h));}map.colorSpace=THREE.SRGBColorSpace;map.minFilter=map.magFilter=THREE.NearestFilter;map.generateMipmaps=false;material.uniforms.map.value=map;material.uniforms.hasMap.value=true;
    }catch(problem){error('투사체 텍스처: '+problem.message);}
  }
  const update=world=>{if(disposed)return;const active=new Map([...world.styles.values()].map(style=>[style.id,style]));for(const [id,batch] of batches)if(!active.has(id)||batch.style!==active.get(id)){release(batch);batches.delete(id);}for(const style of world.styles.values()){
    let batch=batches.get(style.id);if(!batch){const geometry=new THREE.InstancedBufferGeometry(),plane=new THREE.PlaneGeometry(1,1);geometry.index=plane.index.clone();geometry.setAttribute('position',plane.attributes.position.clone());geometry.setAttribute('uv',plane.attributes.uv.clone());plane.dispose();const position=new THREE.InstancedBufferAttribute(new Float32Array(world.capacity*3),3).setUsage(THREE.DynamicDrawUsage);geometry.setAttribute('shotPosition',position);
      const material=createMaterial?.(style)||new THREE.ShaderMaterial({transparent:true,depthWrite:false,side:THREE.DoubleSide,uniforms:{uvRect:{value:new THREE.Vector4(0,0,1,1)},shape:{value:new THREE.Vector2(1,1)},map:{value:null},hasMap:{value:false},tint:{value:new THREE.Vector4(...style.color)},size:{value:style.size},planeXZ:{value:style.plane==='XZ'}},vertexShader:'attribute vec3 shotPosition; uniform float size; uniform vec2 shape; uniform bool planeXZ; varying vec2 vUv; void main(){vUv=uv;vec3 offset=planeXZ?vec3(position.x*shape.x,0.0,position.y*shape.y):vec3(position.xy*shape,0.0);gl_Position=projectionMatrix*modelViewMatrix*vec4(shotPosition+offset*size,1.0);}',fragmentShader:'uniform sampler2D map;uniform vec4 uvRect;uniform bool hasMap;uniform vec4 tint;varying vec2 vUv;void main(){vec4 tex=hasMap?texture2D(map,uvRect.xy+vUv*uvRect.zw):vec4(1.0,1.0,1.0,1.0-smoothstep(.42,.5,length(vUv-.5)));gl_FragColor=tint*tex;if(gl_FragColor.a<.001)discard;\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}'}),mesh=new THREE.Mesh(geometry,material);mesh.frustumCulled=false;mesh.renderOrder=10000;mesh.name='HBProjectiles_'+style.id;scene().add(mesh);batch={mesh,geometry,material,position,count:0,style};batches.set(style.id,batch);texture(style,batch);
    }batch.count=0;
  }
    for(let n=0;n<world.count;n++){const batch=batches.get(world.style[n]),offset=batch.count++*3;batch.position.array.set(world.position.subarray(n*3,n*3+3),offset);}
    for(const batch of batches.values()){batch.geometry.instanceCount=batch.count;batch.mesh.visible=batch.count>0;batch.position.clearUpdateRanges();if(batch.count){batch.position.addUpdateRange(0,batch.count*3);batch.position.needsUpdate=true;}}
  };
  return {update,dispose(){disposed=true;for(const batch of batches.values())release(batch);batches.clear();}};
}
