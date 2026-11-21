import { letterBoxes } from './lettering'
import { clamp, f, noise, range, select, text } from './model'
import type { PatternDefinition, RenderContext } from './model'

type Point = readonly [number, number]

const TAU = Math.PI * 2
const radians = (degrees: number) => (degrees * Math.PI) / 180
const fraction = (value: number) => value - Math.floor(value)
const mix = (a: number, b: number, weight: number) => a + (b - a) * weight
const lerp = (a: Point, b: Point, weight: number): Point => [mix(a[0], b[0], weight), mix(a[1], b[1], weight)]
const unit = (value: number) => clamp(value, 0, 1)
const position = ([x, y]: Point) => `${f(x)} ${f(y)}`

function seedAt(ctx: RenderContext, index: number, channel = 0): number {
  let hash = Math.imul(index + 1, 0x9e3779b1) ^ Math.imul(channel + 1, 0x85ebca6b) ^ ctx.seed
  hash = Math.imul(hash ^ (hash >>> 16), 0x45d9f3b)
  hash = Math.imul(hash ^ (hash >>> 16), 0x45d9f3b)
  return ((hash ^ (hash >>> 16)) >>> 0) / 4294967296
}

function polyline(points: Point[], closed = false): string {
  if (!points.length) return ''
  return `M${points.map(position).join('L')}${closed ? 'Z' : ''}`
}

function fillPath(d: string, fill: string, opacity = 1): string {
  return d ? `<path d="${d}" fill="${fill}" fill-opacity="${f(opacity)}"/>` : ''
}

function strokePath(d: string, stroke: string, width: number, opacity = 1): string {
  return d ? `<path d="${d}" fill="none" stroke="${stroke}" stroke-width="${f(width)}" stroke-opacity="${f(opacity)}" stroke-linecap="round" stroke-linejoin="round"/>` : ''
}

function rectangle(x: number, y: number, width: number, height: number): string {
  return width > 0 && height > 0 ? `M${f(x)} ${f(y)}h${f(width)}v${f(height)}h${f(-width)}Z` : ''
}

function circle(x: number, y: number, radius: number): string {
  if (radius < 0.1) return ''
  return `M${f(x - radius)} ${f(y)}a${f(radius)} ${f(radius)} 0 1 0 ${f(radius * 2)} 0a${f(radius)} ${f(radius)} 0 1 0 ${f(radius * -2)} 0Z`
}

function crop(x: number, y: number, width: number, height: number, viewBox: string, content: string): string {
  return `<svg x="${f(x)}" y="${f(y)}" width="${f(width)}" height="${f(height)}" viewBox="${viewBox}" preserveAspectRatio="none" overflow="hidden">${content}</svg>`
}

const columns = (initial: number, max = 42) => range('columns', 'Columns', 2, max, 1, initial, 'Number of cells across the canvas.')
const rows = (initial: number, max = 40) => range('rows', 'Rows', 2, max, 1, initial, 'Number of cells down the canvas.')

const radialBurst: PatternDefinition = {
  id: 'radial-burst',
  name: 'Radial Burst',
  category: 'Radial',
  description: 'A burst of solid rays with irregular tips and gaps that travel outward.',
  animated: true,
  controls: [
    range('rays', 'Ray count', 5, 130, 1, 53, 'Sets the number of evenly spaced rays.'),
    range('width', 'Ray width', 0.005, 0.085, 0.001, 0.026, 'Sets ray thickness as a fraction of the canvas.'),
    range('radius', 'Reach', 0.18, 0.76, 0.01, 0.46, 'Moves the tips away from the centre.'),
    range('inner', 'Inner radius', 0, 0.66, 0.01, 0.23, 'Opens the area around the origin.'),
    range('breaks', 'Breaks', 0, 8, 1, 2, 'Sets the number of gaps along each ray.'),
    range('taper', 'Taper', -1, 1, 0.01, -0.43, 'Positive values narrow the tips. Negative values narrow the roots.'),
    range('x', 'Origin X', 0, 1, 0.01, 0.5, 'Moves the origin from left to right.', true),
    range('y', 'Origin Y', 0, 1, 0.01, 0.51, 'Moves the origin from top to bottom.', true),
    range('fray', 'Fray', 0, 1, 0.01, 0.54, 'Varies root and tip lengths.', true),
    range('tilt', 'Tilt', 0, 30, 0.25, 3, 'Varies the angle of individual rays.', true),
    range('drift', 'Sideways drift', 0, 1, 0.01, 0.16, 'Slides individual rays sideways without shifting the origin.', true),
    range('width-variation', 'Width variation', 0, 1, 0.01, 0.48, 'Broadens the range of ray thicknesses.', true),
  ],
  render(ctx) {
    const side = Math.min(ctx.width, ctx.height)
    const cx = ctx.width * ctx.n('x')
    const cy = ctx.height * ctx.n('y')
    const reach = side * ctx.n('radius')
    const inner = reach * ctx.n('inner')
    const rayCount = ctx.n('rays')
    const baseWidth = ctx.n('width') * side
    const taper = ctx.n('taper')
    const fray = ctx.n('fray')
    const breaks = ctx.n('breaks')
    const primary: string[] = []
    const accents: string[] = []

    for (let i = 0; i < rayCount; i++) {
      const angle = i * TAU / rayCount - Math.PI / 2
      const offset = (seedAt(ctx, i, 1) - 0.5) * baseWidth * ctx.n('drift') * 3
      const root = inner + reach * fray * (seedAt(ctx, i, 2) - 0.3) * 0.29
      const tip = reach * (1 - 0.46 * fray * seedAt(ctx, i, 3))
      const twist = radians(ctx.n('tilt')) * (seedAt(ctx, i, 4) - 0.5) * 2
      const direction = angle + twist
      const size = baseWidth * (1 + (seedAt(ctx, i, 5) - 0.5) * ctx.n('width-variation') * 1.5)
      const rootX = cx + Math.max(0, root) * Math.cos(angle) - offset * Math.sin(angle)
      const rootY = cy + Math.max(0, root) * Math.sin(angle) + offset * Math.cos(angle)
      const length = Math.max(reach * 0.04, tip - Math.max(0, root))
      const point = (t: number, sideSign: number): Point => {
        const halfWidth = size * (1 + taper * (1 - 2 * t) * 0.88) / 2
        return [rootX + t * length * Math.cos(direction) - sideSign * halfWidth * Math.sin(direction),
          rootY + t * length * Math.sin(direction) + sideSign * halfWidth * Math.cos(direction)]
      }

      const gaps: [number, number][] = []
      const gapWidth = 0.14 / (1 + breaks * 0.38)
      for (let gap = 0; gap < breaks; gap++) {
        const centre = fraction((gap + 1 + seedAt(ctx, i + gap * 131, 6) * 0.32) / (breaks + 1) + ctx.phase)
        const start = centre - gapWidth / 2
        const end = centre + gapWidth / 2
        gaps.push([unit(start), unit(end)])
        if (start < 0) gaps.push([start + 1, 1])
        if (end > 1) gaps.push([0, end - 1])
      }
      gaps.sort((a, b) => a[0] - b[0])
      gaps.push([1, 1])
      const target = i % 11 === 1 ? accents : primary
      let cursor = 0
      for (const [start, end] of gaps) {
        if (start - cursor >= 0.008) {
          target.push(polyline([point(cursor, 1), point(start, 1), point(start, -1), point(cursor, -1)], true))
        }
        cursor = Math.max(cursor, end)
      }
    }
    return fillPath(primary.join(''), ctx.ink) + fillPath(accents.join(''), ctx.accent)
  },
}

function recede(value: number, shape: string): number {
  if (shape === 'ease') return value * value * (3 - 2 * value)
  if (shape === 'power') return Math.pow(value, 2.3)
  if (shape === 'stairs') return Math.floor(value * 6) / 6
  if (shape === 'wave') return unit(value + Math.sin(value * TAU * 1.5) * 0.14)
  return value
}

