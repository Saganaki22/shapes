import { clamp, f, noise, range, select, type Control, type PatternDefinition, type RenderContext } from './model';

type Point = readonly [number, number];
type Voxel = { x: number; y: number; z: number };

const TAU = Math.PI * 2;
const SQRT_3 = Math.sqrt(3);

function unit(ctx: RenderContext) {
  return Math.min(ctx.width, ctx.height) / 600;
}

function grid(columns: number, rows: number, max = 45): Control[] {
  return [
    range('columns', 'Columns', 2, max, 1, columns, 'Number of positions across the canvas.'),
    range('rows', 'Rows', 2, max, 1, rows, 'Number of positions down the canvas.'),
  ];
}

function mask(coverage = 1): Control[] {
  return [
    range('coverage', 'Coverage', 0, 1, .01, coverage, 'Reduces the visible portion of the pattern.'),
    { ...range('mask-angle', 'Clear direction', 0, 360, 1, 48, 'Rotates the direction in which space opens up.', true), enabled: values => Number(values.coverage) < 1 },
    { ...range('mask-feather', 'Edge scatter', 0, 1, .01, .32, 'Scatters some marks across the clearance boundary.', true), enabled: values => Number(values.coverage) < 1 },
    { ...range('mask-scale', 'Scatter scale', .5, 18, .1, 5, 'Higher values make the boundary break into finer patches.', true), enabled: values => Number(values.coverage) < 1 && Number(values['mask-feather']) > 0 },
  ];
}

function kept(ctx: RenderContext, u: number, v: number) {
  const coverage = ctx.n('coverage');
  if (coverage === 1) return true;
  if (coverage === 0) return false;
  const angle = ctx.n('mask-angle') * Math.PI / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const position = .5 + ((u - .5) * cos + (v - .5) * sin) / (Math.abs(cos) + Math.abs(sin));
  const scale = ctx.n('mask-scale');
  const scatter = ctx.n('mask-feather') * noise(u * scale, v * scale, ctx.seed + 417) * .46;
  return position + scatter <= coverage;
}

function point(x: number, y: number): string {
  return `${f(x)} ${f(y)}`;
}

function trace(points: readonly Point[], close = false) {
  if (!points.length) return '';
  const data = points.map(([x, y], index) => `${index === 0 ? 'M' : 'L'}${point(x, y)}`).join('');
  return close ? `${data}Z` : data;
}

function path(data: string, ink: string, weight: number, opacity = 1) {
  if (!data || weight <= 0) return '';
  return `<path d="${data}" fill="none" stroke="${ink}" stroke-width="${f(weight)}" stroke-opacity="${f(opacity)}" stroke-linecap="round" stroke-linejoin="round"/>`;
}

function polygon(points: readonly Point[], ink: string, opacity = 1) {
  return `<path d="${trace(points, true)}" fill="${ink}" fill-opacity="${f(opacity)}"/>`;
}

function polar(x: number, y: number, radius: number, angle: number): Point {
  return [x + Math.cos(angle) * radius, y + Math.sin(angle) * radius];
}

function arc(x: number, y: number, radius: number, start: number, sweep: number) {
  const [x1, y1] = polar(x, y, radius, start);
  const [x2, y2] = polar(x, y, radius, start + sweep);
  return `M${point(x1, y1)}A${f(radius)} ${f(radius)} 0 ${sweep > Math.PI ? 1 : 0} 1 ${point(x2, y2)}`;
}

function tileStroke(ctx: RenderContext, mode: 'quarters' | 'fans') {
  const cols = ctx.n('columns');
  const rows = ctx.n('rows');
  const bands = ctx.n('bands');
  const deltaX = ctx.width / cols;
  const deltaY = ctx.height / rows;
  const spacing = 46 / bands;
  const stroke = spacing * ctx.n('arc-weight');
  let data = '';
  for (let i = 0; i < bands; i++) {
    const radius = (i + .62) * spacing;
    if (mode === 'quarters') {
      data += arc(0, 0, radius * 1.95, 0, Math.PI / 2);
      data += arc(100, 100, radius * 1.95, Math.PI, Math.PI / 2);
    } else {
      data += arc(50, 0, radius, 0, Math.PI);
      data += arc(50, 100, radius, Math.PI, Math.PI);
    }
  }
  const useSymbol = ctx.quality !== 'export';
  const tileId = `mesh-tile-${mode}-${bands}-${f(stroke)}`;
  let output = '';
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const turn = mode === 'quarters' ? Math.floor(ctx.random() * 4) : (col + row * ctx.n('row-shift')) % 2;
      if (!kept(ctx, (col + .5) / cols, (row + .5) / rows)) continue;
      const color = (row + col + turn) % 4 === 0 ? ctx.accent : ctx.ink;
      const transform = `translate(${point(col * deltaX, row * deltaY)}) scale(${(deltaX / 100).toFixed(5)} ${(deltaY / 100).toFixed(5)}) rotate(${turn * 90} 50 50)`;
      output += useSymbol
        ? `<use href="#${tileId}" transform="${transform}" color="${color}"/>`
        : `<g transform="${transform}">${path(data, color, stroke)}</g>`;
    }
  }
  return output && useSymbol ? `<defs><g id="${tileId}">${path(data, 'currentColor', stroke)}</g></defs>${output}` : output;
}

function project(x: number, y: number, z: number): Point {
  return [(x - y) * SQRT_3 / 2, (x + y) / 2 - z];
}

