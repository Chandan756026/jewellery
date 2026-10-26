import { useState } from 'react';
import { Heart, ArrowUpRight } from 'lucide-react';
import { useCollections } from '../collections.jsx';
import { useSite } from '../settings.jsx';
import { useStore } from '../store.jsx';
import Logo from './Logo.jsx';

export const money = (p) => p.price_text || 'Price on enquiry';

export function Story() {
  const site = useSite();
  return (
    <section className="section story" id="story">
      <div className="wrap story__grid">
        <div>
          <p className="eyebrow eyebrow--line"><i />Our story</p>
          <h2 className="display display--l">Trust, blessing and tradition — through light and ornament.</h2>
        </div>
        <div className="story__copy">
          <p>Tarini is a jewellery house of {site.place}. Every piece begins as a quiet idea of warmth: a familiar glow, a small ritual, a bond that is meant to last.</p>
          <p>We make ornament to be lived in — worn to a wedding, passed to a daughter, kept for the day that needs something to hold on to.</p>
          <p className="story__sig">Crafted in Balasore. Worn with pride.</p>
        </div>
      </div>
    </section>
  );
}

export function ProductCard({ product, index }) {
  const { wish, toggleWish, addToBag } = useStore();
  const saved = wish.includes(product.slug);
  return (
    <article className="card">
      <a className="card__media" href={`#/piece/${product.slug}`} aria-label={`View ${product.name}`}>
        {product.cover_image && <img src={product.cover_image} alt={product.name} loading="lazy" width="880" height="1100" />}
        <span className="card__no">{String(index + 1).padStart(2, '0')}</span>
      </a>
      <button className={`card__wish${saved ? ' is-on' : ''}`} aria-pressed={saved}
        aria-label={saved ? `Remove ${product.name} from wishlist` : `Save ${product.name} to wishlist`}
        onClick={() => toggleWish(product.slug)}>
        <Heart size={18} strokeWidth={1.3} fill={saved ? 'currentColor' : 'none'} />
      </button>
      <div className="card__body">
        <p className="eyebrow">{product.kind || 'Collection'}</p>
        <h3 className="card__name"><a href={`#/piece/${product.slug}`}>{product.name}</a></h3>
        <p className="card__tag">{product.tagline || product.description}</p>
        <div className="card__row">
          <span className="card__price">{money(product)}</span>
          <button className="btn-line" onClick={() => addToBag(product.slug)}>Add to enquiry</button>
        </div>
      </div>
    </article>
  );
}

function CardSkeleton() {
  return (
    <div className="card card--skeleton" aria-hidden="true">
      <div className="card__media" />
      <div className="card__body"><i /><i /><i /></div>
    </div>
  );
}

export function Collection() {
  const { status, items, error, retry } = useCollections();
  return (
    <section className="section collection" id="collection" aria-busy={status === 'loading'}>
      <div className="wrap">
        <header className="section__head">
          <p className="eyebrow eyebrow--line"><i />The collection</p>
          <h2 className="display display--l">Details that belong to your story.</h2>
          <p className="lede">Save the pieces you love and send us your enquiry.</p>
        </header>
        {status === 'loading' && <div className="grid"><CardSkeleton /><CardSkeleton /><CardSkeleton /></div>}
        {status === 'error' && (
          <div className="state-box" role="alert">
            <p>The collection could not be loaded right now.</p>
            <small>{error}</small>
            <button className="btn-ghost" onClick={retry}>Try again</button>
          </div>
        )}
        {status === 'ready' && items.length === 0 && (
          <div className="state-box"><p>New pieces are on their way. Please check back soon.</p></div>
        )}
        {status === 'ready' && items.length > 0 && (
          <div className="grid">
            {items.map((p, i) => <ProductCard key={p.slug} product={p} index={i} />)}
          </div>
        )}
      </div>
    </section>
  );
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function Visit() {
  const site = useSite();
  const [email, setEmail] = useState('');
  const [state, setState] = useState({ kind: 'idle', msg: '' });

  const submit = (e) => {
    e.preventDefault();
    if (!email.trim()) return setState({ kind: 'error', msg: 'Please enter your email address.' });
    if (!EMAIL.test(email.trim())) return setState({ kind: 'error', msg: 'That email address does not look right.' });
    // Demo only: no mailing-list service is connected yet.
    setState({ kind: 'ok', msg: 'Thank you. (Demo form — not yet connected to a mailing list.)' });
    setEmail('');
  };

  const details = [['Address', site.address], ['Phone', site.phone], ['Email', site.email], ['Hours', site.hours]].filter(([, v]) => v);

  return (
    <section className="section visit" id="visit">
      <div className="wrap visit__grid">
        <div>
          <p className="eyebrow eyebrow--line"><i />Visit Tarini</p>
          <h2 className="display display--l">Come in. Stay a while.</h2>
          <p className="lede">{site.name} {site.sub}, {site.place}. Step inside the glow and let us show you the details.</p>
          {details.length > 0 && (
            <dl className="details">
              {details.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
            </dl>
          )}
        </div>
        <form className="news" onSubmit={submit} noValidate>
          <label htmlFor="news-email" className="eyebrow">Letters from Tarini</label>
          <p className="news__hint">New pieces and quiet invitations. No noise.</p>
          <div className="news__row">
            <input id="news-email" type="email" inputMode="email" autoComplete="email" placeholder="Your email address"
              value={email} onChange={(e) => { setEmail(e.target.value); if (state.kind !== 'idle') setState({ kind: 'idle', msg: '' }); }}
              aria-invalid={state.kind === 'error'} aria-describedby="news-msg" />
            <button className="btn-ghost" type="submit">Subscribe <ArrowUpRight size={15} strokeWidth={1.3} /></button>
          </div>
          <p id="news-msg" className={`news__msg news__msg--${state.kind}`} role="status" aria-live="polite">{state.msg}</p>
        </form>
      </div>
    </section>
  );
}

export function Footer() {
  const site = useSite();
  return (
    <footer className="footer">
      <div className="wrap footer__row">
        <Logo />
        <p>Crafted in Balasore. Worn with pride.</p>
        <nav aria-label="Footer">
          <a href="#story">Our Story</a>
          <a href="#collection">The Collection</a>
          <a href="#visit">Visit Tarini</a>
          {site.social.map((s) => <a key={s.href} href={s.href} target="_blank" rel="noreferrer">{s.label}</a>)}
        </nav>
      </div>
      <p className="footer__fine">© {new Date().getFullYear()} {site.name} {site.sub}. Imagery is illustrative.</p>
    </footer>
  );
}
