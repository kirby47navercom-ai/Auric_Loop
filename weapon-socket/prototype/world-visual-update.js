import * as THREE from 'three';
import {validWorldAsset} from './world-assets.js';
import {reflectionProbeMeshBounds} from './reflection-probe-bounds.js';

const sameVector = (a, b) => a?.length === b?.length && a.every((value, i) => value === b[i]);
const states = new WeakMap();
const matrix = new THREE.Matrix4(), rotation = new THREE.Quaternion(), euler = new THREE.Euler();
const position = new THREE.Vector3(), scale = new THREE.Vector3();
const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), edge = new THREE.Vector3();

// Keep pending writes from earlier edits until the renderer consumes them.
// A highly scattered edit trades some extra bytes for a bounded range list.
function dirty(attribute, indices) {
  if (!indices.length) return;
  const sorted = [...new Set(indices)].sort((a, b) => a - b);
  let first = sorted[0], last = first;
  for (let i = 1; i <= sorted.length; i++) {
    if (i < sorted.length && sorted[i] === last + 1) { last = sorted[i]; continue; }
    attribute.addUpdateRange(first * attribute.itemSize, (last - first + 1) * attribute.itemSize);
    if (attribute.updateRanges.length > 64) {
      const start = Math.min(...attribute.updateRanges.map(range => range.start));
      const end = Math.max(...attribute.updateRanges.map(range => range.start + range.count));
      attribute.clearUpdateRanges(); attribute.addUpdateRange(start, end - start);
    }
    first = last = sorted[i];
  }
  attribute.needsUpdate = true;
}

export function prepareEditableWorldVisual(root, kind, data) {
  states.set(root, {kind, data});
  if (kind === 'terrain') root.traverse(node => {
    if (node.isMesh) {
      node.geometry.userData.terrainGrid = {width: data.resolution[0], height: data.resolution[1], holes: data.holes};
      for (const key of ['position', 'normal', 'color']) node.geometry.attributes[key]?.setUsage(THREE.DynamicDrawUsage);
    }
  });
  if (kind === 'foliage') root.traverse(node => {
    if (node.isInstancedMesh && node.userData.foliage) node.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  });
}

function updateFoliage(root, previous, data) {
  if (previous.mesh !== data.mesh) return false;
  const meshes = root.children.filter(node => node.isInstancedMesh && node.userData.foliage);
  if (!meshes.length || meshes.some(mesh => !mesh.userData.foliageSourceMatrix)) return false;
  let matrixWrites = 0, grown = 0;
  for (let mesh of meshes) {
    let force = false;
    if (data.instances.length > mesh.instanceMatrix.count) {
      const capacity = 2 ** Math.ceil(Math.log2(Math.max(1, data.instances.length)));
      const next = new THREE.InstancedMesh(mesh.geometry, mesh.material, capacity);
      next.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      next.userData = {...mesh.userData}; next.name = mesh.name;
      next.position.copy(mesh.position); next.quaternion.copy(mesh.quaternion); next.scale.copy(mesh.scale);
      next.visible = mesh.visible; next.layers.mask = mesh.layers.mask; next.renderOrder = mesh.renderOrder;
      next.castShadow = mesh.castShadow; next.receiveShadow = mesh.receiveShadow; next.frustumCulled = mesh.frustumCulled;
      const at = root.children.indexOf(mesh);
      root.add(next); root.children.splice(root.children.indexOf(next), 1); root.children.splice(at, 0, next);
      mesh.removeFromParent(); mesh.dispose(); mesh = next; force = true; grown++;
    }
    const changed = [];
    for (let i = 0; i < data.instances.length; i++) {
      const item = data.instances[i], old = previous.instances[i];
      if (!force && old && sameVector(item.position, old.position) && sameVector(item.rotation, old.rotation) && sameVector(item.scale, old.scale)) continue;
      matrix.compose(position.fromArray(item.position), rotation.setFromEuler(euler.set(...item.rotation.map(THREE.MathUtils.degToRad))), scale.fromArray(item.scale));
      matrix.multiply(mesh.userData.foliageSourceMatrix); mesh.setMatrixAt(i, matrix); changed.push(i);
    }
    mesh.count = data.instances.length;
    mesh.userData.foliageIds = data.instances.map(item => item.id);
    dirty(mesh.instanceMatrix, changed); matrixWrites += changed.length;
    mesh.updateWorldMatrix(true, false); reflectionProbeMeshBounds(mesh);
  }
  root.userData.foliageCount = data.instances.length;
  root.userData.worldUpdate = {kind: 'foliage', matrixWrites, grown, meshes: meshes.length, instances: data.instances.length};
  return true;
}

