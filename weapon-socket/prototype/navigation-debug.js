import * as THREE from 'three';
import {validNavigationAsset} from './navigation-mesh.js';

// Created only while an editor viewport requests navigation visualization.
export class NavigationDebugOverlay{
 constructor(data){
  if(!validNavigationAsset('navmesh',data))throw Error('내비게이션 표시 에셋을 확인하세요.');this.group=new THREE.Group();this.resources=[];const positions=new Float32Array(data.vertices.length*3),indices=new(data.vertices.length<=65536?Uint16Array:Uint32Array)(data.indices.length),counts=new Uint32Array(32),starts=new Uint32Array(32),geometry=new THREE.BufferGeometry(),materials=[],areas=[];
  for(let i=0;i<data.vertices.length;i++)positions.set(data.vertices[i],i*3);for(let f=0;f<data.indices.length/3;f++)counts[data.areas?.[f]||0]+=3;for(let i=1;i<32;i++)starts[i]=starts[i-1]+counts[i-1];const cursors=starts.slice();for(let f=0;f<data.indices.length/3;f++){const area=data.areas?.[f]||0;for(let k=0;k<3;k++)indices[cursors[area]++]=data.indices[f*3+k];}
  for(let area=0;area<32;area++)if(counts[area]){const color=new THREE.Color().setHSL(area?(area*.61803398875)%1:.36,.7,.48),material=new THREE.MeshBasicMaterial({color,side:THREE.DoubleSide,transparent:true,opacity:.25,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1});geometry.addGroup(starts[area],counts[area],materials.length);materials.push(material);areas.push(area);}
  geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));geometry.setIndex(new THREE.BufferAttribute(indices,1));this.resources.push(geometry,...materials);const fill=new THREE.Mesh(geometry,materials);fill.renderOrder=100;this.group.add(fill);
  const wire=new THREE.WireframeGeometry(geometry),wireMaterial=new THREE.LineBasicMaterial({color:0x70d795,transparent:true,opacity:.7,depthWrite:false});this.resources.push(wire,wireMaterial);const lines=new THREE.LineSegments(wire,wireMaterial);lines.renderOrder=101;this.group.add(lines);
  const links=data.links.filter(l=>l.enabled),points=links.flatMap(l=>[new THREE.Vector3(...l.start),new THREE.Vector3(...l.end)]);let linkBytes=0;if(points.length){const linkGeometry=new THREE.BufferGeometry().setFromPoints(points),linkMaterial=new THREE.LineBasicMaterial({color:0x78d9ff,depthWrite:false});this.resources.push(linkGeometry,linkMaterial);const linkLines=new THREE.LineSegments(linkGeometry,linkMaterial);linkLines.renderOrder=102;this.group.add(linkLines);linkBytes=linkGeometry.getAttribute('position').array.byteLength;}
  this.group.traverse(node=>{node.userData.editorHelper=true;node.userData.hbNavigation=true;node.raycast=()=>{};});this.metadata={plane:data.plane||'XZ',vertices:data.vertices.length,triangles:data.indices.length/3,links:links.length,areas,bytes:positions.byteLength+indices.byteLength+wire.getAttribute('position').array.byteLength+linkBytes};this.disposed=false;
 }
 dispose(){if(this.disposed)return;this.disposed=true;this.group.removeFromParent();this.resources.forEach(r=>r.dispose());this.resources.length=0;this.group.clear();}
}
