import { clamp, f, noise, range, select, text } from './model';
import type { PatternDefinition, RenderContext } from './model';
import { letterBoxes } from './lettering';

type Point = [number, number];
const TAU = Math.PI * 2;
const sizeOf = ({ width, height }: RenderContext) => Math.min(width, height);
const centerOf = ({ width, height }: RenderContext): Point => [width / 2, height / 2];
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const count = (ctx: RenderContext, id: string) => Math.max(1, Math.round(ctx.n(id)));
const angle = (degrees: number) => degrees * Math.PI / 180;
const samples = <T>(length: number, callback: (index: number) => T): T[] => Array.from({ length }, (_, index) => callback(index));
const spacing = (index: number, total: number) => index / Math.max(1, total - 1);

function polar([cx, cy]: Point, radius: number, radians: number): Point {
  return [cx + radius * Math.cos(radians), cy + radius * Math.sin(radians)];
}

function path(points: Point[], closed = false): string {
  return points.map(([x, y], index) => `${index === 0 ? 'M' : 'L'}${f(x)} ${f(y)}`).join('') + (closed ? 'Z' : '');
}

function stroke(d: string, color: string, weight: number, extra = ''): string {
  return `<path d="${d}" fill="none" stroke="${color}" stroke-width="${f(weight)}" stroke-linecap="round" stroke-linejoin="round" ${extra}/>`;
}

function fill(d: string, color: string): string {
  return `<path d="${d}" fill="${color}"/>`;
}

function dot([x, y]: Point, radius: number, color: string): string {
  return radius > 0 ? `<circle cx="${f(x)}" cy="${f(y)}" r="${f(radius)}" fill="${color}"/>` : '';
}

function box(x: number, y: number, width: number, height: number, color: string): string {
  return `<rect x="${f(x)}" y="${f(y)}" width="${f(width)}" height="${f(height)}" fill="${color}"/>`;
}

function rotate([x, y]: Point, [cx, cy]: Point, radians: number): Point {
  const dx = x - cx;
  const dy = y - cy;
  return [cx + dx * Math.cos(radians) - dy * Math.sin(radians), cy + dx * Math.sin(radians) + dy * Math.cos(radians)];
}

function dashAt(point: Point, radius: number, radians: number): string {
  return path([polar(point, -radius, radians), polar(point, radius, radians)]);
}

function isoBlock([x, y]: Point, unit: number, height: number, ctx: RenderContext, turn = 0, emphasis = false): string {
  const ridge: Point = [x, y - height];
  const west: Point = [x - unit, y - height - unit * 0.5];
  const east: Point = [x + unit, y - height - unit * 0.5];
  const north: Point = [x, y - height - unit];
  const side = (point: Point): Point => [point[0], point[1] + height];
  const face = (points: Point[], color: string, opacity = 1) =>
    `<path d="${path(turn === 0 ? points : points.map((point) => rotate(point, [x, y], turn)), true)}" fill="${color}" opacity="${opacity}"/>`;
  return face([west, ridge, side(ridge), side(west)], ctx.ink, 0.7) +
    face([ridge, east, side(east), side(ridge)], ctx.ink) +
    face([north, east, ridge, west], emphasis ? ctx.ink : ctx.accent, emphasis ? 0.9 : 1);
}

function isoGrid(ctx: RenderContext, rows: number, columns: number, visitor: (column: number, row: number, point: Point, unit: number) => string): string {
  const unit = Math.min(ctx.width * 0.84 / (rows + columns), ctx.height * 1.35 / (rows + columns));
  const origin: Point = [ctx.width / 2 - (columns - rows) * unit / 2, ctx.height * 0.61 - (rows + columns - 2) * unit / 4];
  let result = '';
  for (let depth = 0; depth < rows + columns - 1; depth++) {
    for (let row = Math.max(0, depth - columns + 1); row < Math.min(rows, depth + 1); row++) {
      const column = depth - row;
      result += visitor(column, row, [origin[0] + (column - row) * unit, origin[1] + depth * unit / 2], unit);
    }
  }
  return result;
}

const halftone: PatternDefinition = {
  id: 'halftone-field', name: 'Halftone Field', category: 'Radial',
  description: 'A dotted screen forms a softly lit disc. Smaller marks dissolve into its edges.',
  controls: [
    range('grid', 'Grid Size', 5, 52, 1, 29, 'Sets the number of dots along each side.'),
    range('spacing', 'Spacing', 25, 115, 1, 83, 'Moves dot centers closer or farther apart.'),
    range('falloff', 'Falloff Radius', 10, 80, 1, 43, 'Extends the part of the field where dots remain visible.'),
    range('weight', 'Dot Weight', 10, 100, 1, 91, 'Sets the maximum thickness of each dot.'),
    range('light', 'Light Angle', 0, 360, 1, 235, 'Moves the lit side of the screen.', true),
  ],
  render(ctx) {
    const grid = count(ctx, 'grid');
    const size = sizeOf(ctx);
    const step = size * ctx.n('spacing') / 100 / grid;
    const reach = size * ctx.n('falloff') / 100;
    const light = polar([0, 0], reach * 0.24, angle(ctx.n('light')));
    const [cx, cy] = centerOf(ctx);
    let geometry = '';
    for (let row = 0; row < grid; row++) {
      for (let column = 0; column < grid; column++) {
        const dx = (column - (grid - 1) / 2) * step;
        const dy = (row - (grid - 1) / 2) * step;
        const falloff = clamp(1 - Math.hypot(dx, dy) / reach, 0, 1) ** 0.54;
        const shade = clamp(1.25 - Math.hypot(dx - light[0], dy - light[1]) / reach, 0.21, 1);
        geometry += dot([cx + dx, cy + dy], falloff * shade * step * ctx.n('weight') / 200, shade > 0.86 ? ctx.accent : ctx.ink);
      }
    }
    return geometry;
  },
};

const columnTerrain: PatternDefinition = {
  id: 'column-terrain', name: 'Column Terrain', category: 'Isometric',
  description: 'Different heights turn a square field of pillars into a stepped terrain.',
  controls: [
    range('grid', 'Grid Dimension', 3, 28, 1, 17, 'Sets the number of pillars in each direction.'),
    range('block', 'Block Size', 25, 100, 1, 95, 'Sets each pillar footprint.'),
    range('gap', 'Gap', 0, 85, 1, 10, 'Opens space between pillars.'),
    range('scale', 'Noise Scale', 1, 100, 1, 29, 'Higher values make the terrain change more rapidly.'),
    range('height', 'Height Factor', 5, 100, 1, 55, 'Stretches the terrain vertically.'),
  ],
  render(ctx) {
    const grid = count(ctx, 'grid');
    const scale = ctx.n('scale') / 110;
    const tallest = sizeOf(ctx) * ctx.n('height') / 330;
    return isoGrid(ctx, grid, grid, (column, row, point, unit) => {
      const level = clamp(0.5 + noise(column * scale, row * scale, ctx.seed) * 0.52, 0.03, 1);
      return isoBlock(point, unit * ctx.n('block') / 100 * (1 - ctx.n('gap') / 100), tallest * level, ctx, 0, level < 0.32);
    });
  },
};

