import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Eye, Pause, Pencil, Play, Plus, Search, Trash2 } from 'lucide-react';
import { api } from '../lib/api.js';
import OfferPopup from '../components/OfferPopup.jsx';
import { Badge, Confirm, Field, ImageField, Pagination, Toggle, fmtDate, fromLocalInput, toLocalInput, useToast } from './ui.jsx';
import { STATE_LABEL } from './Dashboard.jsx';

const FREQ = {
  every_visit: 'Every visit',
  session: 'Once per session',
  daily: 'Once per day',
  campaign: 'Once per campaign',
};

/** Same rules as the server (api/src/offers.php) so the form can show the live state while editing. */
function stateOf({ status, starts_at, ends_at }, now = Date.now()) {
  if (status !== 'published') return 'draft';
  if (starts_at && Date.parse(starts_at) > now) return 'scheduled';
  if (ends_at && Date.parse(ends_at) <= now) return 'expired';
  return 'active';
}

/** Adapts an offer (list row or form values) to what the public popup component expects. */
const toPopup = (o) => ({
  id: o.id ?? 0,
  campaign_id: o.campaign_id || 'preview',
  title: o.title || 'Offer title',
  description: o.description,
  discount_text: o.discount_text,
  coupon_code: o.coupon_code,
  image: o.image?.url ?? o.image_url ?? (typeof o.image === 'string' ? o.image : null),
  mobile_image: o.mobile_image?.url ?? o.mobile_image_url ?? (typeof o.mobile_image === 'string' ? o.mobile_image : null),
  button_text: o.button_text,
  button_url: o.button_url,
  min_cart_value: o.min_cart_value ? Number(o.min_cart_value) : null,
  terms: o.terms,
});