function drawVoxels(ctx: RenderContext, voxels: Voxel[], size = 1, rise = 1) {
  if (!voxels.length) return '';
  const leftCorner = project(0, size, rise);
  const topCorner = project(0, 0, rise);
  const rightCorner = project(size, 0, rise);
  const centerCorner = project(size, size, rise);
  const lowerLeft = project(0, size, 0);
  const lowerCenter = project(size, size, 0);
  const lowerRight = project(size, 0, 0);
  const outline = trace([topCorner, rightCorner, lowerRight, lowerCenter, lowerLeft, leftCorner], true)
    + trace([leftCorner, centerCorner, rightCorner]) + trace([centerCorner, lowerCenter]);
  const block = polygon([leftCorner, topCorner, rightCorner, centerCorner], ctx.accent, .75)
    + polygon([leftCorner, centerCorner, lowerCenter, lowerLeft], ctx.ink, .56)
    + polygon([centerCorner, rightCorner, lowerRight, lowerCenter], ctx.ink, .94)
    + path(outline, ctx.ink, .028, .7);
  let left = Infinity;
  let right = -Infinity;
  let top = Infinity;
  let bottom = -Infinity;
  const blockId = `block-${f(size)}-${f(rise)}-${ctx.ink.slice(1)}-${ctx.accent.slice(1)}`;
  const useSymbol = ctx.quality !== 'export';
  let faces = '';
  voxels.sort((a, b) => a.x + a.y + a.z - b.x - b.y - b.z);
  for (const { x, y, z } of voxels) {
    const [screenX, screenY] = project(x, y, z);
    left = Math.min(left, screenX + leftCorner[0]);
    right = Math.max(right, screenX + rightCorner[0]);
    top = Math.min(top, screenY + topCorner[1]);
    bottom = Math.max(bottom, screenY + lowerCenter[1]);
    faces += useSymbol
      ? `<use href="#${blockId}" x="${f(screenX)}" y="${f(screenY)}"/>`
      : `<g transform="translate(${point(screenX, screenY)})">${block}</g>`;
  }
  const scale = .87 * Math.min(ctx.width / Math.max(1, right - left), ctx.height / Math.max(1, bottom - top));
  const tx = ctx.width / 2 - (left + right) * scale / 2;
  const ty = ctx.height / 2 - (top + bottom) * scale / 2;
  const defs = useSymbol ? `<defs><g id="${blockId}">${block}</g></defs>` : '';
  return `${defs}<g transform="translate(${point(tx, ty)}) scale(${f(scale)})">${faces}</g>`;
}

function blockArray(ctx: RenderContext, mode: 'cross' | 'eruption' | 'frame' | 'orb' | 'scattered') {
  const size = ctx.n('dimension');
  const layers = mode === 'scattered' || mode === 'eruption' ? ctx.n('layers') : size;
  const gap = ctx.n('gap');
  const pitch = 1 + gap;
  const center = (size - 1) / 2;
  const middle = (layers - 1) / 2;
  const voxels: Voxel[] = [];
  for (let z = 0; z < layers; z++) {
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const dx = x - center;
        const dy = y - center;
        const dz = z - middle;
        const radius = Math.hypot(dx, dy, dz);
        let scale = pitch;
        if (mode === 'cross') {
          const beam = size * ctx.n('arm') * .5;
          if ([dx, dy, dz].filter(value => Math.abs(value) <= beam).length < 2) continue;
        } else if (mode === 'frame') {
          const boundaryCount = Number(x === 0 || x === size - 1) + Number(y === 0 || y === size - 1) + Number(z === 0 || z === layers - 1);
          if (boundaryCount < 2) continue;
        } else if (mode === 'orb') {
          const edge = center + .35;
          if (radius > edge || radius < edge - ctx.n('shell')) continue;
        } else if (mode === 'scattered') {
          const frequency = ctx.n('cluster');
          const sample = ctx.s('distribution') === 'cloud'
            ? .5 + noise((x + z * 1.37) * frequency, (y - z * .43) * frequency, ctx.seed) * .5
            : ctx.random();
          if (sample >= ctx.n('density')) continue;
        } else {
          const frequency = ctx.n('cluster');
          const modulation = .5 + .45 * noise((x + 1.6 * z) * frequency, (y - .6 * z) * frequency, ctx.seed);
          scale += modulation * ctx.n('scatter') * (1 + radius / size);
        }
        voxels.push({ x: dx * scale, y: dy * scale, z: dz * scale });
      }
    }
  }
  return drawVoxels(ctx, voxels);
}

function terrainPatches(ctx: RenderContext) {
  const cols = ctx.n('columns');
  const rows = ctx.n('rows');
  const gap = ctx.n('gap') * Math.min(ctx.width / cols, ctx.height / rows);
  const radius = ctx.n('radius');
  const span = ctx.n('variance');
  const dx = ctx.width / cols;
  const dy = ctx.height / rows;
  const used = new Uint8Array(cols * rows);
  let output = '';
  function isFree(col: number, row: number, width: number, height: number) {
    if (col + width > cols || row + height > rows) return false;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (used[(row + y) * cols + col + x]) return false;
      }
    }
    return true;
  }
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      if (used[row * cols + col]) continue;
      let width = 1 + Math.floor(ctx.random() * span);
      let height = 1 + Math.floor(ctx.random() * span);
      while (!isFree(col, row, width, height)) {
        if (width > height) width--;
        else height--;
      }
      for (let y = 0; y < height; y++) {
        used.fill(1, (row + y) * cols + col, (row + y) * cols + col + width);
      }
      if (!kept(ctx, (col + width / 2) / cols, (row + height / 2) / rows)) continue;
      const rx = Math.min(width * dx - gap, height * dy - gap) * radius;
      const curve = ctx.s('corners') === 'uniform' ? Math.min(rx, Math.min(dx - gap, dy - gap) * radius) : rx;
      const color = (width + height) % 4 === 0 ? ctx.accent : ctx.ink;
      output += `<rect x="${f(col * dx + gap / 2)}" y="${f(row * dy + gap / 2)}" width="${f(width * dx - gap)}" height="${f(height * dy - gap)}" rx="${f(curve)}" fill="${color}"/>`;
    }
  }
  return output;
}

