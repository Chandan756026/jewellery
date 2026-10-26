import { createContext, useCallback, useContext, useEffect, useId, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Image as ImageIcon, Library, Trash2, Upload, X } from 'lucide-react';
import { api } from '../lib/api.js';

// ───────── formatting ─────────
export const fmtDate = (iso) => (iso ? new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—');

/** ISO (UTC) → value for <input type="datetime-local"> in the admin's own timezone */
export const toLocalInput = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};
/** datetime-local value → ISO UTC string for the API */
export const fromLocalInput = (v) => (v ? new Date(v).toISOString() : null);

export const slugify = (t) => t.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 120);

// ───────── toasts ─────────
const ToastCtx = createContext(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const push = useCallback((message, kind = 'ok') => {
    const id = Math.random().toString(36).slice(2);
    setItems((l) => [...l, { id, message, kind }]);
    setTimeout(() => setItems((l) => l.filter((t) => t.id !== id)), 4200);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="adm-toasts" role="status" aria-live="polite">
        {items.map((t) => <div key={t.id} className={`adm-toast adm-toast--${t.kind}`}>{t.message}</div>)}
      </div>
    </ToastCtx.Provider>
  );
}

// ───────── small components ─────────
export function Badge({ kind, children }) {
  return <span className={`adm-badge adm-badge--${kind}`}>{children}</span>;
}

export function Field({ label, error, hint, children, htmlFor, className = '' }) {
  return (
    <div className={`adm-field ${error ? 'has-error' : ''} ${className}`}>
      {label && <label htmlFor={htmlFor}>{label}</label>}
      {children}
      {hint && !error && <small className="adm-hint">{hint}</small>}
      {error && <small className="adm-error" role="alert">{error}</small>}
    </div>
  );
}

export function Toggle({ checked, onChange, label, hint }) {
  const id = useId();
  return (
    <div className="adm-toggle">
      <button id={id} type="button" role="switch" aria-checked={checked} className={checked ? 'is-on' : ''} onClick={() => onChange(!checked)}><i /></button>
      <label htmlFor={id}>{label}{hint && <small>{hint}</small>}</label>
    </div>
  );
}

export function Modal({ title, onClose, children, wide = false }) {
  useEffect(() => {
    const k = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', k);
    document.body.classList.add('is-locked');
    return () => { document.removeEventListener('keydown', k); document.body.classList.remove('is-locked'); };
  }, [onClose]);
  return (
    <div className="adm-modal" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`adm-modal__box${wide ? ' is-wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <header><h2>{title}</h2><button className="adm-icon" aria-label="Close" onClick={onClose}><X size={18} /></button></header>
        <div className="adm-modal__body">{children}</div>
      </div>
    </div>
  );
}

export function Confirm({ title, message, confirmLabel = 'Delete', onConfirm, onCancel, busy }) {
  return (
    <Modal title={title} onClose={onCancel}>
      <p className="adm-muted">{message}</p>
      <div className="adm-actions">
        <button className="adm-btn adm-btn--ghost" onClick={onCancel}>Cancel</button>
        <button className="adm-btn adm-btn--danger" onClick={onConfirm} disabled={busy}>{busy ? 'Working…' : confirmLabel}</button>
      </div>
    </Modal>
  );
}

export function Pagination({ meta, onPage }) {
  if (!meta || meta.pages <= 1) return null;
  return (
    <nav className="adm-pager" aria-label="Pagination">
      <button className="adm-icon" disabled={meta.page <= 1} onClick={() => onPage(meta.page - 1)} aria-label="Previous page"><ChevronLeft size={18} /></button>
      <span>Page {meta.page} of {meta.pages} · {meta.total} items</span>
      <button className="adm-icon" disabled={meta.page >= meta.pages} onClick={() => onPage(meta.page + 1)} aria-label="Next page"><ChevronRight size={18} /></button>
    </nav>
  );
}

// ───────── media library picker ─────────
export function MediaPicker({ onPick, onClose }) {
  const [state, setState] = useState({ items: [], meta: null, loading: true, error: null });
  const load = useCallback((page = 1) => {
    setState((s) => ({ ...s, loading: true }));
    api.get(`/admin/media?page=${page}&per_page=12`)
      .then((r) => setState({ items: r.data, meta: r.meta, loading: false, error: null }))
      .catch((e) => setState((s) => ({ ...s, loading: false, error: e.message })));
  }, []);
  useEffect(() => load(1), [load]);
  return (
    <Modal title="Choose from media library" onClose={onClose} wide>
      {state.error && <p className="adm-error">{state.error}</p>}
      {state.loading && <p className="adm-muted">Loading…</p>}
      {!state.loading && state.items.length === 0 && <p className="adm-muted">No images uploaded yet.</p>}
      <ul className="adm-media-grid">
        {state.items.map((m) => (
          <li key={m.id}><button onClick={() => onPick({ path: m.path, url: m.url })} aria-label={`Use ${m.name}`}><img src={m.url} alt="" loading="lazy" /><span>{m.name}</span></button></li>
        ))}
      </ul>
      <Pagination meta={state.meta} onPage={load} />
    </Modal>
  );
}

// ───────── image upload field ─────────
const TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_MB = 5;

/** Uploads a File with progress; resolves to { path, url } */
export async function uploadImage(file, folder, onProgress) {
  if (!TYPES.includes(file.type)) throw new Error('Only JPG, PNG and WebP images are allowed.');
  if (file.size > MAX_MB * 1048576) throw new Error(`The image must be smaller than ${MAX_MB} MB.`);
  const fd = new FormData();
  fd.append('file', file);
  fd.append('folder', folder);
  const { data } = await api.upload('/admin/media', fd, onProgress);
  return { path: data.path, url: data.url };
}

export function ImageField({ label, value, onChange, folder, hint, error, optional = true }) {
  const input = useRef(null);
  const [preview, setPreview] = useState(null); // local blob while uploading
  const [progress, setProgress] = useState(null);
  const [err, setErr] = useState(null);
  const [picker, setPicker] = useState(false);

  const pick = async (file) => {
    if (!file) return;
    setErr(null);
    const blob = URL.createObjectURL(file);
    setPreview(blob);
    setProgress(0);
    try {
      onChange(await uploadImage(file, folder, setProgress));
    } catch (e) {
      setErr(e.fields?.file || e.message);
    } finally {
      setProgress(null);
      setPreview(null);
      URL.revokeObjectURL(blob);
      if (input.current) input.current.value = '';
    }
  };

  const shown = preview || value?.url;
  return (
    <Field label={label} error={error || err} hint={hint}>
      <div className="adm-image">
        <div className="adm-image__frame">
          {shown ? <img src={shown} alt="" /> : <span><ImageIcon size={26} strokeWidth={1.2} />No image</span>}
          {progress !== null && <div className="adm-progress" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${progress}%` }} /></div>}
        </div>
        <div className="adm-image__actions">
          <input ref={input} type="file" accept={TYPES.join(',')} hidden onChange={(e) => pick(e.target.files?.[0])} />
          <button type="button" className="adm-btn adm-btn--ghost" onClick={() => input.current?.click()} disabled={progress !== null}><Upload size={15} />{value ? 'Replace' : 'Upload'}</button>
          <button type="button" className="adm-btn adm-btn--ghost" onClick={() => setPicker(true)}><Library size={15} />Library</button>
          {value && optional && <button type="button" className="adm-btn adm-btn--text" onClick={() => onChange(null)}>Remove</button>}
        </div>
      </div>
      {picker && <MediaPicker onClose={() => setPicker(false)} onPick={(m) => { onChange(m); setPicker(false); }} />}
    </Field>
  );
}

