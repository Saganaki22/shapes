import { f } from './model';

export type LetterStyle = 'block' | 'mono';
type GlyphBox = { x: number; y: number; width: number; height: number };

// The rows are five columns wide, with X marking a filled cell.
const glyphs: Record<string, string> = {
  A: '.XXX./XX.XX/XX.XX/XXXXX/XX.XX/XX.XX/XX.XX',
  B: 'XXXX./XX.XX/XX.XX/XXXX./XX.XX/XX.XX/XXXX.',
  C: '.XXXX/XX.../XX.../XX.../XX.../XX.../.XXXX',
  D: 'XXXX./XX.XX/XX.XX/XX.XX/XX.XX/XX.XX/XXXX.',
  E: 'XXXXX/XX.../XX.../XXXX./XX.../XX.../XXXXX',
  F: 'XXXXX/XX.../XX.../XXXX./XX.../XX.../XX...',
  G: '.XXXX/XX.../XX.../XX.XX/XX.XX/XX.XX/.XXXX',
  H: 'XX.XX/XX.XX/XX.XX/XXXXX/XX.XX/XX.XX/XX.XX',
  I: 'XXXXX/..X../..X../..X../..X../..X../XXXXX',
  J: '..XXX/...XX/...XX/...XX/...XX/XX.XX/.XXX.',
  K: 'XX.XX/XX.XX/XXXX./XXX../XXXX./XX.XX/XX.XX',
  L: 'XX.../XX.../XX.../XX.../XX.../XX.../XXXXX',
  M: 'XX.XX/XXXXX/XXXXX/XX.XX/XX.XX/XX.XX/XX.XX',
  N: 'XX.XX/XXX.X/XXX.X/XX.XX/X.XXX/X.XXX/XX.XX',
  O: '.XXX./XX.XX/XX.XX/XX.XX/XX.XX/XX.XX/.XXX.',
  P: 'XXXX./XX.XX/XX.XX/XXXX./XX.../XX.../XX...',
  Q: '.XXX./XX.XX/XX.XX/XX.XX/XX.XX/.XXXX/....X',
  R: 'XXXX./XX.XX/XX.XX/XXXX./XXX../XX.X./XX.XX',
  S: '.XXXX/XX.../XX.../.XXX./...XX/...XX/XXXX.',
  T: 'XXXXX/..X../..X../..X../..X../..X../..X..',
  U: 'XX.XX/XX.XX/XX.XX/XX.XX/XX.XX/XX.XX/.XXX.',
  V: 'XX.XX/XX.XX/XX.XX/XX.XX/.X.X./.XXX./..X..',
  W: 'XX.XX/XX.XX/XX.XX/XX.XX/XXXXX/XXXXX/.X.X.',
  X: 'XX.XX/XX.XX/.XXX./..X../.XXX./XX.XX/XX.XX',
  Y: 'XX.XX/XX.XX/.XXX./..X../..X../..X../..X..',
  Z: 'XXXXX/...XX/..XX./..X../.XX../XX.../XXXXX',
  '0': '.XXX./XX.XX/XX.XX/XX.XX/XX.XX/XX.XX/.XXX.',
  '1': '..XX./.XXX./..XX./..XX./..XX./..XX./XXXXX',
  '2': '.XXX./XX.XX/...XX/..XX./.XX../XX.../XXXXX',
  '3': 'XXXX./...XX/...XX/.XXX./...XX/...XX/XXXX.',
  '4': 'XX.XX/XX.XX/XX.XX/XXXXX/...XX/...XX/...XX',
  '5': 'XXXXX/XX.../XX.../XXXX./...XX/...XX/XXXX.',
  '6': '.XXXX/XX.../XX.../XXXX./XX.XX/XX.XX/.XXX.',
  '7': 'XXXXX/...XX/...XX/..XX./.XX../.XX../.XX..',
  '8': '.XXX./XX.XX/XX.XX/.XXX./XX.XX/XX.XX/.XXX.',
  '9': '.XXX./XX.XX/XX.XX/.XXXX/...XX/...XX/XXXX.',
  '?': '.XXX./XX.XX/...XX/..XX./..X../...../..X..',
  '!': '..X../..X../..X../..X../..X../...../..X..',
  '&': '.XX../X..X./X..X./.XX../X..XX/X..X./.XX.X',
  '-': '...../...../...../.XXX./...../...../.....',
  '+': '...../..X../..X../XXXXX/..X../..X../.....',
  '.': '...../...../...../...../...../...../..X..',
  ',': '...../...../...../...../...../..X../.X...',
  '/': '....X/....X/...X./..X../.X.../X..../X....',
  ' ': '...../...../...../...../...../...../.....',
};

const marks: Record<string, [number, number][]> = {
  '\u0300': [[1, -2], [2, -1]],
  '\u0301': [[3, -2], [2, -1]],
  '\u0302': [[2, -2], [1, -1], [3, -1]],
  '\u0303': [[1, -1], [2, -2], [3, -2], [4, -1]],
  '\u0308': [[1, -1], [3, -1]],
  '\u030a': [[2, -2], [1, -1], [3, -1]],
  '\u0327': [[2, 7], [1, 8]],
};

export function letterBoxes(value: string, x: number, y: number, width: number, height: number, style: LetterStyle = 'block'): GlyphBox[] {
  const boxes: GlyphBox[] = [];
  const characters = Array.from(value.trim().toUpperCase()).slice(0, 48);
  const inset = style === 'mono' ? 0.12 : 0;
  let unitMinY = 0;
  let unitMaxY = 7;

  characters.forEach((character, index) => {
    const [base, ...accents] = Array.from(character.normalize('NFKD'));
    const offset = index * 6;
    const rows = (glyphs[base] ?? glyphs['?']).split('/');
    rows.forEach((row, rowIndex) => {
      for (const run of row.matchAll(style === 'mono' ? /X/g : /X+/g)) {
        boxes.push({ x: offset + run.index, y: rowIndex, width: run[0].length - inset, height: 1 - inset });
      }
    });
    accents.forEach((accent) => {
      for (const [column, row] of marks[accent] ?? []) {
        unitMinY = Math.min(unitMinY, row);
        unitMaxY = Math.max(unitMaxY, row + 1);
        boxes.push({ x: offset + column, y: row, width: 1 - inset, height: 1 - inset });
      }
    });
  });

  if (!characters.length || width <= 0 || height <= 0) return [];
  const unitWidth = characters.length * 6 - 1;
  const unitHeight = unitMaxY - unitMinY;
  const scale = Math.min(width / unitWidth, height / unitHeight);
  const originX = x + (width - unitWidth * scale) / 2;
  const originY = y + (height - unitHeight * scale) / 2 - unitMinY * scale;
  return boxes.map((box) => ({
    x: originX + box.x * scale,
    y: originY + box.y * scale,
    width: box.width * scale,
    height: box.height * scale,
  }));
}

export function lettering(value: string, x: number, y: number, width: number, height: number, style: LetterStyle = 'block'): string {
  return letterBoxes(value, x, y, width, height, style)
    .map((box) => `M${f(box.x)} ${f(box.y)}h${f(box.width)}v${f(box.height)}h${f(-box.width)}Z`)
    .join('');
}
