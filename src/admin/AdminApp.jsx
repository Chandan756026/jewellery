import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, NavLink, Navigate, Outlet, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Gem, ImageIcon, LayoutDashboard, LogOut, Menu, Settings as Cog, Sparkles, X } from 'lucide-react';
import { api, setCsrf } from '../lib/api.js';
import { ToastProvider } from './ui.jsx';
import { Collections, CollectionForm } from './Collections.jsx';
import { OfferForm, Offers } from './Offers.jsx';
import { MediaLibrary, SettingsPage } from './Settings.jsx';
import Dashboard from './Dashboard.jsx';
import { AuthCtx, useAuth } from './auth.js';
import './admin.css';


function AuthProvider({ children }) {
  const [state, setState] = useState({ loading: true, user: null, error: null });

  useEffect(() => {
    api.get('/auth/me')
      .then((r) => { setCsrf(r.csrf); setState({ loading: false, user: r.user, error: null }); })
      .catch((e) => setState({ loading: false, user: null, error: e.message }));
  }, []);

  const login = useCallback(async (identifier, password) => {
    const r = await api.post('/auth/login', { identifier, password });
    setCsrf(r.csrf);
    setState({ loading: false, user: r.user, error: null });
  }, []);

  const logout = useCallback(async () => {
    try { const r = await api.post('/auth/logout'); setCsrf(r.csrf); } catch { /* already signed out */ }
    setState({ loading: false, user: null, error: null });
  }, []);

  const value = useMemo(() => ({ ...state, login, logout }), [state, login, logout]);
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

function Login() {
  const { user, loading, error: bootError, login } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const [form, setForm] = useState({ identifier: '', password: '' });
  const [show, setShow] = useState(false);
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  if (!loading && user) return <Navigate to={loc.state?.from || '/admin'} replace />;

  const submit = async (e) => {
    e.preventDefault();
    const fe = {};
    if (!form.identifier.trim()) fe.identifier = 'Enter your email or username.';
    if (!form.password) fe.password = 'Enter your password.';
    setErrors(fe);
    setMessage('');
    if (Object.keys(fe).length) return;
    setBusy(true);
    try {
      await login(form.identifier.trim(), form.password);
      nav(loc.state?.from || '/admin', { replace: true });
    } catch (err) {
      setErrors(err.fields || {});
      setMessage(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="adm-login">
      <form className="adm-login__card" onSubmit={submit} noValidate>
        <div className="adm-login__brand"><span>TARINI</span><i /><small>JEWELLERY · ADMIN</small></div>
        <h1>Sign in</h1>
        {(message || bootError) && <p className="adm-alert" role="alert">{message || bootError}</p>}
        <div className={`adm-field ${errors.identifier ? 'has-error' : ''}`}>
          <label htmlFor="identifier">Email or username</label>
          <input id="identifier" autoComplete="username" autoFocus value={form.identifier} onChange={(e) => setForm({ ...form, identifier: e.target.value })} />
          {errors.identifier && <small className="adm-error">{errors.identifier}</small>}
        </div>
        <div className={`adm-field ${errors.password ? 'has-error' : ''}`}>
          <label htmlFor="password">Password</label>
          <div className="adm-password">
            <input id="password" type={show ? 'text' : 'password'} autoComplete="current-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
            <button type="button" onClick={() => setShow(!show)} aria-label={show ? 'Hide password' : 'Show password'}>{show ? <EyeOff size={17} /> : <Eye size={17} />}</button>
          </div>
          {errors.password && <small className="adm-error">{errors.password}</small>}
        </div>
        <button className="adm-btn adm-btn--solid adm-btn--block" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        <Link to="/" className="adm-login__back">← Back to the website</Link>
      </form>
    </main>
  );
}

const LINKS = [
  { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/admin/collections', label: 'Collections', icon: Gem },
  { to: '/admin/offers', label: 'Offers & Popups', icon: Sparkles },
  { to: '/admin/media', label: 'Media Library', icon: ImageIcon },
  { to: '/admin/settings', label: 'Website Settings', icon: Cog },
];

function Shell() {
  const { user, loading, logout } = useAuth();
  const loc = useLocation();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [loc.pathname]);

  if (loading) return <div className="boot">Loading…</div>;
  if (!user) return <Navigate to="/admin/login" replace state={{ from: loc.pathname }} />;

  return (
    <div className="adm">
      <header className="adm-top">
        <button className="adm-icon" aria-label={open ? 'Close menu' : 'Open menu'} aria-expanded={open} onClick={() => setOpen(!open)}>{open ? <X size={20} /> : <Menu size={20} />}</button>
        <strong>TARINI</strong>
      </header>
      <aside className={`adm-side${open ? ' is-open' : ''}`}>
        <Link to="/admin" className="adm-brand"><span>TARINI</span><i /><small>JEWELLERY · ADMIN</small></Link>
        <nav aria-label="Admin">
          {LINKS.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} className={({ isActive }) => (isActive ? 'is-active' : '')}><Icon size={17} strokeWidth={1.4} />{label}</NavLink>
          ))}
          <a href="/" target="_blank" rel="noreferrer"><Eye size={17} strokeWidth={1.4} />View website</a>
        </nav>
        <div className="adm-side__foot">
          <p><b>{user.name}</b><small>{user.role === 'admin' ? 'Administrator' : 'Editor'}</small></p>
          <button className="adm-btn adm-btn--ghost adm-btn--block" onClick={logout}><LogOut size={15} />Logout</button>
        </div>
      </aside>
      {open && <div className="adm-scrim" onClick={() => setOpen(false)} />}
      <main className="adm-main"><Outlet /></main>
    </div>
  );
}

export default function AdminApp() {
  return (
    <AuthProvider>
      <ToastProvider>
        <Routes>
          <Route path="login" element={<Login />} />
          <Route element={<Shell />}>
            <Route index element={<Dashboard />} />
            <Route path="collections" element={<Collections />} />
            <Route path="collections/new" element={<CollectionForm />} />
            <Route path="collections/:id" element={<CollectionForm />} />
            <Route path="offers" element={<Offers />} />
            <Route path="offers/new" element={<OfferForm />} />
            <Route path="offers/:id" element={<OfferForm />} />
            <Route path="media" element={<MediaLibrary />} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/admin" replace />} />
        </Routes>
      </ToastProvider>
    </AuthProvider>
  );
}
