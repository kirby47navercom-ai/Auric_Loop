import {REVISION} from 'three/webgpu';

// r180 compares Vector4.w with offset+4; zero resets can leave stale GPU data.
export function updateGPUVector4(uniform){
 const values=this.values,value=uniform.getValue(),offset=uniform.offset;
 if(values[offset]===value.x&&values[offset+1]===value.y&&values[offset+2]===value.z&&values[offset+3]===value.w)return false;
 const buffer=this._getBufferForType(uniform.getType());
 buffer[offset]=values[offset]=value.x;buffer[offset+1]=values[offset+1]=value.y;buffer[offset+2]=values[offset+2]=value.z;buffer[offset+3]=values[offset+3]=value.w;
 return true;
}
export function installGPUUniformCompatibility(renderer){
 if(REVISION!=='180')return;
 const bindings=renderer._bindings,update=bindings._update,checked=new WeakSet();
 bindings._update=function(group,...args){
  for(const binding of group.bindings)if(binding.isNodeUniformsGroup&&!checked.has(binding)){binding.updateVector4=updateGPUVector4;checked.add(binding);}
  return update.call(this,group,...args);
 };
}