const floatingVoxels: PatternDefinition = {
  id: 'floating-voxels', name: 'Floating Voxels', category: 'Isometric',
  description: 'Equal-volume blocks follow a smoothly varying field of elevation.',
  controls: [
    range('grid', 'Grid Size', 2, 22, 1, 11, 'Sets the number of cubes in each direction.'),
    range('block', 'Cube Size', 12, 100, 1, 60, 'Changes the side length of each cube.'),
    range('spacing', 'Cube Spacing', 25, 100, 1, 92, 'Spreads the cube positions.'),
    range('strength', 'Noise Strength', 0, 100, 1, 59, 'Changes how far the cubes lift from the grid.'),
    range('frequency', 'Noise Scale', 1, 80, 1, 22, 'Changes how quickly elevations vary between cubes.', true),
  ],
  render(ctx) {
    const grid = count(ctx, 'grid');
    const [cx, cy] = centerOf(ctx);
    const spread = ctx.n('spacing') / 100;
    return isoGrid(ctx, grid, grid, (column, row, [x, y], unit) => {
      const scale = ctx.n('frequency') / 100;
      const shift = noise(column * scale, row * scale, ctx.seed) * sizeOf(ctx) * ctx.n('strength') / 480;
      const cube = unit * ctx.n('block') / 100;
      return isoBlock([cx + (x - cx) * spread, cy + (y - cy) * spread - shift], cube, cube * 1.1, ctx, 0, shift < 0);
    });
  },
};

const axonometricGrid: PatternDefinition = {
  id: 'axonometric-grid', name: 'Axonometric Grid', category: 'Isometric',
  description: 'An orderly checker of cubes casts an alternating grid across a tilted plane.',
  controls: [
    range('grid', 'Grid Dimension', 2, 17, 1, 8, 'Changes the number of cubes on each side.'),
    range('size', 'Cube Size', 20, 125, 1, 95, 'Increases the width and height of each cube.'),
    range('gap', 'Gap', 0, 65, 1, 18, 'Separates neighboring cubes.'),
    range('height', 'Height', 20, 220, 1, 100, 'Squashes or elongates the cubes.', true),
  ],
  render(ctx) {
    const grid = count(ctx, 'grid');
    return isoGrid(ctx, grid, grid, (column, row, point, unit) => {
      const cube = unit * ctx.n('size') / 100 * (1 - ctx.n('gap') / 100);
      return isoBlock(point, cube, cube * ctx.n('height') / 100, ctx, 0, (column + row) % 2 === 0);
    });
  },
};

const cubes: PatternDefinition = {
  id: 'isometric-cubes', name: 'Isometric Cubes', category: 'Isometric',
  description: 'A staggered array of cubes is revealed or hidden by a directional mask.',
  controls: [
    range('rows', 'Rows', 2, 35, 1, 13, 'Sets the number of cube rows.'),
    range('columns', 'Columns', 2, 35, 1, 11, 'Sets the number of cube columns.'),
    range('size', 'Block Size', 20, 108, 1, 92, 'Changes the size of the cubes in their cells.'),
    range('fill', 'Fill', 0, 100, 1, 82, 'Controls how many whole cubes the mask retains.'),
    { ...range('direction', 'Fill Direction', 0, 100, 1, 100, 'Blends scattered removal with a directional clearing.', true), enabled: (values) => Number(values.fill) > 0 && Number(values.fill) < 100 },
    { ...range('angle', 'Fill Angle', 0, 360, 1, 43, 'Rotates the mask axis.', true), enabled: (values) => Number(values.fill) > 0 && Number(values.fill) < 100 && Number(values.direction) > 0 },
    { ...range('edge', 'Fill Edge', 0, 100, 1, 25, 'Adds scattered cubes around the boundary.', true), enabled: (values) => Number(values.fill) > 0 && Number(values.fill) < 100 },
    { ...range('noise', 'Fill Noise', 0, 100, 1, 37, 'Makes the mask boundary more irregular.', true), enabled: (values) => Number(values.fill) > 0 && Number(values.fill) < 100 },
    { ...range('scale', 'Fill Noise Scale', 1, 100, 1, 32, 'Changes the granularity of the boundary distortion.', true), enabled: (values) => Number(values.fill) > 0 && Number(values.fill) < 100 && Number(values.noise) > 0 },
  ],
  render(ctx) {
    const rows = count(ctx, 'rows');
    const columns = count(ctx, 'columns');
    const coverage = ctx.n('fill') / 100;
    const direction = ctx.n('direction') / 100;
    const radians = angle(ctx.n('angle'));
    const nx = Math.cos(radians);
    const ny = Math.sin(radians);
    const extent = Math.abs(nx) + Math.abs(ny);
    return isoGrid(ctx, rows, columns, (column, row, point, unit) => {
      const x = spacing(column, columns) - 0.5;
      const y = spacing(row, rows) - 0.5;
      const directional = 0.5 + (nx * x + ny * y) / extent;
      const scale = ctx.n('scale') / 125;
      const seeded = ctx.random();
      const roughness = noise(column * scale, row * scale, ctx.seed) * ctx.n('noise') / 250;
      const jitter = (seeded - 0.5) * ctx.n('edge') / 180;
      const retained = coverage >= 1 || (coverage > 0 && mix(seeded, directional, direction) + roughness + jitter < coverage);
      const width = unit * ctx.n('size') / 100;
      return retained ? isoBlock([point[0] + (row % 2 ? unit * 0.16 : 0), point[1]], width, width * 1.08, ctx, 0, (column + row) % 5 === 0) : '';
    });
  },
};

