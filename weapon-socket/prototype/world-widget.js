import * as THREE from 'three';
import {sceneWorldMatrix} from './scene-runtime.js';
const clip=new THREE.Vector4(),point=new THREE.Vector3(),eye=new THREE.Vector3();
// Camera-facing DOM presentation. It does not write depth or receive scene lighting.
export function worldWidgetPlacement(object,objects,camera,width,height,p){
 if(!camera||!width||!height||object.poolActive===false||object.visible===false)return {visible:false};
 camera.updateWorldMatrix(true,false);point.fromArray(p.worldOffset||[0,0,0]).applyMatrix4(sceneWorldMatrix(object,objects));camera.getWorldPosition(eye);const distance=point.distanceTo(eye);if(p.maxDistance>0&&distance>p.maxDistance)return {visible:false};
 clip.set(point.x,point.y,point.z,1).applyMatrix4(camera.matrixWorldInverse).applyMatrix4(camera.projectionMatrix);if(clip.w<=0||clip.z< -clip.w||clip.z>clip.w)return {visible:false};
 let scale=1;if(p.distanceScale){const pixelsPerUnit=height*Math.abs(camera.projectionMatrix.elements[5])/(2*(camera.isPerspectiveCamera?clip.w:1));scale=pixelsPerUnit*(p.unitsPerPixel??.01);}
 const x=(clip.x/clip.w+1)*width/2,y=(1-clip.y/clip.w)*height/2,w=(p.drawWidth||320)*scale,h=(p.drawHeight||180)*scale,left=x-w*(p.pivotX??.5),top=y-h*(p.pivotY??1),visible=left+w>=0&&top+h>=0&&left<=width&&top<=height;
 return {visible,x,y,scale,depth:clip.z/clip.w,distance};
}
