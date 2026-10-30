// Missing values keep the existing scene exposure/tone mapping. Pixel art and
// authored UI-like sprites can explicitly preserve their display colors.
export const spriteToneMapped=properties=>properties.toneMapping!=='display';
export function applySpriteColorPolicy(material,properties){const mapped=spriteToneMapped(properties);if(material.toneMapped!==mapped){material.toneMapped=mapped;material.needsUpdate=true;}return material;}
