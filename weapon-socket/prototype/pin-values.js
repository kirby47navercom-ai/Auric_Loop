export function defaultsFor(type){ return {bool:false,int:0,float:0,string:'',vec2:[0,0],vec3:[0,0,0],color:[1,1,1,1],transform:{position:[0,0,0],rotation:[0,0,0],scale:[1,1,1]},object:null,hit:{hit:false,position:[0,0,0],normal:[0,1,0],actor:null},record:{}}[type]; }
function recordData(value,budget={left:2000000},depth=0){
 if(--budget.left<0||depth>16)return false;
 if(value===null||typeof value==='boolean')return true;
 if(typeof value==='number')return Number.isFinite(value);
 if(typeof value==='string')return value.length<=4096;
 if(Array.isArray(value)){if(value.length>100000)return false;for(let index=0;index<value.length;index++)if(!Object.hasOwn(value,index)||!recordData(value[index],budget,depth+1))return false;return true;}
 return !!value&&typeof value==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(value))&&Object.keys(value).length<=128&&Object.entries(value).every(([key,item])=>key.length<=80&&recordData(item,budget,depth+1));
}
// C++ JSON object keys are ordered by name, whereas editor values preserve
// declaration order. Value equality must not depend on that representation.
export function equalValues(a,b,budget={left:2000000},depth=0){
 if(--budget.left<0||depth>32)throw Error('값 비교 범위를 확인하세요.');
 if(a===b)return true;if(!a||!b||typeof a!=='object'||typeof b!=='object')return false;
 if(Array.isArray(a)||Array.isArray(b)){if(!Array.isArray(a)||!Array.isArray(b)||a.length!==b.length)return false;for(let index=0;index<a.length;index++)if(!Object.hasOwn(a,index)||!Object.hasOwn(b,index)||!equalValues(a[index],b[index],budget,depth+1))return false;return true;}
 if(![Object.prototype,null].includes(Object.getPrototypeOf(a))||![Object.prototype,null].includes(Object.getPrototypeOf(b)))return false;
 const keys=Object.keys(a);return keys.length===Object.keys(b).length&&keys.every(key=>Object.hasOwn(b,key)&&equalValues(a[key],b[key],budget,depth+1));
}
export function validValue(type,value){
  const vector=(size)=>{if(!Array.isArray(value)||value.length!==size)return false;for(let index=0;index<size;index++)if(!Number.isFinite(value[index]))return false;return true;};
  if(type==='bool')return typeof value==='boolean';if(type==='int')return Number.isInteger(value)&&value>=-2147483648&&value<=2147483647;if(type==='float')return Number.isFinite(value);if(type==='string')return typeof value==='string'&&value.length<=4096;
  if(type==='vec2')return vector(2);if(type==='vec3')return vector(3);if(type==='color')return vector(4)&&value.every(v=>v>=0&&v<=1);if(type==='object')return value===null||(typeof value==='string'&&value.length<=200);
  if(type==='record')return !!value&&typeof value==='object'&&!Array.isArray(value)&&recordData(value);
  if(type==='transform')return value&&['position','rotation','scale'].every(k=>validValue('vec3',value[k]));if(type==='hit')return value&&validValue('bool',value.hit)&&validValue('vec3',value.position)&&validValue('vec3',value.normal)&&validValue('object',value.actor);return false;
}
