import { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react';
import { ChevronDown, Dice5, Grid2X2, Palette, Pause, Play, RotateCcw, SlidersHorizontal } from 'lucide-react';
import { ColorControls, NumberEntry, PatternControl, Slider } from './Controls';
import { ExportDialog } from './ExportDialog';
import { PatternLibrary } from './PatternLibrary';
import { ThemeToggle } from './ThemeToggle';
import { initialPalette, initialSize, parseHex, svgArtwork } from './engine';
import type { ArtworkSettings } from './engine';
import { patterns } from './patterns';
import { clamp, patternValues, range } from './patterns/model';
import type { PatternDefinition, PatternValues } from './patterns/model';

interface Session extends ArtworkSettings {
  patternId: string;
}

type Panel = 'patterns' | 'adjust' | 'colors';

const storageKey = 'shapes.editor.v1';
const initialSeed = 17;
const initialPhase = 0.22;
const phaseControl = range('artwork-phase', 'Phase', 0, 1, 0.001, initialPhase, 'Move through the animation cycle.');
const sizes = [
  { label: 'Landscape (4:3)', width: 960, height: 720 },
  { label: 'Square (1:1)', width: 900, height: 900 },
  { label: 'Portrait (3:4)', width: 720, height: 960 },
  { label: 'Wide (16:9)', width: 1280, height: 720 },
];

function fitDimension(value: number) {
  return clamp(Math.round(value), 120, 4096);
}

function defaultSession(): Session {
  const pattern = patterns[0];
  const base: Session = {
    ...initialSize, patternId: pattern.id, palette: initialPalette, seed: initialSeed, phase: initialPhase,
    values: patternValues(pattern),
  };
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) ?? 'null') as Partial<Session> | null;
    if (!saved || typeof saved !== 'object') return base;
    const savedPattern = patterns.find((item) => item.id === saved.patternId) ?? pattern;
    const palette = saved.palette;
    return {
      width: typeof saved.width === 'number' && Number.isFinite(saved.width) ? fitDimension(saved.width) : base.width,
      height: typeof saved.height === 'number' && Number.isFinite(saved.height) ? fitDimension(saved.height) : base.height,
      patternId: savedPattern.id,
      values: patternValues(savedPattern, saved.values),
      seed: typeof saved.seed === 'number' && Number.isFinite(saved.seed) ? clamp(Math.round(saved.seed), 0, 9999) : base.seed,
      phase: typeof saved.phase === 'number' && Number.isFinite(saved.phase) ? clamp(saved.phase, 0, 1) : base.phase,
      palette: {
        ink: typeof palette?.ink === 'string' ? parseHex(palette.ink) ?? initialPalette.ink : initialPalette.ink,
        accent: typeof palette?.accent === 'string' ? parseHex(palette.accent) ?? initialPalette.accent : initialPalette.accent,
        paper: typeof palette?.paper === 'string' ? parseHex(palette.paper) ?? initialPalette.paper : initialPalette.paper,
        transparent: palette?.transparent === true,
      },
    };
  } catch {
    return base;
  }
}

function Brand() {
  return <div className="brand">
    <svg className="brand-mark" viewBox="0 0 44 44" aria-hidden="true">
      <rect width="44" height="44" rx="10" fill="currentColor" />
      <path d="M22 7v30M7 22h30M11.4 11.4l21.2 21.2m0-21.2L11.4 32.6" fill="none" stroke="white" strokeWidth="4.3" strokeLinecap="round" />
      <circle cx="22" cy="22" r="4.7" fill="currentColor" />
    </svg>
    <div className="brand-type"><h1>Shapes<span>.</span></h1><p>Generative art studio</p></div>
  </div>;
}