const recedingBands: PatternDefinition = {
  id: 'receding-bands',
  name: 'Receding Bands',
  category: 'Grid',
  description: 'Segmented rows get narrower and shift sideways to form a receding plane.',
  controls: [
    range('bands', 'Band count', 3, 42, 1, 17, 'Sets the number of stacked strips.'),
    select('orientation', 'Orientation', [['horizontal', 'Horizontal'], ['vertical', 'Vertical']], 'horizontal', 'Turns the bands across or down the sheet.'),
    select('curve', 'Depth curve', [['linear', 'Linear'], ['ease', 'Ease'], ['power', 'Power'], ['stairs', 'Steps'], ['wave', 'Wave']], 'ease', 'Changes how the perspective progresses across the bands.'),
    range('cell', 'Cell length', 0.045, 0.45, 0.005, 0.2, 'Controls the width of segments within a band.'),
    range('gap', 'Band gap', 0, 0.72, 0.01, 0.15, 'Separates neighboring bands.'),
    range('depth', 'Depth', -1, 1, 0.01, 0.76, 'Changes how much the bands and segments taper.', true),
    range('shift', 'Shift', -1, 1, 0.01, 0.58, 'Sets the distance and direction the starting edges move.', true),
    range('fade', 'Fade', 0, 1, 0.01, 0.6, 'Fades each cell from a solid edge into lower opacity.', true),
  ],
  render(ctx) {
    const vertical = ctx.s('orientation') === 'vertical'
    const width = vertical ? ctx.height : ctx.width
    const height = vertical ? ctx.width : ctx.height
    const count = ctx.n('bands')
    const curve = ctx.s('curve')
    const depth = ctx.n('depth')
    const progress = Array.from({ length: count }, (_, index) => recede(index / (count - 1), curve))
    const weights = progress.map((amount) => 1 - 0.82 * Math.abs(depth) * (depth < 0 ? 1 - amount : amount))
    const total = weights.reduce((sum, value) => sum + value, 0)
    const fade = ctx.n('fade')
    const bands: string[] = []
    let y = height * 0.10

    for (let row = 0; row < count; row++) {
      const slot = (height * 0.8 * weights[row]) / total
      const bandHeight = slot * (1 - ctx.n('gap'))
      const cellLength = width * ctx.n('cell') * weights[row]
      const offset = width * (0.12 + Math.max(0, ctx.n('shift')) * progress[row] * 0.40 + Math.max(0, -ctx.n('shift')) * (1 - progress[row]) * 0.4)
      const segments = Math.ceil((width * 0.90 - offset) / cellLength)
      const steps = fade ? 6 : 1
      const paths = Array.from({ length: steps }, () => ({ ink: '', accent: '' }))

      for (let cell = 0; cell < segments; cell++) {
        const x = offset + cell * cellLength
        const length = Math.min(width * 0.9 - x, cellLength * 0.95)
        for (let step = 0; step < steps; step++) {
          const key = (row + cell) % 5 === 0 ? 'accent' : 'ink'
          paths[step][key] += rectangle(x + (step * length) / steps, y, length / steps, bandHeight)
        }
      }
      for (const [index, path] of paths.entries()) {
        const opacity = 1 - fade * (index / steps)
        bands.push(fillPath(path.ink, ctx.ink, opacity), fillPath(path.accent, ctx.accent, opacity))
      }
      y += slot
    }
    return vertical ? `<g transform="matrix(0 1 1 0 0 0)">${bands.join('')}</g>` : bands.join('')
  },
}

const slidingTiles: PatternDefinition = {
  id: 'sliding-tiles',
  name: 'Sliding Tiles',
  category: 'Grid',
  description: 'Cut shapes cross a tile field in a synchronized or staggered loop.',
  animated: true,
  controls: [
    columns(8, 32),
    rows(6, 32),
    select('shape', 'Shape', [['half-disc', 'Half disc'], ['wedge', 'Wedge'], ['pill', 'Pill']], 'half-disc', 'Chooses the moving form inside each tile.'),
    select('direction', 'Travel direction', [['random', 'Random'], ['horizontal', 'Horizontal'], ['vertical', 'Vertical'], ['alternate', 'Alternating rows']], 'alternate', 'Sets the directions the tile shapes travel.'),
    range('stagger', 'Stagger', 0, 2, 0.01, 0.77, 'Spreads motion timing across the grid.'),
    range('move', 'Travel duration', 0.14, 1, 0.01, 0.7, 'Short values give a quick slide and a longer hold.', true),
    range('gap', 'Gutter', 0, 0.35, 0.01, 0.04, 'Opens a margin around every tile.', true),
    {
      ...range('stagger-angle', 'Stagger angle', 0, 360, 1, 28, 'Rotates the direction in which the stagger spreads.', true),
      enabled: (values) => Number(values.stagger) > 0,
    },
  ],
  render(ctx) {
    const cols = ctx.n('columns')
    const count = ctx.n('rows')
    const width = ctx.width * 0.84 / cols
    const height = ctx.height * 0.84 / count
    const gap = ctx.n('gap')
    const stagger = ctx.n('stagger')
    const staggerAngle = radians(ctx.n('stagger-angle'))
    const direction = ctx.s('direction')
    const shape = ctx.s('shape')
    const tiles: string[] = []
    const silhouettes: Record<string, string> = {
      'half-disc': 'M0 50a50 50 0 1 1 100 0Z',
      wedge: 'M0 60L50 0l50 60Z',
      pill: 'M23 18h54a23 23 0 1 1 0 46H23a23 23 0 1 1 0-46Z',
    }

    for (let row = 0; row < count; row++) {
      for (let col = 0; col < cols; col++) {
        const index = row * cols + col
        const x = ctx.width * 0.08 + (col + gap / 2) * width
        const y = ctx.height * 0.08 + (row + gap / 2) * height
        const delay = (col / cols * Math.cos(staggerAngle) + row / count * Math.sin(staggerAngle)) * stagger
        const elapsed = fraction(ctx.phase + 0.46 - delay)
        const move = unit(elapsed / ctx.n('move'))
        const advance = recede(move, 'ease') * 100
        const tone = seedAt(ctx, index, 1) > 0.43 ? ctx.ink : ctx.accent
        const turn = direction === 'random' ? Math.floor(seedAt(ctx, index) * 3.999) * 90
          : direction === 'horizontal' ? 90 : direction === 'alternate' && row % 2 ? 270 : 0
        const silhouette = silhouettes[shape] ?? silhouettes['half-disc']
        const movers = [-100, 0, 100].map((offset) => `<path d="${silhouette}" transform="translate(0 ${f(offset + advance)})" fill="${tone}"/>`).join('')
        const content = `<rect width="100" height="100" fill="${tone}" opacity="0.14"/><g transform="rotate(${turn} 50 50)">${movers}</g>`
        tiles.push(crop(x, y, width * (1 - gap), height * (1 - gap), '0 0 100 100', content))
      }
    }
    return tiles.join('')
  },
}

const shiftedCells: PatternDefinition = {
  id: 'shifted-cells',
  name: 'Shifted Cells',
  category: 'Grid',
  description: 'Rounded plates shift inside clipped tiles and gather into a large-scale field.',
  animated: true,
  controls: [
    columns(11, 32),
    rows(9, 32),
    range('size', 'Plate size', 0.15, 1.75, 0.01, 1.04, 'Sets the size of each rounded plate.'),
    range('roundness', 'Roundness', 0, 1, 0.01, 0.9, 'Rounds the plate corners.'),
    range('shift', 'Shift', 0, 1.5, 0.01, 0.63, 'Moves each plate through its tile.'),
    range('radial', 'Radial pull', 0, 1, 0.01, 0.74, 'Blends parallel travel with movement toward the centre.'),
    {
      ...range('angle', 'Sweep angle', 0, 360, 1, 25, 'Rotates the direction of the parallel sweep.', true),
      enabled: (values) => Number(values.radial) < 1 && Number(values.shift) > 0,
    },
    range('gutter', 'Gutter', 0, 0.32, 0.01, 0.09, 'Adds even space around the clipped tiles.', true),
  ],
  render(ctx) {
    const cols = ctx.n('columns')
    const count = ctx.n('rows')
    const width = ctx.width * 0.86 / cols
    const height = ctx.height * 0.86 / count
    const gap = ctx.n('gutter')
    const size = ctx.n('size') * 100
    const radius = ctx.n('roundness') * size / 2
    const shift = ctx.n('shift') * 70
    const radial = ctx.n('radial')
    const angle = radians(ctx.n('angle'))
    const shapes: string[] = []

    for (let row = 0; row < count; row++) {
      for (let col = 0; col < cols; col++) {
        const px = (col + 0.5) / cols - 0.5
        const py = (row + 0.5) / count - 0.5
        const wave = Math.sin((px * Math.cos(angle) + py * Math.sin(angle) + ctx.phase) * TAU)
        const dx = shift * mix(wave * Math.cos(angle), -2 * px, radial)
        const dy = shift * mix(wave * Math.sin(angle), -2 * py, radial)
        const x = ctx.width * 0.07 + (col + gap / 2) * width
        const y = ctx.height * 0.07 + (row + gap / 2) * height
        const fill = (row + 2 * col) % 7 === 0 ? ctx.accent : ctx.ink
        const content = `<rect x="${f(50 - size / 2 + dx)}" y="${f(50 - size / 2 + dy)}" width="${f(size)}" height="${f(size)}" rx="${f(radius)}" fill="${fill}"/>`
        shapes.push(crop(x, y, width * (1 - gap), height * (1 - gap), '0 0 100 100', content))
      }
    }
    return shapes.join('')
  },
}