const tangentRosettes: PatternDefinition = {
  id: 'tangent-rosettes', name: 'Tangent Rosettes', category: 'Radial',
  description: 'Overlapping circles of straight dashes build a dense circular rosette.',
  controls: [
    range('circles', 'Circles', 2, 20, 1, 8, 'Sets how many dash circles overlap.'),
    range('marks', 'Marks Per Circle', 10, 140, 1, 76, 'Changes how densely each circle is sampled.'),
    range('length', 'Line Length', 1, 30, 0.5, 8.5, 'Extends or shortens the dashes around their centers.'),
    range('transform', 'Transformer', -100, 100, 1, 37, 'Vary both the scale and the rotation of successive circles.'),
  ],
  render(ctx) {
    const center = centerOf(ctx);
    const size = sizeOf(ctx);
    const circles = count(ctx, 'circles');
    const marks = count(ctx, 'marks');
    const transform = ctx.n('transform') / 100;
    return samples(circles, (ring) => {
      const turn = ring * TAU / circles;
      const origin = polar(center, size * (0.108 + transform * 0.055), turn);
      const radius = size * (0.278 + transform * 0.095 * Math.cos(turn));
      const d = samples(marks, (i) => {
        const theta = i * TAU / marks + turn * transform;
        return dashAt(polar(origin, radius, theta), size * ctx.n('length') / 930, theta + Math.PI / 2 + transform * 0.32);
      }).join('');
      return stroke(d, ring % 3 === 0 ? ctx.accent : ctx.ink, size * 0.0017);
    }).join('');
  },
};

const lissajous: PatternDefinition = {
  id: 'lissajous-marks', name: 'Lissajous Marks', category: 'Physics',
  description: 'Short dashes trace the loops of two perpendicular oscillations.',
  controls: [
    range('x', 'X Frequency', 1, 10, 1, 3, 'Sets the number of horizontal oscillations.'),
    range('y', 'Y Frequency', 1, 10, 1, 2, 'Sets vertical oscillations and changes the looping structure.'),
    range('length', 'Line Length', 1, 25, 0.5, 7, 'Extends each dash equally in both directions.'),
    range('count', 'Marks', 32, 800, 1, 320, 'Changes the number of sampled dashes.'),
    range('phase', 'Phase Offset', 0, 360, 1, 41, 'Changes the timing relationship between the two oscillations.', true),
  ],
  render(ctx) {
    const [cx, cy] = centerOf(ctx);
    const size = sizeOf(ctx);
    const xFrequency = count(ctx, 'x');
    const yFrequency = count(ctx, 'y');
    const phase = angle(ctx.n('phase'));
    const marks = count(ctx, 'count');
    const groups = ['', ''];
    for (let i = 0; i < marks; i++) {
      const t = i * TAU / marks;
      const x = t * xFrequency + phase;
      const y = t * yFrequency;
      const point: Point = [cx + ctx.width * 0.34 * Math.sin(x), cy + ctx.height * 0.33 * Math.sin(y)];
      const tangent = Math.atan2(Math.cos(y) * yFrequency, Math.cos(x) * xFrequency);
      groups[Math.floor(i / 17) % 2] += dashAt(point, size * ctx.n('length') / 600, tangent + Math.PI / 2);
    }
    return stroke(groups[0], ctx.ink, size * 0.0023) + stroke(groups[1], ctx.accent, size * 0.0021);
  },
};

function clipBox(vertices: Point[], x: number, y: number, width: number, height: number): Point[] {
  const bounds: [axis: 0 | 1, bound: number, sign: number][] = [[0, x, 1], [0, x + width, -1], [1, y, 1], [1, y + height, -1]];
  for (const [axis, bound, sign] of bounds) {
    const next: Point[] = [];
    let previous = vertices.at(-1);
    if (!previous) break;
    for (const point of vertices) {
      const inside = (point[axis] - bound) * sign >= 0;
      const insidePrevious = (previous[axis] - bound) * sign >= 0;
      if (inside !== insidePrevious) {
        const fraction = (bound - previous[axis]) / (point[axis] - previous[axis]);
        next.push([mix(previous[0], point[0], fraction), mix(previous[1], point[1], fraction)]);
      }
      if (inside) next.push(point);
      previous = point;
    }
    vertices = next;
  }
  return vertices;
}

const glyphWindows: PatternDefinition = {
  id: 'glyph-windows', name: 'Glyph Windows', category: 'Type',
  description: 'Clipped geometric lettering fills a seeded mosaic of rectangular windows.',
  controls: [
    text('word', 'Word', 'SHAPES', 'Supplies the letters used in the grid.', 24),
    select('font', 'Letter Style', [['block', 'Solid'], ['mono', 'Pixel']], 'block', 'Choose filled or segmented letterforms.'),
    range('columns', 'Grid Dimension', 4, 28, 1, 15, 'Adds or removes grid cells across the artwork.'),
    range('scale', 'Block Size', 1, 8, 1, 4, 'Sets the largest size of a packed block.'),
    range('zoom', 'Zoom', 0.25, 4, 0.05, 1.65, 'Magnifies the geometric letters inside each window.'),
    range('rotation', 'Rotation', 0, 90, 1, 21, 'Changes the maximum random letter tilt.', true),
    range('shift', 'Shift', 0, 100, 1, 28, 'Moves the letters away from the center of their window.', true),
    range('format', 'Format', 0.5, 2, 0.05, 1, 'Sets the vertical density of the grid relative to its width.', true),
  ],
  render(ctx) {
    const letters = Array.from(ctx.s('word').replace(/\s/g, ''));
    if (!letters.length) return '';
    const columns = count(ctx, 'columns');
    const rows = clamp(Math.round(columns * ctx.height / ctx.width * ctx.n('format')), 2, 46);
    const margin = sizeOf(ctx) * 0.067;
    const stepX = (ctx.width - margin * 2) / columns;
    const stepY = (ctx.height - margin * 2) / rows;
    const occupied = new Set<number>();
    const paths = ['', ''];
    const maxBlock = count(ctx, 'scale');
    let tileIndex = 0;
    for (let row = 0; row < rows; row++) {
      for (let column = 0; column < columns; column++) {
        const key = row * columns + column;
        if (occupied.has(key)) continue;
        let tileWidth = 1;
        const requestedWidth = Math.min(columns - column, 1 + Math.floor(ctx.random() * maxBlock));
        while (tileWidth < requestedWidth && !occupied.has(key + tileWidth)) tileWidth++;
        let tileHeight = 1;
        const requestedHeight = Math.min(rows - row, 1 + Math.floor(ctx.random() * maxBlock));
        while (tileHeight < requestedHeight && samples(tileWidth, (i) => !occupied.has(key + i + tileHeight * columns)).every(Boolean)) tileHeight++;
        for (let dy = 0; dy < tileHeight; dy++) {
          for (let dx = 0; dx < tileWidth; dx++) occupied.add(key + dy * columns + dx);
        }

        const x = margin + column * stepX + stepX * 0.035;
        const y = margin + row * stepY + stepY * 0.035;
        const width = (tileWidth - 0.07) * stepX;
        const height = (tileHeight - 0.07) * stepY;
        const center: Point = [x + width / 2, y + height / 2];
        const zoom = Math.max(width, height) * ctx.n('zoom');
        const tilt = angle((ctx.random() * 2 - 1) * ctx.n('rotation'));
        const offset = ctx.n('shift') / 230;
        const glyph = letters[tileIndex++ % letters.length];
        const outlines = letterBoxes(glyph, center[0] - zoom / 2 + (ctx.random() - 0.5) * width * offset, center[1] - zoom / 2 + (ctx.random() - 0.5) * height * offset, zoom, zoom, ctx.s('font') === 'mono' ? 'mono' : 'block');
        const ink = tileIndex % 4 === 0 ? 1 : 0;
        for (const rect of outlines) {
          const corners: Point[] = [[rect.x, rect.y], [rect.x + rect.width, rect.y], [rect.x + rect.width, rect.y + rect.height], [rect.x, rect.y + rect.height]];
          const clipped = clipBox(corners.map((corner) => rotate(corner, center, tilt)), x, y, width, height);
          if (clipped.length > 2) paths[ink] += path(clipped, true);
        }
      }
    }
    return fill(paths[0], ctx.ink) + fill(paths[1], ctx.accent);
  },
};

