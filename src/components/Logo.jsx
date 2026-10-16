import { site } from '../data/site.js';

export default function Logo({ href = '#top' }) {
  return (
    <a className="logo" href={href} aria-label={`${site.name} ${site.sub} — home`}>
      <span className="logo__name">{site.name.toUpperCase()}</span>
      <span className="logo__rule" />
      <span className="logo__sub">{site.sub.toUpperCase()}</span>
    </a>
  );
}