function corneredSquare(x: number, y: number, size: number, rounding: number, corners: boolean[]): string {
  const [tl, tr, br, bl] = corners.map((rounded) => rounded ? rounding * size / 2 : 0)
  return `M${f(x + tl)} ${f(y)}H${f(x + size - tr)}Q${f(x + size)} ${f(y)} ${f(x + size)} ${f(y + tr)}V${f(y + size - br)}Q${f(x + size)} ${f(y + size)} ${f(x + size - br)} ${f(y + size)}H${f(x + bl)}Q${f(x)} ${f(y + size)} ${f(x)} ${f(y + size - bl)}V${f(y + tl)}Q${f(x)} ${f(y)} ${f(x + tl)} ${f(y)}Z`
}

const roundedPacking: PatternDefinition = {
  id: 'rounded-packing',
  name: 'Rounded Packing',
  category: 'Grid',
  description: 'Large and small corner-rounded squares nest on a seeded lattice.',
  controls: [
    columns(8, 30),
    rows(7, 30),
    range('max-size', 'Largest square', 1, 5, 1, 3, 'Allows larger tiles to occupy multiple base cells.'),
    range('roundness', 'Roundness', 0, 1, 0.01, 1, 'Rounds each selected corner.'),
    range('corners', 'Rounded corners', 0, 4, 1, 3, 'Sets the usual number of corners to round.'),
    range('mixed', 'Corner variation', 0, 1, 0.01, 0.45, 'Lets some squares choose a different corner count.', true),
    range('fill', 'Coverage', 0, 1, 0.01, 0.88, 'Sets the share of packed tiles that remain visible.', true),
    range('gap', 'Gutter', 0, 0.46, 0.01, 0.06, 'Adds space between packed squares.', true),
    range('angle', 'Orientation', 0, 3, 1, 0, 'Turns the corner layout in quarter turns.', true),
  ],
  render(ctx) {
    const cols = ctx.n('columns')
    const count = ctx.n('rows')
    const cell = Math.min(ctx.width * 0.87 / cols, ctx.height * 0.87 / count)
    const gutter = cell * ctx.n('gap')
    const originX = (ctx.width - cols * cell) / 2
    const originY = (ctx.height - count * cell) / 2
    const used = new Uint8Array(cols * count)
    const ink: string[] = []
    const accent: string[] = []

    for (let row = 0; row < count; row++) {
      for (let col = 0; col < cols; col++) {
        const index = row * cols + col
        if (used[index]) continue
        let span = Math.min(cols - col, count - row, 1 + Math.floor(seedAt(ctx, index) * ctx.n('max-size') * 0.999))
        const fits = (size: number) => {
          for (let dy = 0; dy < size; dy++) {
            for (let dx = 0; dx < size; dx++) {
              if (used[(row + dy) * cols + col + dx]) return false
            }
          }
          return true
        }
        while (span > 1 && !fits(span)) span--
        for (let dy = 0; dy < span; dy++) used.fill(1, (row + dy) * cols + col, (row + dy) * cols + col + span)
        if (seedAt(ctx, index, 1) > ctx.n('fill')) continue
        const cornerCount = seedAt(ctx, index, 2) < ctx.n('mixed') ? Math.floor(seedAt(ctx, index, 3) * 4.999) : ctx.n('corners')
        const start = ctx.n('angle') + Math.floor(seedAt(ctx, index, 4) * 3.999)
        const corners = Array.from({ length: 4 }, (_, corner) => ((corner - start + 8) % 4) < cornerCount)
        const target = (index + span * 2) % 7 < 2 ? accent : ink
        target.push(corneredSquare(originX + col * cell + gutter / 2, originY + row * cell + gutter / 2, span * cell - gutter, ctx.n('roundness'), corners))
      }
    }
    return fillPath(ink.join(''), ctx.ink) + fillPath(accent.join(''), ctx.accent)
  },
}

const pixelField: PatternDefinition = {
  id: 'pixel-field',
  name: 'Pixel Field',
  category: 'Radial',
  description: 'A grid of tiny shapes changes size around a movable focal point.',
  controls: [
    columns(32, 80),
    rows(25, 75),
    select('shape', 'Pixel shape', [['circle', 'Circle'], ['square', 'Square'], ['diamond', 'Diamond'], ['horizontal', 'Horizontal bar'], ['vertical', 'Vertical bar']], 'circle'),
    range('x', 'Focus X', -0.25, 1.25, 0.01, 0.53, 'Moves the centre of the field horizontally.'),
    range('y', 'Focus Y', -0.25, 1.25, 0.01, 0.46, 'Moves the centre of the field vertically.'),
    range('spread', 'Spread', 0.16, 1.5, 0.01, 0.74, 'Expands the distance over which pixels change size.'),
    range('falloff', 'Falloff', 0.25, 4, 0.05, 1.25, 'Adjusts how quickly pixels shrink within the gradient.', true),
    range('cutoff', 'Cutoff', 0, 0.96, 0.01, 0.07, 'Removes pixels below the selected size.', true),
    range('steps', 'Size levels', 0, 12, 1, 0, 'Snaps pixel sizes to discrete steps. Zero keeps the gradient continuous.', true),
    range('noise', 'Noise', 0, 1, 0.01, 0.23, 'Adds smooth variation to the pattern.', true),
    {
      ...range('noise-scale', 'Noise frequency', 0.4, 12, 0.1, 5.4, 'Makes the size variation finer or coarser.', true),
      enabled: (values) => Number(values.noise) > 0,
    },
    select('invert', 'Emphasis', [['centre', 'Full centre'], ['edges', 'Open centre']], 'edges', 'Switches between a solid focus and a hollow focus.', true),
  ],
  render(ctx) {
    const cols = ctx.n('columns')
    const count = ctx.n('rows')
    const width = ctx.width * 0.89 / cols
    const height = ctx.height * 0.89 / count
    const side = Math.min(ctx.width, ctx.height)
    const step = ctx.n('steps')
    const grain = ctx.n('noise')
    const scale = ctx.n('noise-scale')
    const shape = ctx.s('shape')
    const invert = ctx.s('invert') === 'edges'
    const ink: string[] = []
    const accent: string[] = []

    for (let row = 0; row < count; row++) {
      for (let col = 0; col < cols; col++) {
        const x = ctx.width * 0.055 + (col + 0.5) * width
        const y = ctx.height * 0.055 + (row + 0.5) * height
        const distance = Math.hypot(x - ctx.n('x') * ctx.width, y - ctx.n('y') * ctx.height)
        const value = Math.pow(unit(1 - distance / (side * ctx.n('spread'))), ctx.n('falloff'))
        const perturbation = grain ? noise(col / cols * scale, row / count * scale, ctx.seed) * grain * 0.52 : 0
        let size = unit((invert ? 1 - value : value) + perturbation)
        if (step) size = Math.round(size * step) / step
        if (size <= ctx.n('cutoff')) continue
        const radius = size * Math.min(width, height) * 0.47
        const target = size < 0.28 ? accent : ink
        if (shape === 'diamond') target.push(polyline([[x, y - radius], [x + radius, y], [x, y + radius], [x - radius, y]], true))
        else if (shape === 'square') target.push(rectangle(x - radius, y - radius, 2 * radius, 2 * radius))
        else if (shape === 'horizontal') target.push(rectangle(x - radius, y - radius * 0.36, 2 * radius, 0.72 * radius))
        else if (shape === 'vertical') target.push(rectangle(x - radius * 0.36, y - radius, 0.72 * radius, 2 * radius))
        else target.push(circle(x, y, radius))
      }
    }
    return fillPath(ink.join(''), ctx.ink) + fillPath(accent.join(''), ctx.accent)
  },
}

