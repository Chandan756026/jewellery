import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { api } from './lib/api.js';
import { site as defaults } from './data/site.js';

const Ctx = createContext(defaults);

/** Contact details and social links managed in Admin → Website Settings. Falls back to data/site.js. */
export function SettingsProvider({ children }) {
  const [remote, setRemote] = useState(null);
  useEffect(() => {
    api.get('/settings').then(({ data }) => setRemote(data)).catch(() => {});
  }, []);
  const value = useMemo(() => {
    if (!remote) return defaults;
    const social = [
      remote.instagram && { label: 'Instagram', href: remote.instagram },
      remote.facebook && { label: 'Facebook', href: remote.facebook },
      remote.whatsapp && { label: 'WhatsApp', href: `https://wa.me/${remote.whatsapp.replace(/\D/g, '')}` },
    ].filter(Boolean);
    return {
      ...defaults,
      address: remote.address || defaults.address,
      phone: remote.phone || defaults.phone,
      email: remote.email || defaults.email,
      hours: remote.hours || defaults.hours,
      social: social.length ? social : defaults.social,
    };
  }, [remote]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useSite = () => useContext(Ctx);
