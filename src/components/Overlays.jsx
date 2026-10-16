import { useEffect, useMemo, useRef, useState } from 'react';
import { Copy, Heart, Minus, Plus, Search, Trash2, X } from 'lucide-react';
import { products } from '../data/products.js';
import { useStore } from '../store.jsx';
import { money } from './Sections.jsx';

function useEscape(onClose, active = true) {
  useEffect(() => {
    if (!active) return undefined;
    const k = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose, active]);
}

function Shell({ title, onClose, children, side = 'right' }) {
  useEscape(onClose);
  const ref = useRef(null);
  useEffect(() => { ref.current?.focus(); document.body.classList.add('is-locked'); return () => document.body.classList.remove('is-locked'); }, []);
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside className={`drawer drawer--${side}`} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={ref}>
        <header className="drawer__head">
          <h2>{title}</h2>
          <button className="icon-btn" aria-label="Close" onClick={onClose}><X size={20} strokeWidth={1.3} /></button>
        </header>
        {children}
      </aside>
    </div>
  );
}

function Qty({ value, onChange }) {
  return (
    <div className="qty" role="group" aria-label="Quantity">
      <button aria-label="Decrease quantity" onClick={() => onChange(value - 1)}><Minus size={14} /></button>
      <output aria-live="polite">{value}</output>
      <button aria-label="Increase quantity" onClick={() => onChange(value + 1)} disabled={value >= 9}><Plus size={14} /></button>
    </div>
  );
}

export function BagDrawer() {
  const { bag, count, setQty, clearBag, setPanel } = useStore();
  const [copied, setCopied] = useState(false);
  const text = useMemo(
    () => `Hello Tarini, I would like to enquire about:\n${bag.map((i) => `• ${i.product.name} × ${i.qty}`).join('\n')}`,
    [bag]
  );
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2400); } catch { window.prompt('Copy your enquiry:', text); }
  };
  return (
    <Shell title={`Enquiry bag${count ? ` (${count})` : ''}`} onClose={() => setPanel(null)}>
      {bag.length === 0 ? (
        <div className="drawer__empty">
          <p>Your enquiry bag is empty.</p>
          <a className="btn-ghost" href="#collection" onClick={() => setPanel(null)}>Explore the collection</a>
        </div>
      ) : (
        <>
          <ul className="lines">
            {bag.map(({ product, qty }) => (
              <li key={product.id}>
                <img src={product.image} alt={product.alt} width="72" height="90" />
                <div>
                  <a href={`#/piece/${product.id}`} onClick={() => setPanel(null)}>{product.name}</a>
                  <small>{money(product)}</small>
                  <Qty value={qty} onChange={(v) => setQty(product.id, v)} />
                </div>
                <button className="icon-btn" aria-label={`Remove ${product.name}`} onClick={() => setQty(product.id, 0)}><Trash2 size={16} strokeWidth={1.3} /></button>
              </li>
            ))}
          </ul>
          <footer className="drawer__foot">
            <p className="note">Online ordering and payment are not connected yet. Copy this list and share it with Tarini to enquire.</p>
            <button className="btn-solid" onClick={copy}><Copy size={15} strokeWidth={1.4} /> {copied ? 'Copied to clipboard' : 'Copy enquiry'}</button>
            <button className="btn-text" onClick={clearBag}>Clear bag</button>
          </footer>
        </>
      )}
    </Shell>
  );
}

export function WishDrawer() {
  const { wish, toggleWish, addToBag, setPanel } = useStore();
  const items = products.filter((p) => wish.includes(p.id));
  return (
    <Shell title={`Wishlist${items.length ? ` (${items.length})` : ''}`} onClose={() => setPanel(null)}>
      {items.length === 0 ? (
        <div className="drawer__empty">
          <p>Tap the heart on any piece to save it here.</p>
          <a className="btn-ghost" href="#collection" onClick={() => setPanel(null)}>Explore the collection</a>
        </div>
      ) : (
        <ul className="lines">
          {items.map((p) => (
            <li key={p.id}>
              <img src={p.image} alt={p.alt} width="72" height="90" />
              <div>
                <a href={`#/piece/${p.id}`} onClick={() => setPanel(null)}>{p.name}</a>
                <small>{p.tagline}</small>
                <button className="btn-line" onClick={() => addToBag(p.id)}>Add to enquiry</button>
              </div>
              <button className="icon-btn" aria-label={`Remove ${p.name} from wishlist`} onClick={() => toggleWish(p.id)}><Trash2 size={16} strokeWidth={1.3} /></button>
            </li>
          ))}
        </ul>
      )}
    </Shell>
  );
}

