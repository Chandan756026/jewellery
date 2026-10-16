import { useCallback, useEffect, useState } from 'react';
import Header from './components/Header.jsx';
import Hero from './components/Hero.jsx';
import { Collection, Footer, Story, Visit } from './components/Sections.jsx';
import { BagDrawer, ProductDetail, SearchOverlay, WishDrawer } from './components/Overlays.jsx';
import { useStore } from './store.jsx';

const pieceFromHash = () => (window.location.hash.match(/^#\/piece\/([\w-]+)/) || [])[1] || null;

export default function App() {
  const { panel, setPanel } = useStore();
  const [piece, setPiece] = useState(pieceFromHash);

  useEffect(() => {
    const onHash = () => { setPiece(pieceFromHash()); setPanel((p) => (p === 'menu' ? null : p)); };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, [setPanel]);

  const closePiece = useCallback(() => {
    history.replaceState(null, '', `${window.location.pathname}#collection`);
    setPiece(null);
  }, []);

  return (
    <>
      <Header />
      <main>
        <Hero />
        <Story />
        <Collection />
        <Visit />
      </main>
      <Footer />
      {panel === 'bag' && <BagDrawer />}
      {panel === 'wish' && <WishDrawer />}
      {panel === 'search' && <SearchOverlay />}
      {piece && <ProductDetail key={piece} id={piece} onClose={closePiece} />}
    </>
  );
}
