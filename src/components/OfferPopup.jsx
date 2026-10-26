import { useEffect, useId, useRef, useState } from 'react';
import { Check, Copy, X } from 'lucide-react';
import { safeUrl } from '../offers.js';

const EXIT_MS = 260;
const FOCUSABLE = 'a[href], button:not([disabled]), input, [tabindex]:not([tabindex="-1"])';

/**
 * Luxury offer popup. `open` controls visibility; the component stays mounted briefly for the exit animation.
 * Used on the public site and (with `preview`) inside the admin panel.
 */
export default function OfferPopup({ offer, open, onClose, preview = false }) {
  const [mounted, setMounted] = useState(open);
  const [leaving, setLeaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const panel = useRef(null);
  const returnTo = useRef(null);
  const uid = useId();

  useEffect(() => {
    if (open) {
      setMounted(true);
      setLeaving(false);
      return undefined;
    }
    if (!mounted) return undefined;
    setLeaving(true);
    const t = setTimeout(() => { setMounted(false); setLeaving(false); }, EXIT_MS);
    return () => clearTimeout(t);
  }, [open, mounted]);

  // scroll lock, focus management and keyboard handling while visible
  useEffect(() => {
    if (!mounted || !open) return undefined;
    returnTo.current = document.activeElement;
    document.body.classList.add('is-locked');
    panel.current?.querySelector('.popup__close')?.focus();
    const onKey = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
      if (e.key !== 'Tab' || !panel.current) return;
      const nodes = [...panel.current.querySelectorAll(FOCUSABLE)].filter((n) => n.offsetParent !== null);
      if (!nodes.length) return;
      const a = nodes[0];
      const z = nodes[nodes.length - 1];
      if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); }
      else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      document.body.classList.remove('is-locked');
      returnTo.current?.focus?.();
    };
  }, [mounted, open, onClose]);

  if (!mounted || !offer) return null;
  const url = safeUrl(offer.button_url);
  const external = url && /^https?:\/\//i.test(url) && !url.startsWith(window.location.origin);
  const hasImage = !!(offer.image || offer.mobile_image);
  const terms = [
    offer.min_cart_value ? `Valid on enquiries above ₹${Number(offer.min_cart_value).toLocaleString('en-IN')}.` : null,
    offer.terms,
  ].filter(Boolean).join(' ');

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(offer.coupon_code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard blocked */ }
  };

  return (
    <div className={`popup${leaving ? ' is-leaving' : ''}${preview ? ' popup--preview' : ''}`}
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <section ref={panel} className={`popup__panel${hasImage ? '' : ' popup__panel--plain'}`} role="dialog" aria-modal="true"
        aria-labelledby={`${uid}-t`} aria-describedby={offer.description ? `${uid}-d` : undefined}>
        <button className="popup__close" onClick={onClose} aria-label="Close offer"><X size={20} strokeWidth={1.4} /></button>
        {hasImage && (
          <picture className="popup__media">
            {offer.mobile_image && <source media="(max-width: 640px)" srcSet={offer.mobile_image} />}
            <img src={offer.image || offer.mobile_image} alt="" />
          </picture>
        )}
        <div className="popup__body">
          <p className="eyebrow eyebrow--line"><i />A Tarini offer</p>
          {offer.discount_text && <p className="popup__discount">{offer.discount_text}</p>}
          <h2 id={`${uid}-t`} className="display popup__title">{offer.title}</h2>
          {offer.description && <p id={`${uid}-d`} className="popup__text">{offer.description}</p>}
          {offer.coupon_code && (
            <div className="popup__coupon">
              <span>Use code</span>
              <b>{offer.coupon_code}</b>
              <button onClick={copy} aria-label={copied ? 'Code copied' : 'Copy code'}>{copied ? <Check size={15} /> : <Copy size={15} />}</button>
            </div>
          )}
          {offer.button_text && url && (
            <a className="btn-solid popup__cta" href={url} {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
              onClick={(e) => { if (preview) e.preventDefault(); else onClose(); }}>{offer.button_text}</a>
          )}
          {terms && <p className="popup__terms">{terms}</p>}
        </div>
      </section>
    </div>
  );
}
