import {sampleSectionWeightCurve} from './sequence-weight-curve.js';
import {sequenceKeyLimits} from './sequence-key-storage.js';
export function recordTakeAudioGain(voice,time,value=1){
 if(!Number.isFinite(time)||!Number.isFinite(value)||value<0||value>1)throw Error('녹화 오디오 시각·음량은 유한한 값이고 음량은0~1이어야 해요.');const keys=voice.gainKeys??=([]),local=Math.max(0,time-voice.start),last=keys.at(-1);if(last?.time===local){if(last.value!==value&&voice.gainUndo){keys.splice(keys.length-1,0,voice.gainUndo);voice.gainUndo=null;}last.value=value;return;}const row={time:local,value};voice.gainUndo=null;if(keys.length>=2){const a=keys.at(-2),b=last,t=(b.time-a.time)/(local-a.time),expected=a.value+(value-a.value)*t;if(Math.abs(expected-b.value)<=1e-6)voice.gainUndo=keys.pop();}keys.push(row);if(keys.length>sequenceKeyLimits.perTrack)throw Error('오디오 음량 녹화 키 예산을 넘었어요.');
}
export function takeAudioGainSlice(keys,start,duration){
 if(!keys?.length||keys.every(k=>k.value===1))return {};if(keys.every(k=>k.value===keys[0].value))return {volume:keys[0].value};
 const section={start:0,weightCurve:keys},end=start+duration,volumeCurve=[{time:0,value:sampleSectionWeightCurve(section,start)}];for(const key of keys)if(key.time>start&&key.time<end)volumeCurve.push({time:key.time-start,value:key.value});volumeCurve.push({time:duration,value:sampleSectionWeightCurve(section,end)});return {volumeCurve};
}
