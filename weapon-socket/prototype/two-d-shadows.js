import * as THREE from 'three';
import {enabledComponent} from './scene-components.js';
import {polygonTriangles} from './collision-geometry.js';

export const shadow2dLimits={edges:8192,bitmapPixels:4194304,atlasPixels:4194304,shapePoints:64,resolutions:[64,128,256,512,1024]};
const identity=new THREE.Matrix3(),point3=new THREE.Vector3(),box=new THREE.Box3(),fillBox=new THREE.Box3();
const visible=node=>{for(let p=node;p;p=p.parent)if(!p.visible||p.userData.disposed)return false;return true;};
export function shadowCompositeRoot(group){let result=group;for(let p=group.parent;p;p=p.parent)if(p.userData.shadowGroup2d?.enabled!==false&&p.userData.shadowGroup2d)result=p;return result;}
const circle=(radius,center=[0,0],height=0)=>Array.from({length:32},(_,i)=>{const a=i*Math.PI/16;return [center[0]+radius*Math.cos(a),center[1]+radius*Math.sin(a)+(Math.sin(a)>=0?height:-height)];});
export function shadowColliderPaths(object){
  const paths=[];
  for(const type of ['BoxCollider2D','CircleCollider2D','CapsuleCollider2D','PolygonCollider2D','EdgeCollider2D']){
    for(const c of [...object.components||[],...object.tileColliders||[]])if(c.type===type&&c.properties?.enabled!==false){const p={...enabledComponent({...object,components:[c]},type)},center=p.center||[0,0,0];let shape;
      if(type==='BoxCollider2D'){const [x,y]=p.extent;shape=[[-x,-y],[x,-y],[x,y],[-x,y]];}
      if(type==='CircleCollider2D')shape=circle(p.radius);
      if(type==='CapsuleCollider2D')shape=circle(p.radius,[0,0],Math.max(0,p.height/2-p.radius));
      if(type==='PolygonCollider2D'){for(const path of p.paths)paths.push({points:path.map(q=>q.map((v,i)=>v+center[i])),closed:true});continue;}
      if(type==='EdgeCollider2D')shape=p.points;
      paths.push({points:shape.map(q=>q.map((v,i)=>v+center[i])),closed:type!=='EdgeCollider2D'});
    }
  }return paths;
}