const coilSweep: PatternDefinition = {
  id: 'coil-sweep',
  name: 'Coil Sweep',
  category: 'Organic',
  description: 'Cross-sections along a projected knot accumulate into a sculptural ribbon.',
  animated: true,
  controls: [
    range('slices', 'Slices', 15, 400, 1, 148, 'Sets how many sections are placed along the path.'),
    range('windings', 'Windings', 1, 6, 1, 2, 'Sets the number of trips around the main ring.'),
    range('loops', 'Loops', 0, 12, 1, 5, 'Adds smaller coils within the ring.'),
    range('depth', 'Coil depth', 0, 0.76, 0.01, 0.28, 'Increases the height and outward reach of the coils.'),
    range('thickness', 'Section width', 0.035, 0.4, 0.005, 0.12, 'Scales the cross-section relative to the canvas.'),
    select('section', 'Section', [['oval', 'Oval'], ['slab', 'Slab']], 'oval', 'Chooses a rounded or angular cross-section.'),
    range('tilt', 'View tilt', -85, 85, 1, -37, 'Tilts the knot toward or away from the viewer.', true),
    range('twist', 'Twist', -8, 8, 0.1, 1.2, 'Turns the sections along the sweep.', true),
    range('squash', 'Section ratio', 0.1, 1, 0.01, 0.29, 'Flattens or thickens the section’s second axis.', true),
    range('sweep', 'Sweep', 0.1, 1, 0.01, 0.91, 'Controls how much of the full path is visible.', true),
  ],
  render(ctx) {
    const side = Math.min(ctx.width, ctx.height)
    const tilt = radians(ctx.n('tilt'))
    const windings = ctx.n('windings')
    const loops = ctx.n('loops')
    const depth = ctx.n('depth')
    const spin = ctx.phase * TAU
    const radius = side * 0.3
    const section = side * ctx.n('thickness') * 0.5
    const count = ctx.n('slices')
    const point = (t: number) => {
      const pathAngle = t * windings + spin
      const coilAngle = t * loops
      const distance = radius * (1 + depth * Math.cos(coilAngle))
      const x = distance * Math.cos(pathAngle)
      const z = distance * Math.sin(pathAngle)
      const y = radius * depth * Math.sin(coilAngle)
      return { x, y: y * Math.cos(tilt) - z * Math.sin(tilt), depth: y * Math.sin(tilt) + z * Math.cos(tilt) }
    }
    const slices = Array.from({ length: count }, (_, index) => {
      const t = index / (count - 1) * TAU * ctx.n('sweep')
      const p = point(t)
      const next = point(t + 0.001)
      const angle = (Math.atan2(next.y - p.y, next.x - p.x) + t * ctx.n('twist')) * 180 / Math.PI
      const scale = 1 + p.depth / side * 0.57
      return { x: ctx.width / 2 + p.x * scale, y: ctx.height / 2 + p.y * scale, depth: p.depth, radius: section * scale, angle, accent: index % 9 === 0 }
    })
    slices.sort((a, b) => a.depth - b.depth)
    return slices.map(({ x, y, radius: rx, angle, accent }) => {
      const ry = rx * ctx.n('squash')
      const fill = accent ? ctx.accent : ctx.ink
      const attributes = `fill="${fill}" fill-opacity="${accent ? 0.35 : 0.16}" stroke="${fill}" stroke-width="${f(side * 0.0015)}" transform="rotate(${f(angle)} ${f(x)} ${f(y)})"`
      return ctx.s('section') === 'slab'
        ? `<rect x="${f(x - rx)}" y="${f(y - ry)}" width="${f(2 * rx)}" height="${f(2 * ry)}" ${attributes}/>`
        : `<ellipse cx="${f(x)}" cy="${f(y)}" rx="${f(rx)}" ry="${f(ry)}" ${attributes}/>`
    }).join('')
  },
}

const slicedTypography: PatternDefinition = {
  id: 'sliced-typography',
  name: 'Sliced Typography',
  category: 'Type',
  description: 'A line of vector lettering splits into windows that shift and occasionally turn.',
  controls: [
    text('word', 'Text', 'SHAPES', 'Changes the lettering being sliced.', 22),
    select('font', 'Lettering', [['block', 'Block'], ['mono', 'Grid']], 'block', 'Changes the construction of the letters.'),
    range('slices', 'Columns', 3, 32, 1, 16, 'Sets the number of windows across the lettering.'),
    range('rows', 'Rows', 2, 10, 1, 4, 'Splits the lettering into this many bands.'),
    range('shift', 'Shift per row', -0.85, 0.85, 0.01, 0.23, 'Slips each band sideways by a different amount.'),
    range('jitter', 'Jitter', 0, 1, 0.01, 0.35, 'Adds seeded movement to individual windows.', true),
    range('turn', 'Turned cells', 0, 1, 0.01, 0.14, 'Sets the share of cells turned a quarter turn.', true),
    range('gutter', 'Gutter', 0, 0.48, 0.01, 0.09, 'Separates the cropped slices.', true),
  ],
  render(ctx) {
    const cols = ctx.n('slices')
    const count = ctx.n('rows')
    const width = ctx.width * 0.77
    const height = ctx.height * 0.55
    const cellWidth = width / cols
    const cellHeight = height / count
    const gap = ctx.n('gutter')
    const boxes = letterBoxes(ctx.s('word'), 0, 0, width, height, ctx.s('font') === 'mono' ? 'mono' : 'block')
    if (!boxes.length) return ''
    const letters: string[] = []

    for (let row = 0; row < count; row++) {
      for (let col = 0; col < cols; col++) {
        const tileX = col * cellWidth
        const tileY = row * cellHeight
        const index = row * cols + col
        const shift = (row / (count - 1) - 0.5) * ctx.n('shift') * width * 0.25
        const dx = (seedAt(ctx, index, 1) - 0.5) * cellWidth * ctx.n('jitter')
        const dy = (seedAt(ctx, index, 2) - 0.5) * cellHeight * ctx.n('jitter') * 0.57
        const cropWidth = cellWidth * (1 - gap)
        const cropHeight = cellHeight * (1 - gap)
        const turn = seedAt(ctx, index, 3) < ctx.n('turn')
        const x = (ctx.width - width) / 2 + tileX + dx + shift
        const y = (ctx.height - height) / 2 + tileY + dy
        const fill = turn ? ctx.accent : ctx.ink
        const pieces = boxes.map((box) => {
          const left = Math.max(tileX, box.x)
          const top = Math.max(tileY, box.y)
          const right = Math.min(tileX + cropWidth, box.x + box.width)
          const bottom = Math.min(tileY + cropHeight, box.y + box.height)
          return rectangle(x + left - tileX, y + top - tileY, right - left, bottom - top)
        }).join('')
        if (!pieces) continue
        const shape = fillPath(pieces, fill)
        const rotation = (seedAt(ctx, index, 4) >= 0.5 ? 1 : -1) * 90
        letters.push(turn ? `<g transform="rotate(${rotation} ${f(x + cropWidth / 2)} ${f(y + cropHeight / 2)})">${shape}</g>` : shape)
      }
    }
    return letters.join('')
  },
}

const hexTransit: PatternDefinition = {
  id: 'hex-transit',
  name: 'Hex Transit',
  category: 'Flow',
  description: 'Parallel routes enter and leave the sides of a flexible hexagonal lattice.',
  controls: [
    columns(18, 44),
    rows(12, 32),
    range('strands', 'Lines per bundle', 1, 14, 1, 6, 'Sets how many parallel strands cross each occupied cell.'),
    range('density', 'Coverage', 0, 1, 0.01, 0.75, 'Sets the proportion of cells carrying routes.'),
    range('warp', 'Warp', 0, 1, 0.01, 0.44, 'Bends the lattice while keeping shared vertices together.'),
    range('carry', 'Route continuity', 0, 1, 0.01, 0.8, 'Moves from independent cell directions to longer runs.', true),
    range('bend', 'Bend', 0, 1, 0.01, 0.69, 'Curves the routes through each cell.', true),
    range('outlines', 'Cell outlines', 0, 1, 0.01, 0.19, 'Changes the visibility of the honeycomb edges.', true),
  ],
  render(ctx) {
    const cols = ctx.n('columns')
    const count = ctx.n('rows')
    const sx = ctx.width * 0.83 / (Math.sqrt(3) * (cols + 0.5))
    const sy = ctx.height * 0.83 / (1.5 * count + 0.5)
    const strands = ctx.n('strands')
    const warp = ctx.n('warp')
    const carry = ctx.n('carry')
    const wire: string[] = []
    const ink: string[] = []
    const accent: string[] = []

    const distort = (x: number, y: number): Point => [
      x + noise(x / ctx.width * 4.4, y / ctx.height * 4.4, ctx.seed) * sx * warp * 2.3,
      y + noise(x / ctx.width * 4.4 + 19, y / ctx.height * 4.4 - 9, ctx.seed) * sy * warp * 2.3,
    ]

    for (let row = 0; row < count; row++) {
      for (let col = 0; col < cols; col++) {
        const id = row * cols + col
        const x = ctx.width * 0.085 + (col + 0.5 + (row % 2) / 2) * Math.sqrt(3) * sx
        const y = ctx.height * 0.085 + (row * 1.5 + 1) * sy
        const points = Array.from({ length: 6 }, (_, index) => {
          const angle = index * TAU / 6 - Math.PI / 2
          return distort(x + sx * Math.cos(angle), y + sy * Math.sin(angle))
        })
        if (ctx.n('outlines') > 0) wire.push(polyline(points, true))
        const neighbor = unit(0.5 + noise(col * 0.39, row * 0.39, ctx.seed) * 0.68)
        if (mix(seedAt(ctx, id), neighbor, carry) > ctx.n('density')) continue
        const from = Math.min(5, Math.floor(mix(seedAt(ctx, id, 1), neighbor, carry) * 6))
        const to = (from + (seedAt(ctx, id, 2) < 0.48 ? 2 : 3)) % 6
        const target = (row + col * 2) % 7 < 2 ? accent : ink
        const middle = distort(x, y)

        for (let i = 0; i < strands; i++) {
          const t = (i + 1) / (strands + 1)
          const start = lerp(points[from], points[(from + 1) % 6], t)
          const end = lerp(points[to], points[(to + 1) % 6], 1 - t)
          const control = lerp(lerp(start, end, 0.5), middle, ctx.n('bend'))
          target.push(`M${position(start)}Q${position(control)} ${position(end)}`)
        }
      }
    }
    const width = Math.max(0.45, Math.min(sx, sy) * 0.086)
    return strokePath(wire.join(''), ctx.ink, width * 0.62, ctx.n('outlines')) + strokePath(ink.join(''), ctx.ink, width) + strokePath(accent.join(''), ctx.accent, width)
  },
}

