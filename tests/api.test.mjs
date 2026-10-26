// End-to-end API tests. Run with the backend up (XAMPP Apache + MySQL):
//   TEST_ADMIN_EMAIL=... TEST_ADMIN_PASSWORD=... node tests/api.test.mjs
// Optional: API_URL (default http://localhost/ckg/jewellery/api), UPLOADS_PATH (folder used for the code-execution test)
import { deflateSync } from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';

const API = process.env.API_URL || 'http://localhost/ckg/jewellery/api';
const SITE = API.replace(/\/api$/, '');
const EMAIL = process.env.TEST_ADMIN_EMAIL;
const PASSWORD = process.env.TEST_ADMIN_PASSWORD;
if (!EMAIL || !PASSWORD) { console.error('Set TEST_ADMIN_EMAIL and TEST_ADMIN_PASSWORD'); process.exit(2); }

let passed = 0;
const failures = [];
const check = (name, ok, extra = '') => {
  if (ok) { passed++; console.log(`  ✓ ${name}`); } else { failures.push(name); console.log(`  ✗ ${name} ${extra}`); }
};
const section = (t) => console.log(`\n${t}`);

// ── tiny client with its own cookie jar ──
function client() {
  let cookie = '';
  let csrf = '';
  const call = async (method, p, body, { headers = {}, raw = false, noCsrf = false } = {}) => {
    const h = { Accept: 'application/json', ...headers };
    if (cookie) h.Cookie = cookie;
    if (csrf && !noCsrf && method !== 'GET') h['X-CSRF-Token'] = csrf;
    let payload = body;
    if (body && !(body instanceof FormData) && typeof body === 'object') { h['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
    const res = await fetch(API + p, { method, headers: h, body: payload });
    const set = res.headers.getSetCookie?.() || [];
    for (const c of set) cookie = c.split(';')[0];
    if (raw) return res;
    let json = null;
    try { json = await res.json(); } catch { /* */ }
    return { status: res.status, json };
  };
  return {
    call,
    async boot() { const r = await call('GET', '/auth/me'); csrf = r.json.csrf; return r; },
    async login(e, p) { const r = await call('POST', '/auth/login', { identifier: e, password: p }); if (r.json?.csrf) csrf = r.json.csrf; return r; },
    async logout() { const r = await call('POST', '/auth/logout'); if (r.json?.csrf) csrf = r.json.csrf; return r; },
    setCsrf: (t) => { csrf = t; },
  };
}

// ── PNG generator (valid image, width x height, solid colour + noise so it is not trivially small) ──
function crc32(buf) {
  let c, crc = ~0;
  for (const b of buf) { c = (crc ^ b) & 0xff; for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1; crc = (crc >>> 8) ^ c; }
  return ~crc >>> 0;
}
function png(w = 320, h = 400) {
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 3 + 1)] = 0; for (let x = 0; x < w * 3; x++) raw[y * (w * 3 + 1) + 1 + x] = (x * 7 + y * 3) & 255; }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const form = (buf, name, type, folder = 'collections') => {
  const fd = new FormData();
  fd.append('file', new Blob([buf], { type }), name);
  fd.append('folder', folder);
  return fd;
};

const iso = (offsetMs) => new Date(Date.now() + offsetMs).toISOString();
const H = 3600_000;
const made = { collections: [], offers: [], media: [], users: [] };

const admin = client();
const visitor = client();
await admin.boot();
await visitor.boot();

