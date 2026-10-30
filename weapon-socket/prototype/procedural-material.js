// Reduce each cell before adding: a large x must not erase an odd y cell.
export function checkerValue(uv,scale){const mod=x=>((x%2)+2)%2;return mod(mod(Math.floor(uv[0]*scale[0]))+mod(Math.floor(uv[1]*scale[1])));}
export function checkerValueNode(T,uv,scale){const cells=uv.mul(scale).floor().mod(2).toVar();return cells.x.add(cells.y).mod(2);}
export function checkerGLSL(uv,scale,mod='mod'){const p='('+uv+'*'+scale+')';return `${mod}(${mod}(floor(${p}.x),2.0)+${mod}(floor(${p}.y),2.0),2.0)`;}
