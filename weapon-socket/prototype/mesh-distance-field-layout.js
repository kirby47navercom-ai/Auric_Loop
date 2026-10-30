// Budget fitting changes only voxel resolution. Distances and their conservative
// interpolation bound still come from the original triangle field and grid.
export function planMeshDistanceFieldLayout(mesh,{resolution=24,padding,byteBudget=16*1024*1024,minimumResolution}={}){
 const minimum=minimumResolution??resolution;
 if(!Number.isSafeInteger(resolution)||resolution<5||!Number.isSafeInteger(minimum)||minimum<5||minimum>resolution||!Number.isSafeInteger(byteBudget)||byteBudget<4||padding!==undefined&&(!Number.isFinite(padding)||padding<=0))throw Error('거리장 해상도와 페이로드 예산을 확인하세요.');
 const size=Math.max(...mesh.extent);
 const at=r=>{
  const pad=padding??Math.max(1e-5,size/(r-1)*2);if(!Number.isFinite(pad)||pad<=0)throw Error('거리장 여백을 확인하세요.');const min=mesh.min.map(v=>v-pad),max=mesh.max.map(v=>v+pad),span=min.map((v,i)=>max[i]-v),largest=Math.max(...span),dimensions=span.map(v=>Math.max(5,Math.round((r-1)*v/largest)+1)),cells=dimensions.reduce((a,b)=>a*b,1),bytes=cells*4;
  return {requestedResolution:resolution,resolution:r,min,max,dimensions,cells,bytes,span};
 };
 const fits=p=>Number.isSafeInteger(p.bytes)&&p.bytes<=byteBudget&&p.cells<=2**26;
 const requested=at(resolution);let chosen=requested;
 if(!fits(requested)){
  const least=at(minimum);
  if(!fits(least))throw Object.assign(Error('거리장 페이로드가 예산이나 atlas 주소 범위를 넘었어요.'),{code:'HB_DISTANCE_FIELD_BUDGET',requiredBytes:Number.isSafeInteger(requested.bytes)?requested.bytes:null,minimumBytes:Number.isSafeInteger(least.bytes)?least.bytes:null,byteBudget});
  let lower=minimum,upper=resolution;
  while(lower<upper){const middle=lower+Math.ceil((upper-lower)/2);if(fits(at(middle)))lower=middle;else upper=middle-1;}
  chosen=at(lower);
 }
 const step=chosen.span.map((v,i)=>v/(chosen.dimensions[i]-1)),voxelDiagonal=Math.hypot(...step);delete chosen.span;
 return {...chosen,step,voxelDiagonal};
}
