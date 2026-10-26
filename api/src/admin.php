<?php
declare(strict_types=1);

/** Website settings, team (users) and dashboard overview. */

const PUBLIC_SETTINGS = ['address', 'phone', 'email', 'hours', 'instagram', 'facebook', 'whatsapp', 'popups_enabled'];

function setting(string $key, ?string $default = null): ?string
{
    $v = q('SELECT setting_value FROM settings WHERE setting_key = ?', [$key])->fetchColumn();
    return $v === false || $v === null ? $default : (string) $v;
}

function settings_all(): array
{
    $out = array_fill_keys(PUBLIC_SETTINGS, null);
    $out['popups_enabled'] = '1';
    foreach (q('SELECT setting_key, setting_value FROM settings')->fetchAll() as $r) {
        if (array_key_exists($r['setting_key'], $out)) {
            $out[$r['setting_key']] = $r['setting_value'];
        }
    }
    return $out;
}

function settings_public(): array
{
    $s = settings_all();
    $s['popups_enabled'] = $s['popups_enabled'] === '1';
    return $s;
}

route('GET', '/settings', fn () => ['data' => settings_public()]);

route('GET', '/admin/settings', fn () => ['data' => settings_public()], 'user');

route('PUT', '/admin/settings', function () {
    $in = input();
    $v = new Validator($in);
    $clean = [
        'address' => $v->string('address', false, 300, true),
        'phone' => $v->string('phone', false, 40),
        'email' => $v->string('email', false, 190),
        'hours' => $v->string('hours', false, 200),
        'instagram' => $v->url('instagram'),
        'facebook' => $v->url('facebook'),
        'whatsapp' => $v->string('whatsapp', false, 40),
    ];
    if ($clean['email'] !== null && !filter_var($clean['email'], FILTER_VALIDATE_EMAIL)) {
        $v->errors['email'] = 'Enter a valid email address.';
    }
    $clean['popups_enabled'] = $v->bool('popups_enabled', true) ? '1' : '0';
    $v->fail();
    $now = now_utc();
    foreach ($clean as $k => $val) {
        q(
            'INSERT INTO settings (setting_key, setting_value, updated_at) VALUES (?,?,?)
             ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), updated_at = VALUES(updated_at)',
            [$k, $val, $now]
        );
    }
    return ['data' => settings_public()];
}, 'admin');

// ───────── Team ─────────
route('GET', '/admin/users', function () {
    $rows = q('SELECT * FROM users ORDER BY id')->fetchAll();
    return ['data' => array_map('public_user', $rows)];
}, 'admin');

function user_fields(array $in, ?int $id): array
{
    $v = new Validator($in);
    $d = [
        'name' => $v->string('name', true, 120),
        'email' => $v->string('email', true, 190),
        'username' => $v->string('username', false, 60),
        'role' => $v->enum('role', ['admin', 'editor'], 'editor'),
        'is_active' => $v->bool('is_active', true),
    ];
    if ($d['email'] !== null) {
        $d['email'] = mb_strtolower($d['email']);
        if (!filter_var($d['email'], FILTER_VALIDATE_EMAIL)) {
            $v->errors['email'] = 'Enter a valid email address.';
        }
    }
    if ($d['username'] !== null) {
        $d['username'] = mb_strtolower($d['username']);
        if (!preg_match('/^[a-z0-9._-]{3,60}$/', $d['username'])) {
            $v->errors['username'] = 'Use 3–60 lowercase letters, numbers, dots, hyphens or underscores.';
        }
    }
    $v->fail();
    if (q('SELECT 1 FROM users WHERE email = ? AND id <> ?', [$d['email'], $id ?? 0])->fetchColumn() !== false) {
        fail(422, 'Please correct the highlighted fields.', ['email' => 'This email is already used.']);
    }
    if ($d['username'] !== null && q('SELECT 1 FROM users WHERE username = ? AND id <> ?', [$d['username'], $id ?? 0])->fetchColumn() !== false) {
        fail(422, 'Please correct the highlighted fields.', ['username' => 'This username is already used.']);
    }
    return $d;
}

