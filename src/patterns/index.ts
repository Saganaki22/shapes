import { geometryPatterns } from './geometry';
import { meshPatterns } from './meshes';
import { fieldPatterns } from './fields';

const firstRelease = [
  'radial-burst', 'arc-tiles', 'pixel-field', 'woven-lines', 'halftone-field', 'sliced-typography',
  'sliding-tiles', 'receding-bands', 'flow-lines', 'spiral-bloom', 'nested-polygons', 'isometric-blocks',
];

const catalog = [...geometryPatterns, ...meshPatterns, ...fieldPatterns];
const byId = new Map(catalog.map((pattern) => [pattern.id, pattern]));

export const patterns = [
  ...firstRelease.flatMap((id) => {
    const pattern = byId.get(id);
    return pattern ? [pattern] : [];
  }),
  ...catalog.filter((pattern) => !firstRelease.includes(pattern.id)),
];