const PAGES = [
  { id: 'story', label: 'Our Story', href: '#story', hint: 'Trust, blessing and tradition' },
  { id: 'collection', label: 'The Collection', href: '#collection', hint: 'Necklace, earrings, ring' },
  { id: 'visit', label: 'Visit Tarini', href: '#visit', hint: 'Balasore, Odisha' },
];

export function SearchOverlay() {
  const { setPanel } = useStore();
  const [q, setQ] = useState('');
  const close = () => setPanel(null);
  useEscape(close);
  const term = q.trim().toLowerCase();
  const hits = useMemo(() => {
    const has = (s) => s.toLowerCase().includes(term);
    return {
      pieces: products.filter((p) => !term || [p.name, p.kind, p.tagline, p.description, ...p.details].some(has)),
      pages: PAGES.filter((p) => term && [p.label, p.hint].some(has)),
    };
  }, [term]);
  return (
    <div className="overlay overlay--top" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="search" role="dialog" aria-modal="true" aria-label="Search">
        <div className="search__bar">
          <Search size={20} strokeWidth={1.3} />
          <input autoFocus type="search" placeholder="Search the collection" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search" />
          <button className="icon-btn" aria-label="Close search" onClick={close}><X size={20} strokeWidth={1.3} /></button>
        </div>
        <ul className="search__list">
          {hits.pieces.map((p) => (
            <li key={p.id}>
              <a href={`#/piece/${p.id}`} onClick={close}><img src={p.image} alt="" width="48" height="60" /><span><b>{p.name}</b><small>{p.tagline}</small></span></a>
            </li>
          ))}
          {hits.pages.map((p) => (
            <li key={p.id}><a href={p.href} onClick={close}><span><b>{p.label}</b><small>{p.hint}</small></span></a></li>
          ))}
          {hits.pieces.length + hits.pages.length === 0 && <li className="search__none">Nothing found for “{q}”.</li>}
        </ul>
      </div>
    </div>
  );
}

export function ProductDetail({ id, onClose }) {
  const { wish, toggleWish, addToBag } = useStore();
  const product = products.find((p) => p.id === id);
  const [qty, setQty] = useState(1);
  useEscape(onClose, !!product);
  useEffect(() => { document.body.classList.add('is-locked'); return () => document.body.classList.remove('is-locked'); }, []);
  if (!product) return null;
  const saved = wish.includes(product.id);
  const idx = products.indexOf(product);
  const next = products[(idx + 1) % products.length];
  return (
    <div className="overlay overlay--page" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <article className="detail" role="dialog" aria-modal="true" aria-label={product.name}>
        <button className="icon-btn detail__close" aria-label="Close" onClick={onClose}><X size={22} strokeWidth={1.3} /></button>
        <div className="detail__media"><img src={product.image} alt={product.alt} /></div>
        <div className="detail__info">
          <p className="eyebrow eyebrow--line"><i />{product.kind} · 0{idx + 1} / 0{products.length}</p>
          <h2 className="display display--l">{product.tagline}</h2>
          <h3 className="detail__name">{product.name}</h3>
          <p className="lede lede--sm">{product.description}</p>
          <ul className="detail__list">{product.details.map((d) => <li key={d}>{d}</li>)}</ul>
          <p className="card__price">{money(product)}</p>
          <div className="detail__buy">
            <Qty value={qty} onChange={(v) => setQty(Math.max(1, v))} />
            <button className="btn-solid" onClick={() => { addToBag(product.id, qty); onClose(); }}>Add to enquiry</button>
            <button className={`icon-btn icon-btn--bordered${saved ? ' is-on' : ''}`} aria-pressed={saved} aria-label={saved ? 'Remove from wishlist' : 'Save to wishlist'} onClick={() => toggleWish(product.id)}>
              <Heart size={18} strokeWidth={1.3} fill={saved ? 'currentColor' : 'none'} />
            </button>
          </div>
          <a className="btn-text" href={`#/piece/${next.id}`}>Next: {next.name} →</a>
        </div>
      </article>
    </div>
  );
}
