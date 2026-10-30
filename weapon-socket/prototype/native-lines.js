import * as THREE from 'three';

// Solid lines use camera-facing ribbons over the existing native triangle path.
// No native pipeline or GPU readback is needed; unchanged views reuse the buffers.
export class NativeLinePool {
  constructor(){this.entries=new Map();this.seen=new Set();this.a=new THREE.Vector3();this.b=new THREE.Vector3();this.p=new THREE.Vector3();this.view=new THREE.Matrix4();this.inverse=new THREE.Matrix4();}
  begin(){this.seen.clear();}
  mesh(line,camera,width,height){
    if(Array.isArray(line.material)||!line.material?.isLineBasicMaterial||line.material.isLineDashedMaterial)throw Error('DirectX 선에는 단일 실선 머테리얼이 필요해요.');
    if(!line.material.visible||!line.layers.test(camera.layers))return null;this.seen.add(line.uuid);
    const position=line.geometry.getAttribute('position'),index=line.geometry.index,count=index?.count??position?.count??0,start=line.geometry.drawRange.start,end=Math.min(count,start+line.geometry.drawRange.count),segments=Math.max(0,line.isLineSegments?Math.floor((end-start)/2):end-start-(line.isLineLoop?0:1));if(!segments)return null;
    let entry=this.entries.get(line.uuid);if(!entry||entry.capacity!==segments){if(entry)this.release(entry);const geometry=new THREE.BufferGeometry(),vertices=segments*4,positions=new Float32Array(vertices*3),colors=new Float32Array(vertices*3),normals=new Float32Array(vertices*3),uvs=new Float32Array(vertices*2),indices=[];for(let i=0;i<vertices;i++)normals[i*3+2]=1;for(let i=0;i<segments;i++){const at=i*4;indices.push(at,at+1,at+2,at,at+2,at+3);}geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));geometry.setAttribute('normal',new THREE.BufferAttribute(normals,3));geometry.setAttribute('uv',new THREE.BufferAttribute(uvs,2));geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));geometry.setIndex(indices);const material=new THREE.MeshBasicMaterial({side:THREE.DoubleSide,vertexColors:true}),mesh=new THREE.Mesh(geometry,material);mesh.uuid=line.uuid+':native-line';mesh.matrixAutoUpdate=false;mesh.matrixWorldAutoUpdate=false;mesh.frustumCulled=false;entry={mesh,capacity:segments,signature:''};this.entries.set(line.uuid,entry);}
    const material=line.material,color=material.vertexColors?line.geometry.getAttribute('color'):undefined,signature=JSON.stringify([position.version,color?.version,index?.version,start,end,line.isLineSegments,line.isLineLoop,...line.matrixWorld.elements,...camera.matrixWorld.elements,...camera.projectionMatrix.elements,width,height,material.linewidth]);
    entry.mesh.userData=line.userData;entry.mesh.layers.mask=line.layers.mask;entry.mesh.renderOrder=line.renderOrder;entry.mesh.matrix.copy(line.matrixWorld);entry.mesh.matrixWorld.copy(line.matrixWorld);entry.mesh.material.color.copy(material.color);for(const key of ['transparent','opacity','depthTest','depthWrite','blending'])entry.mesh.material[key]=material[key];
    if(entry.signature===signature&&entry.position===position&&entry.color===color&&entry.index===index)return entry.mesh;entry.signature=signature;entry.position=position;entry.color=color;entry.index=index;this.view.copy(camera.matrixWorldInverse).multiply(line.matrixWorld);this.inverse.copy(line.matrixWorld).invert();const geometry=entry.mesh.geometry,output=geometry.attributes.position.array,tint=geometry.attributes.color.array;let visible=0;const at=i=>index?index.getX(i):i;
    for(let i=0;i<segments;i++){
      const first=at(start+(line.isLineSegments?i*2:i)),last=at(start+(line.isLineSegments?i*2+1:(i+1)%(end-start)));this.a.fromBufferAttribute(position,first).applyMatrix4(this.view);this.b.fromBufferAttribute(position,last).applyMatrix4(this.view);const near=-camera.near*1.00001,far=-camera.far;if(this.a.z>near&&this.b.z>near||this.a.z<far&&this.b.z<far)continue;
      for(const boundary of [near,far]){const isNear=boundary===near,aOutside=isNear?this.a.z>boundary:this.a.z<boundary,bOutside=isNear?this.b.z>boundary:this.b.z<boundary;if(aOutside!==bOutside){const alpha=(boundary-this.a.z)/(this.b.z-this.a.z);this.p.lerpVectors(this.a,this.b,alpha);(aOutside?this.a:this.b).copy(this.p);}}
      this.a.applyMatrix4(camera.projectionMatrix);this.b.applyMatrix4(camera.projectionMatrix);const dx=(this.b.x-this.a.x)*width,dy=(this.b.y-this.a.y)*height,length=Math.hypot(dx,dy);if(length<1e-9)continue;const pixels=Math.max(.1,material.linewidth||1),ox=-dy/length*pixels/width,oy=dx/length*pixels/height;
      for(let k=0;k<4;k++){const endpoint=k<2?this.a:this.b,sign=k===0||k===3?1:-1;this.p.copy(endpoint);this.p.x+=ox*sign;this.p.y+=oy*sign;this.p.applyMatrix4(camera.projectionMatrixInverse).applyMatrix4(camera.matrixWorld).applyMatrix4(this.inverse);const base=(visible*4+k)*3;this.p.toArray(output,base);const c=k<2?first:last;for(let axis=0;axis<3;axis++)tint[base+axis]=color?(axis===0?color.getX(c):axis===1?color.getY(c):color.getZ(c)):1;}
      visible++;
    }
    geometry.setDrawRange(0,visible*6);geometry.attributes.position.needsUpdate=true;geometry.attributes.color.needsUpdate=true;return visible?entry.mesh:null;
  }
  release(entry){entry.mesh.geometry.dispose();entry.mesh.material.dispose();}
  end(){for(const [id,entry] of this.entries)if(!this.seen.has(id)){this.release(entry);this.entries.delete(id);}}
  dispose(){for(const entry of this.entries.values())this.release(entry);this.entries.clear();this.seen.clear();}
}
