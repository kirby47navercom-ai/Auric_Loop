import {OrthographicCamera,PerspectiveCamera,Vector3,Vector4,Color} from 'three';
import {enabledComponent} from './scene-components.js';

export function createGameCamera(p){const camera=p.projection==='orthographic'?new OrthographicCamera(-p.orthographicSize,p.orthographicSize,p.orthographicSize,-p.orthographicSize,p.near,p.far):new PerspectiveCamera(p.fieldOfView,1,p.near,p.far);camera.userData.cameraProperties=p;return camera;}
export function pixelPerfectViewport(width,height,p,pixelRatio=1){
  const cssWidth=width,cssHeight=height;width=Math.round(width*pixelRatio);height=Math.round(height*pixelRatio);
  const ppu=p.pixelPixelsPerUnit||32,reference=[p.pixelReferenceWidth||640,p.pixelReferenceHeight||360],nativeHeight=Math.max(1,Math.round(2*p.orthographicSize*ppu)),nativeWidth=Math.max(1,Math.round(nativeHeight*reference[0]/reference[1]));
  const fit=Math.min(width/nativeWidth,height/nativeHeight),scale=fit>=1?Math.floor(fit):fit;
  const w=Math.min(width,Math.round(nativeWidth*scale)),h=Math.min(height,Math.round(nativeHeight*scale));
  return {x:Math.floor((width-w)/2)/pixelRatio,y:Math.floor((height-h)/2)/pixelRatio,width:w/pixelRatio,height:h/pixelRatio,aspect:nativeWidth/nativeHeight,scale,ppu,cssWidth,cssHeight,pixelRatio};
}
export function selectGameCamera(objects,size,override,current){
  const aspect=typeof size==='number'?size:size.width/Math.max(1,size.height);
  let selected;
  for(const object of objects){
    if(object.visible===false||override&&object.id!==override)continue;
    const authored=object.components?enabledComponent(object,'Camera'):null;if(object.components&&!authored)continue;
    const camera=current(object.id)?.userData.gameCamera,properties=authored||camera?.userData.cameraProperties;
    if(camera&&properties&&(override||properties.main)&&(!selected||properties.priority>selected.properties.priority))selected={object,camera,properties};
  }if(!selected)return null;
  let c=selected.camera;const p=selected.properties;
  if(Boolean(c.isOrthographicCamera)!==(p.projection==='orthographic')){const previous=c,parent=c.parent;c=createGameCamera(p);c.position.copy(previous.userData.basePosition||previous.position);c.quaternion.copy(previous.quaternion);c.scale.copy(previous.scale);previous.removeFromParent();parent.add(c);parent.userData.gameCamera=c;}
  c.userData.cameraProperties=p;c.near=p.near;c.far=p.far;if(c.isPerspectiveCamera)c.fov=p.fieldOfView;
  c.userData.pixelViewport=c.isOrthographicCamera&&p.pixelPerfect&&typeof size==='object'?pixelPerfectViewport(size.width,size.height,p):null;
  const ratio=c.userData.pixelViewport?.aspect||aspect;
  if(c.isOrthographicCamera){c.top=p.orthographicSize;c.bottom=-p.orthographicSize;c.left=-p.orthographicSize*ratio;c.right=p.orthographicSize*ratio;}else c.aspect=aspect;
  c.userData.basePosition??=c.position.clone();c.position.copy(c.userData.basePosition);
  if(p.followTarget){const target=current(p.followTarget);if(target){const position=target.getWorldPosition(new Vector3()).add(new Vector3(...(p.followOffset||[0,0,10])));c.parent.updateWorldMatrix(true,false);c.position.copy(c.parent.worldToLocal(position));}}
  const shake=selected.object.cameraShake;if(shake?.remaining>0){const t=shake.duration-shake.remaining,amplitude=shake.intensity*shake.remaining/Math.max(.001,shake.duration);c.position.x+=Math.sin(t*73.9)*amplitude;c.position.y+=Math.cos(t*91.7)*amplitude;}
  if(c.isOrthographicCamera&&p.pixelPerfect){const ppu=p.pixelPixelsPerUnit||32;c.parent.updateWorldMatrix(true,false);const at=c.parent.localToWorld(c.position.clone());at.x=Math.round(at.x*ppu)/ppu;at.y=Math.round(at.y*ppu)/ppu;c.position.copy(c.parent.worldToLocal(at));}
  c.updateProjectionMatrix();c.updateWorldMatrix(true,false);return c;
}
// Viewport values are CSS pixels; Three applies the drawing-buffer pixel ratio.
export function renderGameViewport(renderer,camera,draw){
  let rect=camera.userData.pixelViewport;if(!rect)return draw();const ratio=renderer.getPixelRatio();if(rect.pixelRatio!==ratio)camera.userData.pixelViewport=rect=pixelPerfectViewport(rect.cssWidth,rect.cssHeight,camera.userData.cameraProperties,ratio);
  const viewport=renderer.getViewport(new Vector4()),scissor=renderer.getScissor(new Vector4()),test=renderer.getScissorTest(),color=renderer.getClearColor(new Color()),alpha=renderer.getClearAlpha();
  try{renderer.setScissorTest(false);renderer.setClearColor(0,1);renderer.clear();renderer.setClearColor(color,alpha);renderer.setViewport(rect.x,rect.y,rect.width,rect.height);renderer.setScissor(rect.x,rect.y,rect.width,rect.height);renderer.setScissorTest(true);return draw();}
  finally{renderer.setViewport(viewport);renderer.setScissor(scissor);renderer.setScissorTest(test);renderer.setClearColor(color,alpha);}
}
export function fallbackGameCamera(dimension,aspect=1){const camera=dimension==='2d'?new OrthographicCamera(-7*aspect,7*aspect,7,-7,.05,100000):new PerspectiveCamera(60,aspect,.05,100000);if(dimension==='2d')camera.position.set(0,0,20);else{camera.position.set(8.6,7.2,10.5);camera.lookAt(0,.45,0);}camera.updateWorldMatrix(true,false);return camera;}
