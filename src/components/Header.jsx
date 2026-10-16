import { useEffect, useState } from 'react';
import { Heart, Menu, Search, ShoppingBag, X } from 'lucide-react';
import Logo from './Logo.jsx';
import { nav, visitCta } from '../data/site.js';
import { useStore } from '../store.jsx';

export default function Header() {
  const { count, wish, panel, setPanel } = useStore();
  const [solid, setSolid] = useState(false);
  const menuOpen = panel === 'menu';

  useEffect(() => {
    const onScroll = () => setSolid(window.scrollY > window.innerHeight * 5.2);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const go = () => setPanel(null);

  return (
    <header className={`header${solid ? ' header--solid' : ''}${menuOpen ? ' header--open' : ''}`}>
      <Logo />
      <nav className="header__nav" aria-label="Primary">
        {nav.map((n) => <a key={n.href} href={n.href}>{n.label}</a>)}
      </nav>
      <div className="header__tools">
        <button className="icon-btn" aria-label="Search" onClick={() => setPanel('search')}><Search size={17} strokeWidth={1.4} /></button>
        <button className="icon-btn" aria-label={`Wishlist, ${wish.length} saved`} onClick={() => setPanel('wish')}>
          <Heart size={17} strokeWidth={1.4} />{wish.length > 0 && <i className="badge">{wish.length}</i>}
        </button>
        <button className="icon-btn" aria-label={`Enquiry bag, ${count} items`} onClick={() => setPanel('bag')}>
          <ShoppingBag size={17} strokeWidth={1.4} />{count > 0 && <i className="badge">{count}</i>}
        </button>
        <a className="btn-ghost header__visit" href={visitCta.href}>{visitCta.label}</a>
        <button className="icon-btn header__burger" aria-label={menuOpen ? 'Close menu' : 'Open menu'} aria-expanded={menuOpen}
          onClick={() => setPanel(menuOpen ? null : 'menu')}>
          {menuOpen ? <X size={20} strokeWidth={1.4} /> : <Menu size={20} strokeWidth={1.4} />}
        </button>
      </div>
      {menuOpen && (
        <div className="mobile-menu" onClick={go}>
          {nav.map((n) => <a key={n.href} href={n.href}>{n.label}</a>)}
          <a href={visitCta.href}>{visitCta.label}</a>
        </div>
      )}
    </header>
  );
}
