import {BufferAttribute} from 'three';
// Normal/color-only targets need an identity position channel in the browser renderers.
export function prepareModelMorphs(root){
 const pending=new Map();root.traverse(object=>{const g=object.geometry,p=g?.attributes.position;if(!g||g.morphAttributes.position?.length)return;const source=g.morphAttributes.normal?.length?g.morphAttributes.normal:g.morphAttributes.color;if(!source?.length||pending.has(g))return;if(!p||p.itemSize!==3||Object.values(g.morphAttributes).filter(list=>list.length).some(list=>list.length!==source.length||list.some(a=>a.count!==p.count)))throw Error('모프 정점 개수를 확인하세요.');pending.set(g,{p,source});});
 for(const[g,{p,source}]of pending){const values=new Float32Array(p.count*3);if(!g.morphTargetsRelative)for(let i=0;i<p.count;i++)values.set([p.getX(i),p.getY(i),p.getZ(i)],i*3);g.morphAttributes.position=source.map(a=>{const attr=new BufferAttribute(values,3);attr.name=a.name;return attr;});}
 return pending.size;
}
