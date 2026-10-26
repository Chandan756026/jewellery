import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useCollections } from './collections.jsx';

const Ctx = createContext(null);
const KEY = 'tarini-state-v1';

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    return { wish: s?.wish ?? [], bag: s?.bag ?? [] };
  } catch {
    return { wish: [], bag: [] };
  }
}

// Wishlist and bag hold collection slugs. Anything that is no longer published simply disappears from the lists.
export function StoreProvider({ children }) {
  const { items } = useCollections();
  const [state, setState] = useState(load);
  const [panel, setPanel] = useState(null); // 'bag' | 'wish' | 'search' | 'menu' | null

  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* storage unavailable */ }
  }, [state]);

  const toggleWish = useCallback((id) =>
    setState((s) => ({ ...s, wish: s.wish.includes(id) ? s.wish.filter((x) => x !== id) : [...s.wish, id] })), []);

  const addToBag = useCallback((id, qty = 1) => {
    setState((s) => {
      const has = s.bag.find((i) => i.id === id);
      const bag = has ? s.bag.map((i) => (i.id === id ? { ...i, qty: Math.min(9, i.qty + qty) } : i)) : [...s.bag, { id, qty }];
      return { ...s, bag };
    });
    setPanel('bag');
  }, []);

  const setQty = useCallback((id, qty) =>
    setState((s) => ({ ...s, bag: qty < 1 ? s.bag.filter((i) => i.id !== id) : s.bag.map((i) => (i.id === id ? { ...i, qty: Math.min(9, qty) } : i)) })), []);

  const clearBag = useCallback(() => setState((s) => ({ ...s, bag: [] })), []);

  const value = useMemo(() => {
    const bag = state.bag.map((i) => ({ ...i, product: items.find((p) => p.slug === i.id) })).filter((i) => i.product);
    return {
      wish: state.wish.filter((id) => items.some((p) => p.slug === id)),
      bag,
      count: bag.reduce((n, i) => n + i.qty, 0),
      panel, setPanel, toggleWish, addToBag, setQty, clearBag,
    };
  }, [state, items, panel, toggleWish, addToBag, setQty, clearBag]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useStore = () => useContext(Ctx);
