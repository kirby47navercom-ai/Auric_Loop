export const effectCurvePath=value=>typeof value==='string'&&value.length<=1000&&/^Assets\/(?:[^/\\:\x00-\x1f]+\/)*[^/\\:\x00-\x1f]+\.hbcurve\.json$/.test(value)&&!value.split('/').some(part=>part==='.'||part==='..');
export const validEffectScaling=value=>value===undefined||!!(value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).every(key=>['curve','track'].includes(key))&&effectCurvePath(value.curve)&&typeof value.track==='string'&&value.track.length>0&&value.track.length<=80);
export const validEffectLevel=value=>Number.isFinite(value)&&value>=0&&value<=1e9;