function waveDashes(ctx: RenderContext) {
  const columns = ctx.n('columns');
  const rows = ctx.n('rows');
  const spacing = Math.min(ctx.width / columns, ctx.height / rows);
  const length = ctx.n('length') * spacing / 2;
  const scale = ctx.n('scale');
  let primary = '';
  let secondary = '';
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < columns; col++) {
      const u = (col + .5) / columns;
      const v = (row + .5) / rows;
      if (!kept(ctx, u, v)) continue;
      const current = noise(u * scale, v * scale, ctx.seed);
      const ripple = .21 * Math.sin(TAU * (u + v + ctx.phase));
      const angle = TAU * (current + ripple) + ctx.n('tilt') * Math.PI / 180;
      const x = u * ctx.width;
      const y = v * ctx.height;
      const data = trace([polar(x, y, length, angle + Math.PI), polar(x, y, length, angle)]);
      if (current > .19) secondary += data;
      else primary += data;
    }
  }
  const width = spacing * ctx.n('weight');
  return path(primary, ctx.ink, width) + path(secondary, ctx.accent, width, .92);
}

function risingArcs(ctx: RenderContext) {
  const steps = ctx.n('bands');
  const scale = unit(ctx);
  const gridAngle = ctx.n('step') * Math.PI / 180;
  const min = Math.min(ctx.n('min-sweep'), ctx.n('max-sweep'));
  const max = Math.max(ctx.n('min-sweep'), ctx.n('max-sweep'));
  let radius = ctx.n('start') * scale;
  let output = '';
  for (let i = 0; i < steps; i++) {
    const progress = (i / (steps - 1)) ** ctx.n('growth');
    const width = scale * (ctx.n('min-width') * (1 - progress) + ctx.n('max-width') * progress);
    const angle = Math.min(TAU - .003, (min + Math.floor(ctx.random() * (max - min + 1))) * gridAngle);
    const bias = ctx.n('bias') * Math.PI / 180;
    const target = bias + (ctx.random() - .5) * TAU * (1 - ctx.n('focus'));
    const start = Math.round((target - angle / 2) / gridAngle) * gridAngle;
    output += path(arc(ctx.width / 2, ctx.height / 2, radius + width / 2, start, angle), i % 3 === 1 ? ctx.accent : ctx.ink, width);
    radius += width + ctx.n('gap') * scale;
  }
  return output;
}

function squareField(ctx: RenderContext, mode: 'crop' | 'drift') {
  const cols = ctx.n('columns');
  const rows = ctx.n('rows');
  const dx = ctx.width / cols;
  const dy = ctx.height / rows;
  const space = Math.min(dx, dy);
  const noiseScale = ctx.n('scale');
  let output = '';
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const u = (col + .5) / cols;
      const v = (row + .5) / rows;
      if (mode === 'crop' && !kept(ctx, u, v)) continue;
      const first = noise(u * noiseScale, v * noiseScale, ctx.seed);
      const second = noise(u * noiseScale, v * noiseScale, ctx.seed + 85);
      const transition = mode === 'drift'
        ? clamp((v - ctx.n('transition')) * (1 + 12 * ctx.n('sharpness')) + .35, 0, 1)
        : 1;
      const shift = space * ctx.n('shift') * transition;
      const rotate = ctx.n('rotation') * first * transition;
      const size = space * ctx.n('size') * (mode === 'crop' ? 1 - Math.abs(second) * ctx.n('shrink') : 1);
      const x = dx / 2 + first * shift;
      const y = dy / 2 + second * shift;
      const ink = first > .22 ? ctx.accent : ctx.ink;
      const rect = `<rect x="${f(x - size / 2)}" y="${f(y - size / 2)}" width="${f(size)}" height="${f(size)}" transform="rotate(${f(rotate)} ${point(x, y)})" ${mode === 'crop' ? `fill="${ink}"` : `fill="none" stroke="${ink}" stroke-width="${f(ctx.n('weight') * unit(ctx))}"`}/>`;
      const left = col * dx;
      const top = row * dy;
      output += mode === 'crop'
        ? `<svg x="${f(left)}" y="${f(top)}" width="${f(dx)}" height="${f(dy)}" overflow="hidden">${rect}</svg>`
        : `<g transform="translate(${point(left, top)})">${rect}</g>`;
    }
  }
  return output;
}

function ribbonGrid(ctx: RenderContext) {
  const columns = ctx.n('columns');
  const rows = ctx.n('rows');
  const dx = ctx.width / (columns + .5);
  const dy = ctx.height / rows;
  const scale = ctx.n('scale');
  const points: Point[][] = [];
  const visibility: boolean[][] = [];
  let strands = '';
  let ribbons = '';
  for (let row = 0; row <= rows; row++) {
    const offset = row % 2 * .5;
    const line: Point[] = [];
    const flags = [];
    for (let col = 0; col <= columns; col++) {
      const x = (col + offset) * dx;
      const y = row * dy;
      line.push([x, y]);
      flags.push(kept(ctx, x / ctx.width, y / ctx.height));
    }
    points.push(line);
    visibility.push(flags);
  }
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < columns; col++) {
      const a = points[row][col];
      const b = points[row][col + 1];
      const c = points[row + 1][col];
      const d = points[row + 1][col + 1];
      const isA = visibility[row][col];
      const isB = visibility[row][col + 1];
      const isC = visibility[row + 1][col];
      const isD = visibility[row + 1][col + 1];
      if (isA && isB) strands += trace([a, b]);
      if (isA && isC) strands += trace([a, c]);
      if (row % 2 === 0 && isB && isC) strands += trace([b, c]);
      if (row % 2 === 1 && isA && isD) strands += trace([a, d]);
      if (!isA || !isB || !isC || !isD) continue;
      const value = noise(col / columns * scale, row / rows * scale, ctx.seed);
      if (.5 + value * .5 < ctx.n('density')) {
        ribbons += polygon([a, b, d, c], (row + col) % 3 === 0 ? ctx.accent : ctx.ink, .85);
      }
    }
  }
  return ribbons + path(strands, ctx.ink, ctx.n('weight') * unit(ctx), .66);
}

