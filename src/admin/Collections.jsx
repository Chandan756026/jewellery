import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowDown, ArrowUp, Eye, EyeOff, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { api } from '../lib/api.js';
import { Badge, Confirm, Field, GalleryField, ImageField, Modal, Pagination, Toggle, fmtDate, slugify, useToast } from './ui.jsx';

// ───────── list ─────────
function CollectionPreview({ c, onClose }) {
  return (
    <Modal title={`Preview: ${c.name || 'Untitled'}`} onClose={onClose} wide>
      {c.status !== 'published' && <p className="adm-alert adm-alert--info">Draft — visitors cannot see this collection until it is published.</p>}
      <div className="adm-preview">
        <article className="card">
          <div className="card__media">{c.cover_url ? <img src={c.cover_url} alt="" /> : null}<span className="card__no">01</span></div>
          <div className="card__body">
            <p className="eyebrow">{c.kind || 'Collection'}</p>
            <h3 className="card__name">{c.name || 'Untitled'}</h3>
            <p className="card__tag">{c.tagline || c.description}</p>
            <div className="card__row"><span className="card__price">{c.price_text || 'Price on enquiry'}</span><span className="btn-line">Add to enquiry</span></div>
          </div>
        </article>
        <div className="adm-preview__text">
          <p className="adm-eyebrow">Detail view</p>
          <h3>{c.tagline || c.name}</h3>
          <p className="adm-muted">{c.description}</p>
          {c.gallery?.length > 0 && <div className="adm-thumbs">{c.gallery.map((g) => <img key={g.path} src={g.url} alt="" />)}</div>}
          {c.status === 'published' && <a className="adm-btn adm-btn--ghost" href={`/#/piece/${c.slug}`} target="_blank" rel="noreferrer">Open on the website</a>}
        </div>
      </div>
    </Modal>
  );
}

export function Collections() {
  const toast = useToast();
  const [params, setParams] = useState({ page: 1, search: '', status: '' });
  const [state, setState] = useState({ data: [], meta: null, loading: true, error: null });
  const [preview, setPreview] = useState(null);
  const [removing, setRemoving] = useState(null);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');

  const load = useCallback(() => {
    setState((s) => ({ ...s, loading: true }));
    const qs = new URLSearchParams({ page: params.page, per_page: 10, ...(params.search && { search: params.search }), ...(params.status && { status: params.status }) });
    api.get(`/admin/collections?${qs}`)
      .then((r) => setState({ data: r.data, meta: r.meta, loading: false, error: null }))
      .catch((e) => setState((s) => ({ ...s, loading: false, error: e.message })));
  }, [params]);
  useEffect(load, [load]);

  useEffect(() => {
    const t = setTimeout(() => setParams((p) => (p.search === search ? p : { ...p, search, page: 1 })), 300);
    return () => clearTimeout(t);
  }, [search]);

  const act = async (fn, okMsg) => {
    try { await fn(); if (okMsg) toast(okMsg); load(); } catch (e) { toast(e.message, 'error'); }
  };
  const filtered = !!(params.search || params.status);

  return (
    <>
      <header className="adm-head">
        <div><p className="adm-eyebrow">Manage</p><h1>Collections</h1></div>
        <Link className="adm-btn adm-btn--solid" to="/admin/collections/new"><Plus size={16} />Add collection</Link>
      </header>

      <div className="adm-filters">
        <div className="adm-search"><Search size={16} /><input type="search" placeholder="Search collections" aria-label="Search collections" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
        <select aria-label="Filter by status" value={params.status} onChange={(e) => setParams({ ...params, status: e.target.value, page: 1 })}>
          <option value="">All statuses</option><option value="published">Published</option><option value="draft">Draft</option>
        </select>
      </div>

      {state.error && <p className="adm-alert">{state.error}</p>}
      <div className="adm-table-wrap">
        <table className="adm-table">
          <thead><tr><th>Collection</th><th>Status</th><th>Order</th><th>Updated</th><th className="adm-right">Actions</th></tr></thead>
          <tbody>
            {state.data.map((c, i) => (
              <tr key={c.id}>
                <td data-label="Collection">
                  <div className="adm-cell">
                    {c.cover_url ? <img src={c.cover_url} alt="" /> : <span className="adm-noimg" />}
                    <div><Link to={`/admin/collections/${c.id}`}><b>{c.name}</b></Link><small>/{c.slug}{c.is_featured ? ' · Featured' : ''}</small></div>
                  </div>
                </td>
                <td data-label="Status"><Badge kind={c.status}>{c.status === 'published' ? 'Published' : 'Draft'}</Badge></td>
                <td data-label="Order">
                  <div className="adm-order">
                    <button className="adm-icon" aria-label={`Move ${c.name} up`} disabled={filtered || (params.page === 1 && i === 0)} onClick={() => act(() => api.post(`/admin/collections/${c.id}/move`, { direction: 'up' }))}><ArrowUp size={15} /></button>
                    <span>{c.display_order}</span>
                    <button className="adm-icon" aria-label={`Move ${c.name} down`} disabled={filtered || (state.meta && params.page === state.meta.pages && i === state.data.length - 1)} onClick={() => act(() => api.post(`/admin/collections/${c.id}/move`, { direction: 'down' }))}><ArrowDown size={15} /></button>
                  </div>
                </td>
                <td data-label="Updated">{fmtDate(c.updated_at)}</td>
                <td className="adm-right" data-label="Actions">
                  <div className="adm-row-actions">
                    <button className="adm-icon" title="Preview" aria-label={`Preview ${c.name}`} onClick={() => setPreview(c)}><Eye size={16} /></button>
                    <button className="adm-icon" title={c.status === 'published' ? 'Unpublish' : 'Publish'} aria-label={c.status === 'published' ? `Unpublish ${c.name}` : `Publish ${c.name}`}
                      onClick={() => act(() => api.patch(`/admin/collections/${c.id}`, { status: c.status === 'published' ? 'draft' : 'published' }), c.status === 'published' ? 'Unpublished.' : 'Published.')}>
                      {c.status === 'published' ? <EyeOff size={16} /> : <Eye size={16} className="is-gold" />}
                    </button>
                    <Link className="adm-icon" title="Edit" aria-label={`Edit ${c.name}`} to={`/admin/collections/${c.id}`}><Pencil size={16} /></Link>
                    <button className="adm-icon adm-icon--danger" title="Delete" aria-label={`Delete ${c.name}`} onClick={() => setRemoving(c)}><Trash2 size={16} /></button>
                  </div>
                </td>
              </tr>
            ))}
            {!state.loading && state.data.length === 0 && <tr><td colSpan={5} className="adm-empty">{filtered ? 'No collections match your search.' : 'No collections yet. Add your first one.'}</td></tr>}
            {state.loading && state.data.length === 0 && <tr><td colSpan={5} className="adm-empty">Loading…</td></tr>}
          </tbody>
        </table>
      </div>
      <Pagination meta={state.meta} onPage={(page) => setParams({ ...params, page })} />
      {filtered && <p className="adm-hint">Reordering is available when no search or filter is applied.</p>}

      {preview && <CollectionPreview c={preview} onClose={() => setPreview(null)} />}
      {removing && (
        <Confirm title="Delete collection?" message={`“${removing.name}” will be removed from the website and cannot be restored. Its images stay in the media library.`} busy={busy}
          onCancel={() => setRemoving(null)}
          onConfirm={async () => { setBusy(true); await act(() => api.del(`/admin/collections/${removing.id}`), 'Collection deleted.'); setBusy(false); setRemoving(null); }} />
      )}
    </>
  );
}

