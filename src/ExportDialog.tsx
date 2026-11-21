import { useRef, useState } from 'react';
import { Download, X } from 'lucide-react';
import { NumberEntry } from './Controls';
import { downloadArtwork, exportDimensions } from './engine';
import type { ArtworkSettings } from './engine';
import type { PatternDefinition } from './patterns/model';

export function ExportDialog({ pattern, settings, onOpen }: {
  pattern: PatternDefinition;
  settings: ArtworkSettings;
  onOpen: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [format, setFormat] = useState<'svg' | 'png'>('svg');
  const [pngWidth, setPngWidth] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const output = exportDimensions(settings.width, settings.height, pngWidth ?? settings.width);

  async function download() {
    if (busy) return;
    setBusy(true);
    setMessage('');
    try {
      await downloadArtwork(pattern, settings, format, output.width);
      setMessage(`${format.toUpperCase()} downloaded.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'The download failed.');
    } finally {
      setBusy(false);
    }
  }

  return <>
    <button className="primary-button header-export" type="button" onClick={() => {
      onOpen();
      setMessage('');
      dialog.current?.showModal();
    }}><Download size={18} aria-hidden="true" /> Export</button>
    <dialog ref={dialog} className="export-dialog" aria-labelledby="export-title">
      <div className="dialog-head">
        <div>
          <h2 id="export-title">Export artwork</h2>
          <p>{pattern.name}</p>
        </div>
        <button className="icon-button" type="button" aria-label="Close export" onClick={() => dialog.current?.close()}>
          <X size={20} aria-hidden="true" />
        </button>
      </div>
      <div className="export-options" aria-label="File format">
        <button type="button" aria-pressed={format === 'svg'} onClick={() => { setFormat('svg'); setMessage(''); }}>
          <strong>SVG</strong><span>Editable vector</span>
        </button>
        <button type="button" aria-pressed={format === 'png'} onClick={() => { setFormat('png'); setMessage(''); }}>
          <strong>PNG</strong><span>Raster image</span>
        </button>
      </div>
      {format === 'png' && <div className="export-size">
        <div className="size-presets">
          <button type="button" onClick={() => setPngWidth(null)}>1×</button>
          <button type="button" onClick={() => setPngWidth(settings.width * 2)}>2×</button>
        </div>
        <label>Width <NumberEntry label="PNG width in pixels" value={output.width} onChange={(width) => setPngWidth(width)} /> px</label>
      </div>}
      <div className="export-meta">
        <span>{format === 'png' ? `${output.width} × ${output.height}` : `${settings.width} × ${settings.height}`} px</span>
        <span>{settings.palette.transparent ? 'Transparent background' : 'Solid background'}</span>
      </div>
      <button className="primary-button download" type="button" onClick={download} disabled={busy}>
        <Download size={18} aria-hidden="true" /> {busy ? 'Preparing download…' : `Download ${format.toUpperCase()}`}
      </button>
      {message && <p role="status" className="export-status">{message}</p>}
    </dialog>
  </>;
}