function updateTerrain(root, previous, data) {
  if (!sameVector(previous.size, data.size) || !sameVector(previous.resolution, data.resolution)) return false;
  const [width, height] = data.resolution;
  for (let i = 0; i < (width - 1) * (height - 1); i++) if (!!previous.holes?.[i] !== !!data.holes?.[i]) return false;
  const mesh = root.children.find(node => node.isMesh), geometry = mesh?.geometry;
  if (!geometry || geometry.attributes.position.count !== data.heights.length) return false;
  const p = geometry.attributes.position, n = geometry.attributes.normal, colors = geometry.attributes.color;
  const positions = [], colorIds = [], normals = new Set();
  const layerChanged = previous.layers.length !== data.layers.length || data.layers.some((layer, i) => !sameVector(layer.color, previous.layers[i]?.color));
  let minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < data.heights.length; i++) {
    const value = Math.fround(data.heights[i]); minY = Math.min(minY, value); maxY = Math.max(maxY, value);
    if (p.getY(i) !== value) {
      p.setY(i, value); positions.push(i);
      const x = i % width, y = Math.floor(i / width);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (x + dx >= 0 && x + dx < width && y + dy >= 0 && y + dy < height) normals.add((y + dy) * width + x + dx);
      }
    }
    if (layerChanged || !sameVector(data.weights[i], previous.weights[i])) {
      let changed = false;
      for (let channel = 0; channel < 3; channel++) {
        const value = Math.fround(data.weights[i].reduce((sum, weight, k) => sum + weight * data.layers[k].color[channel], 0));
        if (colors.getComponent(i, channel) !== value) { colors.setComponent(i, channel, value); changed = true; }
      }
      if (changed) colorIds.push(i);
    }
  }
  // Rebuild each affected vertex from all adjacent faces, in index order.
  // Float32 accumulation matches BufferGeometry.computeVertexNormals().
  for (const id of normals) {
    const x = id % width, y = Math.floor(id / width); n.setXYZ(id, 0, 0, 0);
    for (let cy = Math.max(0, y - 1); cy <= Math.min(height - 2, y); cy++) for (let cx = Math.max(0, x - 1); cx <= Math.min(width - 2, x); cx++) {
      if (data.holes?.[cy * (width - 1) + cx]) continue;
      const at = cy * width + cx;
      for (const triangle of [[at, at + width, at + 1], [at + 1, at + width, at + width + 1]]) {
        if (!triangle.includes(id)) continue;
        a.fromBufferAttribute(p, triangle[0]); b.fromBufferAttribute(p, triangle[1]); c.fromBufferAttribute(p, triangle[2]);
        c.sub(b); edge.subVectors(a, b); c.cross(edge);
        n.setXYZ(id, n.getX(id) + c.x, n.getY(id) + c.y, n.getZ(id) + c.z);
      }
    }
    a.fromBufferAttribute(n, id).normalize(); n.setXYZ(id, a.x, a.y, a.z);
  }
  dirty(p, positions); dirty(n, [...normals]); dirty(colors, colorIds);
  if (positions.length) {
    geometry.boundingBox.min.set(p.getX(0), minY, p.getZ(0));
    geometry.boundingBox.max.set(p.getX(p.count - 1), maxY, p.getZ(p.count - 1));
    geometry.boundingBox.getBoundingSphere(geometry.boundingSphere); geometry.boundingSphere.radius *= 1 + 8 * Number.EPSILON;
  }
  root.userData.worldUpdate = {kind: 'terrain', positionWrites: positions.length, normalWrites: normals.size, colorWrites: colorIds.length, vertices: p.count, indexRebuilt: false};
  return true;
}

// The editor passes immutable authored snapshots. Structural/dependency changes
// fall back to its existing load/dispose path before touching any buffers.
export function updateWorldVisual(root, data) {
  const state = states.get(root);
  if (!state || !validWorldAsset(state.kind, data)) return false;
  const updated = state.kind === 'foliage' ? updateFoliage(root, state.data, data) : state.kind === 'terrain' ? updateTerrain(root, state.data, data) : false;
  if (updated) state.data = data;
  return updated;
}
