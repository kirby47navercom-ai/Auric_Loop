// Pure worker-safe ownership of the renderer's existing solid-angle resampler.
export function resampleSphericalEnvironment(data,width,height,w,h){
 const next=new Float32Array(w*h*4);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const x0=x*width/w,x1=(x+1)*width/w,y0=y*height/h,y1=(y+1)*height/h,weight=(x1-x0)*(Math.cos(Math.PI*y0/height)-Math.cos(Math.PI*y1/height)),rgb=[0,0,0];for(let sy=Math.floor(y0);sy<Math.ceil(y1);sy++){const vertical=Math.cos(Math.PI*Math.max(y0,sy)/height)-Math.cos(Math.PI*Math.min(y1,sy+1)/height);for(let sx=Math.floor(x0);sx<Math.ceil(x1);sx++){const a=vertical*(Math.min(x1,sx+1)-Math.max(x0,sx));for(let c=0;c<3;c++)rgb[c]+=data[(sy*width+sx)*4+c]*a;}}for(let c=0;c<3;c++)next[(y*w+x)*4+c]=rgb[c]/weight;}
 return next;
}
export function sphericalEnvironmentMips(data,width,height){
 const levels=[{data,width,height}];while(width>1||height>1){const w=Math.max(1,Math.floor(width/2)),h=Math.max(1,Math.floor(height/2)),next=resampleSphericalEnvironment(data,width,height,w,h);data=next;width=w;height=h;levels.push({data,width,height});}return levels;
}
