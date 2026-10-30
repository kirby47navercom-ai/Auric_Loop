// Compile-time SSA sharing only. Stores stay ordered and programs keep their
// existing 64-register / 4096-instruction execution budgets on every backend.
const store=8,registerLimit=Symbol('ray-register-limit');
function shareOperations(ops){
 const shared=[],ids=[],expressions=new Map();
 for(const op of ops){
  const args=op.args.map(id=>ids[id]);
  // JSON numbers erase -0. Keep it distinct: division and signed normals may
  // observe the sign even when two authored constants otherwise compare equal.
  const key=op.operation===store?null:JSON.stringify([op.operation,op.size,op.inputSize,args,op.value.map(v=>Object.is(v,-0)?'-0':v)]);
  let id=key===null?undefined:expressions.get(key);
  if(id===undefined){id=shared.length;shared.push({...op,args});if(key!==null)expressions.set(key,id);}
  ids.push(id);
 }
 return shared;
}
function allocate(ops){
 const uses=Array(ops.length).fill(0);for(const op of ops)for(const id of op.args)uses[id]++;
 const registers=new Map(),free=Array.from({length:64},(_,i)=>63-i),instructions=[];
 for(let id=0;id<ops.length;id++){
  const op=ops[id],refs=op.args.map(id=>registers.get(id));
  for(const ref of op.args)if(--uses[ref]===0){free.push(registers.get(ref));registers.delete(ref);}
  const dest=op.operation===store?-1:free.pop();if(dest===undefined)throw registerLimit;
  if(dest>=0)registers.set(id,dest);
  instructions.push([op.operation,dest,op.size,op.inputSize,...Array.from({length:4},(_,i)=>refs[i]??-1),...op.value]);
  if(dest>=0&&!uses[id]){free.push(dest);registers.delete(id);}
 }
 if(instructions.length>4096)throw Error('광선 머테리얼 실행 명령이 GPU 순회 예산을 넘었어요.');
 return instructions;
}
export function compileRayProgram(ops){
 try{
  const shared=shareOperations(ops);
  try{return allocate(shared);}catch(error){
   // Sharing can lengthen a value's lifetime. Recompute as before when that
   // would reject a graph which fits the original register budget.
   if(error!==registerLimit||shared.length===ops.length)throw error;
   return allocate(ops);
  }
 }catch(error){
  if(error===registerLimit)throw Error('광선 머테리얼의 동시에 살아 있는 값이 GPU 레지스터 예산을 넘었어요.');
  throw error;
 }
}