function quarterMoons(ctx: RenderContext) {
  const columns = ctx.n('columns');
  const rows = ctx.n('rows');
  const dx = ctx.width / columns;
  const dy = ctx.height / rows;
  const radius = Math.min(dx, dy) * (.48 - ctx.n('gap'));
  let output = '';
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < columns; col++) {
      const x = (col + .5) * dx;
      const y = (row + .5) * dy;
      for (let quarter = 0; quarter < 4; quarter++) {
        const angle = quarter * TAU / 4;
        const [tx, ty] = polar(x, y, radius / 4, angle + Math.PI / 4);
        if (ctx.random() >= ctx.n('density') || !kept(ctx, tx / ctx.width, ty / ctx.height)) continue;
        const offset = Math.min(dx, dy) * ctx.n('split');
        const [cx, cy] = polar(x, y, offset, angle + Math.PI / 4);
        const shape = `${arc(cx, cy, radius, angle, Math.PI / 2)}L${point(cx, cy)}Z`;
        output += `<path d="${shape}" fill="${quarter % 3 === 0 ? ctx.accent : ctx.ink}"/>`;
      }
    }
  }
  return output;
}

function lineWaves(ctx: RenderContext, mode: 'converge' | 'signal') {
  const lines = ctx.n('lines');
  const span = ctx.width * ctx.n('width');
  const height = ctx.height * ctx.n('spread');
  const amplitude = Math.min(ctx.width, ctx.height) * ctx.n('amplitude');
  const samples = mode === 'signal' ? ctx.n('detail') : 120;
  let output = '';
  for (let i = 0; i < lines; i++) {
    const v = i / (lines - 1);
    const points: Point[] = [];
    for (let j = 0; j <= samples; j++) {
      const u = j / samples;
      let offset = 0;
      if (mode === 'converge') {
        const f0 = ctx.n('start-frequency');
        const f1 = ctx.n('end-frequency');
        const fade = clamp((u - ctx.n('onset')) / (1 - ctx.n('onset')), 0, 1);
        offset = Math.sin(TAU * (u * (f0 * (1 - v) + f1 * v) + v + ctx.phase)) * fade;
      } else {
        const center = (1 - Math.abs(u * 2 - 1)) ** ctx.n('focus');
        const upper = (1 - Math.abs(v * 2 - 1)) ** ctx.n('vertical');
        const sample = noise(u * ctx.n('frequency'), v * ctx.n('variation'), ctx.seed);
        offset = -Math.abs(sample) * center * upper * 2;
      }
      points.push([ctx.width / 2 + (u - .5) * span, ctx.height / 2 + (v - .5) * height + offset * amplitude]);
    }
    output += path(trace(points), i % 6 === 2 ? ctx.accent : ctx.ink, ctx.n('weight') * unit(ctx));
  }
  return output;
}

function nodeMesh(ctx: RenderContext, mode: 'pulse' | 'weave' | 'beads') {
  const cols = mode === 'pulse' ? ctx.n('columns') : ctx.n('size');
  const rows = mode === 'pulse' ? ctx.n('rows') : cols;
  const spanX = ctx.width * (mode === 'pulse' ? ctx.n('span-x') : .88);
  const spanY = ctx.height * (mode === 'pulse' ? ctx.n('span-y') : .85);
  const scale = ctx.n('scale');
  const strength = unit(ctx) * ctx.n('warp');
  const points: Point[][] = [];
  const active: boolean[][] = [];
  let dots = '';
  for (let row = 0; row < rows; row++) {
    const y = row / (rows - 1);
    const line: Point[] = [];
    const flags = [];
    for (let col = 0; col < cols; col++) {
      const x = col / (cols - 1);
      const nx = noise(x * scale, y * scale, ctx.seed);
      const ny = noise(x * scale, y * scale, ctx.seed + 171);
      const wave = mode === 'pulse'
        ? (1 - Math.abs(x * 2 - 1)) ** ctx.n('focus-x') * (1 - Math.abs(y * 2 - 1)) ** ctx.n('focus-y')
        : 1;
      const offsetX = mode === 'pulse' ? 0 : nx * strength;
      const offsetY = mode === 'pulse' ? -Math.abs(nx) * wave * strength * 2.2 : ny * strength;
      const px = ctx.width / 2 + (x - .5) * spanX + offsetX;
      const py = ctx.height / 2 + (y - .5) * spanY + offsetY;
      const keep = mode === 'pulse' || kept(ctx, x, y);
      line.push([px, py]);
      flags.push(keep);
      if (keep && mode === 'beads' && ctx.n('bead') > 0) {
        dots += `<circle cx="${f(px)}" cy="${f(py)}" r="${f(ctx.n('bead') * unit(ctx))}" fill="${(row + col) % 3 === 0 ? ctx.accent : ctx.ink}"/>`;
      }
    }
    points.push(line);
    active.push(flags);
  }
  let horizontal = '';
  let vertical = '';
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      if (!active[row][col]) continue;
      const here = points[row][col];
      if (col + 1 < cols && active[row][col + 1]) horizontal += trace([here, points[row][col + 1]]);
      if (mode === 'pulse' && ctx.s('connection') === 'strokes') continue;
      if (row + 1 < rows && active[row + 1][col]) vertical += trace([here, points[row + 1][col]]);
    }
  }
  const width = ctx.n('weight') * unit(ctx);
  return path(horizontal, ctx.ink, width) + path(vertical, ctx.accent, width, .75) + dots;
}