function warpedGrid(ctx: RenderContext, cols: number, count: number, amount: number): Point[][] {
  const stepX = ctx.width * 0.82 / cols
  const stepY = ctx.height * 0.82 / count
  return Array.from({ length: count + 1 }, (_, row) => Array.from({ length: cols + 1 }, (_, col): Point => {
    const horizontal = col === 0 || col === cols ? 0 : noise(col * 0.39, row * 0.32, ctx.seed)
    const vertical = row === 0 || row === count ? 0 : noise(col * 0.32 + 47, row * 0.39 - 35, ctx.seed)
    return [ctx.width * 0.09 + stepX * (col + horizontal * amount), ctx.height * 0.09 + stepY * (row + vertical * amount)]
  }))
}

const ribbonLattice: PatternDefinition = {
  id: 'ribbon-lattice',
  name: 'Ribbon Lattice',
  category: 'Distortion',
  description: 'Flat bands braid through a warped grid and turn at tile corners.',
  controls: [
    columns(12, 29),
    rows(10, 29),
    range('divisions', 'Bands per tile', 2, 15, 1, 6, 'Adds more ribbons inside each cell.'),
    range('warp', 'Warp', 0, 1.1, 0.01, 0.83, 'Moves the corners of the grid away from their regular positions.'),
    range('ratio', 'Ribbon width', 0.12, 0.92, 0.01, 0.55, 'Changes the balance between the ribbons and open gaps.'),
    range('direction', 'Turn balance', 0, 1, 0.01, 0.51, 'Sets the proportion of cells that turn in one direction.', true),
    range('variation', 'Band variation', 0, 1, 0.01, 0.34, 'Makes the band thickness vary within the lattice.', true),
  ],
  render(ctx) {
    const cols = ctx.n('columns')
    const count = ctx.n('rows')
    const points = warpedGrid(ctx, cols, count, ctx.n('warp'))
    const divisions = ctx.n('divisions')
    const ink: string[] = []
    const accent: string[] = []

    for (let row = 0; row < count; row++) {
      for (let col = 0; col < cols; col++) {
        const id = row * cols + col
        const a = points[row][col]
        const b = points[row][col + 1]
        const c = points[row + 1][col + 1]
        const d = points[row + 1][col]
        const reversed = seedAt(ctx, id, 2) > ctx.n('direction')
        const pointA = reversed ? b : a
        const pointB = reversed ? a : b
        const pointD = reversed ? c : d
        const pointC = reversed ? d : c

        for (let band = 0; band < divisions; band++) {
          const start = band / divisions
          const ratio = unit(ctx.n('ratio') * (1 + (seedAt(ctx, band, 4) - 0.5) * ctx.n('variation')))
          const end = (band + ratio) / divisions
          const target = (row + col + band) % 8 === 0 ? accent : ink
          const one = lerp(pointA, pointB, start)
          const two = lerp(pointA, pointB, end)
          const three = lerp(pointC, pointB, end)
          const four = lerp(pointC, pointB, start)
          const inner = lerp(pointD, pointB, (start + end) / 2)
          const width = Math.min(Math.hypot(two[0] - one[0], two[1] - one[1]), Math.hypot(three[0] - four[0], three[1] - four[1]))
          if (width < 0.1) continue
          target.push(`M${position(one)}L${position(two)}Q${position(inner)} ${position(three)}L${position(four)}Q${position(lerp(inner, pointD, 0.1))} ${position(one)}Z`)
        }
      }
    }
    return fillPath(ink.join(''), ctx.ink) + fillPath(accent.join(''), ctx.accent)
  },
}

const wovenLines: PatternDefinition = {
  id: 'woven-lines',
  name: 'Woven Lines',
  category: 'Grid',
  description: 'A net of fine crossing lines warps around larger woven cells.',
  controls: [
    columns(13, 26),
    rows(10, 26),
    range('threads', 'Threads per cell', 1, 12, 1, 5, 'Subdivides each warped cell into a finer mesh.'),
    range('warp', 'Warp amount', 0, 1.4, 0.01, 1.15, 'Moves the supporting corners away from their regular positions.'),
    range('weight', 'Line weight', 0.0005, 0.011, 0.0001, 0.0018, 'Thickens each thread relative to the canvas.'),
    range('fill', 'Coverage', 0, 1, 0.01, 0.86, 'Fills or clears cells across the mesh.', true),
    range('fill-angle', 'Clearing angle', 0, 360, 1, 40, 'Turns the direction in which cells disappear.', true),
    range('fill-noise', 'Clearing irregularity', 0, 1, 0.01, 0.47, 'Adds scattered interruptions to the clearing edge.', true),
  ],
  render(ctx) {
    const cols = ctx.n('columns')
    const count = ctx.n('rows')
    const points = warpedGrid(ctx, cols, count, ctx.n('warp'))
    const strands = ctx.n('threads')
    const angle = radians(ctx.n('fill-angle'))
    const across: string[] = []
    const down: string[] = []
    const coverage = ctx.n('fill')

    for (let row = 0; row < count; row++) {
      for (let col = 0; col < cols; col++) {
        const projection = (col / (cols - 1) - 0.5) * Math.cos(angle) + (row / (count - 1) - 0.5) * Math.sin(angle)
        const position = 0.5 + projection / Math.SQRT2
        const random = seedAt(ctx, row * cols + col, 2)
        if (coverage === 0 || (coverage < 1 && mix(position, random, ctx.n('fill-noise')) > coverage)) continue
        const a = points[row][col]
        const b = points[row][col + 1]
        const c = points[row + 1][col + 1]
        const d = points[row + 1][col]
        for (let i = 0; i < strands; i++) {
          const t = i / strands
          across.push(polyline([lerp(a, d, t), lerp(b, c, t)]))
          down.push(polyline([lerp(a, b, t), lerp(d, c, t)]))
        }
      }
    }
    const weight = Math.min(ctx.width, ctx.height) * ctx.n('weight')
    return strokePath(across.join(''), ctx.ink, weight, 0.83) + strokePath(down.join(''), ctx.accent, weight * 0.78, 0.7)
  },
}

