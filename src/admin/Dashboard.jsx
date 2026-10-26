import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { Badge, fmtDate } from './ui.jsx';
import { useAuth } from './auth.js';

export const STATE_LABEL = { draft: 'Draft', scheduled: 'Scheduled', active: 'Active', expired: 'Expired', published: 'Published' };

export default function Dashboard() {
  const { user } = useAuth();
  const [d, setD] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.get('/admin/dashboard').then(setD).catch((e) => setError(e.message));
  }, []);

  if (error) return <p className="adm-alert">{error}</p>;
  if (!d) return <p className="adm-muted">Loading…</p>;

  const cards = [
    { label: 'Collections', value: d.collections.total, sub: `${d.collections.published} published · ${d.collections.draft} draft`, to: '/admin/collections' },
    { label: 'Active offers', value: d.offers.active, sub: `${d.offers.scheduled} scheduled · ${d.offers.expired} expired`, to: '/admin/offers' },
    { label: 'Images', value: d.media, sub: 'in the media library', to: '/admin/media' },
  ];

  return (
    <>
      <header className="adm-head">
        <div><p className="adm-eyebrow">Welcome back</p><h1>{user.name}</h1></div>
        <div className="adm-actions">
          <Link className="adm-btn adm-btn--solid" to="/admin/collections/new">New collection</Link>
          <Link className="adm-btn adm-btn--ghost" to="/admin/offers/new">New offer</Link>
        </div>
      </header>

      <section className="adm-cards">
        {cards.map((c) => (
          <Link key={c.label} to={c.to} className="adm-stat"><small>{c.label}</small><strong>{c.value}</strong><span>{c.sub}</span></Link>
        ))}
      </section>

      <div className="adm-two">
        <section className="adm-panel">
          <h2>Recently added collections</h2>
          {d.recent_collections.length === 0 && <p className="adm-muted">No collections yet.</p>}
          <ul className="adm-list">
            {d.recent_collections.map((c) => (
              <li key={c.id}>
                {c.cover_url && <img src={c.cover_url} alt="" />}
                <div><Link to={`/admin/collections/${c.id}`}>{c.name}</Link><small>{fmtDate(c.created_at)}</small></div>
                <Badge kind={c.status}>{STATE_LABEL[c.status]}</Badge>
              </li>
            ))}
          </ul>
        </section>
        <section className="adm-panel">
          <h2>Recently updated offers</h2>
          {d.recent_offers.length === 0 && <p className="adm-muted">No offers yet.</p>}
          <ul className="adm-list">
            {d.recent_offers.map((o) => (
              <li key={o.id}>
                <div><Link to={`/admin/offers/${o.id}`}>{o.title}</Link><small>Updated {fmtDate(o.updated_at)}</small></div>
                <Badge kind={o.state}>{STATE_LABEL[o.state]}</Badge>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  );
}