const chordWeave: PatternDefinition = {
  id: 'chord-weave', name: 'Chord Weave', category: 'Radial',
  description: 'Straight chords between two circles reveal curved envelopes as they overlap.',
  controls: [
    range('lines', 'Lines', 12, 470, 1, 169, 'Changes how many chords join the two rings.'),
    range('factor', 'Angle Multiplier', 1.05, 28, 0.05, 4.2, 'Maps a point on the outer ring to its partner on the inner ring.'),
    range('radius', 'Inner Radius', 0, 110, 1, 72, 'Expands or contracts the ring where chords end.'),
    range('shift', 'Rotation', 0, 360, 1, 11, 'Rotates the destination ring around the center.', true),
  ],
  render(ctx) {
    const center = centerOf(ctx);
    const radius = sizeOf(ctx) * 0.435;
    const inner = radius * ctx.n('radius') / 100;
    const number = count(ctx, 'lines');
    const groups = ['', ''];
    for (let i = 0; i < number; i++) {
      const t = i * TAU / number;
      const end = t * ctx.n('factor') + angle(ctx.n('shift'));
      groups[i % 8 === 0 ? 1 : 0] += path([polar(center, radius, t), polar(center, inner, end)]);
    }
    return stroke(groups[0], ctx.ink, radius * 0.0027) + stroke(groups[1], ctx.accent, radius * 0.004);
  },
};

const nestedPolygons: PatternDefinition = {
  id: 'nested-polygons', name: 'Nested Polygons', category: 'Radial',
  description: 'Nested outlines share corner links and bend into a layered angular structure.',
  controls: [
    range('sides', 'Sides', 3, 12, 1, 7, 'Changes the number of corners on every ring.'),
    range('rings', 'Rings', 2, 38, 1, 18, 'Adds or removes polygon rings.'),
    range('radius', 'Inner Radius', 0, 92, 1, 30, 'Opens or closes the center of the mesh.'),
    range('warp', 'Warp Amount', 0, 100, 1, 27, 'Displaces corners away from regular polygon positions.'),
    range('rotation', 'Rotate', 0, 360, 1, 14, 'Turns the entire composition.'),
    { ...range('scale', 'Noise Scale', 1, 100, 1, 25, 'Higher values make the distortion change more quickly from ring to ring.', true), enabled: (values) => Number(values.warp) > 0 },
    range('twist', 'Twist', -120, 120, 1, 24, 'Changes rotation gradually from the inner ring to the outer ring.', true),
  ],
  render(ctx) {
    const sides = count(ctx, 'sides');
    const rings = count(ctx, 'rings');
    const size = sizeOf(ctx);
    const center = centerOf(ctx);
    const scale = ctx.n('scale') / 70;
    const warp = size * ctx.n('warp') / 950;
    const mesh = samples(rings, (ring) => samples(sides, (corner) => {
      const t = spacing(ring, rings);
      const radius = size * 0.396 * mix(ctx.n('radius') / 100, 1, t);
      const theta = corner * TAU / sides + angle(ctx.n('rotation') + ctx.n('twist') * t);
      const node = polar(center, radius, theta);
      node[0] += noise(corner * scale, ring * scale, ctx.seed) * warp * t;
      node[1] += noise(corner * scale + 8, ring * scale - 4, ctx.seed) * warp * t;
      return node;
    }));
    const outlines = mesh.map((ring) => path(ring, true)).join('');
    const connectors = samples(sides, (corner) => path(mesh.map((ring) => ring[corner]))).join('');
    return stroke(outlines, ctx.ink, size * 0.0026) + stroke(connectors, ctx.accent, size * 0.0023);
  },
};

const organicContours: PatternDefinition = {
  id: 'organic-contours', name: 'Organic Contours', category: 'Organic',
  description: 'Smooth concentric rings bend into irregular, topographic contours.',
  controls: [
    range('rings', 'Ring Count', 3, 50, 1, 26, 'Sets the number of nested outlines.'),
    range('amplitude', 'Noise Amplitude', 0, 100, 1, 54, 'Controls how far the rings bulge inward and outward.'),
    range('scale', 'Noise Scale', 1, 100, 1, 36, 'Changes the size of the bumps around each ring.'),
    range('radius', 'Inner Radius', 0, 72, 1, 13, 'Opens the center of the contour stack.'),
    range('samples', 'Smoothness', 12, 200, 1, 110, 'Controls how finely the curves are sampled.', true),
  ],
  render(ctx) {
    const rings = count(ctx, 'rings');
    const resolution = ctx.quality === 'thumbnail' ? Math.min(65, count(ctx, 'samples')) : count(ctx, 'samples');
    const center = centerOf(ctx);
    const size = sizeOf(ctx);
    return samples(rings, (ring) => {
      const t = spacing(ring, rings);
      const radius = size * 0.375 * mix(ctx.n('radius') / 100, 1, t);
      const twist = t * ctx.n('scale') / 125;
      const points = samples(resolution, (i) => {
        const theta = i * TAU / resolution;
        const frequency = 0.7 + ctx.n('scale') / 22;
        const field = noise(Math.cos(theta + twist) * frequency + t * 1.2, Math.sin(theta + twist) * frequency - t * 1.1, ctx.seed);
        return polar(center, Math.max(0, radius + field * size * ctx.n('amplitude') / 640 * (0.25 + t * 0.75)), theta);
      });
      return stroke(path(points, true), ring % 5 === 0 ? ctx.accent : ctx.ink, size * 0.0023);
    }).join('');
  },
};

