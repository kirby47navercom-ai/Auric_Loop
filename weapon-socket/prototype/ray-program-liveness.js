// Resolve physical register versions before slicing. A later overwrite must
// never replace the producer that an earlier output actually consumed.
export function rayOutputInstructions(instructions,channels=[3]){
  const definitions=new Map(),parents=[],roots=new Map();
  for(let n=0;n<instructions.length;n++){const i=instructions[n];parents.push(i.slice(4,8).filter(r=>r>=0).map(r=>definitions.get(r)).filter(n=>n!==undefined));if(i[0]===8){for(const c of channels)if(c>=i[8]&&c<i[8]+i[9])roots.set(c,n);}else definitions.set(i[1],n);}
  const live=new Set(),pending=[...roots.values()];while(pending.length){const n=pending.pop();if(live.has(n))continue;live.add(n);pending.push(...parents[n]);}return live;
}
