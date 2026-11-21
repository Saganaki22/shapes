import { useId, useState } from 'react';
import { Check, ChevronDown, Palette as PaletteIcon } from 'lucide-react';
import { initialPalette, parseHex } from './engine';
import type { Palette } from './engine';
import { normalizeRange } from './patterns/model';
import type { Control, PatternValues, RangeControl } from './patterns/model';

export function NumberEntry(props: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
}) {
  const { label, value, onChange, disabled } = props;
  const [draft, setDraft] = useState<string | null>(null);

  return <input
    className="number-entry"
    type="text"
    inputMode="decimal"
    aria-label={label}
    value={draft ?? String(value)}
    disabled={disabled}
    onFocus={(event) => event.currentTarget.select()}
    onChange={(event) => setDraft(event.target.value)}
    onBlur={() => {
      if (draft?.trim()) {
        const number = Number(draft.trim().replace(',', '.'));
        if (Number.isFinite(number)) onChange(number);
      }
      setDraft(null);
    }}
    onKeyDown={(event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        event.currentTarget.blur();
      }
    }}
  />;
}

export function Slider({ control, value, onChange, disabled }: {
  control: RangeControl;
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
}) {
  const id = useId();
  const { label, description, min, max, step } = control;
  const percent = 100 * (value - min) / (max - min);
  const update = (next: number) => onChange(normalizeRange(control, next));
  return <div className="control" data-disabled={disabled || undefined}>
    <div className="control-head">
      <label htmlFor={id}>{label}</label>
      <NumberEntry label={`${label} value`} value={value} onChange={update} disabled={disabled} />
    </div>
    <input
      id={id}
      style={{ '--range-progress': `${percent}%` } as React.CSSProperties}
      type="range" min={min} max={max} step={step} value={value} disabled={disabled}
      aria-describedby={description ? `${id}-description` : undefined}
      onChange={(event) => update(event.target.valueAsNumber)}
    />
    {description && <p className="control-description" id={`${id}-description`}>{description}</p>}
  </div>;
}

export function PatternControl({ control, values, onChange }: {
  control: Control;
  values: PatternValues;
  onChange: (id: string, value: number | string) => void;
}) {
  const id = useId();
  const disabled = control.enabled ? !control.enabled(values) : false;
  const value = values[control.id] ?? control.defaultValue;
  if (control.kind === 'range') {
    return <Slider control={control} value={Number(value)} disabled={disabled}
      onChange={(next) => onChange(control.id, next)} />;
  }
  return <div className="control" data-disabled={disabled || undefined}>
    <label htmlFor={id}>{control.label}</label>
    {control.kind === 'select' ? <div className="select-wrap">
      <select id={id} value={String(value)} disabled={disabled} aria-describedby={control.description ? `${id}-description` : undefined}
        onChange={(event) => onChange(control.id, event.target.value)}>
        {control.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
      <ChevronDown aria-hidden="true" size={16} />
    </div> : <input className="text-entry" id={id} value={String(value)} maxLength={control.maxLength} disabled={disabled}
      aria-describedby={control.description ? `${id}-description` : undefined}
      onChange={(event) => onChange(control.id, event.target.value)} />}
    {control.description && <p className="control-description" id={`${id}-description`}>{control.description}</p>}
  </div>;
}

function ColorField({ label, value, onChange, disabled }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const id = useId();
  return <div className="color-field" data-disabled={disabled || undefined}>
    <input type="color" id={id} value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} />
    <label htmlFor={id}>{label}</label>
    <input type="text" className="hex-entry" value={draft ?? value.toUpperCase()} disabled={disabled} maxLength={7}
      aria-label={`${label} hex`} spellCheck={false}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        const parsed = draft && parseHex(draft);
        if (parsed) onChange(parsed);
        setDraft(null);
      }}
      onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }}
    />
  </div>;
}

const presets = [
  { name: 'Ultraviolet', ...initialPalette },
  { name: 'Persimmon', ink: '#a22718', accent: '#e16b27', paper: '#f7dfc9' },
  { name: 'Poolside', ink: '#12444d', accent: '#16798a', paper: '#d4edf0' },
  { name: 'Electric', ink: '#dbe850', accent: '#fff6aa', paper: '#222625' },
  { name: 'Mono', ink: '#171721', accent: '#797984', paper: '#f9f8f4' },
];

export function ColorControls({ palette, setPalette }: { palette: Palette; setPalette: (next: Palette) => void }) {
  return <div className="color-controls">
    <ColorField label="Artwork" value={palette.ink} onChange={(ink) => setPalette({ ...palette, ink })} />
    <ColorField label="Accent" value={palette.accent} onChange={(accent) => setPalette({ ...palette, accent })} />
    <ColorField label="Background" value={palette.paper} disabled={palette.transparent}
      onChange={(paper) => setPalette({ ...palette, paper })} />
    <label className="transparency">
      <input type="checkbox" checked={palette.transparent}
        onChange={(event) => setPalette({ ...palette, transparent: event.target.checked })} />
      Transparent background
    </label>
    <div className="swatches-title"><PaletteIcon aria-hidden="true" size={16} /> Quick palettes</div>
    <div className="swatches">
      {presets.map(({ name, ink, accent, paper }) => {
        const active = ink === palette.ink && accent === palette.accent && paper === palette.paper;
        return <button key={name} type="button" className="swatch" title={name} aria-label={`${name} palette`} aria-pressed={active}
          style={{ backgroundColor: paper, color: ink }} onClick={() => setPalette({ ...palette, ink, accent, paper })}>
          {active ? <Check size={18} strokeWidth={3} aria-hidden="true" /> : <span style={{ backgroundColor: ink }} />}
        </button>;
      })}
    </div>
  </div>;
}
