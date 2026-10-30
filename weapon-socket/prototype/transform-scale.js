// Actor scales are signed and invertible. Keep editor and runtime limits identical.
export const MIN_ACTOR_SCALE=.01,MAX_ACTOR_SCALE=10000;
export const validScaleAxis=value=>Number.isFinite(value)&&Math.abs(value)>=Math.fround(MIN_ACTOR_SCALE)&&Math.abs(value)<=MAX_ACTOR_SCALE;
export const validActorScale=value=>Array.isArray(value)&&value.length===3&&value.every(validScaleAxis);
export function clampScaleAxis(value){if(!Number.isFinite(value))throw Error('크기는 유한한 숫자여야 해요.');return (value<0||Object.is(value,-0)?-1:1)*Math.max(MIN_ACTOR_SCALE,Math.min(MAX_ACTOR_SCALE,Math.abs(value)));}