const currentDots: PatternDefinition = {
  id: 'current-dots',
  name: 'Current Dots',
  category: 'Flow',
  description: 'Dots drift across diverging strands and bunch into wavy pockets.',
  animated: true,
  controls: [
    range('strands', 'Strands', 8, 100, 1, 42, 'Sets the number of starting paths.'),
    range('spacing', 'Dot interval', 0.01, 0.14, 0.001, 0.033, 'Increases the vertical distance between dots.'),
    range('radius', 'Dot radius', 0.0009, 0.015, 0.0001, 0.0038, 'Changes the radius of every dot.'),
    range('turbulence', 'Turbulence', 0, 1, 0.01, 0.49, 'Increases the sideways drift away from the starting edge.'),
    range('frequency', 'Wave frequency', 0.4, 7, 0.1, 3.1, 'Adds more wave crests across the field.', true),
    range('curve', 'Divergence', 0.25, 3, 0.05, 1.3, 'Sets how quickly the strands pull apart.', true),
  ],
  render(ctx) {
    const strands = ctx.n('strands')
    const count = Math.floor(1 / ctx.n('spacing'))
    const turbulence = ctx.n('turbulence')
    const frequency = ctx.n('frequency')
    const radius = Math.min(ctx.width, ctx.height) * ctx.n('radius')
    const cycle = ctx.phase * TAU
    const ink: string[] = []
    const accent: string[] = []

    for (let strand = 0; strand < strands; strand++) {
      const u = (strand + 0.5) / strands
      const target = strand % 6 === 2 ? accent : ink
      for (let index = 0; index < count; index++) {
        const v = (index + 0.3) / count
        const warp = Math.sin(u * TAU * frequency + v * 2.6 + cycle) * Math.pow(v, ctx.n('curve')) * turbulence * 0.26
        const x = ctx.width * (0.08 + u * 0.84 + warp)
        const y = ctx.height * (0.08 + v * 0.84 + Math.sin(u * 11 - v * 8 + cycle) * turbulence * v * 0.032)
        target.push(circle(x, y, radius))
      }
    }
    return fillPath(ink.join(''), ctx.ink) + fillPath(accent.join(''), ctx.accent)
  },
}

function followField(ctx: RenderContext, field: (x: number, y: number) => Point, seeds: Point[], steps: number, interval: number): string {
  const paths: string[] = []
  const extent = (value: number) => value >= 0.035 && value <= 0.965
  for (const seed of seeds) {
    const trace = (direction: number) => {
      const points: Point[] = []
      let [x, y] = seed
      for (let step = 0; step < steps; step++) {
        const [dx, dy] = field(x, y)
        const magnitude = Math.max(Math.hypot(dx, dy), 0.01)
        x += interval * dx / magnitude * direction
        y += interval * dy / magnitude * direction
        if (!extent(x) || !extent(y)) break
        points.push([x * ctx.width, y * ctx.height])
      }
      return points
    }
    const backwards = trace(-1).reverse()
    const forwards = trace(1)
    if (backwards.length + forwards.length > 2) {
      paths.push(polyline([...backwards, [seed[0] * ctx.width, seed[1] * ctx.height], ...forwards]))
    }
  }
  return paths.join('')
}

function flowSeeds(ctx: RenderContext, count: number): Point[] {
  const columns = Math.ceil(Math.sqrt(count * ctx.width / ctx.height))
  const rows = Math.ceil(count / columns)
  return Array.from({ length: count }, (_, i) => [
    0.075 + (i % columns + 0.18 + seedAt(ctx, i, 6) * 0.64) / columns * 0.85,
    0.075 + (Math.floor(i / columns) + 0.18 + seedAt(ctx, i, 7) * 0.64) / rows * 0.85,
  ])
}

const flowLines: PatternDefinition = {
  id: 'flow-lines',
  name: 'Flow Lines',
  category: 'Flow',
  description: 'Curves trace a seeded flow field in both directions from scattered starting points.',
  animated: true,
  controls: [
    range('lines', 'Line count', 8, 180, 1, 87, 'Sets how many streamlines enter the field.'),
    range('length', 'Trail length', 10, 90, 1, 63, 'Controls the maximum length of each trace.'),
    range('curve', 'Curvature', 0, 2, 0.01, 0.98, 'Increases how strongly lines bend.'),
    range('angle', 'Direction', 0, 360, 1, 19, 'Turns the overall direction of travel.'),
    range('turbulence', 'Turbulence', 0, 1, 0.01, 0.58, 'Adds smooth local variation to the direction.', true),
    range('scale', 'Field frequency', 0.4, 7, 0.1, 2.6, 'Packs more or fewer direction changes into the field.', true),
    range('weight', 'Line weight', 0.0006, 0.009, 0.0001, 0.002, 'Thickens each trace.', true),
  ],
  render(ctx) {
    const curve = ctx.n('curve')
    const direction = radians(ctx.n('angle'))
    const frequency = ctx.n('scale')
    const turbulence = ctx.n('turbulence')
    const progress = ctx.phase * TAU
    const field = (x: number, y: number): Point => {
      const bend = Math.sin((x * 0.67 - y * 0.38) * frequency * TAU + progress)
      const variation = noise(x * frequency + Math.sin(progress) * 0.5, y * frequency + Math.cos(progress) * 0.5, ctx.seed)
      const angle = direction + bend * curve + variation * turbulence * Math.PI
      return [Math.cos(angle), Math.sin(angle)]
    }
    const seeds = flowSeeds(ctx, ctx.n('lines'))
    const steps = ctx.n('length')
    const weight = Math.min(ctx.width, ctx.height) * ctx.n('weight')
    return strokePath(followField(ctx, field, seeds.filter((_, i) => i % 7 !== 0), steps, 0.006), ctx.ink, weight, 0.84)
      + strokePath(followField(ctx, field, seeds.filter((_, i) => i % 7 === 0), steps, 0.006), ctx.accent, weight * 1.15, 0.82)
  },
}

const vortexPoles: PatternDefinition = {
  id: 'vortex-poles',
  name: 'Vortex Poles',
  category: 'Flow',
  description: 'Streamlines curl around a ring of alternating vortices.',
  animated: true,
  controls: [
    range('poles', 'Pole count', 2, 14, 1, 6, 'Adds more centres of rotation.'),
    range('radius', 'Ring radius', 0.04, 0.34, 0.005, 0.21, 'Moves the poles away from the centre.'),
    range('core', 'Pole core', 0.015, 0.18, 0.005, 0.04, 'Softens the rotation close to each pole.'),
    range('density', 'Trace count', 8, 145, 1, 86, 'Sets the number of streamlines drawn through the combined field.'),
    range('turn', 'Ring orientation', 0, 360, 1, 12, 'Turns the pole placement around the canvas.', true),
    range('scatter', 'Scatter', 0, 1, 0.01, 0.34, 'Offsets the poles from their evenly spaced positions.', true),
    range('pull', 'Inward pull', 0, 1, 0.01, 0.24, 'Blends local spin with attraction to each pole.', true),
  ],
  render(ctx) {
    const count = ctx.n('poles')
    const angle = radians(ctx.n('turn')) + ctx.phase * TAU
    const poles = Array.from({ length: count }, (_, i) => {
      const t = i * TAU / count + angle
      const scatter = ctx.n('scatter') * 0.22
      return {
        x: 0.5 + Math.cos(t) * ctx.n('radius') + (seedAt(ctx, i) - 0.5) * scatter,
        y: 0.5 + Math.sin(t) * ctx.n('radius') + (seedAt(ctx, i, 1) - 0.5) * scatter,
        sign: i % 2 ? -1 : 1,
      }
    })
    const soft = ctx.n('core') ** 2
    const pull = ctx.n('pull')
    const field = (x: number, y: number): Point => {
      let horizontal = 0.06
      let vertical = -0.05
      for (const pole of poles) {
        const dx = x - pole.x
        const dy = y - pole.y
        const weight = 1 / (dx * dx + dy * dy + soft)
        horizontal += (dy * pole.sign - dx * pull) * weight
        vertical += (-dx * pole.sign - dy * pull) * weight
      }
      return [horizontal, vertical]
    }
    const seeds = flowSeeds(ctx, ctx.n('density'))
    const side = Math.min(ctx.width, ctx.height)
    return strokePath(followField(ctx, field, seeds.filter((_, i) => i % 5 !== 0), 58, 0.006), ctx.ink, side * 0.0017, 0.88)
      + strokePath(followField(ctx, field, seeds.filter((_, i) => i % 5 === 0), 58, 0.006), ctx.accent, side * 0.0019, 0.86)
  },
}