const landscape: PatternDefinition = {
  id: 'topographic-lines', name: 'Topographic Lines', category: 'Noise',
  description: 'Stacked traces climb across a common, seeded terrain.',
  controls: [
    range('lines', 'Lines', 6, 120, 1, 48, 'Changes the number of traces in the landscape.'),
    range('strength', 'Strength', 0, 100, 1, 60, 'Changes the height of hills and valleys.'),
    range('spacing', 'Vertical Spacing', 10, 95, 1, 63, 'Changes the vertical span of the stack.'),
    range('width', 'Width', 10, 98, 1, 87, 'Shortens or extends the line field horizontally.'),
    range('scale', 'Noise Scale', 1, 100, 1, 21, 'Changes how far apart terrain features are.'),
    range('samples', 'Smoothness', 8, 130, 1, 80, 'Sets the number of points along each trace.', true),
  ],
  render(ctx) {
    const lines = count(ctx, 'lines');
    const resolution = ctx.quality === 'thumbnail' ? Math.min(56, count(ctx, 'samples')) : count(ctx, 'samples');
    const size = sizeOf(ctx);
    const width = ctx.width * ctx.n('width') / 100;
    const height = ctx.height * ctx.n('spacing') / 100;
    const frequency = 0.3 + ctx.n('scale') / 10;
    return samples(lines, (line) => {
      const y = spacing(line, lines);
      const points = samples(resolution, (i): Point => {
        const x = spacing(i, resolution);
        const field = noise(x * frequency, y * frequency / 2, ctx.seed) + noise(x * frequency * 2.1 + 7, y * frequency / 2 - 4, ctx.seed) * 0.23;
        return [(ctx.width - width) / 2 + x * width, (ctx.height - height) / 2 + y * height + field * size * ctx.n('strength') / 550];
      });
      return stroke(path(points), line % 6 === 0 ? ctx.accent : ctx.ink, size * 0.00165);
    }).join('');
  },
};

const spiralBloom: PatternDefinition = {
  id: 'spiral-bloom', name: 'Spiral Bloom', category: 'Organic',
  description: 'A golden-angle sequence grows into the crossing spirals of a flower head.',
  controls: [
    range('count', 'Count', 20, 1700, 1, 592, 'Adds marks from the center outward.'),
    range('spread', 'Spread', 8, 100, 1, 77, 'Increases the distance between marks and the bloom’s overall size.'),
    range('length', 'Line Length Scale', 0.2, 5, 0.1, 1.7, 'Lengthens the seeded dashes, especially near the outer edge.'),
    range('angle', 'Rotation Step', 125, 155, 0.05, 137.5, 'Changes the angle from one point to the next.'),
    select('mark', 'Marks', ['Dashes', 'Dots'], 'Dashes', 'Switches between straight dashes and round marks.', true),
  ],
  render(ctx) {
    const center = centerOf(ctx);
    const size = sizeOf(ctx);
    const total = count(ctx, 'count');
    const angular = angle(ctx.n('angle'));
    const spread = size * 0.58 * ctx.n('spread') / 100;
    const isDot = ctx.s('mark') === 'Dots';
    const groups = ['', ''];
    for (let i = 0; i < total; i++) {
      const t = Math.sqrt((i + 1) / Math.max(total, 560));
      const theta = i * angular;
      const mark = size * (0.002 + t * 0.005) * ctx.n('length') / 1.8;
      const position = polar(center, spread * t, theta);
      const accent = (i % 11 === 0 || (i % 5 === 0 && t > 0.71)) ? 1 : 0;
      groups[accent] += isDot ? dot(position, mark, accent ? ctx.accent : ctx.ink) : dashAt(position, mark, theta + 0.42);
    }
    return isDot ? groups.join('') : stroke(groups[0], ctx.ink, size * 0.0027) + stroke(groups[1], ctx.accent, size * 0.0027);
  },
};

type PolarProfile = { inner: number; outer: number; twist?: number; petals?: number; petalDepth?: number };

function drawPolarMesh(ctx: RenderContext, profile: PolarProfile): string {
  const rings = count(ctx, 'rings');
  const spokes = count(ctx, 'spokes');
  const size = sizeOf(ctx);
  const center = centerOf(ctx);
  const warp = ctx.n('warp') * size / 1220;
  const nodes = samples(rings, (ring) => samples(spokes, (spoke) => {
    const t = spacing(ring, rings);
    const base = spoke * TAU / spokes;
    const theta = base + (profile.twist ?? 0) * t ** 1.4;
    const lobe = (profile.petalDepth ?? 0) * Math.cos(base * (profile.petals ?? 1)) * (0.22 + t * 0.78);
    const movement = noise(Math.cos(base) * 3.4 + t * 2.1, Math.sin(base) * 3.4 - t * 2.1, ctx.seed);
    const radius = Math.max(0, mix(profile.inner, profile.outer, t) + lobe + movement * warp);
    return polar(center, radius, theta + movement * warp / size);
  }));
  const circular = nodes.map((ring) => path(ring, true)).join('');
  const radial = samples(spokes, (index) => path(nodes.map((ring) => ring[index]))).join('');
  return stroke(circular, ctx.ink, size * 0.0023) + stroke(radial, ctx.accent, size * 0.0019);
}

const polarLattice: PatternDefinition = {
  id: 'polar-lattice', name: 'Polar Lattice', category: 'Radial',
  description: 'A circular grid joins concentric rings with spokes that drift organically.',
  controls: [
    range('rings', 'Rings', 2, 30, 1, 13, 'Sets the number of concentric rows.'),
    range('spokes', 'Spokes', 3, 62, 1, 33, 'Adds or removes spokes around the circle.'),
    range('radius', 'Inner Radius', 0, 90, 1, 17, 'Sets the opening at the center of the lattice.'),
    range('warp', 'Warp Amount', 0, 100, 1, 33, 'Changes smooth irregular displacement over the lattice.'),
  ],
  render(ctx) {
    const outer = sizeOf(ctx) * 0.411;
    return drawPolarMesh(ctx, { inner: outer * ctx.n('radius') / 100, outer });
  },
};

