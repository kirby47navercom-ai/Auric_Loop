export const lightBlendModes=['multiply','additive','subtractive'];
export const lightMaskChannels=['none','r','g','b','a','oneMinusR','oneMinusG','oneMinusB','oneMinusA'];
export const defaultLightBlendStyles=[
  {name:'기본',mode:'multiply',mask:'none'},
  {name:'가산',mode:'additive',mask:'none'},
  {name:'감산',mode:'subtractive',mask:'none'},
  {name:'보조',mode:'multiply',mask:'none'}
];
export const lightBlendStyles=p=>defaultLightBlendStyles.map((s,i)=>({name:p?.['style'+i+'Name']??s.name,mode:p?.['style'+i+'Mode']??s.mode,mask:p?.['style'+i+'Mask']??s.mask}));
export function renderer2DProperties(objects){
  let selected,priority=-Infinity;
  for(const o of objects){let shown=true;const seen=new Set();for(let parent=o;parent;parent=parent.parent?objects.find(v=>v.id===parent.parent):null){if(parent.visible===false||parent.poolActive===false||seen.has(parent)){shown=false;break;}seen.add(parent);}if(!shown)continue;const c=o.components?.find(c=>c.type==='Renderer2D'&&c.properties?.enabled!==false),p=c?.properties||{};if(c&&(p.priority??0)>priority){selected=p;priority=p.priority??0;}}
  return selected;
}
export const lightBlendChoices=objects=>lightBlendStyles(renderer2DProperties(objects)).map((s,i)=>[i,i+' · '+(s.name||'스타일 '+i)]);