function Adjustments({ pattern, values, phase, playing, onChange, onPhase, togglePlaying }: {
  pattern: PatternDefinition;
  values: PatternValues;
  phase: number;
  playing: boolean;
  onChange: (id: string, value: number | string) => void;
  onPhase: (phase: number) => void;
  togglePlaying: () => void;
}) {
  const basic = pattern.controls.filter((control) => !control.advanced);
  const advanced = pattern.controls.filter((control) => control.advanced);
  return <>
    {pattern.animated && <div className="motion-controls">
      <div className="motion-head"><h3>Motion</h3><button type="button" className="secondary-button" onClick={togglePlaying}>
        {playing ? <Pause size={15} aria-hidden="true" /> : <Play size={15} aria-hidden="true" />}
        {playing ? 'Pause' : 'Play'}
      </button></div>
      <Slider control={phaseControl} value={Number(phase.toFixed(3))} onChange={onPhase} />
    </div>}
    {basic.map((control) => <PatternControl control={control} values={values} onChange={onChange} key={control.id} />)}
    {advanced.length > 0 && <details className="advanced" key={pattern.id}>
      <summary>Advanced controls <ChevronDown size={16} aria-hidden="true" /></summary>
      {advanced.map((control) => <PatternControl control={control} values={values} onChange={onChange} key={control.id} />)}
    </details>}
  </>;
}