const harmonicRays: PatternDefinition = {
  id: 'harmonic-rays', name: 'Harmonic Rays', category: 'Radial',
  description: 'Rays run from an even ring to an oscillating flower-like boundary.',
  controls: [
    range('rays', 'Ray Count', 12, 260, 1, 155, 'Changes the density of radial lines around the circle.'),
    range('frequency', 'Frequency', 1, 33, 1, 11, 'Sets how often the ray length rises and falls.'),
    range('amplitude', 'Amplitude', 0, 100, 1, 62, 'Changes the difference between peaks and troughs.'),
    range('radius', 'Inner Radius', 5, 94, 1, 56, 'Sets the ring where fixed ray endpoints sit.'),
    range('skew', 'Skew', -90, 90, 1, 16, 'Rotates the moving endpoints relative to the starting circle.', true),
  ],
  render(ctx) {
    const total = count(ctx, 'rays');
    const center = centerOf(ctx);
    const outer = sizeOf(ctx) * 0.438;
    const inner = ctx.n('radius') / 100 * outer;
    const amplitude = outer * ctx.n('amplitude') / 100 * 0.39;
    const groups = ['', ''];
    for (let index = 0; index < total; index++) {
      const theta = index * TAU / total;
      const pulse = Math.sin(theta * ctx.n('frequency'));
      groups[pulse > 0.64 ? 1 : 0] += path([polar(center, inner, theta), polar(center, outer - amplitude * (1 + pulse), theta + angle(ctx.n('skew')))]);
    }
    return stroke(groups[0], ctx.ink, outer * 0.0054) + stroke(groups[1], ctx.accent, outer * 0.0068);
  },
};

const jitteredSpokes: PatternDefinition = {
  id: 'jittered-spokes', name: 'Jittered Spokes', category: 'Radial',
  description: 'Thin spokes bridge two rings of points with seeded irregular offsets.',
  controls: [
    range('count', 'Spoke Count', 10, 105, 1, 42, 'Adds or removes matching spokes and dot pairs.'),
    range('outer', 'Outer Radius', 15, 93, 1, 84, 'Adjusts the radius of the outer ring.'),
    range('inner', 'Inner Radius', 1, 92, 1, 28, 'Adjusts the radius of the inner ring.'),
    range('jitter', 'Outer Jitter', 0, 100, 1, 46, 'Moves the dots away from their regular positions.'),
    { ...range('innerJitter', 'Inner Jitter', 0, 2, 0.05, 0.6, 'Scales the jitter on the inner ring relative to the outer ring.', true), enabled: (values) => Number(values.jitter) > 0 },
    range('dot', 'Dot Size', 0, 100, 1, 46, 'Changes the size of the dots at the spoke endpoints.', true),
  ],
  render(ctx) {
    const center = centerOf(ctx);
    const size = sizeOf(ctx);
    const total = count(ctx, 'count');
    const spread = size * ctx.n('jitter') / 1050;
    const dotSize = size * ctx.n('dot') / 10500;
    let lines = '';
    let endpoints = '';
    for (let i = 0; i < total; i++) {
      const theta = i * TAU / total;
      const outer = polar(center, ctx.n('outer') * size / 210 + (ctx.random() - 0.5) * spread, theta + (ctx.random() - 0.5) * spread / size);
      const inner = polar(center, ctx.n('inner') * size / 210 + (ctx.random() - 0.5) * spread * ctx.n('innerJitter'), theta + (ctx.random() - 0.5) * spread / size * ctx.n('innerJitter'));
      lines += path([inner, outer]);
      endpoints += dot(outer, dotSize, ctx.ink) + dot(inner, dotSize * 1.17, ctx.accent);
    }
    return stroke(lines, ctx.ink, size * 0.0017) + endpoints;
  },
};

const barClearing: PatternDefinition = {
  id: 'bar-clearing', name: 'Bar Clearing', category: 'Grid',
  description: 'A seeded field of small bars thins toward a circular clearing.',
  controls: [
    range('count', 'Objects', 50, 1200, 1, 740, 'Changes how many bars populate the field.'),
    range('radius', 'Void Radius', 3, 70, 1, 37, 'Sets the size of the sparse central clearing.'),
    range('sharpness', 'Void Sharpness', 0.5, 5, 0.05, 1.65, 'Increases the contrast between the center and the outer field.'),
    range('length', 'Bar Length', 10, 100, 1, 55, 'Changes the average length of the rectangles.', true),
    range('centerX', 'Center X', 0, 100, 1, 51, 'Moves the clearing horizontally.', true),
    range('centerY', 'Center Y', 0, 100, 1, 48, 'Moves the clearing vertically.', true),
  ],
  render(ctx) {
    const size = sizeOf(ctx);
    const center: Point = [ctx.width * ctx.n('centerX') / 100, ctx.height * ctx.n('centerY') / 100];
    const total = count(ctx, 'count');
    const radius = size * ctx.n('radius') / 100;
    const strength = ctx.n('sharpness');
    let shapes = '';
    for (let index = 0; index < total; index++) {
      const x = ctx.width * (0.045 + ctx.random() * 0.91);
      const y = ctx.height * (0.05 + ctx.random() * 0.9);
      const amount = clamp(Math.hypot(x - center[0], y - center[1]) / radius, 0, 1) ** strength;
      const length = size * ctx.n('length') * (0.21 + ctx.random() * 0.79) * amount / 1450;
      const weight = size * (0.0018 + ctx.random() * 0.003) * amount;
      if (length < size * 0.0008) continue;
      shapes += box(x - length / 2, y - weight / 2, length, weight, index % 6 === 0 ? ctx.accent : ctx.ink);
    }
    return shapes;
  },
};

const interferenceRibbons: PatternDefinition = {
  id: 'interference-ribbons', name: 'Interference Ribbons', category: 'Physics', animated: true,
  description: 'Layered sine waves form a shifting interference field.',
  controls: [
    range('lines', 'Line Count', 8, 140, 1, 65, 'Changes the number of waves stacked across the field.'),
    range('format', 'Format', 20, 95, 1, 62, 'Changes the vertical span of the stack before rotation.'),
    range('amplitude', 'Max Amplitude', 0, 100, 1, 56, 'Changes the maximum height of waves near the middle.'),
    range('frequency', 'Base Frequency', 0.5, 9, 0.25, 2.75, 'Changes how often the waves oscillate across a line.'),
    range('rotation', 'Rotation Step', 0, 3, 1, 0, 'Rotates the field in quarter-turn steps.', true),
  ],
  render(ctx) {
    const total = count(ctx, 'lines');
    const center = centerOf(ctx);
    const size = sizeOf(ctx);
    const rotation = Math.round(ctx.n('rotation'));
    const horizontal = rotation % 2 === 0 ? ctx.width : ctx.height;
    const vertical = rotation % 2 === 0 ? ctx.height : ctx.width;
    const width = horizontal * 0.88;
    const height = vertical * ctx.n('format') / 100;
    const frequency = ctx.n('frequency');
    const phase = ctx.phase * TAU;
    const resolution = ctx.quality === 'thumbnail' ? 50 : 100;
    return samples(total, (line) => {
      const y = spacing(line, total);
      const amplitude = size * ctx.n('amplitude') / 650 * Math.sin(y * Math.PI) ** 1.4;
      const points = samples(resolution, (i): Point => {
        const x = spacing(i, resolution);
        const envelope = Math.sin(x * Math.PI) ** 0.75;
        const sum = Math.sin(x * TAU * frequency + y * TAU * 0.91 + phase) + 0.45 * Math.sin(x * TAU * (frequency * 1.46) - y * TAU * 1.63 - phase);
        return [center[0] + (x - 0.5) * width, center[1] + (y - 0.5) * height + sum * envelope * amplitude];
      });
      return stroke(path(rotation ? points.map((p) => rotate(p, center, rotation * Math.PI / 2)) : points), line % 7 === 0 ? ctx.accent : ctx.ink, size * 0.0018);
    }).join('');
  },
};

