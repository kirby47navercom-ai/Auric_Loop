export const cameraViewContract=Object.freeze({version:1,
 perspective:'normalized surface-to-camera position',orthographic:'constant camera-back direction, including rotated cameras and off-axis pixels',
 gpu:'projection uniform selects a fragment-local view variable before physical material variants and lighting; shared by BRDF, environment, coating, anisotropy and engine refraction',
 capture:'perspective cube cameras use the original varying direction; switching cameras needs no material edit',
 ownership:'renderer-owned material conversion plus idempotent node-material decoration; no dependency/global node mutation',
 resources:'no engine-owned GPU buffers/textures/targets or additional pixel readback calls; existing projection/view uniforms are read, with backend-dependent stage packing; no per-frame material traversal',
 fallbackReadback:'explicit 2D/cube color readback restores read/pack state before waiting and frees temporary PBO/FBO objects, including rejection',
 diagnostics:'renderer.cameraView',limits:'raster physical material path; independent path-tracing/history projection policies remain separate'
});
