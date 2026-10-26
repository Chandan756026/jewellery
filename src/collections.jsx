import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from './lib/api.js';

const Ctx = createContext(null);

/** Published collections from the database. Refreshes when the visitor returns to the tab. */
export function CollectionsProvider({ children }) {
  const [state, setState] = useState({ status: 'loading', items: [], error: null });

  const load = useCallback(async () => {
    try {
      const { data } = await api.get('/collections');
      setState({ status: 'ready', items: data, error: null });
    } catch (e) {
      setState((s) => ({ status: s.items.length ? 'ready' : 'error', items: s.items, error: e.message }));
    }
  }, []);

  useEffect(() => {
    load();
    const onVisible = () => document.visibilityState === 'visible' && load();
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [load]);

  const retry = useCallback(() => { setState((s) => ({ ...s, status: s.items.length ? s.status : 'loading' })); load(); }, [load]);
  const value = useMemo(() => ({ ...state, retry }), [state, retry]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useCollections = () => useContext(Ctx);