const rippleDots: PatternDefinition = {
  id: 'ripple-dots', name: 'Ripple Dots', category: 'Physics',
  description: 'A regular dot lattice expands into a circular ripple and changes scale near its center.',
  controls: [
    range('grid', 'Grid Size', 6, 52, 1, 30, 'Sets the number of dots along each side.'),
    range('spacing', 'Dot Spacing', 30, 110, 1, 86, 'Sets the distance between undisturbed dots.'),
    range('radius', 'Falloff Radius', 5, 75, 1, 23, 'Changes the width of the area affected by the ripple.'),
    range('dot', 'Dot Radius', 0.1, 6, 0.05, 1.9, 'Sets the base size before the radial effect.'),
    range('strength', 'Falloff Strength', 0, 4, 0.05, 1.2, 'Pushes and enlarges dots near the center.'),
  ],
  render(ctx) {
    const grid = count(ctx, 'grid');
    const size = sizeOf(ctx);
    const [cx, cy] = centerOf(ctx);
    const step = size * ctx.n('spacing') / 100 / grid;
    const radius = size * ctx.n('radius') / 100;
    const strength = ctx.n('strength');
    const thickness = size * ctx.n('dot') / 590;
    let dots = '';
    for (let row = 0; row < grid; row++) {
      for (let column = 0; column < grid; column++) {
        const dx = (column - (grid - 1) / 2) * step;
        const dy = (row - (grid - 1) / 2) * step;
        const t = Math.hypot(dx, dy) / radius;
        const response = Math.exp(-t * t * 1.5) * strength;
        const spread = 1 + response * 0.45;
        dots += dot([cx + dx * spread, cy + dy * spread], thickness * (1 + response * 0.71), t < 1 ? ctx.accent : ctx.ink);
      }
    }
    return dots;
  },
};

const petalMesh: PatternDefinition = {
  id: 'petal-mesh', name: 'Petal Mesh', category: 'Organic',
  description: 'A polar lattice develops a ring of petals without losing its wireframe.',
  controls: [
    range('petals', 'Petals', 2, 14, 1, 7, 'Changes the number of lobes around the center.'),
    range('rings', 'Rings', 2, 30, 1, 12, 'Changes how many concentric mesh rows are drawn.'),
    range('spokes', 'Spokes', 8, 90, 1, 54, 'Adds or removes lines connecting the rings.'),
    range('inner', 'Inner Radius', 0, 85, 1, 30, 'Opens the center of the mesh.'),
    range('outer', 'Outer Radius', 10, 95, 1, 74, 'Changes the overall size of the mesh.'),
    range('depth', 'Petal Depth', 0, 100, 1, 56, 'Separates the distance between the petal crests and troughs.'),
    range('warp', 'Warp Amount', 0, 100, 1, 12, 'Adds a smooth irregular distortion to the petal shape.', true),
  ],
  render(ctx) {
    const outer = sizeOf(ctx) * ctx.n('outer') / 216;
    return drawPolarMesh(ctx, {
      inner: outer * ctx.n('inner') / 100,
      outer,
      petals: count(ctx, 'petals'),
      petalDepth: outer * ctx.n('depth') / 220,
    });
  },
};

const decayingTraces: PatternDefinition = {
  id: 'decaying-traces', name: 'Decaying Traces', category: 'Flow',
  description: 'A layered signal contracts and softens near the top and bottom of its field.',
  controls: [
    range('lines', 'Line Count', 8, 145, 1, 58, 'Changes the number of traces in the signal.'),
    range('width', 'Wave Width', 20, 98, 1, 88, 'Changes the width of the longest trace.'),
    range('amplitude', 'Amplitude', 0, 100, 1, 38, 'Controls the height of fluctuations within a trace.'),
    range('scaleX', 'Noise Scale X', 0.25, 12, 0.05, 4.6, 'Changes how rapidly a trace fluctuates horizontally.'),
    range('scaleY', 'Noise Scale Y', 0.05, 4, 0.05, 1.25, 'Changes how rapidly neighboring traces vary.', true),
    range('fade', 'Fade Sharpness', 0.2, 4.5, 0.05, 0.75, 'Controls how quickly traces shrink near the edges.', true),
  ],
  render(ctx) {
    const total = count(ctx, 'lines');
    const [cx, cy] = centerOf(ctx);
    const size = sizeOf(ctx);
    const resolution = ctx.quality === 'thumbnail' ? 38 : 102;
    return samples(total, (line) => {
      const t = spacing(line, total);
      const fade = (1 - Math.abs(t * 2 - 1)) ** ctx.n('fade');
      const width = ctx.width * ctx.n('width') / 100 * (0.24 + 0.76 * fade);
      const amplitude = size * ctx.n('amplitude') * fade / 790;
      const points = samples(resolution, (i): Point => {
        const x = spacing(i, resolution);
        const envelope = Math.sin(Math.PI * x) ** 0.67;
        const signal = noise(x * ctx.n('scaleX'), t * ctx.n('scaleY'), ctx.seed);
        return [cx + (x - 0.5) * width, cy + (t - 0.5) * ctx.height * 0.81 + signal * amplitude * envelope];
      });
      return stroke(path(points), line % 5 === 0 ? ctx.accent : ctx.ink, size * mix(0.0008, 0.00215, fade), `opacity="${f(0.3 + 0.7 * fade)}"`);
    }).join('');
  },
};