// ───────── list ─────────
export function Offers() {
  const toast = useToast();
  const [params, setParams] = useState({ page: 1, search: '', state: '' });
  const [search, setSearch] = useState('');
  const [list, setList] = useState({ data: [], meta: null, loading: true, error: null });
  const [removing, setRemoving] = useState(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState({ offer: null, open: false });

  const load = useCallback(() => {
    setList((s) => ({ ...s, loading: true }));
    const qs = new URLSearchParams({ page: params.page, per_page: 10, ...(params.search && { search: params.search }), ...(params.state && { state: params.state }) });
    api.get(`/admin/offers?${qs}`)
      .then((r) => setList({ data: r.data, meta: r.meta, loading: false, error: null }))
      .catch((e) => setList((s) => ({ ...s, loading: false, error: e.message })));
  }, [params]);
  useEffect(load, [load]);
  useEffect(() => {
    const t = setTimeout(() => setParams((p) => (p.search === search ? p : { ...p, search, page: 1 })), 300);
    return () => clearTimeout(t);
  }, [search]);

  const act = async (fn, msg) => {
    try { await fn(); if (msg) toast(msg); load(); } catch (e) { toast(e.message, 'error'); }
  };

  return (
    <>
      <header className="adm-head">
        <div><p className="adm-eyebrow">Promotions</p><h1>Offers &amp; Popups</h1></div>
        <Link className="adm-btn adm-btn--solid" to="/admin/offers/new"><Plus size={16} />Add offer</Link>
      </header>
      <div className="adm-filters">
        <div className="adm-search"><Search size={16} /><input type="search" placeholder="Search offers" aria-label="Search offers" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
        <select aria-label="Filter by status" value={params.state} onChange={(e) => setParams({ ...params, state: e.target.value, page: 1 })}>
          <option value="">All statuses</option>
          {['active', 'scheduled', 'draft', 'expired'].map((s) => <option key={s} value={s}>{STATE_LABEL[s]}</option>)}
        </select>
      </div>
      {list.error && <p className="adm-alert">{list.error}</p>}
      <div className="adm-table-wrap">
        <table className="adm-table">
          <thead><tr><th>Offer</th><th>Status</th><th>Popup</th><th>Schedule</th><th>Priority</th><th className="adm-right">Actions</th></tr></thead>
          <tbody>
            {list.data.map((o) => (
              <tr key={o.id}>
                <td data-label="Offer"><Link to={`/admin/offers/${o.id}`}><b>{o.title}</b></Link><small>{[o.discount_text, o.coupon_code && `Code ${o.coupon_code}`].filter(Boolean).join(' · ') || '—'}</small></td>
                <td data-label="Status"><Badge kind={o.state}>{STATE_LABEL[o.state]}</Badge></td>
                <td data-label="Popup">{o.popup_enabled ? <>On<small>{FREQ[o.popup_frequency]}</small></> : 'Off'}</td>
                <td data-label="Schedule"><small>{fmtDate(o.starts_at)}</small><small>{o.ends_at ? `to ${fmtDate(o.ends_at)}` : 'No end date'}</small></td>
                <td data-label="Priority">{o.display_priority}</td>
                <td className="adm-right" data-label="Actions">
                  <div className="adm-row-actions">
                    <button className="adm-icon" title="Preview popup" aria-label={`Preview popup for ${o.title}`} onClick={() => setPreview({ offer: toPopup(o), open: true })}><Eye size={16} /></button>
                    <button className="adm-icon" title={o.status === 'published' ? 'Deactivate' : 'Activate'} aria-label={o.status === 'published' ? `Deactivate ${o.title}` : `Activate ${o.title}`}
                      onClick={() => act(() => api.patch(`/admin/offers/${o.id}`, { status: o.status === 'published' ? 'draft' : 'published' }), o.status === 'published' ? 'Offer deactivated.' : 'Offer activated.')}>
                      {o.status === 'published' ? <Pause size={16} /> : <Play size={16} className="is-gold" />}
                    </button>
                    <Link className="adm-icon" title="Edit" aria-label={`Edit ${o.title}`} to={`/admin/offers/${o.id}`}><Pencil size={16} /></Link>
                    <button className="adm-icon adm-icon--danger" title="Delete" aria-label={`Delete ${o.title}`} onClick={() => setRemoving(o)}><Trash2 size={16} /></button>
                  </div>
                </td>
              </tr>
            ))}
            {!list.loading && list.data.length === 0 && <tr><td colSpan={6} className="adm-empty">{params.search || params.state ? 'No offers match your search.' : 'No offers yet. Create your first one.'}</td></tr>}
            {list.loading && list.data.length === 0 && <tr><td colSpan={6} className="adm-empty">Loading…</td></tr>}
          </tbody>
        </table>
      </div>
      <Pagination meta={list.meta} onPage={(page) => setParams({ ...params, page })} />
      <OfferPopup offer={preview.offer} open={preview.open} preview onClose={() => setPreview((p) => ({ ...p, open: false }))} />
      {removing && (
        <Confirm title="Delete offer?" message={`“${removing.title}” will stop appearing on the website and cannot be restored.`} busy={busy}
          onCancel={() => setRemoving(null)}
          onConfirm={async () => { setBusy(true); await act(() => api.del(`/admin/offers/${removing.id}`), 'Offer deleted.'); setBusy(false); setRemoving(null); }} />
      )}
    </>
  );
}

// ───────── form ─────────
const inOneWeek = () => { const d = new Date(); d.setDate(d.getDate() + 7); return toLocalInput(d.toISOString()); };
const EMPTY = {
  title: '', description: '', discount_text: '', coupon_code: '', image: null, mobile_image: null, button_text: '', button_url: '',
  starts_at: toLocalInput(new Date().toISOString()), ends_at: inOneWeek(), status: 'draft', popup_enabled: true, popup_frequency: 'session',
  display_priority: 0, min_cart_value: '', terms: '', campaign_id: '',
};

export function OfferForm() {
  const { id } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const [f, setF] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(!!id);
  const [loadError, setLoadError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(false);
  const dirty = useRef(false);

  useEffect(() => {
    if (!id) return;
    api.get(`/admin/offers/${id}`).then(({ data: o }) => {
      setF({
        title: o.title, description: o.description || '', discount_text: o.discount_text || '', coupon_code: o.coupon_code || '',
        image: o.image_path ? { path: o.image_path, url: o.image } : null, mobile_image: o.mobile_image_path ? { path: o.mobile_image_path, url: o.mobile_image } : null,
        button_text: o.button_text || '', button_url: o.button_url || '', starts_at: toLocalInput(o.starts_at), ends_at: toLocalInput(o.ends_at),
        status: o.status, popup_enabled: o.popup_enabled, popup_frequency: o.popup_frequency, display_priority: o.display_priority,
        min_cart_value: o.min_cart_value ?? '', terms: o.terms || '', campaign_id: o.campaign_id,
      });
      setLoading(false);
    }).catch((e) => { setLoadError(e.message); setLoading(false); });
  }, [id]);

  useEffect(() => {
    const warn = (e) => { if (dirty.current) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);

  const set = (patch) => { dirty.current = true; setF((s) => ({ ...s, ...patch })); };
  const live = stateOf({ status: f.status, starts_at: fromLocalInput(f.starts_at), ends_at: fromLocalInput(f.ends_at) });

  const submit = async (e) => {
    e.preventDefault();
    const fe = {};
    if (!f.title.trim()) fe.title = 'Enter the offer title.';
    if (!f.starts_at) fe.starts_at = 'Choose when the offer starts.';
    if (f.starts_at && f.ends_at && new Date(f.ends_at) <= new Date(f.starts_at)) fe.ends_at = 'The end must be after the start.';
    if (f.button_text && !f.button_url) fe.button_url = 'Add a link for the button, or clear the button text.';
    if (f.button_url && !f.button_text) fe.button_text = 'Add the text for the button.';
    setErrors(fe);
    if (Object.keys(fe).length) { toast('Please correct the highlighted fields.', 'error'); return; }
    const body = {
      title: f.title, description: f.description || null, discount_text: f.discount_text || null, coupon_code: f.coupon_code || null,
      image: f.image?.path ?? null, mobile_image: f.mobile_image?.path ?? null, button_text: f.button_text || null, button_url: f.button_url || null,
      starts_at: fromLocalInput(f.starts_at), ends_at: fromLocalInput(f.ends_at), status: f.status, popup_enabled: f.popup_enabled,
      popup_frequency: f.popup_frequency, display_priority: Number(f.display_priority) || 0, min_cart_value: f.min_cart_value === '' ? null : f.min_cart_value,
      terms: f.terms || null, campaign_id: f.campaign_id || undefined,
    };
    setBusy(true);
    try {
      if (id) await api.patch(`/admin/offers/${id}`, body);
      else await api.post('/admin/offers', body);
      dirty.current = false;
      toast('Offer saved.');
      nav('/admin/offers');
    } catch (err) {
      setErrors(err.fields || {});
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <p className="adm-muted">Loading…</p>;
  if (loadError) return <p className="adm-alert">{loadError} <Link to="/admin/offers">Back to offers</Link></p>;
  const er = (k) => errors[k];

  return (
    <>
      <header className="adm-head">
        <div><p className="adm-eyebrow">{id ? 'Edit' : 'New'}</p><h1>{id ? f.title || 'Offer' : 'Add offer'}</h1></div>
        <div className="adm-actions"><Badge kind={live}>{STATE_LABEL[live]}</Badge><Link className="adm-btn adm-btn--text" to="/admin/offers">← All offers</Link></div>
      </header>
      <form className="adm-form" onSubmit={submit} noValidate>
        <section className="adm-panel">
          <h2>Offer</h2>
          <div className="adm-grid">
            <Field label="Offer title *" error={er('title')} htmlFor="o-title"><input id="o-title" value={f.title} maxLength={160} onChange={(e) => set({ title: e.target.value })} /></Field>
            <Field label="Discount text" error={er('discount_text')} hint="e.g. 20% OFF" htmlFor="o-disc"><input id="o-disc" value={f.discount_text} maxLength={60} onChange={(e) => set({ discount_text: e.target.value })} /></Field>
            <Field label="Subtitle / description" error={er('description')} className="adm-span" htmlFor="o-desc"><textarea id="o-desc" rows={3} value={f.description} maxLength={1000} onChange={(e) => set({ description: e.target.value })} /></Field>
            <Field label="Coupon code (optional)" error={er('coupon_code')} htmlFor="o-code"><input id="o-code" value={f.coupon_code} maxLength={40} onChange={(e) => set({ coupon_code: e.target.value.toUpperCase() })} /></Field>
            <Field label="Minimum cart value (optional)" error={er('min_cart_value')} hint="In rupees" htmlFor="o-min"><input id="o-min" type="number" min="0" step="1" value={f.min_cart_value} onChange={(e) => set({ min_cart_value: e.target.value })} /></Field>
            <Field label="Button text" error={er('button_text')} hint="e.g. Explore Collection" htmlFor="o-btn"><input id="o-btn" value={f.button_text} maxLength={60} onChange={(e) => set({ button_text: e.target.value })} /></Field>
            <Field label="Button link" error={er('button_url')} hint="#collection, /page or https://…" htmlFor="o-url"><input id="o-url" value={f.button_url} maxLength={500} onChange={(e) => set({ button_url: e.target.value })} /></Field>
            <Field label="Terms and conditions (optional)" error={er('terms')} className="adm-span" htmlFor="o-terms"><textarea id="o-terms" rows={2} value={f.terms} maxLength={2000} onChange={(e) => set({ terms: e.target.value })} /></Field>
          </div>
        </section>

        <section className="adm-panel">
          <h2>Banner images (optional)</h2>
          <div className="adm-grid">
            <ImageField label="Desktop banner" value={f.image} onChange={(image) => set({ image })} folder="offers" error={er('image')} hint="Landscape or portrait; shown beside the text." />
            <ImageField label="Mobile banner" value={f.mobile_image} onChange={(mobile_image) => set({ mobile_image })} folder="offers" error={er('mobile_image')} hint="Wide crop shown on phones. Falls back to the desktop banner." />
          </div>
        </section>

        <section className="adm-panel">
          <h2>Schedule &amp; status</h2>
          <div className="adm-grid">
            <Field label="Starts *" error={er('starts_at')} htmlFor="o-start"><input id="o-start" type="datetime-local" value={f.starts_at} onChange={(e) => set({ starts_at: e.target.value })} /></Field>
            <Field label="Ends" error={er('ends_at')} hint="Leave empty to run until deactivated" htmlFor="o-end"><input id="o-end" type="datetime-local" value={f.ends_at} onChange={(e) => set({ ends_at: e.target.value })} /></Field>
            <Field label="Visibility" error={er('status')} hint="Published offers go live automatically at the start time." htmlFor="o-status">
              <select id="o-status" value={f.status} onChange={(e) => set({ status: e.target.value })}><option value="draft">Draft (hidden)</option><option value="published">Published</option></select>
            </Field>
            <Field label="Current status"><p className="adm-static"><Badge kind={live}>{STATE_LABEL[live]}</Badge> <small>Times are in your local timezone.</small></p></Field>
          </div>
        </section>

        <section className="adm-panel">
          <h2>Popup</h2>
          <div className="adm-grid">
            <Toggle checked={f.popup_enabled} onChange={(popup_enabled) => set({ popup_enabled })} label="Show as homepage popup" hint="When off, the offer is live but no popup appears." />
            <Field label="Display frequency" error={er('popup_frequency')} htmlFor="o-freq">
              <select id="o-freq" value={f.popup_frequency} onChange={(e) => set({ popup_frequency: e.target.value })}>
                {Object.entries(FREQ).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </Field>
            <Field label="Display priority" error={er('display_priority')} hint="Higher number wins when several offers are active." htmlFor="o-prio"><input id="o-prio" type="number" min="0" max="1000" value={f.display_priority} onChange={(e) => set({ display_priority: e.target.value })} /></Field>
            {id && <Field label="Campaign ID" error={er('campaign_id')} hint="Change it to show a “once per campaign” popup again to everyone." htmlFor="o-cmp"><input id="o-cmp" value={f.campaign_id} maxLength={40} onChange={(e) => set({ campaign_id: e.target.value })} /></Field>}
          </div>
        </section>

        <div className="adm-savebar">
          <button type="button" className="adm-btn adm-btn--ghost" onClick={() => setPreview(true)}><Eye size={15} />Preview popup</button>
          <span />
          <button className="adm-btn adm-btn--solid" disabled={busy}>{busy ? 'Saving…' : 'Save offer'}</button>
        </div>
      </form>
      <OfferPopup offer={toPopup(f)} open={preview} preview onClose={() => setPreview(false)} />
    </>
  );
}