export function GalleryField({ label, value, onChange, folder, error, max = 12 }) {
  const input = useRef(null);
  const [busy, setBusy] = useState(null);
  const [err, setErr] = useState(null);
  const [picker, setPicker] = useState(false);

  const add = async (files) => {
    setErr(null);
    const list = [...files].slice(0, max - value.length);
    const added = [];
    for (const [i, f] of list.entries()) {
      setBusy(`Uploading ${i + 1} of ${list.length}…`);
      try { added.push(await uploadImage(f, folder, () => {})); } catch (e) { setErr(`${f.name}: ${e.fields?.file || e.message}`); }
    }
    setBusy(null);
    if (added.length) onChange([...value, ...added]);
    if (input.current) input.current.value = '';
  };
  const move = (i, d) => {
    const next = [...value];
    const j = i + d;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };

  return (
    <Field label={label} error={error || err} hint={`Up to ${max} images. They appear on the collection's detail view.`}>
      <ul className="adm-gallery">
        {value.map((g, i) => (
          <li key={g.path}>
            <img src={g.url} alt="" />
            <div>
              <button type="button" aria-label="Move earlier" disabled={i === 0} onClick={() => move(i, -1)}><ChevronLeft size={14} /></button>
              <button type="button" aria-label="Move later" disabled={i === value.length - 1} onClick={() => move(i, 1)}><ChevronRight size={14} /></button>
              <button type="button" aria-label="Remove image" onClick={() => onChange(value.filter((_, k) => k !== i))}><Trash2 size={14} /></button>
            </div>
          </li>
        ))}
      </ul>
      <div className="adm-image__actions">
        <input ref={input} type="file" multiple accept={TYPES.join(',')} hidden onChange={(e) => add(e.target.files)} />
        <button type="button" className="adm-btn adm-btn--ghost" disabled={!!busy || value.length >= max} onClick={() => input.current?.click()}><Upload size={15} />{busy || 'Add images'}</button>
        <button type="button" className="adm-btn adm-btn--ghost" disabled={value.length >= max} onClick={() => setPicker(true)}><Library size={15} />Library</button>
      </div>
      {picker && <MediaPicker onClose={() => setPicker(false)} onPick={(m) => { if (!value.some((v) => v.path === m.path)) onChange([...value, m]); setPicker(false); }} />}
    </Field>
  );
}