// Squared Euclidean distance, separable in image rows/columns. No radius-sized kernel.
function distanceLine(input,output,length,spacing,sites,cuts,offset){let top=0;sites[0]=0;cuts[0]=-Infinity;cuts[1]=Infinity;const w=spacing*spacing;
  for(let q=1;q<length;q++){let split;do{const v=sites[top];split=((input[q]+w*(q+offset)**2)-(input[v]+w*(v+offset)**2))/(2*w*(q-v));if(split>cuts[top])break;top--;}while(top>=0);top++;sites[top]=q;cuts[top]=split;cuts[top+1]=Infinity;}
  top=0;for(let q=0;q<length;q++){while(cuts[top+1]<q)top++;const d=q-sites[top]-offset;output[q]=w*d*d+input[sites[top]];}
}
export function bitmapShadowEdges(alpha,width,height,bounds,trim=0){
  if(width*height>shadow2dLimits.bitmapPixels)throw Error('2D 그림자 이미지 범위는4,194,304픽셀까지예요.');
  const dx=(bounds[2]-bounds[0])/width,dy=(bounds[3]-bounds[1])/height;let occupied=alpha;
  if(trim>0){const w=width+2,h=height+2,n=Math.max(w,h),input=new Float64Array(n),output=new Float64Array(n),half=new Float64Array(n),sites=new Int32Array(n),cuts=new Float64Array(n+1),dist=new Float64Array(w*h);
    // Pixel rectangles, not pixel centers: two shifted parabolas preserve anisotropic spacing.
    const transform=length=>{distanceLine(input,half,length,spacing,sites,cuts,.5);distanceLine(input,output,length,spacing,sites,cuts,-.5);for(let i=0;i<length;i++)output[i]=Math.min(input[i],half[i],output[i]);};let spacing=dx;
    for(let y=0;y<h;y++){for(let x=0;x<w;x++)input[x]=x&&y&&x<=width&&y<=height&&alpha[(y-1)*width+x-1]?1e30:0;transform(w);dist.set(output.subarray(0,w),y*w);}
    spacing=dy;for(let x=0;x<w;x++){for(let y=0;y<h;y++)input[y]=dist[y*w+x];transform(h);for(let y=0;y<h;y++)dist[y*w+x]=output[y];}
    occupied=new Uint8Array(alpha.length);const threshold=trim**2;for(let y=0;y<height;y++)for(let x=0;x<width;x++)occupied[y*width+x]=alpha[y*width+x]&&dist[(y+1)*w+x+1]>=threshold?1:0;
  }
  const at=(x,y)=>x>=0&&y>=0&&x<width&&y<height&&occupied[y*width+x],edges=[];
  const point=(x,y)=>[bounds[0]+x*dx,bounds[3]-y*dy];
  const add=(x0,y0,x1,y1)=>{edges.push([point(x0,y0),point(x1,y1)]);if(edges.length>shadow2dLimits.edges)throw Error('2D 그림자 외곽은8,192개 선분까지예요.');};
  for(let y=0;y<=height;y++)for(const sign of [1,-1]){let start=-1;for(let x=0;x<=width;x++){const edge=x<width&&(sign===1?at(x,y)&&!at(x,y-1):at(x,y-1)&&!at(x,y));if(edge&&start<0)start=x;else if(!edge&&start>=0){sign===1?add(x,y,start,y):add(start,y,x,y);start=-1;}}}
  for(let x=0;x<=width;x++)for(const sign of [1,-1]){let start=-1;for(let y=0;y<=height;y++){const edge=y<height&&(sign===1?at(x,y)&&!at(x-1,y):at(x-1,y)&&!at(x,y));if(edge&&start<0)start=y;else if(!edge&&start>=0){sign===1?add(x,start,x,y):add(x,y,x,start);start=-1;}}}
  return edges;
}
export function meshShadowEdges(geometry){
  const positions=geometry.getAttribute('position'),indices=geometry.index,edges=new Map(),faces=new Set(),point=i=>[positions.getX(i),positions.getY(i)],key=p=>p.join(',');
  for(let i=0;i<(indices?.count||positions.count);i+=3){const face=[0,1,2].map(j=>point(indices?indices.getX(i+j):i+j)),[a,b,c]=face,id=face.map(key).sort().join('|');if(faces.has(id)||(b[0]-a[0])*(c[1]-a[1])===(b[1]-a[1])*(c[0]-a[0]))continue;faces.add(id);for(let j=0;j<3;j++){const a=face[j],b=face[(j+1)%3],ka=key(a),kb=key(b),id=ka<kb?ka+'|'+kb:kb+'|'+ka,item=edges.get(id);if(item)item.count++;else edges.set(id,{count:1,edge:[a,b]});}}
  const result=[...edges.values()].filter(e=>e.count===1).map(e=>e.edge);if(result.length>shadow2dLimits.edges)throw Error('2D 그림자 메시 외곽 제한을 넘었어요.');return result;
}
function filledShape(paths){const points=paths.filter(p=>p.closed).flatMap(p=>polygonTriangles([p.points])).flat(2),geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(points.flatMap((v,i)=>i%2?[v,0]:[v]),3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(new Float32Array(points.length),2));return geometry;}
function projectionGeometry(edges){const positions=[],extrude=[],turn=[],weight=[];const add=(p,e,t,w)=>{positions.push(...p,0);extrude.push(e);turn.push(t);weight.push(w);};
  for(const [a,b] of edges){for(const [p,e] of [[a,0],[a,1],[b,1],[a,0],[b,1],[b,0]])add(p,e,0,1);for(const [p,t] of [[a,-1],[b,1]]){add(p,0,0,1);add(p,1,0,1);add(p,1,t,0);}}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));for(const [key,data] of [['extrude',extrude],['turn',turn],['weight',weight]])g.setAttribute(key,new THREE.Float32BufferAttribute(data,1));return g;
}
function bitmapEdges(mesh,p){
  const map=mesh.material.map,image=map.image,w=image.width||image.videoWidth,h=image.height||image.videoHeight;
  const width=Math.max(1,Math.round(w*map.repeat.x)),height=Math.max(1,Math.round(h*map.repeat.y));if(width*height>shadow2dLimits.bitmapPixels)throw Error('2D 그림자 이미지 범위 제한을 넘었어요.');
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,map.offset.x*w,(1-map.offset.y-map.repeat.y)*h,width,height,0,0,width,height);
  const rgba=ctx.getImageData(0,0,width,height).data,alpha=new Uint8Array(width*height);for(let i=0;i<alpha.length;i++)alpha[i]=rgba[i*4+3]*mesh.material.opacity>p.alphaCutoff*255?1:0;
  mesh.geometry.computeBoundingBox();const b=mesh.geometry.boundingBox;return bitmapShadowEdges(alpha,width,height,[b.min.x,b.min.y,b.max.x,b.max.y],p.trimEdge);
}

