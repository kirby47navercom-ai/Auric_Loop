import * as THREE from 'three';
import {validSurface} from './model.js';
import {enabledComponent} from './scene-components.js';
export function scenePrimitives(surface,surfaceMaterial){
const ownSurface=surfaceMaterial===undefined;
if(ownSurface)surfaceMaterial=new THREE.MeshStandardMaterial({color:surface.color,roughness:surface.roughness,metalness:surface.metalness});
const stoneMaterial = new THREE.MeshStandardMaterial({ color: 0x9faa91, roughness: 0.86, flatShading: true });
const darkStone = new THREE.MeshStandardMaterial({ color: 0x667c6d, roughness: 0.93, flatShading: true });
const grassMaterial = new THREE.MeshStandardMaterial({ color: 0x7f9c61, roughness: 1, flatShading: true });
const paleGrass = new THREE.MeshStandardMaterial({ color: 0xa4b97c, roughness: 1, flatShading: true });
const groundMaterial = new THREE.MeshStandardMaterial({ color: 0x607851, roughness: 1, flatShading: true });
const crystalMaterial = new THREE.MeshPhysicalMaterial({ color: 0xc3e3b9, roughness: 0.13, metalness: 0.18, clearcoat: 1, emissive: 0x669853, emissiveIntensity: 0.13, flatShading: true });
const pooled=new Set([surfaceMaterial,stoneMaterial,darkStone,grassMaterial,paleGrass,groundMaterial,crystalMaterial]);let disposed=false;

function mesh(group, geometry, material, position = [0, 0, 0], rotation = [0, 0, 0], scale = [1, 1, 1]) {
  const resources=group.userData.resources??=new Set();resources.add(geometry);for(const m of Array.isArray(material)?material:[material])if(!pooled.has(m))resources.add(m);
  const m = new THREE.Mesh(geometry, material); m.position.set(...position); m.rotation.set(...rotation); m.scale.set(...scale); m.castShadow = true; m.receiveShadow = true; group.add(m); return m;
}
const box = (group, size, material, pos, rot) => mesh(group, new THREE.BoxGeometry(...size), material, pos, rot);
function plant(group, x, z, scale = 1, seed = 0) {
  for (let i = 0; i < 5; i++) {
    const leaf = mesh(group, new THREE.ConeGeometry(0.10 * scale, 0.73 * scale, 3), i % 2 ? grassMaterial : paleGrass, [x, .25 * scale, z]);
    leaf.rotation.z = (i - 2) * .27; leaf.rotation.y = seed + i * 1.7;
  }
}
function buildObject(object) {
  const g = new THREE.Group();g.name = object.name;g.userData.objectId = object.id;
  switch (object.kind) {
    case 'arch': {
      for (const x of [-1.4, 1.4]) for (let j = 0; j < 4; j++) box(g, [.76, .48, .8], j === 3 ? surfaceMaterial : stoneMaterial, [x, .24 + j * .5, 0], [0, (j % 2 ? .015 : -.025), 0]);
      mesh(g, new THREE.TorusGeometry(1.4, .39, 4, 12, Math.PI), surfaceMaterial, [0, 1.78, 0]);
      box(g, [1.12, .18, 1.06], darkStone, [-1.4, -.04, 0]); box(g, [1.12, .18, 1.06], darkStone, [1.4, -.04, 0]);
      plant(g, -1.65, .1, .45, 0); plant(g, 1.52, -.15, .55, 1);
      break;
    }
    case 'crystal': mesh(g, new THREE.OctahedronGeometry(.50), crystalMaterial, [0, 0, 0], [0, 0, .09], [.75, 1.45, .75]); break;
    case 'ground': {
      mesh(g, new THREE.CylinderGeometry(4.7, 4.45, .6, 8), darkStone, [0, -.40, 0], [0, Math.PI / 8, 0]);
      mesh(g, new THREE.CylinderGeometry(4.6, 4.72, .22, 8), groundMaterial, [0, -.06, 0], [0, Math.PI / 8, 0]);
      for (let x = -3; x <= 3; x++) for (let z = -3; z <= 3; z++) if (x * x + z * z < 15 && !(x > 1 && z > 0)) {
        box(g, [.91, .075, .91], (x + z) % 3 ? groundMaterial : stoneMaterial, [x, .046, z], [0, Math.sin(x + z) * .025, 0]);
      }
      for (let i = 0; i < 12; i++) { const angle = i * Math.PI / 6; mesh(g, new THREE.DodecahedronGeometry(.42, 0), darkStone, [Math.cos(angle) * 4.2, -.32, Math.sin(angle) * 4.2], [.5, angle, 0], [1, .9, 1]); }
      break;
    }
    case 'path': {
      for (let i = 0; i < 5; i++) box(g, [1.25, .11, .64], stoneMaterial, [Math.sin(i * .8) * .15, .12, .25 + i * .72], [0, (i % 2 ? .025 : -.02), 0]);
      for (let i = 0; i < 3; i++) box(g, [1.5, .20, .52], stoneMaterial, [0, -.08 - .12 * i, 4 + i * .4]);
      break;
    }
    case 'grass': {
      const points = [[-3,-2],[-2.8,-1],[-3.1,.5],[-2.5,2.4],[-1.4,2.7],[1.4,2.9],[2.9,-2.3],[3.5,-.4],[2.2,-2.8],[-1,-3.3],[-3.4,1.7],[3.4,2.4],[1.5,.6],[-1.7,.5]];
      points.forEach(([x,z], i) => { plant(g, x, z, .8 + (i % 3) * .22, i); plant(g, x + .28, z + .17, .6, i + 1); });
      [[-2,1.7],[2.8,-1.2],[-2.3,-2.6]].forEach(([x,z]) => { for (let j = 0; j < 3; j++) { mesh(g, new THREE.CylinderGeometry(.025,.025,.5,4), grassMaterial, [x+j*.2,.3,z+j*.12]); mesh(g,new THREE.IcosahedronGeometry(.105,0), new THREE.MeshStandardMaterial({color:0xf1d59a,roughness:1}), [x+j*.2,.58,z+j*.12]); } });
      break;
    }
    case 'rocks': [[-2.7,-2.4,.6],[2.8,-2.3,.6],[-3,1.9,.4],[3.5,.1,.5],[-1.9,-2.8,.36],[2.9,2.5,.42]].forEach(([x,z,s],i) => mesh(g, new THREE.DodecahedronGeometry(s), i%2 ? darkStone : stoneMaterial, [x,s*.4,z], [.3,i,0],[1.1,.8,.8])); break;
    case 'water': mesh(g, new THREE.CylinderGeometry(1.3,1.25,.06,28), new THREE.MeshPhysicalMaterial({color:0x567f83,roughness:.16,metalness:.3,clearcoat:1}), [0,.08,0], [0,0,0],[1.05,1,.76]); break;
    case 'light': { const directional=object.id==='sun-light',p=enabledComponent(object,directional?'DirectionalLight':'PointLight')||(!directional?enabledComponent(object,'DirectionalLight'):null);if(!p)break;const l=directional?new THREE.DirectionalLight(new THREE.Color(...p.color.slice(0,3)),p.intensity):new THREE.PointLight(new THREE.Color(...p.color.slice(0,3)),p.intensity,p.radius??15,p.decay??2);g.userData.resources=new Set([l]);g.add(l);if(directional){l.castShadow=p.castShadow;l.shadow.mapSize.set(2048,2048);Object.assign(l.shadow.camera,{left:-8,right:8,top:8,bottom:-8,near:.1,far:25});l.shadow.bias=-.001;l.shadow.normalBias=.025;l.target.position.set(0,0,-1);g.add(l.target);}break; }
    case 'skyAtmosphere':case 'skyLight':case 'volumetricCloud':case 'heightFog': {
      const geometry=new THREE.EdgesGeometry(new THREE.OctahedronGeometry(.4)),material=new THREE.LineBasicMaterial({color:object.kind==='heightFog'?0x95afc0:object.kind==='volumetricCloud'?0xc4d5df:0xe5ca84,depthTest:false}),helper=new THREE.LineSegments(geometry,material);helper.userData.editorHelper=true;helper.userData.environmentHelper=true;helper.renderOrder=900;g.userData.resources=new Set([geometry,material]);g.add(helper);break;
    }
    case 'camera': break;
    case 'cube': box(g, [1,1,1], surfaceMaterial, [0,.5,0]); break;
    case 'cone': mesh(g,new THREE.ConeGeometry(.6,1.2,32),surfaceMaterial,[0,.6,0]);break;
    case 'capsule': mesh(g,new THREE.CapsuleGeometry(.35,.8,8,24),surfaceMaterial,[0,.75,0]);break;
    case 'torus': mesh(g,new THREE.TorusGeometry(.6,.2,12,32),surfaceMaterial,[0,.8,0]);break;
    case 'sphere': mesh(g, new THREE.SphereGeometry(.6,32,24), surfaceMaterial, [0,.6,0]); break;
    case 'cylinder': mesh(g, new THREE.CylinderGeometry(.45,.45,1.2,24), surfaceMaterial, [0,.6,0]); break;
    case 'plane': box(g,[1.5,.08,1.5],surfaceMaterial,[0,.04,0]); break;
    case 'character': mesh(g,new THREE.CapsuleGeometry(.35,1.1,8,16),surfaceMaterial,[0,.9,0]);break;
  }
  if(object.materialSurface&&validSurface(object.materialSurface)){const m=new THREE.MeshStandardMaterial({color:object.materialSurface.color,roughness:object.materialSurface.roughness,metalness:object.materialSurface.metalness});(g.userData.resources??=new Set()).add(m);g.traverse(child=>{if(child.isMesh)child.material=m;});}
  g.traverse(child => child.userData.objectId = object.id);
  return g;
}
function dispose(){if(disposed)return;disposed=true;for(const m of pooled)if(m!==surfaceMaterial||ownSurface)m.dispose();pooled.clear();}
return {build:buildObject,surfaceMaterial,mesh,dispose};
}
