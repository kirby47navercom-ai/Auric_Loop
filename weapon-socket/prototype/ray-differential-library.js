// This reads our own shared helper library, not authored shader source.
// Keep its call dependencies in one place rather than copying per-backend lists.
export function guardRayDifferentialLibrary(source,expressions,operations){
 if(!Array.isArray(operations)||operations.some(k=>typeof k!=='string'||!k)||new Set(operations).size!==operations.length)throw Error('Invalid ray operation list');
 const clean=source.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g,s=>s.replace(/[^\n]/g,' ')),functions=[],byName=new Map(),calls=s=>[...s.matchAll(/\b(hbRayDelta\w+)\s*\(/g)].map(m=>m[1]);
 const pattern=/\b(?:float|vec[234]|void)\s+(hbRayDelta\w+)\s*\([^{};]*\)\s*\{/g;
 let match;while((match=pattern.exec(clean))){const start=match.index,open=pattern.lastIndex-1;let depth=1,end=open+1;for(;end<clean.length&&depth;end++){if(clean[end]==='{')depth++;else if(clean[end]==='}')depth--;}if(depth||byName.has(match[1]))throw Error('Invalid differential helper '+match[1]);const fn={name:match[1],source:source.slice(start,end),calls:calls(clean.slice(open+1,end-1)),operations:new Set()};functions.push(fn);byName.set(fn.name,fn);pattern.lastIndex=end;}
 if(!functions.length)throw Error('Missing differential helper library');
 for(const m of clean.matchAll(/\b(?:float|vec[234]|void)\s+(\w+)\s*\([^{};]*\)\s*\{/g))if(!byName.has(m[1]))throw Error('Unrecognized differential helper '+m[1]);
 const checked=new Set(),visiting=new Set(),check=name=>{if(checked.has(name))return;if(visiting.has(name))throw Error('Cyclic differential dependency '+name);const fn=byName.get(name);if(!fn)throw Error('Missing differential dependency '+name);visiting.add(name);for(const next of fn.calls)check(next);visiting.delete(name);checked.add(name);};for(const name of calls(clean))check(name);
 for(let op=0;op<operations.length;op++){const pending=calls(expressions[operations[op]]||''),seen=new Set();while(pending.length){const name=pending.pop();if(seen.has(name))continue;seen.add(name);const fn=byName.get(name);if(!fn)throw Error('Missing differential dependency '+name);fn.operations.add(op);pending.push(...fn.calls);}}
 return functions.map(fn=>'#if '+['defined(HB_RAY_DERIVATIVES_ALL)',...[...fn.operations].sort((a,b)=>a-b).map(op=>'(defined(HB_RAY_DIFF_OP_'+op+') || (!defined(HB_RAY_DIFF_MASK) && defined(HB_RAY_OP_'+op+')))' )].join(' || ')+'\n'+fn.source+'\n#endif').join('\n')+'\n';
}