const chevronStack: PatternDefinition = {
  id: 'chevron-stack',
  name: 'Chevron Stack',
  category: 'Isometric',
  description: 'Stripe-filled hexagons form a cluster of folded, isometric faces.',
  controls: [
    range('blocks', 'Blocks', 1, 38, 1, 13, 'Sets the number of hexagonal blocks in the cluster.'),
    range('bands', 'Bands per face', 3, 25, 1, 10, 'Adds thinner stripes to each face.'),
    range('ratio', 'Band width', 0.16, 0.92, 0.01, 0.56, 'Sets the proportion of each face covered by the stripes.'),
    range('taper', 'Taper', -0.95, 2, 0.05, 0.65, 'Weights stripe spacing toward one side of each face.'),
    range('gutter', 'Block gap', 0, 0.4, 0.01, 0.08, 'Separates adjacent blocks.', true),
    range('turn', 'Orientation', 0, 5, 1, 0, 'Rotates the arrangement in sixty degree steps.', true),
  ],
  render(ctx) {
    const count = ctx.n('blocks')
    const rings = Math.ceil(Math.sqrt(count / 3)) + 1
    const choices: { q: number; r: number; distance: number }[] = []
    for (let r = -rings; r <= rings; r++) {
      for (let q = -rings; q <= rings; q++) {
        const index = (r + rings) * (rings * 2 + 1) + q + rings
        choices.push({ q, r, distance: Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r)) + seedAt(ctx, index, 10) * 0.87 })
      }
    }
    const orientation = ctx.n('turn') * TAU / 6
    choices.sort((a, b) => a.distance - b.distance)
    const points = choices.slice(0, count).map(({ q, r }) => {
      const x = Math.sqrt(3) * (q + r / 2)
      const y = 1.5 * r
      return [x * Math.cos(orientation) - y * Math.sin(orientation), x * Math.sin(orientation) + y * Math.cos(orientation)] as Point
    })
    const left = Math.min(...points.map(([x]) => x))
    const right = Math.max(...points.map(([x]) => x))
    const top = Math.min(...points.map(([, y]) => y))
    const bottom = Math.max(...points.map(([, y]) => y))
    const scale = Math.min(ctx.width * 0.79 / (right - left + 2), ctx.height * 0.82 / (bottom - top + 2))
    const radius = scale * (1 - ctx.n('gutter'))
    const accents: string[] = []
    const primary: string[] = []
    const bands = ctx.n('bands')
    const taper = ctx.n('taper')
    const weighted = (value: number) => Math.pow(value, taper >= 0 ? 1 + taper : 1 / (1 - taper * 2))

    for (const [index, [px, py]] of points.entries()) {
      const x = ctx.width / 2 + (px - (left + right) / 2) * scale
      const y = ctx.height / 2 + (py - (top + bottom) / 2) * scale
      const corners = Array.from({ length: 6 }, (_, n): Point => {
        const angle = n * TAU / 6 - Math.PI / 2
        return [x + Math.cos(angle) * radius, y + Math.sin(angle) * radius]
      })
      const start = seedAt(ctx, index, 1) >= 0.53 ? 1 : 0
      for (let face = 0; face < 3; face++) {
        const side = (face * 2 + start) % 6
        const a = corners[side]
        const b = corners[(side + 1) % 6]
        const c = corners[(side + 2) % 6]
        const d: Point = [x, y]
        const output = (face + index) % 3 === 0 ? accents : primary
        for (let band = 0; band < bands; band++) {
          const lower = weighted(band / bands)
          const higher = weighted((band + ctx.n('ratio')) / bands)
          output.push(polyline([lerp(a, b, lower), lerp(a, b, higher), lerp(d, c, higher), lerp(d, c, lower)], true))
        }
      }
    }
    return fillPath(primary.join(''), ctx.ink) + fillPath(accents.join(''), ctx.accent)
  },
}

const triangleMosaic: PatternDefinition = {
  id: 'triangle-mosaic',
  name: 'Triangle Mosaic',
  category: 'Grid',
  description: 'Pinwheel tiles dissolve into seeded clusters of triangles.',
  controls: [
    columns(27, 64),
    rows(23, 60),
    range('coverage', 'Triangle size', 0.25, 1, 0.01, 0.89, 'Changes the size of each triangle in its tile.'),
    range('breakpoint', 'Breakup starts', 0, 1, 0.01, 0.3, 'Moves the transition from repeating pinwheels into scattered forms.'),
    range('chaos', 'Breakup strength', 0, 1, 0.01, 0.95, 'Increases the chance of a triangle breaking the pinwheel rule.'),
    range('bias', 'Transition angle', 0, 360, 1, 98, 'Turns the direction in which the breakup spreads.', true),
  ],
  render(ctx) {
    const cols = ctx.n('columns')
    const count = ctx.n('rows')
    const width = ctx.width * 0.88 / cols
    const height = ctx.height * 0.88 / count
    const coverage = ctx.n('coverage')
    const angle = radians(ctx.n('bias'))
    const threshold = ctx.n('breakpoint')
    const layouts = [0, 1, 3, 2]
    const ink: string[] = []
    const accent: string[] = []

    for (let row = 0; row < count; row++) {
      for (let col = 0; col < cols; col++) {
        const id = row * cols + col
        const projection = (col / (cols - 1) - 0.5) * Math.cos(angle) + (row / (count - 1) - 0.5) * Math.sin(angle)
        const level = unit((0.5 + projection / Math.SQRT2 - threshold) / Math.max(1 - threshold, 0.001))
        const broken = seedAt(ctx, id, 0) < level * ctx.n('chaos')
        const orientation = broken ? Math.floor(seedAt(ctx, id, 1) * 3.999) : layouts[(row % 2) * 2 + col % 2]
        const x = ctx.width * 0.06 + (col + 0.5) * width
        const y = ctx.height * 0.06 + (row + 0.5) * height
        const hx = coverage * width / 2
        const hy = coverage * height / 2
        const corners: Point[] = [[x - hx, y - hy], [x + hx, y - hy], [x + hx, y + hy], [x - hx, y + hy]]
        const target = broken || (row + col * 2) % 11 === 0 ? accent : ink
        target.push(polyline([corners[orientation], corners[(orientation + 1) % 4], corners[(orientation + 2) % 4]], true))
      }
    }
    return fillPath(ink.join(''), ctx.ink) + fillPath(accent.join(''), ctx.accent)
  },
}

const latticeGarden: PatternDefinition = {
  id: 'lattice-garden',
  name: 'Lattice Garden',
  category: 'Organic',
  description: 'Drifting nodes connect to their neighbors across a seeded field.',
  controls: [
    columns(19, 42),
    rows(17, 40),
    range('size', 'Node radius', 0.0009, 0.015, 0.0001, 0.0043, 'Controls the size of each dot.'),
    range('connections', 'Connection density', 0, 1, 0.01, 0.39, 'Sets the chance that a neighboring pair is connected.'),
    range('warp', 'Displacement', 0, 1.3, 0.01, 0.61, 'Moves the points farther from the regular lattice.'),
    range('fill', 'Coverage', 0, 1, 0.01, 0.86, 'Removes nodes and their attached lines.', true),
    range('angle', 'Clearing angle', 0, 360, 1, 53, 'Changes the direction the pattern clears from.', true),
    range('scatter', 'Clearing mix', 0, 1, 0.01, 0.37, 'Blends directional clearing with scattered removal.', true),
  ],
  render(ctx) {
    const cols = ctx.n('columns')
    const count = ctx.n('rows')
    const side = Math.min(ctx.width, ctx.height)
    const radius = side * ctx.n('size')
    const stepX = ctx.width * 0.86 / cols
    const stepY = ctx.height * 0.86 / count
    const angle = radians(ctx.n('angle'))
    const coverage = ctx.n('fill')
    const warp = ctx.n('warp')
    const nodes = Array.from({ length: count }, (_, row) => Array.from({ length: cols }, (_, col) => {
      const index = row * cols + col
      const x = ctx.width * 0.07 + stepX * (col + 0.25 + row % 2 * 0.5 + noise(col * 0.54, row * 0.54, ctx.seed) * warp)
      const y = ctx.height * 0.07 + stepY * (row + 0.5 + noise(col * 0.54 + 30, row * 0.54 + 12, ctx.seed) * warp)
      const projection = (col / (cols - 1) - 0.5) * Math.cos(angle) + (row / (count - 1) - 0.5) * Math.sin(angle)
      const level = mix(0.5 + projection / Math.SQRT2, seedAt(ctx, index), ctx.n('scatter'))
      return { point: [x, y] as Point, visible: coverage === 1 || (coverage > 0 && level < coverage) }
    }))
    const lines: string[] = []
    const dots: string[] = []
    const highlights: string[] = []

    for (let row = 0; row < count; row++) {
      for (let col = 0; col < cols; col++) {
        const node = nodes[row][col]
        if (!node.visible) continue
        const index = row * cols + col
        const neighboring = [nodes[row][col + 1], nodes[row + 1]?.[col], nodes[row + 1]?.[col + (row % 2 ? 1 : -1)]]
        for (const [edge, other] of neighboring.entries()) {
          if (other?.visible && seedAt(ctx, index, edge + 3) < ctx.n('connections')) lines.push(polyline([node.point, other.point]))
        }
        const [x, y] = node.point
        const collection = (row * 2 + col) % 7 === 2 ? highlights : dots
        collection.push(circle(x, y, radius))
      }
    }
    return strokePath(lines.join(''), ctx.ink, side * 0.0014, 0.67) + fillPath(dots.join(''), ctx.ink) + fillPath(highlights.join(''), ctx.accent)
  },
}