try {
  section('Security: unauthenticated access');
  check('GET /admin/collections → 401', (await visitor.call('GET', '/admin/collections')).status === 401);
  check('POST /admin/collections → 401', (await visitor.call('POST', '/admin/collections', { name: 'x' })).status === 401);
  check('POST /admin/offers → 401', (await visitor.call('POST', '/admin/offers', { title: 'x' })).status === 401);
  check('DELETE /admin/collections/1 → 401', (await visitor.call('DELETE', '/admin/collections/1')).status === 401);
  check('POST /admin/media → 401', (await visitor.call('POST', '/admin/media', form(png(), 'a.png', 'image/png'))).status === 401);
  check('PUT /admin/settings → 401', (await visitor.call('PUT', '/admin/settings', {})).status === 401);
  check('GET /admin/users → 401', (await visitor.call('GET', '/admin/users')).status === 401);
  check('public API needs no login', (await visitor.call('GET', '/collections')).status === 200);

  section('1. Admin login');
  check('wrong password rejected', (await admin.login(EMAIL, 'definitely-wrong-password')).status === 401);
  const bad = await admin.login('', '');
  check('empty form → 422 with field errors', bad.status === 422 && bad.json.error.fields?.identifier);
  const ok = await admin.login(EMAIL, PASSWORD);
  check('valid login succeeds', ok.status === 200 && ok.json.user.role === 'admin');
  check('/auth/me returns the user', (await admin.call('GET', '/auth/me')).json.user?.email === EMAIL.toLowerCase());
  check('password hash never exposed', !JSON.stringify(ok.json).includes('password'));
  const noTok = await admin.call('POST', '/admin/collections', { name: 'x' }, { noCsrf: true });
  check('mutating request without CSRF token is refused', noTok.status === 403 && noTok.json.error.code === 'csrf');

  section('Image upload validation');
  const phpAsPng = await admin.call('POST', '/admin/media', form(Buffer.from('<?php echo "pwned"; ?>'), 'shell.png', 'image/png'));
  check('PHP code disguised as .png rejected', phpAsPng.status === 422);
  const text = await admin.call('POST', '/admin/media', form(Buffer.from('hello'), 'notes.txt', 'text/plain'));
  check('non-image rejected', text.status === 422);
  const tiny = await admin.call('POST', '/admin/media', form(png(20, 20), 'tiny.png', 'image/png'));
  check('too-small image rejected', tiny.status === 422);
  const up = await admin.call('POST', '/admin/media', form(png(), 'My Necklace (final).png', 'image/png'));
  check('valid PNG uploaded', up.status === 201 && /^collections\/[a-f0-9]{32}\.png$/.test(up.json?.data?.path || ''), JSON.stringify(up.json));
  made.media.push(up.json.data.id);
  check('stored name is random (client name not reused)', !up.json.data.path.includes('Necklace'));
  const img = await fetch(SITE + up.json.data.url);
  check('uploaded image is served publicly', img.status === 200 && (img.headers.get('content-type') || '').startsWith('image/png'));
  const up2 = await admin.call('POST', '/admin/media', form(png(300, 300), 'cover2.png', 'image/png'));
  made.media.push(up2.json.data.id);
  const upOffer = await admin.call('POST', '/admin/media', form(png(400, 300), 'banner.png', 'image/png', 'offers'));
  made.media.push(upOffer.json.data.id);

  const uploadsDir = process.env.UPLOADS_PATH || path.resolve(import.meta.dirname, '../uploads/collections');
  const trap = path.join(uploadsDir, '__qa_trap.php');
  fs.writeFileSync(trap, '<?php echo "EXECUTED";');
  const trapRes = await fetch(SITE + '/uploads/collections/__qa_trap.php');
  const trapBody = await trapRes.text();
  fs.unlinkSync(trap);
  check('a .php file inside /uploads is never executed', !trapBody.includes('EXECUTED') && trapRes.status >= 400, `status ${trapRes.status}`);

  section('2–5. Collections: create, publish, edit, unpublish');
  const name = `QA Collection ${Date.now()}`;
  const c = await admin.call('POST', '/admin/collections', { name, tagline: 'Test tagline', description: 'Desc', cover_image: up.json.data.path, status: 'draft' });
  check('draft collection created', c.status === 201 && c.json.data.slug.startsWith('qa-collection'), JSON.stringify(c.json));
  const cid = c.json.data.id; const slug = c.json.data.slug;
  made.collections.push(cid);
  const pubList = async () => (await visitor.call('GET', '/collections')).json.data;
  check('draft is NOT in public list', !(await pubList()).some((x) => x.slug === slug));
  check('draft slug → 404 publicly', (await visitor.call('GET', `/collections/${slug}`)).status === 404);
  check('publish without cover → 422', (await admin.call('POST', '/admin/collections', { name: 'No cover', status: 'published' })).status === 422);
  check('missing name → 422', (await admin.call('POST', '/admin/collections', { status: 'draft' })).status === 422);
  check('image path outside media library rejected', (await admin.call('POST', '/admin/collections', { name: 'Bad', cover_image: 'collections/ffffffffffffffffffffffffffffffff.png' })).status === 422);
  check('path traversal in image rejected', (await admin.call('POST', '/admin/collections', { name: 'Bad', cover_image: '../../.env' })).status === 422);

  const pub = await admin.call('PATCH', `/admin/collections/${cid}`, { status: 'published' });
  check('collection published', pub.status === 200 && pub.json.data.status === 'published');
  const listed = (await pubList()).find((x) => x.slug === slug);
  check('published collection appears in public API', !!listed);
  check('public item has cover URL + name + description', listed?.cover_image?.includes('/uploads/collections/') && listed.name === name && listed.description === 'Desc');
  check('public item exposes no admin fields', !('status' in listed) && !('created_at' in listed));
  check('public detail by slug works', (await visitor.call('GET', `/collections/${slug}`)).status === 200);

  const edit = await admin.call('PATCH', `/admin/collections/${cid}`, { name: name + ' Edited', description: 'New description', gallery: [up2.json.data.path] });
  check('edit saved', edit.status === 200 && edit.json.data.gallery.length === 1);
  const after = (await pubList()).find((x) => x.slug === slug);
  check('edit reflected publicly', after?.name === name + ' Edited' && after.description === 'New description' && after.gallery.length === 1);
  check('duplicate slug rejected', (await admin.call('POST', '/admin/collections', { name: 'Dup', slug, status: 'draft' })).status === 422);

  const before = (await pubList()).map((x) => x.slug);
  const idx = before.indexOf(slug);
  await admin.call('POST', `/admin/collections/${cid}/move`, { direction: 'up' });
  const moved = (await pubList()).map((x) => x.slug);
  check('display order can be changed', idx > 0 ? moved.indexOf(slug) === idx - 1 : moved.indexOf(slug) === idx);

  const search = await admin.call('GET', `/admin/collections?search=${encodeURIComponent('QA Collection')}&status=published&per_page=5`);
  check('admin search + filter + pagination meta', search.status === 200 && search.json.meta.per_page === 5 && search.json.data.some((x) => x.id === cid));

  const unpub = await admin.call('PATCH', `/admin/collections/${cid}`, { status: 'draft' });
  check('collection unpublished', unpub.json.data.status === 'draft');
  check('unpublished disappears from public list', !(await pubList()).some((x) => x.slug === slug));
  const inUse = await admin.call('DELETE', `/admin/media/${up.json.data.id}`);
  check('image in use cannot be deleted from library', inUse.status === 409);

  section('6–11. Offers and popup eligibility');
  const active = async () => (await visitor.call('GET', '/offers/active')).json;
  const mk = (extra) => admin.call('POST', '/admin/offers', { title: 'QA offer', starts_at: iso(-H), ends_at: iso(24 * H), status: 'published', popup_enabled: true, popup_frequency: 'session', ...extra });
  const lo = await mk({ title: 'QA Low priority', display_priority: 1, discount_text: '10% OFF', image: upOffer.json.data.path });
  check('offer with banner created', lo.status === 201 && lo.json.data.state === 'active', JSON.stringify(lo.json));
  made.offers.push(lo.json.data.id);
  const hi = await mk({ title: 'QA High priority', display_priority: 50, coupon_code: 'qa-gold', button_text: 'Shop', button_url: '#collection', popup_frequency: 'campaign' });
  made.offers.push(hi.json.data.id);
  check('coupon code normalised to upper-case', hi.json.data.coupon_code === 'QA-GOLD');
  check('campaign id generated', /^cmp_[a-f0-9]{12}$/.test(hi.json.data.campaign_id));
  const a1 = await active();
  const ids1 = a1.data.map((o) => o.id);
  check('active offers returned', ids1.includes(lo.json.data.id) && ids1.includes(hi.json.data.id));
  check('highest priority comes first', ids1.indexOf(hi.json.data.id) < ids1.indexOf(lo.json.data.id));
  check('frequency + campaign id are in the public payload', a1.data.find((o) => o.id === hi.json.data.id).popup_frequency === 'campaign');
  check('public offer payload has no admin-only fields', !('status' in a1.data[0]) && !('created_at' in a1.data[0]));

  const fut = await mk({ title: 'QA Scheduled', starts_at: iso(2 * H), ends_at: iso(5 * H) });
  made.offers.push(fut.json.data.id);
  check('future offer reports state "scheduled"', fut.json.data.state === 'scheduled');
  check('scheduled offer hidden until start time', !(await active()).data.some((o) => o.id === fut.json.data.id));

  const exp = await mk({ title: 'QA Expired', starts_at: iso(-5 * H), ends_at: iso(-H) });
  made.offers.push(exp.json.data.id);
  check('past offer reports state "expired"', exp.json.data.state === 'expired');
  check('expired offer hidden', !(await active()).data.some((o) => o.id === exp.json.data.id));

  const dr = await mk({ title: 'QA Draft', status: 'draft' });
  made.offers.push(dr.json.data.id);
  check('draft offer hidden', !(await active()).data.some((o) => o.id === dr.json.data.id));

  const off = await admin.call('PATCH', `/admin/offers/${hi.json.data.id}`, { status: 'draft' });
  check('deactivating removes it from the public API', off.status === 200 && !(await active()).data.some((o) => o.id === hi.json.data.id));
  await admin.call('PATCH', `/admin/offers/${hi.json.data.id}`, { status: 'published' });
  check('re-activating brings it back', (await active()).data.some((o) => o.id === hi.json.data.id));

  const noPop = await admin.call('PATCH', `/admin/offers/${lo.json.data.id}`, { popup_enabled: false });
  check('popup can be disabled per offer (flag exposed)', (await active()).data.find((o) => o.id === lo.json.data.id)?.popup_enabled === false && noPop.status === 200);

  check('end before start rejected', (await mk({ starts_at: iso(H), ends_at: iso(-H) })).status === 422);
  check('missing title rejected', (await mk({ title: '' })).status === 422);
  check('javascript: button URL rejected', (await mk({ button_text: 'x', button_url: 'javascript:alert(1)' })).status === 422);
  check('protocol-relative URL rejected', (await mk({ button_text: 'x', button_url: '//evil.example' })).status === 422);
  check('invalid frequency rejected', (await mk({ popup_frequency: 'always' })).status === 422);
  check('bad coupon characters rejected', (await mk({ coupon_code: 'A B<script>' })).status === 422);
  check('banner outside the media library rejected', (await mk({ image: 'offers/ffffffffffffffffffffffffffffffff.png' })).status === 422);

  const stored = (await admin.call('GET', `/admin/offers/${exp.json.data.id}`)).json.data;
  check('timestamps are returned as UTC ISO-8601', /Z$/.test(stored.starts_at) && /Z$/.test(stored.created_at));
  check('admin list can filter by computed state', (await admin.call('GET', '/admin/offers?state=expired&per_page=50')).json.data.every((o) => o.state === 'expired'));
  const stateCounts = (await admin.call('GET', '/admin/dashboard')).json;
  check('dashboard reports counts and recents', stateCounts.offers.active >= 1 && stateCounts.recent_offers.length > 0 && stateCounts.collections.total >= 1);

  section('Website settings and roles');
  const set = await admin.call('PUT', '/admin/settings', { popups_enabled: false, phone: '+91 99999 00000', instagram: 'https://instagram.com/tarini' });
  check('admin can save settings', set.status === 200 && set.json.data.popups_enabled === false);
  check('master popup switch is exposed publicly', (await active()).popups_enabled === false);
  check('invalid settings link rejected', (await admin.call('PUT', '/admin/settings', { instagram: 'javascript:x' })).status === 422);
  await admin.call('PUT', '/admin/settings', { popups_enabled: true, phone: null, instagram: null });
  check('master switch back on', (await active()).popups_enabled === true);

  const ed = await admin.call('POST', '/admin/users', { name: 'QA Editor', email: `qa-editor-${Date.now()}@example.test`, role: 'editor', password: 'Editor-pass-2026' });
  check('admin creates an editor', ed.status === 201);
  made.users.push(ed.json.data.id);
  check('weak password rejected', (await admin.call('POST', '/admin/users', { name: 'W', email: 'w@example.test', password: 'short' })).status === 422);
  const editor = client(); await editor.boot();
  check('editor can sign in', (await editor.login(ed.json.data.email, 'Editor-pass-2026')).status === 200);
  check('editor can read collections', (await editor.call('GET', '/admin/collections')).status === 200);
  check('editor cannot change settings → 403', (await editor.call('PUT', '/admin/settings', { popups_enabled: true })).status === 403);
  check('editor cannot list users → 403', (await editor.call('GET', '/admin/users')).status === 403);

  section('Login throttling and logout');
  const thr = client(); await thr.boot();
  let last;
  for (let i = 0; i < 6; i++) last = await thr.login('throttle-test@example.test', 'nope-nope-nope');
  check('repeated failures are rate-limited (429)', last.status === 429);
  check('logout works', (await admin.logout()).status === 200);
  check('after logout admin API → 401', (await admin.call('GET', '/admin/collections')).status === 401);
} finally {
  // cleanup (log back in if the session was closed)
  const c = client(); await c.boot();
  await c.login(EMAIL, PASSWORD);
  for (const id of made.collections) await c.call('DELETE', `/admin/collections/${id}`);
  for (const id of made.offers) await c.call('DELETE', `/admin/offers/${id}`);
  for (const id of made.users) await c.call('DELETE', `/admin/users/${id}`);
  for (const id of made.media) await c.call('DELETE', `/admin/media/${id}`);
  await c.call('DELETE', '/admin/media/0');
}

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) { console.log('Failed:\n - ' + failures.join('\n - ')); process.exit(1); }