export class TwoDShadows{
  constructor(){this.cache=new Map();this.atlas=null;this.rects=null;this.bounds=null;this.materials=null;this.scene=new THREE.Scene();this.camera=new THREE.OrthographicCamera(-1,1,1,-1,.1,20);this.camera.position.z=10;this.builds=0;this.passes=0;this.signature='';}
  ensureMaterials(renderer){if(this.materials)return;if(renderer.hbShadowMaterials){this.materials=renderer.hbShadowMaterials();return;}
    const fill=(mode)=>new THREE.ShaderMaterial({depthTest:false,depthWrite:false,side:THREE.DoubleSide,toneMapped:false,colorWrite:mode!=='reset',blending:THREE.CustomBlending,blendEquation:mode==='unshadow'?THREE.AddEquation:THREE.MaxEquation,blendSrc:THREE.OneFactor,blendDst:THREE.OneFactor,stencilWrite:mode!=='self',stencilFunc:THREE.AlwaysStencilFunc,stencilRef:mode==='reset'?0:1,stencilZPass:THREE.ReplaceStencilOp,uniforms:{map:{value:null},hasMap:{value:false},transform:{value:new THREE.Matrix3()},opacity:{value:1},cutoff:{value:0}},vertexShader:'varying vec2 imageUV;uniform mat3 transform;void main(){imageUV=(transform*vec3(uv,1.0)).xy;vec4 world=modelMatrix*vec4(position,1.0);world.z=0.0;gl_Position=projectionMatrix*viewMatrix*world;}',fragmentShader:`varying vec2 imageUV;uniform sampler2D map;uniform bool hasMap;uniform float opacity,cutoff;void main(){float a=opacity*(hasMap?texture2D(map,imageUV).a:1.0);if(a<=cutoff)discard;gl_FragColor=${mode==='self'?'vec4(a,0.0,0.0,0.0)':'vec4(0.0,0.0,a,0.0)'};}`});
    const project=green=>new THREE.ShaderMaterial({depthTest:false,depthWrite:false,side:THREE.DoubleSide,toneMapped:false,blending:THREE.CustomBlending,blendEquation:THREE.MaxEquation,blendSrc:THREE.OneFactor,blendDst:THREE.OneFactor,stencilWrite:true,stencilRef:1,stencilFunc:green?THREE.EqualStencilFunc:THREE.NotEqualStencilFunc,uniforms:{origin:{value:new THREE.Vector2()},distance:{value:1},softness:{value:0}},vertexShader:'attribute float extrude,turn,weight;varying float coverage,projectedDistance;uniform vec2 origin;uniform float distance,softness;void main(){vec2 anchor=(modelMatrix*vec4(position,1.0)).xy;vec2 ray=anchor-origin;ray=length(ray)>0.00001?normalize(ray):vec2(0.0,1.0);float a=turn*softness*0.261799388;ray=mat2(cos(a),sin(a),-sin(a),cos(a))*ray;vec2 p=anchor+ray*extrude*distance;gl_Position=projectionMatrix*viewMatrix*vec4(p,0.0,1.0);coverage=weight;projectedDistance=extrude;}',fragmentShader:`varying float coverage,projectedDistance;void main(){float shade=projectedDistance>0.00001?1.0-(1.0-coverage)/projectedDistance:1.0;gl_FragColor=${green?'vec4(0.0,clamp(shade,0.0,1.0),0.0,0.0)':'vec4(clamp(shade,0.0,1.0),0.0,0.0,0.0)'};}`});
    this.materials={self:fill('self'),unshadow:fill('unshadow'),reset:fill('reset'),project:project(false),inside:project(true)};
  }
  shape(group){
    const p=group.userData.shadowCaster2d,mesh=group.userData.spriteMesh,object=group.userData.spriteActor||{components:[]},position=mesh?.geometry.attributes.position;
    const map=mesh?.material.map,signature=JSON.stringify([p,mesh?.uuid,position?.version,map?.uuid,map?.version,map?.offset,map?.repeat,mesh?.material.opacity,p.source==='collider'?[object.components.filter(c=>c.type.endsWith('Collider2D')),object.tileColliders]:null]);
    let item=this.cache.get(group);if(item?.signature===signature)return item;if(item)this.release(item);
    let paths,edges=[],geometry=mesh?.geometry,matrix=mesh?.matrixWorld||group.matrixWorld,own=false;
    if(p.source==='shape'||p.source==='collider'){paths=p.source==='shape'?[{points:p.shapePath,closed:true}]:shadowColliderPaths(object);edges=paths.flatMap(path=>path.points.slice(0,path.closed?undefined:-1).map((point,i)=>[point,path.points[(i+1)%path.points.length]]));if(!geometry){geometry=filledShape(paths);own=true;}matrix=group.matrixWorld;}
    else if(p.source==='sprite'&&mesh)edges=mesh.material.map&&mesh.userData.draw2d?.drawMode!=='sliced'&&mesh.userData.draw2d?.drawMode!=='tiled'&&!group.userData.spriteSkin?bitmapEdges(mesh,p):meshShadowEdges(mesh.geometry);
    else if(p.source==='skin'&&mesh&&group.userData.spriteSkin)edges=meshShadowEdges(mesh.geometry);
    if(edges.length>shadow2dLimits.edges)throw Error('2D 그림자 선분 제한을 넘었어요.');
    const projection=projectionGeometry(edges),localBounds=new THREE.Box3();for(const edge of edges)for(const p of edge)localBounds.expandByPoint(point3.set(...p,0));if(geometry){geometry.computeBoundingBox();localBounds.union(geometry.boundingBox);}item={group,p,signature,geometry,own,projection,matrix,mesh,edges,localBounds,fill:null,project:null};this.cache.set(group,item);this.builds++;return item;
  }
  release(item){item.projection.dispose();if(item.own)item.geometry.dispose();item.fill?.removeFromParent();item.project?.removeFromParent();}
  draw(items,mode,light){this.scene.clear();const material=this.materials[mode];
    for(const [index,item] of items.entries()){if(mode==='project'||mode==='inside'){if(!['cast','both'].includes(item.p.casting)||!item.edges.length||mode==='inside'&&item.p.casting==='both')continue;const proxy=item.project??=new THREE.Mesh(item.projection,material);proxy.material=material;proxy.matrixAutoUpdate=false;proxy.frustumCulled=false;proxy.renderOrder=index;proxy.matrix.copy(item.matrix);this.scene.add(proxy);}
      else{const self=['self','both'].includes(item.p.casting);if(!item.geometry||mode==='self'&&!self||mode!=='self'&&self)continue;const proxy=item.fill??=new THREE.Mesh(item.geometry,material);proxy.material=material;proxy.matrixAutoUpdate=false;proxy.frustumCulled=false;proxy.renderOrder=index;proxy.matrix.copy(item.mesh?.matrixWorld||item.matrix);proxy.onBeforeRender=()=>{const u=material.uniforms,map=item.mesh?.material.map;u.map.value=map||null;u.hasMap.value=!!map;map?.updateMatrix();u.transform.value.copy(map?.matrix||identity);u.opacity.value=item.mesh?.material.opacity??1;u.cutoff.value=mode==='self'?0:item.p.alphaCutoff;material.uniformsNeedUpdate=true;};this.scene.add(proxy);}
    }
    if(mode==='project'||mode==='inside'){material.uniforms.origin.value.set(light.x,light.y);material.uniforms.distance.value=light.radius*4;material.uniforms.softness.value=light.p.shadowSoftness||0;}
  }
  prepare(renderer,groups,lights,receiverLayers,layers){
    const casterGroups=groups.filter(g=>g.userData.shadowCaster2d&&visible(g)&&g.userData.shadowCaster2d.enabled!==false),active=lights.filter(g=>{const p=g.userData.light2d;return p.lightType!=='global'&&(p.shadows&&p.shadowStrength>0||p.volumetric&&p.volumeIntensity>0&&p.volumeShadowStrength>0);});
    if(!active.length||!casterGroups.length||!receiverLayers.size){this.dispose();return {shadowMaps:0,shadowCasters:0,shadowPixels:0};}
    this.ensureMaterials(renderer);const used=new Set(casterGroups),items=casterGroups.map(g=>this.shape(g));for(const [group,item] of this.cache)if(!used.has(group)){this.release(item);this.cache.delete(group);}
    const signature=JSON.stringify([layers,[...receiverLayers],items.map(i=>[i.signature,i.matrix.elements,i.mesh?.matrixWorld.elements,i.mesh?.userData.draw2d?.sortingOrder,shadowCompositeRoot(i.group).uuid,shadowCompositeRoot(i.group).userData.spriteMesh?.userData.draw2d?.sortingOrder]),active.map(g=>[lights.indexOf(g),g.userData.light2d,g.matrixWorld.elements])]);if(this.signature===signature&&this.atlas)return this.stats;
    const cells=[],rectData=new Float32Array(64*64*4),boundData=new Float32Array(64*4);
    for(const group of active){const p=group.userData.light2d,m=group.matrixWorld.elements,row=lights.indexOf(group),cookie=group.userData.light2dCookie,localRadius=p.lightType==='freeform'?Math.max(...p.shapePath.map(v=>Math.hypot(...v)))+p.shapeFalloff:p.lightType==='sprite'?Math.hypot(...(cookie?.size||[p.cookieWidth,p.cookieHeight]))/2+Math.hypot(...(cookie?.offset||[0,0])):p.outerRadius,radius=localRadius*Math.hypot(m[0],m[1],m[4],m[5]),light={p,row,x:m[12],y:m[13],radius},buckets=new Map();boundData.set([light.x,light.y,2*radius,2*radius],row*4);
      for(const layer of receiverLayers){if(!p.targetSortingLayers.includes(layers[layer].id))continue;const selected=items.filter(item=>{if(!item.p.allSortingLayers&&!item.p.targetSortingLayers.includes(layers[layer].id))return false;box.copy(item.localBounds).applyMatrix4(item.matrix);if(item.mesh)box.union(fillBox.copy(item.geometry.boundingBox).applyMatrix4(item.mesh.matrixWorld));return box.min.x<=light.x+radius&&box.max.x>=light.x-radius&&box.min.y<=light.y+radius&&box.max.y>=light.y-radius;});if(!selected.some(item=>['self','both'].includes(item.p.casting)&&item.geometry||item.edges.length&&['cast','both'].includes(item.p.casting)))continue;const key=selected.map(i=>i.group.uuid).join(',');let cell=buckets.get(key);if(!cell){cell={light,items:selected,layers:[],resolution:p.shadowResolution};buckets.set(key,cell);cells.push(cell);}cell.layers.push(layer);}
    }
    if(!cells.length){this.dispose();return {shadowMaps:0,shadowCasters:0,shadowPixels:0};}
    const resolution=Math.max(...cells.map(c=>c.resolution)),columns=Math.ceil(Math.sqrt(cells.length)),rows=Math.ceil(cells.length/columns),width=columns*resolution,height=rows*resolution;
    // ponytail: a lazy4M-pixel atlas; multiple atlas batches replace this ceiling for larger shadow scenes.
    if(width*height>shadow2dLimits.atlasPixels||Math.max(width,height)>(renderer.backend?.device?.limits.maxTextureDimension2D||renderer.capabilities.maxTextureSize))throw Error('2D 그림자 해상도·광원/레이어 조합이 렌더 예산을 넘었어요.');
    if(!this.atlas)this.atlas=renderer.hbShadowTarget?renderer.hbShadowTarget(width,height,{depthBuffer:true,stencilBuffer:true,minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter}):new THREE.WebGLRenderTarget(width,height,{depthBuffer:true,stencilBuffer:true,minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter});else if(this.atlas.width!==width||this.atlas.height!==height)this.atlas.setSize(width,height);
    const target=renderer.getRenderTarget(),clear=renderer.getClearColor(new THREE.Color()),alpha=renderer.getClearAlpha(),autoClear=renderer.autoClear,viewport=renderer.getViewport(new THREE.Vector4()),scissor=renderer.getScissor(new THREE.Vector4()),scissorTest=renderer.getScissorTest(),xr=renderer.xr.enabled;
    try{renderer.xr.enabled=false;renderer.autoClear=false;renderer.setClearColor(0,0);
      // WebGPU loadOp clear ignores scissor; clear the atlas once before drawing all cells.
      if(renderer.hbBackend==='webgpu'){this.atlas.scissorTest=false;renderer.setRenderTarget(this.atlas);renderer.clear(true,true,true);}
      for(let index=0;index<cells.length;index++){const cell=cells[index],x=index%columns*resolution,y=Math.floor(index/columns)*resolution;this.atlas.viewport.set(x,y,resolution,resolution);this.atlas.scissor.set(x,y,resolution,resolution);this.atlas.scissorTest=true;renderer.setRenderTarget(this.atlas);if(renderer.hbBackend!=='webgpu')renderer.clear(true,true,true);
        const l=cell.light;this.camera.left=l.x-l.radius;this.camera.right=l.x+l.radius;this.camera.top=l.y+l.radius;this.camera.bottom=l.y-l.radius;this.camera.updateProjectionMatrix();
        const composites=new Map();for(const item of cell.items){const root=shadowCompositeRoot(item.group);if(!composites.has(root))composites.set(root,[]);composites.get(root).push(item);}
        const order=g=>g.userData.spriteMesh?.userData.draw2d?.sortingOrder||0;const sorted=[...composites].sort(([a],[b])=>order(a)-order(b)||a.uuid.localeCompare(b.uuid));
        for(const [,members] of sorted){members.sort((a,b)=>order(b.group)-order(a.group)||a.group.uuid.localeCompare(b.group.uuid));for(const mode of ['self','unshadow','project','inside','reset']){this.draw(members,mode,l);if(this.scene.children.length){renderer.render(this.scene,this.camera);this.passes++;}}}
        for(const layer of cell.layers)rectData.set([(x+.5)/width,(y+.5)/height,(resolution-1)/width,(resolution-1)/height],(layer*64+l.row)*4);
      }
    }finally{this.scene.clear();renderer.setRenderTarget(target);renderer.setViewport(viewport);renderer.setScissor(scissor);renderer.setScissorTest(scissorTest);renderer.setClearColor(clear,alpha);renderer.autoClear=autoClear;renderer.xr.enabled=xr;}
    if(!this.rects){this.rects=new THREE.DataTexture(rectData,64,64,THREE.RGBAFormat,THREE.FloatType);this.bounds=new THREE.DataTexture(boundData,64,1,THREE.RGBAFormat,THREE.FloatType);}else{this.rects.image.data.set(rectData);this.bounds.image.data.set(boundData);}this.rects.needsUpdate=this.bounds.needsUpdate=true;
    this.signature=signature;return this.stats={shadowMaps:cells.length,shadowCasters:items.length,shadowPixels:width*height,shadowGeometryBuilds:this.builds,shadowPasses:this.passes};
  }
  dispose(){for(const item of this.cache.values())this.release(item);this.cache.clear();for(const resource of [this.atlas,this.rects,this.bounds,...Object.values(this.materials||{})])resource?.dispose();this.atlas=this.rects=this.bounds=this.materials=null;this.signature='';this.scene.clear();}
}