function meshDirections(points: Point[][]): [string, string] {
  const horizontal = points.map((row) => polyline(row)).join('')
  const vertical = points[0].map((_, col) => polyline(points.map((row) => row[col]))).join('')
  return [horizontal, vertical]
}

const interferenceMesh: PatternDefinition = {
  id: 'interference-mesh',
  name: 'Interference Mesh',
  category: 'Physics',
  description: 'Two travelling wave fields fold a grid into overlapping ripples.',
  animated: true,
  controls: [
    range('resolution', 'Mesh points', 8, 65, 1, 32, 'Changes the resolution of the wire grid.'),
    range('frequency', 'Frequency', 0.7, 15, 0.1, 4.4, 'Adds more wave crests across the canvas.'),
    range('amplitude', 'Amplitude', 0, 0.25, 0.005, 0.12, 'Raises the crests and lowers the troughs.'),
    range('separation', 'Source separation', 0, 0.8, 0.01, 0.45, 'Moves the two wave sources farther apart.'),
    range('width', 'Mesh span', 0.32, 1, 0.01, 0.82, 'Expands the mesh outward around the centre.', true),
    range('tilt', 'Source angle', 0, 360, 1, 26, 'Rotates the pair of wave sources.', true),
  ],
  render(ctx) {
    const count = ctx.n('resolution')
    const frequency = ctx.n('frequency') * TAU
    const amplitude = ctx.n('amplitude') * ctx.height * 0.5
    const separation = ctx.n('separation') / 2
    const angle = radians(ctx.n('tilt'))
    const width = ctx.n('width')
    const dx = Math.cos(angle) * separation
    const dy = Math.sin(angle) * separation
    const phase = ctx.phase * TAU
    const side = Math.min(ctx.width, ctx.height)
    const grid = Array.from({ length: count }, (_, row) => Array.from({ length: count }, (_, col): Point => {
      const x = (col / (count - 1) - 0.5) * width
      const y = (row / (count - 1) - 0.5) * width * 0.83
      const first = Math.sin(Math.hypot(x - dx, y - dy) * frequency - phase)
      const second = Math.sin(Math.hypot(x + dx, y + dy) * frequency - phase + 1.15)
      return [(x + 0.5) * ctx.width, (y + 0.5) * ctx.height + (first + second) * amplitude]
    }))
    const [across, down] = meshDirections(grid)
    return strokePath(down, ctx.accent, side * 0.0015, 0.69) + strokePath(across, ctx.ink, side * 0.0017, 0.9)
  },
}

const spiralMesh: PatternDefinition = {
  id: 'spiral-morph',
  name: 'Spiral Morph',
  category: 'Distortion',
  description: 'A rectangular mesh winds into an open coil with a continuous morph.',
  controls: [
    columns(42, 88),
    rows(10, 23),
    range('morph', 'Morph', 0, 1, 0.01, 0.95, 'Blends from a flat grid to a tightly wound spiral.'),
    range('turns', 'Turns', 1, 9, 0.1, 3.1, 'Sets the number of rotations in the final coil.'),
    range('radius', 'Outer radius', 0.16, 0.48, 0.01, 0.39, 'Expands the coil away from its centre.'),
    range('width', 'Band width', 0.025, 0.23, 0.005, 0.085, 'Increases the width of the mesh band.', true),
    range('noise', 'Morph irregularity', 0, 1, 0.01, 0.39, 'Moves neighboring points through the morph at different rates.', true),
    {
      ...range('scale', 'Irregularity frequency', 0.6, 14, 0.1, 4.1, 'Changes the size of the patches that morph together.', true),
      enabled: (values) => Number(values.noise) > 0,
    },
  ],
  render(ctx) {
    const cols = ctx.n('columns')
    const count = ctx.n('rows')
    const side = Math.min(ctx.width, ctx.height)
    const radius = side * ctx.n('radius')
    const width = ctx.n('width') * side
    const morph = ctx.n('morph')
    const turns = ctx.n('turns')
    const random = ctx.n('noise') * Math.sin(morph * Math.PI)
    const scale = ctx.n('scale')
    // Smooth the final spiral even when the underlying rectangular mesh is coarse.
    const samples = Math.max(cols, Math.ceil(turns * 26))
    const spiralPoint = (u: number, v: number): Point => {
      const theta = u * TAU * turns - Math.PI * 0.65
      const distance = radius * (0.096 + u * 0.904) + v * width
      const start: Point = [ctx.width * (0.08 + 0.84 * u), ctx.height / 2 + v * width * 3.2]
      const end: Point = [ctx.width / 2 + Math.cos(theta) * distance, ctx.height / 2 + Math.sin(theta) * distance]
      return lerp(start, end, unit(morph + noise(u * scale, (v + 0.5) * scale, ctx.seed) * random))
    }
    const horizontal = Array.from({ length: count }, (_, row) => polyline(Array.from({ length: samples }, (_, col) => spiralPoint(col / (samples - 1), row / (count - 1) - 0.5))))
    const vertical = Array.from({ length: cols }, (_, col) => polyline(Array.from({ length: count }, (_, row) => spiralPoint(col / (cols - 1), row / (count - 1) - 0.5))))
    return strokePath(vertical.join(''), ctx.accent, side * 0.0016, 0.73) + strokePath(horizontal.join(''), ctx.ink, side * 0.0018)
  },
}

const brokenContours: PatternDefinition = {
  id: 'broken-contours',
  name: 'Broken Contours',
  category: 'Radial',
  description: 'Concentric outlines fray and fall away in patches around a variable opening.',
  controls: [
    range('rings', 'Contour count', 3, 56, 1, 24, 'Adds more concentric outlines.'),
    range('sides', 'Contour sides', 3, 128, 1, 95, 'Rounds the outlines as more vertices are added.'),
    range('inner', 'Inner radius', 0, 0.8, 0.01, 0.26, 'Opens a larger hole in the centre.'),
    range('warp', 'Warp amount', 0, 1, 0.01, 0.36, 'Pushes vertices away from their regular polygon positions.'),
    range('threshold', 'Break threshold', 0, 1, 0.01, 0.43, 'Drops more contour segments as the threshold rises.'),
    range('scale', 'Break frequency', 0.5, 12, 0.1, 3.8, 'Breaks the rings into smaller patches at high settings.', true),
    range('weight', 'Line weight', 0.0008, 0.014, 0.0001, 0.0033, 'Changes the thickness of the visible contours.', true),
  ],
  render(ctx) {
    const side = Math.min(ctx.width, ctx.height)
    const count = ctx.n('rings')
    const sides = ctx.n('sides')
    const maxRadius = side * 0.43
    const inner = ctx.n('inner') * maxRadius
    const warp = ctx.n('warp') * side * 0.17
    const scale = ctx.n('scale')
    const threshold = ctx.n('threshold')
    const ink: string[] = []
    const accent: string[] = []

    for (let ring = 0; ring < count; ring++) {
      const scatter = ring / (count - 1)
      const radius = mix(inner, maxRadius, scatter)
      const points = Array.from({ length: sides }, (_, index): Point => {
        const theta = index * TAU / sides - Math.PI / 2
        const x = Math.cos(theta)
        const y = Math.sin(theta)
        const grit = noise(x * (1.9 + scatter) + 8, y * (1.9 + scatter) + 4, ctx.seed)
        const actual = Math.max(0, radius + grit * warp * (0.35 + scatter * 0.65))
        return [ctx.width / 2 + x * actual, ctx.height / 2 + y * actual]
      })
      const output = ring % 5 === 3 ? accent : ink
      for (let index = 0; index < sides; index++) {
        const theta = (index + 0.5) * TAU / sides
        const bulk = scale * (scatter + 0.33)
        const grit = unit(0.5 + 0.8 * noise(Math.cos(theta) * bulk + 31, Math.sin(theta) * bulk + 26, ctx.seed))
        if (grit > threshold) output.push(polyline([points[index], points[(index + 1) % sides]]))
      }
    }
    const weight = side * ctx.n('weight')
    return strokePath(ink.join(''), ctx.ink, weight, 0.91) + strokePath(accent.join(''), ctx.accent, weight)
  },
}

export const geometryPatterns = [
  radialBurst,
  recedingBands,
  slidingTiles,
  shiftedCells,
  roundedPacking,
  pixelField,
  coilSweep,
  slicedTypography,
  hexTransit,
  ribbonLattice,
  wovenLines,
  currentDots,
  flowLines,
  vortexPoles,
  chevronStack,
  triangleMosaic,
  latticeGarden,
  interferenceMesh,
  spiralMesh,
  brokenContours,
]