// ───────── form ─────────
const EMPTY = { name: '', slug: '', kind: '', tagline: '', description: '', details: '', price_text: '', cover: null, gallery: [], display_order: 0, status: 'draft', is_featured: false };

export function CollectionForm() {
  const { id } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const [f, setF] = useState(EMPTY);
  const [created, setCreated] = useState(null);
  const [slugTouched, setSlugTouched] = useState(false);
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(!!id);
  const [loadError, setLoadError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(false);
  const dirty = useRef(false);

  useEffect(() => {
    if (!id) return;
    api.get(`/admin/collections/${id}`).then(({ data: c }) => {
      setF({
        name: c.name, slug: c.slug, kind: c.kind || '', tagline: c.tagline || '', description: c.description || '', details: c.details || '',
        price_text: c.price_text || '', cover: c.cover_image ? { path: c.cover_image, url: c.cover_url } : null, gallery: c.gallery,
        display_order: c.display_order, status: c.status, is_featured: c.is_featured,
      });
      setCreated(c.created_at);
      setSlugTouched(true);
      setLoading(false);
    }).catch((e) => { setLoadError(e.message); setLoading(false); });
  }, [id]);

  useEffect(() => {
    const warn = (e) => { if (dirty.current) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);

  const set = (patch) => { dirty.current = true; setF((s) => ({ ...s, ...patch })); };
  const err = (k) => errors[k];

  const submit = async (status) => {
    const body = {
      name: f.name, slug: f.slug || undefined, kind: f.kind || null, tagline: f.tagline || null, description: f.description || null, details: f.details || null,
      price_text: f.price_text || null, cover_image: f.cover?.path ?? null, gallery: f.gallery.map((g) => g.path),
      display_order: Number(f.display_order) || 0, is_featured: f.is_featured, status: status ?? f.status,
    };
    const fe = {};
    if (!body.name.trim()) fe.name = 'Enter the collection name.';
    if (body.status === 'published' && !body.cover_image) fe.cover_image = 'Upload a cover image to publish.';
    if (body.slug && !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(body.slug)) fe.slug = 'Use lowercase letters, numbers and single hyphens.';
    setErrors(fe);
    if (Object.keys(fe).length) { toast('Please correct the highlighted fields.', 'error'); return; }
    setBusy(true);
    try {
      if (id) await api.patch(`/admin/collections/${id}`, body);
      else await api.post('/admin/collections', body);
      dirty.current = false;
      toast(body.status === 'published' ? 'Saved and published.' : 'Saved as draft.');
      nav('/admin/collections');
    } catch (e) {
      setErrors(e.fields || {});
      toast(e.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <p className="adm-muted">Loading…</p>;
  if (loadError) return <p className="adm-alert">{loadError} <Link to="/admin/collections">Back to collections</Link></p>;

  return (
    <>
      <header className="adm-head">
        <div><p className="adm-eyebrow">{id ? 'Edit' : 'New'}</p><h1>{id ? f.name || 'Collection' : 'Add collection'}</h1></div>
        <Link className="adm-btn adm-btn--text" to="/admin/collections">← All collections</Link>
      </header>
      <form className="adm-form" onSubmit={(e) => { e.preventDefault(); submit(); }} noValidate>
        <section className="adm-panel">
          <h2>Details</h2>
          <div className="adm-grid">
            <Field label="Collection name *" error={err('name')} htmlFor="c-name">
              <input id="c-name" value={f.name} maxLength={120} onChange={(e) => { const name = e.target.value; set({ name, ...(!slugTouched && { slug: slugify(name) }) }); }} />
            </Field>
            <Field label="URL slug" error={err('slug')} hint="Generated from the name. Editable." htmlFor="c-slug">
              <input id="c-slug" value={f.slug} maxLength={140} onChange={(e) => { setSlugTouched(true); set({ slug: slugify(e.target.value) }); }} />
            </Field>
            <Field label="Category label" error={err('kind')} hint="Small text above the name, e.g. Necklace" htmlFor="c-kind">
              <input id="c-kind" value={f.kind} maxLength={60} onChange={(e) => set({ kind: e.target.value })} />
            </Field>
            <Field label="Tagline" error={err('tagline')} hint="One short line shown under the name" htmlFor="c-tag">
              <input id="c-tag" value={f.tagline} maxLength={200} onChange={(e) => set({ tagline: e.target.value })} />
            </Field>
            <Field label="Short description" error={err('description')} className="adm-span" htmlFor="c-desc">
              <textarea id="c-desc" rows={3} value={f.description} maxLength={2000} onChange={(e) => set({ description: e.target.value })} />
            </Field>
            <Field label="Detail points" error={err('details')} hint="One per line, shown on the detail view" className="adm-span" htmlFor="c-details">
              <textarea id="c-details" rows={3} value={f.details} maxLength={1500} onChange={(e) => set({ details: e.target.value })} />
            </Field>
            <Field label="Price text" error={err('price_text')} hint="Leave empty to show “Price on enquiry”" htmlFor="c-price">
              <input id="c-price" value={f.price_text} maxLength={60} onChange={(e) => set({ price_text: e.target.value })} />
            </Field>
          </div>
        </section>

        <section className="adm-panel">
          <h2>Images</h2>
          <ImageField label="Cover image *" value={f.cover} onChange={(cover) => set({ cover })} folder="collections" error={err('cover_image')}
            optional={false} hint="Shown on the collection card. Portrait 4:5 works best. JPG, PNG or WebP, up to 5 MB." />
          <GalleryField label="Gallery images (optional)" value={f.gallery} onChange={(gallery) => set({ gallery })} folder="collections" error={err('gallery')} />
        </section>

        <section className="adm-panel">
          <h2>Publishing</h2>
          <div className="adm-grid">
            <Field label="Status" error={err('status')} htmlFor="c-status">
              <select id="c-status" value={f.status} onChange={(e) => set({ status: e.target.value })}><option value="draft">Draft (private)</option><option value="published">Published (visible on the website)</option></select>
            </Field>
            <Field label="Display order" error={err('display_order')} hint="Lower numbers appear first. 0 = add at the end." htmlFor="c-order">
              <input id="c-order" type="number" min="0" value={f.display_order} onChange={(e) => set({ display_order: e.target.value })} />
            </Field>
            <Toggle checked={f.is_featured} onChange={(is_featured) => set({ is_featured })} label="Featured collection" />
            {created && <Field label="Created"><p className="adm-static">{fmtDate(created)}</p></Field>}
          </div>
        </section>

        <div className="adm-savebar">
          <button type="button" className="adm-btn adm-btn--ghost" onClick={() => setPreview(true)}><Eye size={15} />Preview</button>
          <span />
          {f.status === 'published' && <button type="button" className="adm-btn adm-btn--ghost" disabled={busy} onClick={() => submit('draft')}>Save as draft</button>}
          <button type="submit" className="adm-btn adm-btn--solid" disabled={busy}>
            {busy ? 'Saving…' : f.status === 'published' ? (id ? 'Save changes' : 'Publish') : 'Save draft'}
          </button>
        </div>
      </form>
      {preview && <CollectionPreview c={{ ...f, cover_url: f.cover?.url, price_text: f.price_text }} onClose={() => setPreview(false)} />}
    </>
  );
}
