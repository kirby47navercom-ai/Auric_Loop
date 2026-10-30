export const defaultVoiceBudget={real:32,tracked:1024};
export function validVoiceBudget(real,tracked){return Number.isInteger(real)&&real>=0&&real<=4096&&Number.isInteger(tracked)&&tracked>=Math.max(1,real)&&tracked<=65536;}
export function selectRealVoices(voices,budget,listener=[0,0,0]){
  const candidates=[];for(const [player,v] of voices){if(player.disposed||player.paused)continue;let volume=Math.max(0,v.gain.gain.value)*Math.max(0,player.output?.gain?.value??1);if(v.settings.spatial&&v.position){const d=Math.hypot(...v.position.map((p,i)=>p-listener[i])),ref=v.settings.refDistance||1,max=v.settings.maxDistance||100,roll=v.settings.rolloff??1;volume*=ref/(ref+roll*(Math.min(max,Math.max(ref,d))-ref));}if(volume>1e-5)candidates.push({player,protected:!player.setVirtual||v.settings.virtualize===false,priority:v.priority??128,volume,serial:v.serial,real:v.real});}
  candidates.sort((a,b)=>Number(b.protected)-Number(a.protected)||a.priority-b.priority||b.volume-a.volume||Number(b.real)-Number(a.real)||a.serial-b.serial);return new Set(candidates.slice(0,budget).map(v=>v.player));
}
