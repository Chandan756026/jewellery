import { useCallback, useEffect, useRef, useState } from 'react';
import { Trash2, Upload } from 'lucide-react';
import { api } from '../lib/api.js';
import { useAuth } from './auth.js';
import { Badge, Confirm, Field, Pagination, Toggle, fmtDate, uploadImage, useToast } from './ui.jsx';

// ───────── media library ─────────
export function MediaLibrary() {
  const toast = useToast();
  const input = useRef(null);
  const [page, setPage] = useState(1);
  const [state, setState] = useState({ data: [], meta: null, loading: true, error: null });
  const [removing, setRemoving] = useState(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(null);

  const load = useCallback(() => {
    setState((s) => ({ ...s, loading: true }));
    api.get(`/admin/media?page=${page}&per_page=18`)
      .then((r) => setState({ data: r.data, meta: r.meta, loading: false, error: null }))
      .catch((e) => setState((s) => ({ ...s, loading: false, error: e.message })));
  }, [page]);
  useEffect(load, [load]);

  const upload = async (files) => {
    for (const [i, f] of [...files].entries()) {
      setUploading(`Uploading ${i + 1} of ${files.length}…`);
      try { await uploadImage(f, 'general', () => {}); } catch (e) { toast(`${f.name}: ${e.fields?.file || e.message}`, 'error'); }
    }
    setUploading(null);
    if (input.current) input.current.value = '';
    setPage(1);
    load();
  };

  const remove = async () => {
    setBusy(true);
    try { await api.del(`/admin/media/${removing.id}`); toast('Image deleted.'); load(); } catch (e) { toast(e.message, 'error'); }
    setBusy(false);
    setRemoving(null);
  };

  return (
    <>
      <header className="adm-head">
        <div><p className="adm-eyebrow">Files</p><h1>Media Library</h1></div>
        <div className="adm-actions">
          <input ref={input} type="file" multiple hidden accept="image/jpeg,image/png,image/webp" onChange={(e) => upload(e.target.files)} />
          <button className="adm-btn adm-btn--solid" disabled={!!uploading} onClick={() => input.current?.click()}><Upload size={16} />{uploading || 'Upload images'}</button>
        </div>
      </header>
      {state.error && <p className="adm-alert">{state.error}</p>}
      {!state.loading && state.data.length === 0 && <p className="adm-muted">No images yet.</p>}
      <ul className="adm-media-grid adm-media-grid--lib">
        {state.data.map((m) => (
          <li key={m.id}>
            <img src={m.url} alt="" loading="lazy" />
            <span title={m.name}>{m.name}</span>
            <small>{m.width}×{m.height} · {Math.round(m.size / 1024)} KB</small>
            <button className="adm-icon adm-icon--danger" aria-label={`Delete ${m.name}`} onClick={() => setRemoving(m)}><Trash2 size={15} /></button>
          </li>
        ))}
      </ul>
      <Pagination meta={state.meta} onPage={setPage} />
      {removing && <Confirm title="Delete image?" message="The file is removed from the server. Images that are still used by a collection or offer cannot be deleted." busy={busy} onCancel={() => setRemoving(null)} onConfirm={remove} />}
    </>
  );
}

// ───────── settings + team ─────────
const SETTING_FIELDS = [
  ['address', 'Address', 'textarea'],
  ['phone', 'Phone', 'input'],
  ['email', 'Email', 'input'],
  ['hours', 'Opening hours', 'input'],
  ['instagram', 'Instagram link', 'input'],
  ['facebook', 'Facebook link', 'input'],
  ['whatsapp', 'WhatsApp number', 'input'],
];

function Team() {
  const { user: me } = useAuth();
  const toast = useToast();
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState({ name: '', email: '', username: '', role: 'editor', password: '' });
  const [errors, setErrors] = useState({});
  const [removing, setRemoving] = useState(null);

  const load = useCallback(() => api.get('/admin/users').then((r) => setUsers(r.data)).catch((e) => toast(e.message, 'error')), [toast]);
  useEffect(() => { load(); }, [load]);

  const add = async (e) => {
    e.preventDefault();
    setErrors({});
    try {
      await api.post('/admin/users', { ...form, username: form.username || null });
      setForm({ name: '', email: '', username: '', role: 'editor', password: '' });
      toast('Team member added.');
      load();
    } catch (err) {
      setErrors(err.fields || {});
      toast(err.message, 'error');
    }
  };
  const patch = async (u, body, msg) => {
    try { await api.patch(`/admin/users/${u.id}`, body); toast(msg); load(); } catch (err) { toast(err.message, 'error'); }
  };

  return (
    <section className="adm-panel">
      <h2>Team</h2>
      <p className="adm-muted">Administrators manage everything. Editors can manage collections, offers and media.</p>
      <div className="adm-table-wrap">
        <table className="adm-table">
          <thead><tr><th>Name</th><th>Role</th><th>Last sign-in</th><th className="adm-right">Actions</th></tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td data-label="Name"><b>{u.name}</b><small>{u.email}{u.username ? ` · @${u.username}` : ''}</small></td>
                <td data-label="Role"><Badge kind={u.role === 'admin' ? 'active' : 'draft'}>{u.role === 'admin' ? 'Administrator' : 'Editor'}</Badge>{!u.is_active && <small>Disabled</small>}</td>
                <td data-label="Last sign-in">{fmtDate(u.last_login_at)}</td>
                <td className="adm-right" data-label="Actions">
                  {u.id !== me.id && (
                    <div className="adm-row-actions">
                      <button className="adm-btn adm-btn--text" onClick={() => patch(u, { is_active: !u.is_active }, u.is_active ? 'Account disabled.' : 'Account enabled.')}>{u.is_active ? 'Disable' : 'Enable'}</button>
                      <button className="adm-btn adm-btn--text" onClick={() => patch(u, { role: u.role === 'admin' ? 'editor' : 'admin' }, 'Role updated.')}>Make {u.role === 'admin' ? 'editor' : 'admin'}</button>
                      <button className="adm-icon adm-icon--danger" aria-label={`Delete ${u.name}`} onClick={() => setRemoving(u)}><Trash2 size={15} /></button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h3>Add a team member</h3>
      <form className="adm-grid" onSubmit={add} noValidate>
        <Field label="Name" error={errors.name} htmlFor="u-name"><input id="u-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
        <Field label="Email" error={errors.email} htmlFor="u-email"><input id="u-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
        <Field label="Username (optional)" error={errors.username} htmlFor="u-user"><input id="u-user" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} /></Field>
        <Field label="Role" htmlFor="u-role"><select id="u-role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}><option value="editor">Editor</option><option value="admin">Administrator</option></select></Field>
        <Field label="Temporary password" error={errors.password} hint="At least 10 characters with letters and numbers." htmlFor="u-pass"><input id="u-pass" type="password" autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></Field>
        <div className="adm-field adm-end"><button className="adm-btn adm-btn--solid">Add member</button></div>
      </form>
      {removing && <Confirm title="Delete team member?" message={`${removing.name} will no longer be able to sign in.`} onCancel={() => setRemoving(null)} onConfirm={async () => { await api.del(`/admin/users/${removing.id}`).then(() => { toast('Team member deleted.'); load(); }).catch((e) => toast(e.message, 'error')); setRemoving(null); }} />}
    </section>
  );
}

export function SettingsPage() {
  const { user } = useAuth();
  const toast = useToast();
  const isAdmin = user.role === 'admin';
  const [s, setS] = useState(null);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get('/admin/settings').then(({ data }) => setS(Object.fromEntries(Object.entries(data).map(([k, v]) => [k, v ?? (k === 'popups_enabled' ? true : '')])))).catch((e) => toast(e.message, 'error'));
  }, [toast]);

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    try {
      await api.put('/admin/settings', Object.fromEntries(Object.entries(s).map(([k, v]) => [k, v === '' ? null : v])));
      toast('Settings saved.');
    } catch (err) {
      setErrors(err.fields || {});
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  if (!s) return <p className="adm-muted">Loading…</p>;
  return (
    <>
      <header className="adm-head"><div><p className="adm-eyebrow">Configure</p><h1>Website Settings</h1></div></header>
      {!isAdmin && <p className="adm-alert adm-alert--info">Only administrators can change website settings.</p>}
      <form className="adm-form" onSubmit={save} noValidate>
        <fieldset disabled={!isAdmin} className="adm-fieldset">
          <section className="adm-panel">
            <h2>Popups</h2>
            <Toggle checked={s.popups_enabled} onChange={(v) => setS({ ...s, popups_enabled: v })} label="Allow offer popups on the website" hint="A master switch. Individual offers also have their own popup setting." />
          </section>
          <section className="adm-panel">
            <h2>Contact details</h2>
            <p className="adm-muted">Shown in the “Visit Tarini” section and the footer. Empty fields stay hidden.</p>
            <div className="adm-grid">
              {SETTING_FIELDS.map(([k, label, kind]) => (
                <Field key={k} label={label} error={errors[k]} className={kind === 'textarea' ? 'adm-span' : ''} htmlFor={`s-${k}`}>
                  {kind === 'textarea'
                    ? <textarea id={`s-${k}`} rows={3} value={s[k]} onChange={(e) => setS({ ...s, [k]: e.target.value })} />
                    : <input id={`s-${k}`} value={s[k]} onChange={(e) => setS({ ...s, [k]: e.target.value })} />}
                </Field>
              ))}
            </div>
          </section>
        </fieldset>
        {isAdmin && <div className="adm-savebar"><span /><button className="adm-btn adm-btn--solid" disabled={busy}>{busy ? 'Saving…' : 'Save settings'}</button></div>}
      </form>
      {isAdmin && <Team />}
    </>
  );
}
