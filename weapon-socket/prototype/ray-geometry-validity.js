export function rayTransformUsable(matrix){
 const e=matrix.elements,a=Math.max(Math.abs(e[0]),Math.abs(e[1]),Math.abs(e[2])),b=Math.max(Math.abs(e[4]),Math.abs(e[5]),Math.abs(e[6])),c=Math.max(Math.abs(e[8]),Math.abs(e[9]),Math.abs(e[10]));
 if(!a||!b||!c)return false;
 const x=e[0]/a,y=e[1]/a,z=e[2]/a,u=e[4]/b,v=e[5]/b,w=e[6]/b,p=e[8]/c,q=e[9]/c,r=e[10]/c;
 return Math.abs(x*(v*r-w*q)-y*(u*r-w*p)+z*(u*q-v*p))>1e-12;
}
export function rayTriangleNormal(a,b,c){
 for(let i=0;i<3;i++)if(!Number.isFinite(a[i])||!Number.isFinite(b[i])||!Number.isFinite(c[i]))throw Error('GI 삼각형 좌표를 확인하세요.');
 let x=b[0]-a[0],y=b[1]-a[1],z=b[2]-a[2],u=c[0]-a[0],v=c[1]-a[1],w=c[2]-a[2];const s=Math.max(Math.abs(x),Math.abs(y),Math.abs(z)),t=Math.max(Math.abs(u),Math.abs(v),Math.abs(w));
 const fastX=y*w-z*v,fastY=z*u-x*w,fastZ=x*v-y*u,area=fastX*fastX+fastY*fastY+fastZ*fastZ;
 // Retain the previous arithmetic (including exact doubles) for ordinary faces.
 if(Number.isFinite(area)&&area>1e-16){const inverse=1/Math.sqrt(area);return [fastX*inverse,fastY*inverse,fastZ*inverse];}
 if(!s||!t)return null;x/=s;y/=s;z/=s;u/=t;v/=t;w/=t;const nx=y*w-z*v,ny=z*u-x*w,nz=x*v-y*u,length=Math.hypot(nx,ny,nz);
 return length>1e-12?[nx/length,ny/length,nz/length]:null;
}
