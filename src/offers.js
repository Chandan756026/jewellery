import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './lib/api.js';

/**
 * Popup display preferences live in the browser; offer content and activation live in the database.
 *   every_visit – every page load        session – once per browser session
 *   daily       – once per calendar day  campaign – once per campaign_id
 */
const PREFIX = 'tarini:offer:';
const safe = (fn, fallback = null) => { try { return fn(); } catch { return fallback; } };
const today = () => new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD in the visitor's timezone

export function alreadySeen(offer) {
  const key = PREFIX + offer.campaign_id;
  switch (offer.popup_frequency) {
    case 'session': return !!safe(() => sessionStorage.getItem(key));
    case 'daily': return safe(() => localStorage.getItem(key + ':day')) === today();
    case 'campaign': return !!safe(() => localStorage.getItem(key + ':seen'));
    default: return false; // every_visit
  }
}

export function markShown(offer) {
  const key = PREFIX + offer.campaign_id;
  if (offer.popup_frequency === 'session') safe(() => sessionStorage.setItem(key, '1'));
  if (offer.popup_frequency === 'daily') safe(() => localStorage.setItem(key + ':day', today()));
  if (offer.popup_frequency === 'campaign') safe(() => localStorage.setItem(key + ':seen', '1'));
}

/** Only absolute web links, site paths, anchors, mailto and tel are rendered as links. */
export const safeUrl = (u) => (u && /^(https?:\/\/|\/(?!\/)|#|mailto:|tel:)/i.test(u) ? u : null);

const REFRESH_MS = 60_000;

/**
 * Loads active offers and decides which single popup (if any) to show on this page load.
 * Offers are re-fetched every minute; an open popup closes if its offer is no longer active.
 */
export function useOfferPopup() {
  const [offer, setOffer] = useState(null);
  const [open, setOpen] = useState(false);
  const decided = useRef(false);
  const skew = useRef(0);
  const dismissed = useRef(new Set());

  const refresh = useCallback(async () => {
    const inWindow = (o) => {
      const t = Date.now() + skew.current;
      return Date.parse(o.starts_at) <= t && (!o.ends_at || Date.parse(o.ends_at) > t);
    };
    try {
      const res = await api.get('/offers/active');
      skew.current = res.server_time ? Date.parse(res.server_time) - Date.now() : 0; // static hosting has no server time
      const live = res.popups_enabled ? res.data.filter((o) => o.popup_enabled && inWindow(o)) : [];
      if (!decided.current) {
        decided.current = true;
        const pick = live.find((o) => !alreadySeen(o));
        if (pick) {
          setOffer(pick);
          window.setTimeout(() => { setOpen(true); markShown(pick); }, 1200);
        }
        return;
      }
      setOffer((cur) => {
        if (!cur) return cur;
        const same = live.find((o) => o.id === cur.id);
        if (!same) setOpen(false); // deactivated, expired or popups switched off
        return same || cur;
      });
    } catch {
      /* the popup is optional: never break the homepage if offers are unavailable */
    }
  }, []);

  useEffect(() => {
    refresh();
    const timer = window.setInterval(refresh, REFRESH_MS);
    const onVisible = () => document.visibilityState === 'visible' && refresh();
    document.addEventListener('visibilitychange', onVisible);
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); };
  }, [refresh]);

  const close = useCallback(() => {
    if (offer) dismissed.current.add(offer.id);
    setOpen(false);
  }, [offer]);

  return { offer, open: !!(open && offer && !dismissed.current.has(offer.id)), close };
}
