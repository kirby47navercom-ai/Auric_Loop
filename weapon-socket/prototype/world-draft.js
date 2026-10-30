// Only synchronous editor transactions own their deep-cloned draft. Public
// operations remain immutable before and after this scope; JSON cannot grant
// ownership or bypass validation.
const drafts=new WeakSet();
export function isWorldDraft(value){return drafts.has(value);}
export function withWorldDraft(source,edit){
 const draft=structuredClone(source);drafts.add(draft);
 try{return{draft,result:edit(draft)};}finally{drafts.delete(draft);}
}
export function copyWorldDraft(source){return drafts.has(source)?source:structuredClone(source);}