function rotatingArcs(ctx: RenderContext) {
  const cols = ctx.n('columns');
  const rows = ctx.n('rows');
  const dx = ctx.width / cols;
  const dy = ctx.height / rows;
  const cell = Math.min(dx, dy);
  const sweep = ctx.n('sweep') * Math.PI / 180;
  const size = cell * (.48 - ctx.n('gap'));
  let primary = '';
  let secondary = '';
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      if (!kept(ctx, (col + .5) / cols, (row + .5) / rows)) continue;
      const angle = TAU * (ctx.phase + (row * .7 + col) * ctx.n('twist'));
      const x = (col + .5) * dx;
      const y = (row + .5) * dy;
      primary += arc(x, y, size, angle, sweep);
      secondary += arc(x, y, size * .57, angle + Math.PI * .63, sweep * .82);
    }
  }
  return path(primary, ctx.ink, cell * ctx.n('weight')) + path(secondary, ctx.accent, cell * ctx.n('weight') * .72);
}

function orbitContours(ctx: RenderContext, mode: 'orbit' | 'growth') {
  const steps = ctx.n('rings');
  const scale = Math.min(ctx.width, ctx.height) / 2;
  const lower = Math.min(ctx.n('inner'), ctx.n('outer')) * scale;
  const upper = Math.max(ctx.n('inner'), ctx.n('outer')) * scale;
  const amount = ctx.n('warp') * scale;
  const samples = ctx.quality === 'thumbnail' ? 80 : 150;
  let output = '';
  for (let i = 0; i < steps; i++) {
    const level = i / (steps - 1);
    const base = lower + (upper - lower) * (mode === 'growth' ? level : ctx.random());
    const offset = mode === 'growth' ? 0 : amount * ctx.random() * .7;
    const heading = offset ? ctx.random() * TAU : 0;
    const center = polar(ctx.width / 2, ctx.height / 2, offset, heading);
    const points: Point[] = [];
    const rate = ctx.n('scale');
    for (let j = 0; j < samples; j++) {
      const angle = j / samples * TAU;
      const x = Math.cos(angle) * rate + level * (mode === 'growth' ? .7 : 5);
      const y = Math.sin(angle) * rate + level * (mode === 'growth' ? .4 : 3);
      const wobble = amount * noise(x, y, ctx.seed);
      points.push(polar(center[0], center[1], Math.max(.5, base + wobble), angle));
    }
    output += path(trace(points, true), i % 5 === 2 ? ctx.accent : ctx.ink, ctx.n('weight') * unit(ctx));
  }
  return output;
}

function coil(ctx: RenderContext) {
  const count = ctx.n('count');
  const voxels: Voxel[] = [];
  for (let i = 0; i < count; i++) {
    const turn = TAU * (i / (count - 1) * ctx.n('turns') + ctx.phase);
    const radius = ctx.n('radius');
    voxels.push({
      x: radius * Math.cos(turn),
      y: radius * Math.sin(turn),
      z: i * ctx.n('rise'),
    });
  }
  return drawVoxels(ctx, voxels, ctx.n('size'), ctx.n('height'));
}

const voxelGap = (amount: number) => range('gap', 'Gap', 0, 1.4, .02, amount, 'Separates cubes along the projection axes.');
const arcWeight = (amount: number) => range('arc-weight', 'Arc weight', .1, .92, .01, amount, 'Balances the thickness of each band against the space between bands.');
const waveThickness = (amount: number) => range('weight', 'Line weight', .3, 6, .1, amount, 'Changes the thickness of every trace.', true);
const gridWarp = (amount: number) => range('warp', 'Warp', 0, 110, .5, amount, 'Moves the nodes away from their regular grid positions.');

