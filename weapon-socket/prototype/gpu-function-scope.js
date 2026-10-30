import {Node} from 'three/webgpu';
import * as T from 'three/tsl';

class ScopedCall extends Node {
 constructor(cache,body,layout,args){super(layout.type);this.functionCache=cache;this.body=body;this.layout=layout;this.args=args;}
 setup(builder){let fn=this.functionCache.get(builder);if(!fn){fn=T.Fn(this.body).setLayout(this.layout);this.functionCache.set(builder,fn);}return fn(...this.args);}
}

// Three r180 caches explicit-layout function code by ShaderNode + builder class.
// Uniform names belong to one concrete builder, so recreate functions on rebuild.
export function gpuFn(body){const ordinary=T.Fn(body),cache=new WeakMap();let layout=null;const fn=(...args)=>layout?T.nodeObject(new ScopedCall(cache,body,layout,args.map(arg=>T.nodeObject(arg)))):ordinary(...args);fn.setLayout=value=>{layout=value;return fn;};return fn;}