export default function App() {
  const [settings, setSettings] = useState(defaultSession);
  const [panel, setPanel] = useState<Panel>('adjust');
  const [playing, setPlaying] = useState(false);
  const [customSize, setCustomSize] = useState(false);
  const pattern = patterns.find((item) => item.id === settings.patternId) ?? patterns[0];
  const rendered = useDeferredValue(settings);
  const preview = pattern.id === rendered.patternId ? rendered : settings;
  const svg = useMemo(() => svgArtwork(pattern, preview), [pattern, preview]);
  const standardSize = sizes.findIndex(({ width, height }) => width === settings.width && height === settings.height);
  const currentSize = customSize || standardSize === -1 ? 'custom' : String(standardSize);
  const inspectorPanel = panel === 'colors' ? 'colors' : 'adjust';

  useEffect(() => {
    if (playing) return;
    try { localStorage.setItem(storageKey, JSON.stringify(settings)); } catch { /* editing still works without storage */ }
  }, [settings, playing]);

  useEffect(() => {
    if (!playing) return;
    let previous = performance.now();
    let loop = 0;
    function tick(now: number) {
      const elapsed = now - previous;
      if (elapsed >= 30) {
        setSettings((current) => ({ ...current, phase: (current.phase + elapsed / 4200) % 1 }));
        previous = now;
      }
      loop = requestAnimationFrame(tick);
    }
    loop = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(loop);
  }, [playing]);

  const choosePattern = useCallback((next: PatternDefinition) => {
    setPlaying(false);
    setPanel('adjust');
    setSettings((current) => current.patternId === next.id ? current : {
      ...current, patternId: next.id, values: patternValues(next), phase: initialPhase, seed: initialSeed,
    });
    if (window.matchMedia('(max-width: 899px)').matches) window.scrollTo(0, 0);
  }, []);

  function changeControl(id: string, value: number | string) {
    setSettings((current) => ({ ...current, values: { ...current.values, [id]: value } }));
  }

  function shuffleSeed() {
    const offset = 1 + Math.floor(Math.random() * 9999);
    setSettings((current) => ({ ...current, seed: (current.seed + offset) % 10000 }));
  }

  return <div className="app-shell">
    <header className="topbar">
      <Brand />
      <div className="header-actions">
        <ThemeToggle />
        <ExportDialog pattern={pattern} settings={settings} onOpen={() => setPlaying(false)} />
      </div>
    </header>

    <main className="workspace">
      <PatternLibrary patterns={patterns} selected={pattern.id} onSelect={choosePattern} active={panel === 'patterns'} />

      <section className="workbench" aria-labelledby="art-title">
        <div className="art-header">
          <div>
            <div className="category-label"><span />{pattern.category}</div>
            <h2 id="art-title">{pattern.name}</h2>
            <p>{pattern.description}</p>
          </div>
          <div className="art-tools">
            <button type="button" className="icon-button" title="Shuffle seed" aria-label="Shuffle seed" onClick={shuffleSeed}>
              <Dice5 size={20} aria-hidden="true" />
            </button>
            <button type="button" className="icon-button" title="Reset pattern controls" aria-label="Reset pattern controls" onClick={() => {
              setPlaying(false);
              setSettings((current) => ({ ...current, values: patternValues(pattern), phase: initialPhase, seed: initialSeed }));
            }}><RotateCcw size={19} aria-hidden="true" /></button>
          </div>
        </div>

        <div className="art-stage">
          <div className="art-paper" role="img" aria-label={`${pattern.name} artwork preview`}
            data-transparent={preview.palette.transparent || undefined}
            style={{ '--art-ratio': preview.width / preview.height } as React.CSSProperties}
            dangerouslySetInnerHTML={{ __html: svg }} />
        </div>

        <div className="art-footer">
          <div className="format-tools">
            <div className="select-wrap format-select">
              <select aria-label="Canvas format" value={currentSize} onChange={(event) => {
                const value = event.target.value;
                setCustomSize(value === 'custom');
                if (value !== 'custom') setSettings((current) => ({ ...current, width: sizes[Number(value)].width, height: sizes[Number(value)].height }));
              }}>
                {sizes.map((size, index) => <option key={size.label} value={index}>{size.label}</option>)}
                <option value="custom">Custom size</option>
              </select>
              <ChevronDown size={15} aria-hidden="true" />
            </div>
            {currentSize === 'custom' ? <div className="custom-size" aria-label="Custom canvas dimensions">
              <NumberEntry label="Canvas width" value={settings.width} onChange={(width) => setSettings((current) => ({ ...current, width: fitDimension(width) }))} />
              <span>×</span>
              <NumberEntry label="Canvas height" value={settings.height} onChange={(height) => setSettings((current) => ({ ...current, height: fitDimension(height) }))} />
              <span>px</span>
            </div> : <span className="dimensions">{settings.width} × {settings.height} px</span>}
          </div>
          <div className="seed-tools">
            <span>Seed</span><NumberEntry label="Seed" value={settings.seed} onChange={(seed) => setSettings((current) => ({ ...current, seed: clamp(Math.round(seed), 0, 9999) }))} />
          </div>
        </div>
      </section>

      <nav className="mobile-panels" aria-label="Editor panels">
        <button type="button" aria-pressed={panel === 'patterns'} onClick={() => setPanel('patterns')}><Grid2X2 size={17} aria-hidden="true" /> Patterns</button>
        <button type="button" aria-pressed={panel === 'adjust'} onClick={() => setPanel('adjust')}><SlidersHorizontal size={17} aria-hidden="true" /> Adjust</button>
        <button type="button" aria-pressed={panel === 'colors'} onClick={() => setPanel('colors')}><Palette size={17} aria-hidden="true" /> Colors</button>
      </nav>

      <aside className="inspector" aria-label="Pattern settings" data-active={panel !== 'patterns'}>
        <div className="inspector-tabs" aria-label="Pattern settings panels">
          <button type="button" aria-pressed={inspectorPanel === 'adjust'} onClick={() => setPanel('adjust')}><SlidersHorizontal size={17} aria-hidden="true" /> Adjust</button>
          <button type="button" aria-pressed={inspectorPanel === 'colors'} onClick={() => setPanel('colors')}><Palette size={17} aria-hidden="true" /> Colors</button>
        </div>
        <div className="inspector-scroll" key={`${pattern.id}-${inspectorPanel}`}>
          {inspectorPanel === 'colors' ? <ColorControls palette={settings.palette}
            setPalette={(palette) => setSettings((current) => ({ ...current, palette }))} /> :
            <Adjustments pattern={pattern} values={settings.values} phase={settings.phase} playing={playing}
              onChange={changeControl} onPhase={(phase) => {
                setPlaying(false);
                setSettings((current) => ({ ...current, phase }));
              }} togglePlaying={() => setPlaying((current) => !current)} />}
        </div>
      </aside>
    </main>
  </div>;
}
