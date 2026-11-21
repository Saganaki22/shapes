export type Category = 'Grid' | 'Radial' | 'Flow' | 'Noise' | 'Isometric' | 'Distortion' | 'Organic' | 'Physics' | 'Type';
export type PatternValues = Record<string, number | string>;

interface ControlMetadata {
  id: string;
  label: string;
  description?: string;
  advanced?: boolean;
  enabled?: (values: PatternValues) => boolean;
}

export interface RangeControl extends ControlMetadata {
  kind: 'range';
  min: number;
  max: number;
  step: number;
  defaultValue: number;
}

export interface SelectControl extends ControlMetadata {
  kind: 'select';
  options: { value: string; label: string }[];
  defaultValue: string;
}

export interface TextControl extends ControlMetadata {
  kind: 'text';
  maxLength: number;
  defaultValue: string;
}

export type Control = RangeControl | SelectControl | TextControl;

export interface RenderContext {
  width: number;
  height: number;
  ink: string;
  accent: string;
  seed: number;
  phase: number;
  n: (id: string) => number;
  s: (id: string) => string;
  random: () => number;
  quality: 'preview' | 'export' | 'thumbnail';
}

export interface PatternDefinition {
  id: string;
  name: string;
  category: Category;
  description: string;
  controls: Control[];
  render: (context: RenderContext) => string;
  animated?: boolean;
}

export function range(id: string, label: string, min: number, max: number, step: number, defaultValue: number, description?: string, advanced = false): RangeControl {
  return { kind: 'range', id, label, min, max, step, defaultValue, description, advanced };
}

export function select(id: string, label: string, options: (string | [string, string])[], defaultValue: string, description?: string, advanced = false): SelectControl {
  return {
    kind: 'select', id, label, defaultValue, description, advanced,
    options: options.map((option) => typeof option === 'string'
      ? { value: option, label: option }
      : { value: option[0], label: option[1] }),
  };
}

export function text(id: string, label: string, defaultValue: string, description?: string, maxLength = 22): TextControl {
  return { kind: 'text', id, label, defaultValue, description, maxLength };
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function f(value: number) {
  return String(Number.isFinite(value) ? Math.round(value * 100) / 100 : 0);
}

export function escapeXml(value: string) {
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&apos;');
}

function hash(x: number, y: number, seed: number) {
  let value = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(seed, 1274126177);
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967296;
}

export function noise(x: number, y: number, seed: number) {
  const left = Math.floor(x);
  const top = Math.floor(y);
  const dx = x - left;
  const dy = y - top;
  const sx = dx * dx * (3 - 2 * dx);
  const sy = dy * dy * (3 - 2 * dy);
  const a = hash(left, top, seed) * (1 - sx) + hash(left + 1, top, seed) * sx;
  const b = hash(left, top + 1, seed) * (1 - sx) + hash(left + 1, top + 1, seed) * sx;
  return (a * (1 - sy) + b * sy) * 2 - 1;
}

export function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6D2B79F5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function normalizeRange(control: RangeControl, value: number) {
  if (!Number.isFinite(value)) return control.defaultValue;
  const steps = Math.round((clamp(value, control.min, control.max) - control.min) / control.step);
  return Number(clamp(control.min + steps * control.step, control.min, control.max).toFixed(8));
}

export function patternValues(pattern: PatternDefinition, saved?: Partial<PatternValues>): PatternValues {
  return Object.fromEntries(pattern.controls.map((control) => {
    const value = saved && Object.hasOwn(saved, control.id) ? saved[control.id] : undefined;
    if (control.kind === 'range' && typeof value === 'number') return [control.id, normalizeRange(control, value)];
    if (control.kind === 'select' && typeof value === 'string' && control.options.some((option) => option.value === value)) return [control.id, value];
    if (control.kind === 'text' && typeof value === 'string') return [control.id, value.slice(0, control.maxLength)];
    return [control.id, control.defaultValue];
  }));
}