const sineBlocks: PatternDefinition = {
  id: 'sine-blocks', name: 'Sine Blocks', category: 'Isometric',
  description: 'A stream of small blocks follows a sine wave and turns along the way.',
  animated: true,
  controls: [
    range('count', 'Block Count', 5, 180, 1, 72, 'Sets the number of blocks along the wave.'),
    range('size', 'Block Size', 5, 100, 1, 24, 'Adjusts the scale of each block.'),
    range('frequency', 'Frequency', 0.25, 12, 0.05, 2.55, 'Controls how rapidly the wave rises and falls.'),
    range('amplitude', 'Amplitude', 0, 100, 1, 63, 'Sets the height of the block stream’s wave.'),
    range('noise', 'Noise', 0, 100, 1, 34, 'Turns individual blocks by a seeded amount.', true),
  ],
  render(ctx) {
    const total = count(ctx, 'count');
    const size = sizeOf(ctx);
    const block = size * ctx.n('size') / 1750;
    const range = ctx.width * 0.87;
    const amplitude = ctx.height * ctx.n('amplitude') / 330;
    const center = centerOf(ctx);
    const phase = ctx.phase * TAU;
    return samples(total, (index) => {
      const t = spacing(index, total);
      const theta = t * TAU * ctx.n('frequency') + phase;
      const origin: Point = [center[0] + (t - 0.5) * range, center[1] + Math.sin(theta) * amplitude + block / 2];
      const turn = noise(t * 18, 0.42, ctx.seed) * ctx.n('noise') / 140;
      return isoBlock(origin, block, block * 1.15, ctx, turn, index % 8 === 0);
    }).join('');
  },
};

const spiralTrail: PatternDefinition = {
  id: 'spiral-dot-trail', name: 'Spiral Dot Trail', category: 'Organic',
  description: 'A continuous spiral of dots pulses between small and large marks.',
  controls: [
    range('count', 'Dot Count', 12, 1050, 1, 340, 'Sets the number of marks along the spiral.'),
    range('turns', 'Turns', 0.5, 20, 0.25, 7.75, 'Changes the number of windings about the center.'),
    range('radius', 'Max Radius', 5, 96, 1, 91, 'Sets the outer reach of the spiral.'),
    range('min', 'Min Dot', 0.1, 10, 0.05, 1.05, 'Changes the dot radius at the trough of the size wave.'),
    range('max', 'Max Dot', 0.2, 16, 0.05, 4.45, 'Changes the dot radius at the peak of the size wave.'),
    range('oscillation', 'Dot Pulses', 1, 30, 1, 14, 'Changes how frequently the dot sizes swell along the spiral.', true),
  ],
  render(ctx) {
    const center = centerOf(ctx);
    const size = sizeOf(ctx);
    const total = count(ctx, 'count');
    const outer = size * ctx.n('radius') / 208;
    return samples(total, (index) => {
      const t = spacing(index, total);
      const theta = TAU * t * ctx.n('turns') - Math.PI / 2;
      const wave = (1 + Math.sin(t * TAU * ctx.n('oscillation'))) / 2;
      const radius = mix(ctx.n('min'), ctx.n('max'), wave) * size / 470 * (0.25 + 0.75 * t);
      return dot(polar(center, outer * t ** 0.8, theta), radius, wave > 0.78 ? ctx.accent : ctx.ink);
    }).join('');
  },
};

const twistedWeave: PatternDefinition = {
  id: 'twisted-weave', name: 'Twisted Weave', category: 'Radial',
  description: 'An open circular grid curls tighter toward the outer ring.',
  controls: [
    range('rings', 'Rings', 2, 36, 1, 22, 'Adds or removes concentric mesh rows.'),
    range('spokes', 'Spokes', 3, 64, 1, 42, 'Changes the number of twisting lines.'),
    range('inner', 'Inner Radius', 0, 88, 1, 11, 'Changes the size of the central opening.'),
    range('outer', 'Outer Radius', 5, 96, 1, 88, 'Changes the reach of the outer ring.'),
    range('twist', 'Twist', -135, 135, 1, 42, 'Controls the amount and direction of the curl.'),
    range('warp', 'Warp Amount', 0, 100, 1, 17, 'Adds a seeded irregular distortion to the grid.', true),
  ],
  render(ctx) {
    const outer = sizeOf(ctx) * ctx.n('outer') / 216;
    return drawPolarMesh(ctx, { inner: outer * ctx.n('inner') / 100, outer, twist: angle(ctx.n('twist')) });
  },
};

const waveFabric: PatternDefinition = {
  id: 'wave-fabric', name: 'Wave Fabric', category: 'Flow',
  description: 'A linked grid flexes into wide waves and smaller irregular folds.',
  animated: true,
  controls: [
    range('columns', 'Columns', 4, 96, 1, 31, 'Sets the number of points across the grid.'),
    range('rows', 'Rows', 3, 48, 1, 16, 'Sets the number of points down the grid.'),
    range('scale', 'Scale', 20, 100, 1, 80, 'Changes the spacing and overall footprint of the mesh.'),
    range('amplitude', 'Wave Amplitude', 0, 100, 1, 49, 'Changes how far the underlying wave pushes the lattice.'),
    range('frequency', 'Wave Frequency', 0.2, 7, 0.05, 1.7, 'Changes the number of crests crossing the grid.'),
    range('warp', 'Warp Amount', 0, 100, 1, 25, 'Adds smaller seeded distortions on top of the wave.', true),
  ],
  render(ctx) {
    const columns = count(ctx, 'columns');
    const rows = count(ctx, 'rows');
    const size = sizeOf(ctx);
    const [cx, cy] = centerOf(ctx);
    const scale = ctx.n('scale') / 100;
    const width = ctx.width * scale;
    const height = ctx.height * scale * 0.78;
    const amplitude = size * ctx.n('amplitude') / 710;
    const frequency = ctx.n('frequency');
    const warp = size * ctx.n('warp') / 1580;
    const phase = ctx.phase * TAU;
    const nodes = samples(rows, (row) => samples(columns, (column): Point => {
      const x = spacing(column, columns);
      const y = spacing(row, rows);
      const oscillation = Math.sin(x * frequency * TAU + y * 2.3 + phase);
      const taper = 0.4 + 0.6 * Math.sin(y * Math.PI);
      const pushX = noise(x * 4.4 - 5, y * 3.6 + 3, ctx.seed) * warp;
      const pushY = noise(x * 5.2 + 3, y * 4.2 - 3, ctx.seed) * warp;
      return [cx + (x - 0.5) * width + pushX, cy + (y - 0.5) * height + oscillation * amplitude * taper + pushY];
    }));
    const bands = nodes.map((row) => path(row)).join('');
    const threads = samples(columns, (column) => path(nodes.map((row) => row[column]))).join('');
    return stroke(bands, ctx.ink, size * 0.0022) + stroke(threads, ctx.accent, size * 0.0017);
  },
};

export const fieldPatterns: PatternDefinition[] = [
  halftone, columnTerrain, floatingVoxels, axonometricGrid, cubes, tangentRosettes, lissajous, glyphWindows,
  chordWeave, nestedPolygons, organicContours, landscape, spiralBloom, polarLattice, harmonicRays,
  jitteredSpokes, barClearing, interferenceRibbons, rippleDots, petalMesh, decayingTraces, sineBlocks,
  spiralTrail, twistedWeave, waveFabric,
];