route('POST', '/admin/users', function () {
    $in = input();
    $d = user_fields($in, null);
    $pw = is_string($in['password'] ?? null) ? $in['password'] : '';
    if ($problem = password_problem($pw)) {
        fail(422, 'Please correct the highlighted fields.', ['password' => $problem]);
    }
    $now = now_utc();
    q(
        'INSERT INTO users (name, email, username, password, role, is_active, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)',
        [$d['name'], $d['email'], $d['username'], store_password($pw), $d['role'], (int) $d['is_active'], $now, $now]
    );
    respond(['data' => public_user(q('SELECT * FROM users WHERE id = ?', [db()->lastInsertId()])->fetch())], 201);
}, 'admin');

route('PATCH', '/admin/users/{id:\d+}', function (array $p) {
    $id = (int) $p['id'];
    $cur = q('SELECT * FROM users WHERE id = ?', [$id])->fetch();
    if (!$cur) {
        fail(404, 'User not found.');
    }
    $in = array_merge([
        'name' => $cur['name'], 'email' => $cur['email'], 'username' => $cur['username'],
        'role' => $cur['role'], 'is_active' => (bool) $cur['is_active'],
    ], input());
    $d = user_fields($in, $id);
    $me = current_user();
    if ($id === (int) $me['id'] && ($d['role'] !== 'admin' || !$d['is_active'])) {
        fail(422, 'You cannot remove your own administrator access.');
    }
    $stored = $cur['password'];
    $pw = input()['password'] ?? null;
    if (is_string($pw) && $pw !== '') {
        if ($problem = password_problem($pw)) {
            fail(422, 'Please correct the highlighted fields.', ['password' => $problem]);
        }
        $stored = store_password($pw);
    }
    q(
        'UPDATE users SET name=?, email=?, username=?, role=?, is_active=?, password=?, updated_at=? WHERE id=?',
        [$d['name'], $d['email'], $d['username'], $d['role'], (int) $d['is_active'], $stored, now_utc(), $id]
    );
    return ['data' => public_user(q('SELECT * FROM users WHERE id = ?', [$id])->fetch())];
}, 'admin');

route('DELETE', '/admin/users/{id:\d+}', function (array $p) {
    $id = (int) $p['id'];
    if ($id === (int) current_user()['id']) {
        fail(422, 'You cannot delete your own account.');
    }
    q('DELETE FROM users WHERE id = ?', [$id]);
    return ['ok' => true];
}, 'admin');

// ───────── Dashboard ─────────
route('GET', '/admin/dashboard', function () {
    $now = now_utc();
    $c = q("SELECT COUNT(*) total, SUM(status='published') published, SUM(status='draft') draft FROM collections")->fetch();
    $o = q(
        "SELECT COUNT(*) total,
            SUM(status='published' AND starts_at <= ? AND (ends_at IS NULL OR ends_at > ?)) active,
            SUM(status='published' AND starts_at > ?) scheduled,
            SUM(status='published' AND ends_at IS NOT NULL AND ends_at <= ?) expired
         FROM offers",
        [$now, $now, $now, $now]
    )->fetch();
    $recentC = q('SELECT * FROM collections ORDER BY created_at DESC, id DESC LIMIT 5')->fetchAll();
    $recentO = q('SELECT * FROM offers ORDER BY updated_at DESC, id DESC LIMIT 5')->fetchAll();
    return [
        'collections' => ['total' => (int) $c['total'], 'published' => (int) $c['published'], 'draft' => (int) $c['draft']],
        'offers' => ['total' => (int) $o['total'], 'active' => (int) $o['active'], 'scheduled' => (int) $o['scheduled'], 'expired' => (int) $o['expired']],
        'media' => (int) q('SELECT COUNT(*) FROM media')->fetchColumn(),
        'recent_collections' => array_map(fn ($r) => collection_admin($r, []), $recentC),
        'recent_offers' => array_map('offer_admin', $recentO),
    ];
}, 'user');