export const meshPatterns: PatternDefinition[] = [
  {
    id: 'arc-tiles', name: 'Arc Tiles', category: 'Grid',
    description: 'Turned tiles route quarter arcs across a geometric field.',
    controls: [
      ...grid(6, 6, 24),
      range('bands', 'Arcs per tile', 2, 14, 1, 5, 'Adds nested curves inside each tile.'),
      arcWeight(.41), ...mask(),
    ],
    render: ctx => tileStroke(ctx, 'quarters'),
  },
  {
    id: 'twin-fans', name: 'Twin Fans', category: 'Grid',
    description: 'Paired semicircle fans turn across a checkerboard.',
    controls: [
      ...grid(7, 7, 26),
      range('bands', 'Bands', 2, 14, 1, 6, 'Sets the number of bands in each fan.'),
      arcWeight(.65),
      range('row-shift', 'Alternate rows', 0, 1, 1, 1, 'Alternates directions across rows to form a checkerboard.'),
      ...mask(),
    ],
    render: ctx => tileStroke(ctx, 'fans'),
  },
  {
    id: 'axial-cross', name: 'Axial Cross', category: 'Isometric',
    description: 'Three perpendicular beams meet in a cross made of shaded blocks.',
    controls: [
      range('dimension', 'Resolution', 5, 19, 2, 11, 'Sets the number of small blocks along each beam.'),
      range('arm', 'Arm width', .14, .65, .01, .27, 'Thickens all three arms of the cross.'), voxelGap(.12),
    ],
    render: ctx => blockArray(ctx, 'cross'),
  },
  {
    id: 'erupting-blocks', name: 'Erupting Blocks', category: 'Isometric',
    description: 'Cubes scatter outward from different parts of a three-dimensional stack.',
    controls: [
      range('dimension', 'Grid dimension', 3, 13, 1, 7, 'Sets the width and depth of each level.'),
      range('layers', 'Layers', 2, 12, 1, 6, 'Adds vertical levels of cubes.'), voxelGap(.16),
      range('scatter', 'Displacement', 0, 4, .02, .68, 'Scales the distance blocks travel away from the middle.'),
      { ...range('cluster', 'Displacement scale', .1, 2.8, .02, .76, 'Sets how quickly the displacement changes from block to block.', true), enabled: values => Number(values.scatter) > 0 },
    ],
    render: ctx => blockArray(ctx, 'eruption'),
  },
  {
    id: 'cube-frame', name: 'Cube Frame', category: 'Isometric',
    description: 'Twelve edges mark the silhouette of a larger open cube.',
    controls: [range('dimension', 'Blocks per edge', 3, 25, 1, 11, 'Adds cube positions along each edge.'), voxelGap(.24)],
    render: ctx => blockArray(ctx, 'frame'),
  },
  {
    id: 'voxel-orb', name: 'Voxel Orb', category: 'Isometric',
    description: 'A shell of small cubes resolves into a sphere.',
    controls: [
      range('dimension', 'Resolution', 5, 25, 1, 13, 'Adds voxels to refine the contour of the orb.'),
      range('shell', 'Shell depth', .7, 3, .1, 1.1, 'Extends the visible shell inward.'), voxelGap(.12),
    ],
    render: ctx => blockArray(ctx, 'orb'),
  },
  {
    id: 'isometric-blocks', name: 'Isometric Blocks', category: 'Isometric',
    description: 'Random gaps and colored faces open up a stack of isometric blocks.',
    controls: [
      range('dimension', 'Grid dimension', 3, 14, 1, 8, 'Sets the width and depth of each level.'),
      range('layers', 'Layers', 2, 12, 1, 7, 'Sets the height of the stack.'), voxelGap(.26),
      range('density', 'Density', 0, 1, .01, .57, 'Sets how many potential positions retain cubes.'),
      select('distribution', 'Distribution', [['scatter', 'Scatter'], ['cloud', 'Clouds']], 'scatter', 'Chooses independent gaps or clusters.'),
      { ...range('cluster', 'Cluster scale', .1, 2.8, .02, .52, 'Higher values make the clusters finer.', true), enabled: values => values.distribution === 'cloud' },
    ],
    render: ctx => blockArray(ctx, 'scattered'),
  },
  {
    id: 'rounded-patchwork', name: 'Rounded Patchwork', category: 'Organic',
    description: 'Rounded blocks pack together like an arrangement of cut cloth.',
    controls: [
      ...grid(19, 17, 44),
      range('gap', 'Gutter', .02, .65, .01, .16, 'Creates breathing room between patches.'),
      range('radius', 'Corner radius', 0, .5, .01, .25, 'Rounds the corners of each patch.'),
      range('variance', 'Size variance', 1, 12, 1, 6, 'Allows larger patches over the base grid.'),
      select('corners', 'Corner treatment', [['scaled', 'Relative'], ['uniform', 'Uniform']], 'scaled', 'Makes rounding scale with each patch or share a common radius.', true),
      ...mask(),
    ],
    render: terrainPatches,
  },
  {
    id: 'eddy-dashes', name: 'Eddy Dashes', category: 'Flow', animated: true,
    description: 'A field of short marks turns in a winding current.',
    controls: [
      ...grid(28, 24, 58),
      range('scale', 'Flow detail', .5, 9, .1, 2.4, 'Larger values shrink the regions of uniform direction.'),
      range('length', 'Dash length', .2, 2.3, .02, 1.32, 'Extends each mark about its midpoint.'),
      range('weight', 'Dash weight', .04, .72, .01, .29, 'Changes the width of each dash.'),
      range('tilt', 'Heading', 0, 360, 1, 32, 'Rotates the direction of the entire field.', true),
      ...mask(),
    ],
    render: waveDashes,
  },
  {
    id: 'rising-arcs', name: 'Rising Arcs', category: 'Radial',
    description: 'Snap-angled bands get heavier as they move away from the center.',
    controls: [
      range('bands', 'Arc count', 2, 20, 1, 8, 'Sets the number of arcs.'),
      range('min-width', 'Inner weight', .5, 28, .5, 2.5, 'Sets the weight of the innermost arc.'),
      range('max-width', 'Outer weight', 1, 65, .5, 32, 'Sets the weight of the outermost arc.'),
      range('growth', 'Growth', .2, 5, .1, 1.4, 'Higher values concentrate the weight toward the last arcs.'),
      range('gap', 'Gap', 0, 24, .5, 8, 'Sets the space between successive arcs.'),
      range('start', 'Inner radius', 5, 190, 1, 54, 'Moves the whole band stack away from the center.'),
      range('step', 'Angle step', 5, 45, 1, 15, 'Sets the increment used to snap the start and end of an arc.', true),
      range('min-sweep', 'Minimum steps', 1, 14, 1, 4, 'Sets the shortest allowable sweep in angle steps.', true),
      range('max-sweep', 'Maximum steps', 2, 28, 1, 15, 'Sets the longest allowable sweep in angle steps.', true),
      range('bias', 'Bias angle', 0, 360, 1, 305, 'Turns the main direction of the stack.', true),
      range('focus', 'Alignment', 0, 1, .01, .51, 'Higher values bring the arc midpoints closer to the bias angle.', true),
    ],
    render: risingArcs,
  },
  {
    id: 'cropped-squares', name: 'Cropped Squares', category: 'Grid',
    description: 'Shifting squares show through a mosaic of hard-edged windows.',
    controls: [
      ...grid(14, 13, 36),
      range('scale', 'Noise detail', .5, 14, .1, 5.2, 'Breaks the square movement into tighter clusters.'),
      range('size', 'Square size', .2, 1.8, .01, .91, 'Scales the squares beneath the windows.'),
      range('shift', 'Translation', 0, 1.6, .01, .41, 'Changes how far the squares slide behind their windows.'),
      range('rotation', 'Rotation', 0, 180, 1, 51, 'Changes how far the squares can turn.'),
      range('shrink', 'Shrinkage', 0, .95, .01, .29, 'Lets the noise field shrink selected squares.'),
      ...mask(),
    ],
    render: ctx => squareField(ctx, 'crop'),
  },
  {
    id: 'rhombus-ribbons', name: 'Rhombus Ribbons', category: 'Isometric',
    description: 'Colored ribbons spread over a triangular mesh.',
    controls: [
      ...grid(16, 23, 48),
      range('weight', 'Mesh weight', 0, 5, .1, .9, 'Sets the width of the lines between facets.'),
      range('scale', 'Cluster detail', .4, 15, .1, 4.8, 'Changes how tightly the colored ribbon clusters repeat.'),
      range('density', 'Ribbon density', 0, 1, .01, .41, 'Changes the share of the mesh filled with ribbon facets.'),
      ...mask(),
    ],
    render: ribbonGrid,
  },
  {
    id: 'square-drift', name: 'Square Drift', category: 'Distortion',
    description: 'A regular grid gradually slips into tilted, displaced outlines.',
    controls: [
      ...grid(15, 16, 42),
      range('size', 'Square size', .18, 1.55, .01, .7, 'Sets the side length of each square relative to its cell.'),
      range('shift', 'Position drift', 0, 2.4, .02, 1.04, 'Moves squares horizontally and vertically.'),
      range('rotation', 'Angle drift', 0, 180, 1, 72, 'Changes the tilt of squares in the distorted part.'),
      range('scale', 'Noise detail', .5, 18, .1, 9.3, 'Higher values make neighboring marks less alike.', true),
      range('sharpness', 'Transition sharpness', 0, 1, .01, .18, 'Changes how abruptly the orderly rows begin to drift.', true),
      range('transition', 'Transition position', 0, 1, .01, .48, 'Moves the start of the distortion toward the bottom.', true),
      waveThickness(1.4),
    ],
    render: ctx => squareField(ctx, 'drift'),
  },
  {
    id: 'quarter-moons', name: 'Quarter Moons', category: 'Grid',
    description: 'Groups of separated sectors form partial circles across a tile grid.',
    controls: [
      ...grid(9, 9, 35),
      range('density', 'Density', 0, 1, .01, .62, 'Changes which proportion of quarters appear.'),
      range('gap', 'Circle gap', 0, .42, .01, .1, 'Shrinks each filled circle to make space between groups.'),
      range('split', 'Sector gap', 0, .26, .01, .04, 'Separates the quarters of each circle.'),
      ...mask(),
    ],
    render: quarterMoons,
  },
  {
    id: 'wave-convergence', name: 'Wave Convergence', category: 'Flow', animated: true,
    description: 'Parallel straight lines turn into overlapping sine waves.',
    controls: [
      range('lines', 'Line count', 2, 80, 1, 34, 'Sets how many traces span the field.'),
      range('width', 'Width', .25, 1, .01, .91, 'Sets the horizontal length of the field.'),
      range('amplitude', 'Amplitude', 0, .34, .01, .14, 'Changes the distance each wave rises and falls.'),
      range('spread', 'Line spread', .08, .88, .01, .58, 'Changes the spacing between the baselines.'),
      range('start-frequency', 'First trace frequency', .25, 8, .05, 1.2, 'Sets the cycle count of the first trace.'),
      range('end-frequency', 'Last trace frequency', .25, 18, .05, 4.4, 'Sets the cycle count of the last trace.'),
      range('onset', 'Fade start', 0, .95, .01, .14, 'Moves the point where flat lines begin to curve.'), waveThickness(1.4),
    ],
    render: ctx => lineWaves(ctx, 'converge'),
  },
  {
    id: 'signal-ridges', name: 'Signal Ridges', category: 'Flow',
    description: 'Stacked traces rise into ridges and flatten toward the margins.',
    controls: [
      range('lines', 'Line count', 4, 82, 1, 42, 'Adds horizontal traces to the stack.'),
      range('width', 'Width', .25, 1, .01, .9, 'Sets the horizontal span of each trace.'),
      range('amplitude', 'Amplitude', 0, .35, .01, .22, 'Increases the height of the ridges.'),
      range('frequency', 'Horizontal detail', .5, 16, .1, 7.4, 'Higher values produce finer peaks along the traces.'),
      range('variation', 'Trace variation', .1, 16, .1, 5.2, 'Higher values make neighboring traces less correlated.'),
      range('spread', 'Vertical spread', .13, .92, .01, .67, 'Pulls the baseline traces farther apart.'),
      range('focus', 'Horizontal focus', .1, 5, .1, 1.4, 'Tightens the ridges toward the horizontal center.', true),
      range('vertical', 'Vertical focus', .1, 5, .1, .7, 'Concentrates taller ridges near the middle rows.', true),
      range('detail', 'Samples', 16, 160, 1, 92, 'Adds points along each trace for smoother bends.', true), waveThickness(1.4),
    ],
    render: ctx => lineWaves(ctx, 'signal'),
  },
  {
    id: 'signal-lattice', name: 'Signal Lattice', category: 'Noise',
    description: 'A connected wireframe rises and folds toward its center.',
    controls: [
      ...grid(35, 31, 66), gridWarp(92),
      range('scale', 'Noise detail', .5, 16, .1, 6.7, 'Breaks the wireframe ridges into finer shapes.'),
      range('focus-x', 'Horizontal focus', .1, 5, .1, 1.5, 'Tightens the warp around the middle columns.'),
      range('focus-y', 'Vertical focus', .1, 5, .1, .8, 'Tightens the warp around the middle rows.'),
      range('span-x', 'Width', .24, 1, .01, .88, 'Adjusts the width of the underlying mesh.', true),
      range('span-y', 'Height', .24, 1, .01, .78, 'Adjusts the height of the underlying mesh.', true),
      select('connection', 'Connections', [['mesh', 'Mesh'], ['strokes', 'Rows only']], 'mesh', 'Shows both grid axes or only the horizontal traces.'), waveThickness(1.1),
    ],
    render: ctx => nodeMesh(ctx, 'pulse'),
  },
  {
    id: 'turning-arcs', name: 'Turning Arcs', category: 'Grid', animated: true,
    description: 'Open arcs rotate in a repeating rhythm across the canvas.',
    controls: [
      ...grid(12, 12, 42),
      range('gap', 'Gap', 0, .42, .01, .05, 'Sets the amount of space around each arc.'),
      range('sweep', 'Sweep', 30, 350, 1, 195, 'Sets the angle each outer arc covers.'),
      range('weight', 'Weight', .02, .25, .01, .08, 'Sets the line weight relative to the local tile size.'),
      range('twist', 'Turn per tile', 0, .75, .01, .12, 'Changes how much the direction rotates between neighbors.'),
      ...mask(),
    ],
    render: rotatingArcs,
  },
  {
    id: 'orbit-tangle', name: 'Orbit Tangle', category: 'Organic',
    description: 'Irregular overlapping contours gather around a loose center.',
    controls: [
      range('rings', 'Orbit count', 6, 95, 1, 44, 'Sets the number of intersecting contours.'),
      range('inner', 'Near radius', .02, .9, .01, .27, 'Sets the smallest starting radius.'),
      range('outer', 'Far radius', .02, 1, .01, .81, 'Sets the largest starting radius.'),
      range('warp', 'Wobble', 0, .43, .01, .22, 'Increases contour irregularity and drifting centers.'),
      range('scale', 'Contour detail', .2, 8, .1, 1.7, 'Increases the number of bends on each contour.', true), waveThickness(1.4),
    ],
    render: ctx => orbitContours(ctx, 'orbit'),
  },
  {
    id: 'growth-rings', name: 'Growth Rings', category: 'Organic',
    description: 'Nested contours share a subtle grain, like a cross section of wood.',
    controls: [
      range('rings', 'Ring count', 2, 84, 1, 34, 'Sets how many contours sit between the selected radii.'),
      range('inner', 'Inner radius', .02, .92, .01, .13, 'Opens a gap in the middle of the pattern.'),
      range('outer', 'Outer radius', .02, 1, .01, .85, 'Changes the reach of the largest contour.'),
      range('warp', 'Wobble', 0, .35, .01, .15, 'Moves the contours away from regular circles.'),
      range('scale', 'Grain detail', .2, 9, .1, 2.2, 'Changes how frequently each contour changes direction.', true), waveThickness(1.6),
    ],
    render: ctx => orbitContours(ctx, 'growth'),
  },
  {
    id: 'woven-lattice', name: 'Woven Lattice', category: 'Distortion',
    description: 'A rigid grid drifts into a loosely woven field.',
    controls: [
      range('size', 'Grid size', 5, 48, 1, 26, 'Sets the number of vertices along both sides.'),
      gridWarp(29),
      range('scale', 'Noise detail', .5, 18, .1, 4.6, 'Higher values compress the warp into localized bends.'),
      waveThickness(1.6), ...mask(),
    ],
    render: ctx => nodeMesh(ctx, 'weave'),
  },
  {
    id: 'beaded-mesh', name: 'Beaded Mesh', category: 'Distortion',
    description: 'Round beads punctuate the crossings of a distorted lattice.',
    controls: [
      range('size', 'Grid size', 5, 56, 1, 23, 'Sets how many points are available on each axis.'),
      gridWarp(35),
      range('scale', 'Noise detail', .5, 18, .1, 4.9, 'Changes the size of each warped region.'),
      range('bead', 'Bead radius', 0, 9, .2, 2.8, 'Changes the radius of the dots at each visible vertex.'),
      waveThickness(1.1), ...mask(),
    ],
    render: ctx => nodeMesh(ctx, 'beads'),
  },
  {
    id: 'cube-coil', name: 'Cube Coil', category: 'Isometric', animated: true,
    description: 'A chain of blocks swings around a vertical helix.',
    controls: [
      range('count', 'Cube count', 5, 110, 1, 32, 'Adds blocks along the stack.'),
      range('radius', 'Lateral spread', .25, 9, .05, 3.65, 'Widens the swing around the center axis.'),
      range('turns', 'Turns', .5, 9, .05, 2.7, 'Sets the number of turns from the first cube to the last.'),
      range('rise', 'Vertical spacing', .05, 1.6, .01, .55, 'Changes the elevation gained between successive cubes.'),
      range('size', 'Cube footprint', .2, 2.7, .05, 1.5, 'Changes the width and depth of each block.'),
      range('height', 'Cube height', .15, 2.8, .05, .85, 'Changes the height of each block independently.'),
    ],
    render: coil,
  },
];
