import * as T from 'three/tsl';

// The committed stack determines its own IOR ratio and transmission/TIR branch.
export function previousBranchGPU(medium,ray,state,id,view,normal,physical,front,reflection){
 const result=T.vec4(0).toVar(),oldFront=ray.geometric(id).dot(view).greaterThan(0),valid=state.count.greaterThanEqual(0).and(oldFront.equal(front)).and(physical.z.greaterThan(.5)).toVar();
 T.If(valid,()=>{
  const volume=medium.id(id).toVar(),incoming=T.float(1).toVar(),outgoing=oldFront.select(physical.w,1).toVar();T.If(state.count.greaterThan(0),()=>{incoming.assign(state.media.element(state.count.sub(1).clamp(0,15)).w);});
  T.If(volume.greaterThan(0).and(oldFront.not()),()=>{const found=T.int(-1).toVar();T.Loop({start:0,end:state.count,type:'int',name:'oldExit'},({oldExit:j})=>{T.If(state.ids.element(j).equal(volume),()=>{found.assign(j);});});T.If(found.lessThan(0),()=>{valid.assign(false);}).ElseIf(found.notEqual(state.count.sub(1)),()=>{outgoing.assign(incoming);}).ElseIf(state.count.greaterThan(1),()=>{outgoing.assign(state.media.element(state.count.sub(2).clamp(0,15)).w);});});
  T.If(volume.lessThan(.5),()=>{incoming.assign(oldFront.select(1,physical.w));outgoing.assign(oldFront.select(physical.w,1));});
  T.If(valid,()=>{const eta=incoming.div(outgoing.max(.000001)).toVar(),facing=oldFront.select(normal,normal.negate()),next=view.negate().refract(facing,eta).toVar(),oldReflection=next.dot(next).lessThan(.000001);T.If(oldReflection.equal(reflection),()=>{T.If(oldReflection,()=>{next.assign(view.negate().reflect(facing));}).Else(()=>{next.assign(next.normalize());T.If(volume.greaterThan(0),()=>{medium.change(state,volume,T.vec4(0,0,0,physical.w),oldFront);});});T.If(state.count.greaterThanEqual(0),()=>{result.assign(T.vec4(next.normalize(),eta));});});});
 });return result;
}
