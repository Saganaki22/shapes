import { clamp, escapeXml, f, patternValues, seededRandom } from './patterns/model';
import type { PatternDefinition, PatternValues, RenderContext } from './patterns/model';

export interface Palette {
  ink: string;
  accent: string;
  paper: string;
  transparent: boolean;
}

export interface ArtworkSettings {
  width: number;
  height: number;
  palette: Palette;
  seed: number;
  phase: number;
  values: PatternValues;
}

export const initialPalette: Palette = { ink: '#222665', accent: '#3749eb', paper: '#eee8f8', transparent: false };
export const initialSize = { width: 960, height: 720 };
export const qualityLimit = 16_777_216;

export function parseHex(input: string) {
  const value = input.trim().replace(/^#/, '');
  if (/^[a-f0-9]{6}$/i.test(value)) return `#${value.toLowerCase()}`;
  if (/^[a-f0-9]{3}$/i.test(value)) return `#${[...value.toLowerCase()].map((letter) => letter.repeat(2)).join('')}`;
  return null;
}

export function svgArtwork(pattern: PatternDefinition, settings: ArtworkSettings, quality: RenderContext['quality'] = 'preview') {
  const { width, height } = settings;
  const { palette, seed, phase } = settings;
  const values = patternValues(pattern, settings.values);
  const ink = parseHex(palette.ink) ?? initialPalette.ink;
  const accent = parseHex(palette.accent) ?? initialPalette.accent;
  const paper = parseHex(palette.paper) ?? initialPalette.paper;
  const art = pattern.render({
    width, height, ink, accent, seed, phase, quality,
    n: (id) => Number(values[id] ?? 0),
    s: (id) => String(values[id] ?? ''),
    random: seededRandom(seed),
  });
  const background = palette.transparent ? '' : `<rect width="${width}" height="${height}" fill="${paper}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" overflow="hidden"><title>${escapeXml(pattern.name)}</title>${background}${art}</svg>`;
}

export function thumbnail(pattern: PatternDefinition) {
  const settings = { ...initialSize, palette: initialPalette, seed: 17, phase: 0.22, values: {} };
  return `data:image/svg+xml,${encodeURIComponent(svgArtwork(pattern, settings, 'thumbnail'))}`;
}

export function exportDimensions(width: number, height: number, requestedWidth: number) {
  const aspect = width / height;
  const maxWidth = Math.max(1, Math.min(8192, Math.floor(8192 * aspect), Math.floor(Math.sqrt(qualityLimit * aspect))));
  const outputWidth = clamp(Math.round(requestedWidth), 1, maxWidth);
  const outputHeight = clamp(Math.round(outputWidth / aspect), 1, Math.min(8192, Math.floor(qualityLimit / outputWidth)));
  return { width: outputWidth, height: outputHeight, maxWidth };
}

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export async function downloadArtwork(pattern: PatternDefinition, settings: ArtworkSettings, format: 'svg' | 'png', outputWidth: number) {
  const svg = svgArtwork(pattern, settings, 'export');
  const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  const filename = `shapes-${pattern.id}-${settings.seed}`;
  if (format === 'svg') {
    saveBlob(blob, `${filename}.svg`);
    return;
  }

  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    const ready = new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('The artwork could not be rasterized.'));
    });
    image.src = url;
    await ready;
    const output = exportDimensions(settings.width, settings.height, outputWidth);
    const canvas = document.createElement('canvas');
    canvas.width = output.width;
    canvas.height = output.height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('This browser could not create the export canvas.');
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const png = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((result) => result ? resolve(result) : reject(new Error('The PNG could not be encoded. Try a smaller size.')), 'image/png');
    });
    saveBlob(png, `${filename}-${f(output.width)}w.png`);
  } finally {
    URL.revokeObjectURL(url);
  }
}
