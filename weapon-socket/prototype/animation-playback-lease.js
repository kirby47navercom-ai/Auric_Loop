import {canonicalImportedTransformPath} from './sequence-indexed-transforms.js';
import * as THREE from 'three';
import {animationPlaybackToken} from './animation-playback-state.js';

// A lease owns a detached evaluator, never a second ticking evaluator. Keeping
// the original instance preserves transition, fade and finite-loop history.
export class AnimationPlaybackLease {
  constructor(object,group,{animation,mixer,graph}={}){
    Object.assign(this,{kind:animationPlaybackToken,object,group,animation,mixer,graph,phase:'pending',type:graph?'graph':mixer?'mixer':animation?.type==='sprite'?'sprite':animation?'timeline':'none'});
    this.transform=Object.fromEntries(['position','rotation','scale'].map(field=>[field,object[field]?.slice()]));this.writtenTRS=new Set();this.activeTRS=new Set();
  }
  reconcileTRS(fields){for(const field of this.activeTRS)if(!fields.has(field)&&this.transform[field])this.object[field]=this.transform[field].slice();for(const field of fields)this.writtenTRS.add(field);this.activeTRS=new Set(fields);}
  restoreTRS(){for(const field of this.writtenTRS)if(this.transform[field])this.object[field]=this.transform[field].slice();}
  matches({animation,mixer,graph}){return this.animation===animation&&this.mixer===mixer&&this.graph===graph;}
  prepare(players=[]){
    // Public PropertyBinding values are copied once. update(0) alone can skip
    // unchanged accumulator values after another mixer has changed the target.
    if(this.mixer){const actions=this.mixer.sequenceLayerActions?[...this.mixer.sequenceLayerActions.values()].map(row=>row.action):[this.mixer.action],tracks=new Map([...actions.flatMap(action=>action.getClip().tracks),...this.mixer.aliasPoseTracks||[]].map(track=>[track.name,track]));this.pose=[...tracks.values()].map(track=>{const binding=THREE.PropertyBinding.create(this.group,canonicalImportedTransformPath(track.name)),value=new Array(track.getValueSize()/(track.createInterpolant.isInterpolantFactoryMethodGLTFCubicSpline?3:1)).fill(0);binding.getValue(value,0);value.length=track.getValueSize()/(track.createInterpolant.isInterpolantFactoryMethodGLTFCubicSpline?3:1);const saved=this.readPresentation?.(binding.targetObject,binding.parsedPath);if(saved&&saved.length===value.length)for(let i=0;i<value.length;i++)value[i]=saved[i];const target=binding.targetObject,property=binding.resolvedProperty;binding.unbind();return {path:track.name,value,target,property};});}
    if(this.graph)this.presentation=this.graph.capturePresentation();
    else if(players.length)this.presentation=players.at(-1).program.capturePresentation();
  }
  suspend(montages){
    this.montages=montages;this.phase='suspended';
    if(montages?.states.length)this.type=this.graph?'graph+montage':'montage';
  }
  async present(){
    if(this.graph)await this.graph.restorePresentation(this.presentation);
    else if(this.montages?.states.length)await this.montages.states.at(-1).player.program.restorePresentation(this.presentation);
    if(this.mixer)for(const {path,value,target,property}of this.pose){const binding=THREE.PropertyBinding.create(this.group,canonicalImportedTransformPath(path));binding.bind();let valid=binding.targetObject===target&&binding.resolvedProperty===property;if(target?.isBone){let root=target;while(root&&root!==this.group&&(!root.userData?.objectId||root.userData.objectId===this.group.userData.objectId))root=root.parent;valid&&=root===this.group;}if(valid)binding.setValue(value,0);binding.unbind();}
  }
  release(){
    if(this.phase==='suspended'){
      this.graph?.dispose();
      for(const state of this.montages?.states||[]){state.notifyTrack?.dispose();state.player.dispose();}
      // Dropping an unregistered mixer needs no uncacheRoot: that operation
      // writes its old bind pose and would corrupt a newer owner's final pose.
    }
    this.readPresentation=null;this.phase='released';this.animation=this.mixer=this.graph=this.montages=this.presentation=this.pose=this.object=this.group=this.transform=this.writtenTRS=this.activeTRS=null;
  }
}
