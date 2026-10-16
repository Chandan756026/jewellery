import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { odiaLine, site } from '../data/site.js';

const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const ease = (t) => t * t * (3 - 2 * t);
const seg = (x, a, b) => ease(clamp((x - a) / (b - a)));

// Scroll checkpoints (0–1 of the 500vh runway) — from the Figma "One scroll. Seven moments." spec.
const STAGES = [
  { to: 0.15, place: 'An invitation to enter', cue: 'Scroll to enter' },
  { to: 0.35, place: 'Follow the warm light', cue: 'A little closer' },
  { to: 0.5, place: 'The threshold', cue: 'Come inside' },
  { to: 0.65, place: 'Inside Tarini', cue: 'Discover the details' },
  { to: 0.78, place: 'The necklace · 01 / 03', cue: 'Another detail awaits' },
  { to: 0.9, place: 'The earrings · 02 / 03', cue: 'Another detail awaits' },
  { to: 1.01, place: 'The ring · 03 / 03', cue: 'Your story begins here' },
];

// Copy blocks fade in over [i0,i1] and out over [o0,o1].
const win = (p, i0, i1, o0, o1) => seg(p, i0, i1) * (1 - seg(p, o0, o1));

export default function Hero() {
  const runway = useRef(null);
  const [p, setP] = useState(0);
  const reduce = useMemo(() => !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches, []);

  useEffect(() => {
    let target = 0, shown = 0, raf = 0;
    const tick = () => {
      raf = 0;
      shown += (target - shown) * (reduce ? 1 : 0.14); // gentle scrubbed easing
      if (Math.abs(target - shown) < 0.0004) shown = target;
      setP(shown);
      if (shown !== target) raf = requestAnimationFrame(tick);
    };
    const read = () => {
      const el = runway.current;
      const total = el.offsetHeight - window.innerHeight;
      target = clamp(-el.getBoundingClientRect().top / total);
      if (!raf) raf = requestAnimationFrame(tick);
    };
    read();
    window.addEventListener('scroll', read, { passive: true });
    window.addEventListener('resize', read);
    return () => {
      window.removeEventListener('scroll', read);
      window.removeEventListener('resize', read);
      cancelAnimationFrame(raf);
    };
  }, [reduce]);

  // Camera push: 1 → 1.28 (approach) → ~2.4 (entrance). Reduced motion: crossfades only.
  const cam = reduce ? 1 : 1 + 0.02 * seg(p, 0, 0.15) + 0.26 * seg(p, 0.15, 0.35) + 1.12 * seg(p, 0.35, 0.5);
  const sc = (v) => (reduce ? 1 : v);
  const layer = (o, s = 1) => ({ opacity: o, transform: `scale(${s})`, visibility: o < 0.003 ? 'hidden' : 'visible' });

  const dusk = layer(1 - seg(p, 0.29, 0.35), cam);
  const close = layer(seg(p, 0.29, 0.35) * (1 - seg(p, 0.44, 0.5)), sc(cam / 1.28));
  const door = layer(seg(p, 0.44, 0.5) * (1 - seg(p, 0.5, 0.56)), sc(1 + 0.05 * (1 - seg(p, 0.44, 0.52))));
  const room = layer(seg(p, 0.5, 0.56) * (1 - seg(p, 0.63, 0.67)), sc(1.08 - 0.08 * seg(p, 0.5, 0.63)));
  const neck = layer(seg(p, 0.65, 0.71) * (1 - seg(p, 0.75, 0.78)), sc(0.96 + 0.04 * seg(p, 0.65, 0.71)));
  const ears = layer(seg(p, 0.78, 0.82) * (1 - seg(p, 0.87, 0.9)), sc(0.96 + 0.04 * seg(p, 0.78, 0.82)));
  const ring = layer(seg(p, 0.9, 0.94), sc(0.96 + 0.04 * seg(p, 0.9, 0.94)));
  const glow = Math.sin(Math.PI * clamp((p - 0.36) / 0.18)) ** 2; // amber spill as the doors open
  const stage = STAGES.find((s) => p < s.to);
  const rail = p >= 0.65 ? (p < 0.78 ? 0 : p < 0.9 ? 1 : 2) : -1;
  const text = (o, y = 18) => ({
    opacity: o,
    transform: `translateY(${(1 - o) * y}px)`,
    visibility: o < 0.003 ? 'hidden' : 'visible',
    pointerEvents: o > 0.6 ? 'auto' : 'none',
  });
  const pct = p < 0.02 ? 8 : Math.round(p * 100);

  return (
    <section ref={runway} className="hero" id="top" aria-label="Tarini — the story in seven moments">
      <div className="hero__stage">
        <div className="hero__plates" aria-hidden="true">
          <img className="plate" style={dusk} src="/img/facade-dusk.webp" alt="" fetchpriority="high" />
          <img className="plate" style={close} src="/img/facade-close.webp" alt="" />
          <img className="plate" style={door} src="/img/doorway.webp" alt="" />
          <img className="plate" style={room} src="/img/showroom.webp" alt="" />
          <img className="plate plate--product plate--necklace" style={neck} src="/img/necklace.webp" alt="" />
          <img className="plate plate--product plate--earrings" style={ears} src="/img/earrings.webp" alt="" />
          <img className="plate plate--product plate--ring" style={ring} src="/img/ring.webp" alt="" />
        </div>
        <div className="hero__scrim" />
        <div className="hero__amber" style={{ opacity: glow * 0.55 }} />

        {/* 1 · Opening */}
        <div className="copy copy--open" style={text(1 - seg(p, 0.07, 0.15), 0)}>
          <p className="eyebrow">A warm welcome. A timeless bond.</p>
          <h1 className="wordmark">
            {site.name.toUpperCase()}
            <span className="wordmark__rule" />
          </h1>
          <p className="wordmark__sub">{site.sub.toUpperCase()}</p>
          <p className="tagline">Crafted in Balasore. Worn with pride.</p>
          <p className="odia" lang="or">{odiaLine}</p>
        </div>

        {/* 3 · Entrance */}
        <div className="copy copy--door" style={text(win(p, 0.38, 0.43, 0.5, 0.54))}>
          <h2 className="display display--m">A world of warmth awaits.</h2>
        </div>

        {/* 4 · Showroom */}
        <div className="copy copy--room" style={text(win(p, 0.55, 0.6, 0.63, 0.67))}>
          <p className="eyebrow">Tradition, in a new light</p>
          <h2 className="display display--xl">Step inside the glow of Tarini.</h2>
          <span className="rule" />
          <p className="lede">A familiar warmth. A world of beautiful details.</p>
        </div>

        {/* 5–7 · Products */}
        <Product o={win(p, 0.67, 0.71, 0.745, 0.775)} text={text} w={5.6} tag="The necklace" title="Grace, in every curve."
          body="A delicate rhythm of ornament. A beautiful beginning to your own story." />
        <Product o={win(p, 0.8, 0.83, 0.865, 0.895)} text={text} w={6.9} tag="The earrings" title="A little light. A lasting glow."
          body="Graceful movement. Quiet radiance. Details that feel entirely your own." />
        <Product o={seg(p, 0.92, 0.95)} text={text} w={6.4} tag="The ring" title="For moments that stay."
          body="A small circle of meaning. Discover a piece that belongs to your story." cta />

        {/* chrome */}
        <ul className="rail" style={{ opacity: rail < 0 ? 0 : 1 }} aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <li key={i} className={rail === i ? 'is-on' : ''}><i />{`0${i + 1}`}</li>
          ))}
        </ul>
        <div className="hud hud--left">
          <b>{site.place.toUpperCase()}</b>
          <span key={stage.place} className="swap">{stage.place}</span>
        </div>
        <div className="hud hud--cue">
          <span key={stage.cue} className="swap">{stage.cue.toUpperCase()}</span>
          <i className="cue-line" />
        </div>
        <div className="hud hud--right">
          <span>{pct}% OF THE STORY</span>
          <i className="meter"><b style={{ width: `${Math.max(p * 100, 8)}%` }} /></i>
        </div>
      </div>
    </section>
  );
}

function Product({ o, text, tag, title, body, cta, w }) {
  return (
    <div className="copy copy--product" style={text(o, 24)}>
      <p className="eyebrow eyebrow--line"><i />{tag}</p>
      <h2 className="display display--l" style={{ maxWidth: `${w}em` }}>{title}</h2>
      <p className="lede lede--sm">{body}</p>
      {cta && (
        <a className="link-cta" href="#collection">
          Explore the collection <ArrowRight size={18} strokeWidth={1.2} />
        </a>
      )}
    </div>
  );
}
