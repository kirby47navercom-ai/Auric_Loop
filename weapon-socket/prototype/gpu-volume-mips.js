const installed=new WeakSet(),pipelines=new WeakMap(),states=new WeakMap();
export const gpuVolumeMipState=renderer=>Object.freeze({...states.get(renderer?.backend)||{uploads:0,dispatches:0,temporaryCreated:0,temporaryDestroyed:0}});
function pipelineFor(device,format){let cache=pipelines.get(device);if(!cache){cache=new Map();pipelines.set(device,cache);}if(cache.has(format))return cache.get(format);const srgb=format==='rgba8unorm-srgb';if(format!=='rgba8unorm'&&!srgb)throw Error('볼륨 밉의 RGBA8 형식을 확인하세요.');
 const code=`@group(0) @binding(0) var source:texture_3d<f32>;
@group(0) @binding(1) var destination:texture_storage_3d<rgba8unorm,write>;
@compute @workgroup_size(4,4,4) fn main(@builtin(global_invocation_id) id:vec3<u32>){
 let size=textureDimensions(destination);if(any(id>=size)){return;}let inputSize=textureDimensions(source);let low=vec3<f32>(id)*vec3<f32>(inputSize)/vec3<f32>(size);let high=vec3<f32>(id+vec3<u32>(1))*vec3<f32>(inputSize)/vec3<f32>(size);let first=vec3<i32>(floor(low));let last=vec3<i32>(ceil(high));let area=(high.x-low.x)*(high.y-low.y)*(high.z-low.z);var value=vec4<f32>(0);
 for(var z=first.z;z<last.z;z++){for(var y=first.y;y<last.y;y++){for(var x=first.x;x<last.x;x++){let at=vec3<i32>(x,y,z);let overlap=max(vec3<f32>(0),min(vec3<f32>(at+vec3<i32>(1)),high)-max(vec3<f32>(at),low));value+=textureLoad(source,at,0)*(overlap.x*overlap.y*overlap.z/area);}}}
 ${srgb?'value=vec4<f32>(select(value.rgb*12.92,1.055*pow(max(value.rgb,vec3<f32>(0)),vec3<f32>(1.0/2.4))-.055,value.rgb>vec3<f32>(.0031308)),value.a);':''}
 textureStore(destination,vec3<i32>(id),value);
}`;
 const result=device.createComputePipeline({label:'HB volume mip area filter',layout:'auto',compute:{module:device.createShaderModule({code}),entryPoint:'main'}});cache.set(format,result);return result;
}
function generate(backend,texture){
 const {texture:source,textureDescriptorGPU:d}=backend.get(texture),levels=d.mipLevelCount;if(levels<2)return;const state=states.get(backend);state.uploads++;const device=backend.device,pipeline=pipelineFor(device,d.format),base=d.size,temp=device.createTexture({label:'HB temporary volume mips',size:{width:Math.max(1,Math.floor(base.width/2)),height:Math.max(1,Math.floor(base.height/2)),depthOrArrayLayers:Math.max(1,Math.floor(base.depthOrArrayLayers/2))},mipLevelCount:levels-1,dimension:'3d',format:'rgba8unorm',usage:GPUTextureUsage.STORAGE_BINDING|GPUTextureUsage.COPY_SRC});state.temporaryCreated++;
 try{const encoder=device.createCommandEncoder({label:'HB volume mip generation'});for(let level=1;level<levels;level++){
  const width=Math.max(1,base.width>>level),height=Math.max(1,base.height>>level),depth=Math.max(1,base.depthOrArrayLayers>>level),group=device.createBindGroup({layout:pipeline.getBindGroupLayout(0),entries:[{binding:0,resource:source.createView({dimension:'3d',baseMipLevel:level-1,mipLevelCount:1})},{binding:1,resource:temp.createView({dimension:'3d',baseMipLevel:level-1,mipLevelCount:1})}]}),pass=encoder.beginComputePass();pass.setPipeline(pipeline);pass.setBindGroup(0,group);pass.dispatchWorkgroups(Math.ceil(width/4),Math.ceil(height/4),Math.ceil(depth/4));pass.end();encoder.copyTextureToTexture({texture:temp,mipLevel:level-1},{texture:source,mipLevel:level},{width,height,depthOrArrayLayers:depth});
 state.dispatches++;}device.queue.submit([encoder.finish()]);}finally{temp.destroy();state.temporaryDestroyed++;}
}
export function prepareGPUVolumeMips(renderer,texture){
 const backend=renderer?.backend;if(!backend?.isWebGPUBackend||!texture.isData3DTexture||!texture.generateMipmaps)return texture;texture.userData.hbGPUVolumeMips=true;
 if(!installed.has(backend)){installed.add(backend);states.set(backend,{uploads:0,dispatches:0,temporaryCreated:0,temporaryDestroyed:0});const create=backend.createTexture,generateMips=backend.generateMipmaps;
  backend.createTexture=function(map,options){if(map.isData3DTexture&&map.userData.hbGPUVolumeMips){const image=map.image,levels=1+Math.floor(Math.log2(Math.max(image.width,image.height,image.depth)));return create.call(this,map,{...options,levels});}return create.call(this,map,options);};
  backend.generateMipmaps=function(map){if(map.isData3DTexture&&map.userData.hbGPUVolumeMips)return generate(this,map);return generateMips.call(this,map);};
 }return texture;
}
