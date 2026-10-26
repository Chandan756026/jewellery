<?php
declare(strict_types=1);

/** Session based admin authentication with CSRF protection and login throttling. */

const SESSION_IDLE_SECONDS = 8 * 3600;
const LOGIN_MAX_FAILURES = 5;
const LOGIN_WINDOW_MINUTES = 15;

function session_boot(): void
{
    if (session_status() === PHP_SESSION_ACTIVE) {
        return;
    }
    $https = !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off';
    ini_set('session.use_strict_mode', '1');
    ini_set('session.use_only_cookies', '1');
    session_name('tarini_admin');
    session_set_cookie_params([
        'lifetime' => 0,
        'path' => '/',
        'secure' => $https,
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
    session_start();
    if (isset($_SESSION['last_seen']) && time() - (int) $_SESSION['last_seen'] > SESSION_IDLE_SECONDS) {
        $_SESSION = [];
        session_regenerate_id(true);
    }
    $_SESSION['last_seen'] = time();
    if (empty($_SESSION['csrf'])) {
        $_SESSION['csrf'] = bin2hex(random_bytes(32));
    }
}

function csrf_token(): string
{
    session_boot();
    return (string) $_SESSION['csrf'];
}

function csrf_check(): void
{
    session_boot();
    $sent = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '';
    if (!is_string($sent) || $sent === '' || !hash_equals((string) $_SESSION['csrf'], $sent)) {
        fail(403, 'Your session expired. Refresh the page and try again.', [], 'csrf');
    }
}

function public_user(array $u): array
{
    return [
        'id' => (int) $u['id'],
        'name' => $u['name'],
        'email' => $u['email'],
        'username' => $u['username'],
        'role' => $u['role'],
        'is_active' => (bool) $u['is_active'],
        'last_login_at' => iso($u['last_login_at']),
        'created_at' => iso($u['created_at']),
    ];
}

function current_user(): ?array
{
    static $cache = false;
    if ($cache !== false) {
        return $cache;
    }
    session_boot();
    $user = null;
    if (!empty($_SESSION['uid'])) {
        $row = q('SELECT * FROM users WHERE id = ? AND is_active = 1', [(int) $_SESSION['uid']])->fetch();
        $user = $row ?: null;
        if (!$user) {
            unset($_SESSION['uid']);
        }
    }
    return $cache = $user;
}

function require_auth(string $level): array
{
    $user = current_user();
    if (!$user) {
        fail(401, 'Please sign in to continue.');
    }
    if ($level === 'admin' && $user['role'] !== 'admin') {
        fail(403, 'Only administrators can do this.');
    }
    return $user;
}

function client_ip(): string
{
    return substr((string) ($_SERVER['REMOTE_ADDR'] ?? '0.0.0.0'), 0, 45);
}

function hash_password(string $plain): string
{
    return password_hash($plain, defined('PASSWORD_ARGON2ID') ? PASSWORD_ARGON2ID : PASSWORD_DEFAULT);
}

/**
 * LOCAL DEVELOPMENT ONLY: with ALLOW_PLAINTEXT_PASSWORDS=1 in api/.env, new passwords are stored as normal text in users.password
 * and plain-text values are accepted at login. It is refused automatically when APP_ENV=production or when the site is not served
 * from localhost, so a live website always uses password_hash()/password_verify().
 */
function plaintext_passwords_allowed(): bool
{
    if (env('ALLOW_PLAINTEXT_PASSWORDS', '0') !== '1' || env('APP_ENV', 'local') === 'production') {
        return false;
    }
    if (PHP_SAPI === 'cli') {
        return true;
    }
    $host = strtolower((string) ($_SERVER['SERVER_NAME'] ?? ''));
    return in_array($host, ['localhost', '127.0.0.1', '::1', '[::1]'], true) || str_ends_with($host, '.localhost');
}

/** The value to save in users.password */
function store_password(string $plain): string
{
    return plaintext_passwords_allowed() ? $plain : hash_password($plain);
}

function password_is_hashed(string $stored): bool
{
    return preg_match('/^\$(argon2id|argon2i|2y)\$/', $stored) === 1;
}

/** Hashed values are always verified with password_verify(); plain values only in the local-development mode. */
function check_password(string $plain, string $stored): bool
{
    if (password_is_hashed($stored)) {
        return password_verify($plain, $stored);
    }
    return plaintext_passwords_allowed() && hash_equals($stored, $plain);
}

function password_problem(string $plain): ?string
{
    $min = max(4, (int) env('MIN_PASSWORD_LENGTH', '10'));
    if (strlen($plain) < $min) {
        return "Use at least {$min} characters.";
    }
    if ($min >= 8 && (!preg_match('/[A-Za-z]/', $plain) || !preg_match('/\d/', $plain))) {
        return 'Include at least one letter and one number.';
    }
    return null;
}

route('GET', '/auth/me', function () {
    $u = current_user();
    return ['user' => $u ? public_user($u) : null, 'csrf' => csrf_token()];
});

route('POST', '/auth/login', function () {
    $in = input();
    $identifier = is_string($in['identifier'] ?? null) ? trim($in['identifier']) : '';
    $password = is_string($in['password'] ?? null) ? $in['password'] : '';
    if ($identifier === '' || $password === '') {
        fail(422, 'Enter your email or username and your password.', array_filter([
            'identifier' => $identifier === '' ? 'This field is required.' : null,
            'password' => $password === '' ? 'This field is required.' : null,
        ]));
    }
    $ident = mb_strtolower(mb_substr($identifier, 0, 190));
    $ip = client_ip();
    $since = gmdate('Y-m-d H:i:s', time() - LOGIN_WINDOW_MINUTES * 60);
    // Lock a specific (ip + account) pair after 5 failures; also guard against many accounts from one IP
    // and many IPs against one account, without letting one bad actor lock everybody out.
    $count = fn (string $where, array $args) => (int) q("SELECT COUNT(*) FROM login_attempts WHERE created_at > ? AND $where", [$since, ...$args])->fetchColumn();
    if ($count('ip = ? AND identifier = ?', [$ip, $ident]) >= LOGIN_MAX_FAILURES
        || $count('ip = ?', [$ip]) >= LOGIN_MAX_FAILURES * 6
        || $count('identifier = ?', [$ident]) >= LOGIN_MAX_FAILURES * 4) {
        fail(429, 'Too many failed attempts. Please wait ' . LOGIN_WINDOW_MINUTES . ' minutes and try again.');
    }

    $user = q('SELECT * FROM users WHERE (email = ? OR username = ?) AND is_active = 1 LIMIT 1', [$ident, $ident])->fetch();
    // Always verify against a hash so timing does not reveal whether the account exists.
    $stored = $user['password'] ?? hash_password(bin2hex(random_bytes(8)));
    $valid = check_password($password, $stored);
    $ok = $valid && $user;
    if (!$ok) {
        q('INSERT INTO login_attempts (ip, identifier, created_at) VALUES (?, ?, ?)', [$ip, $ident, now_utc()]);
        fail(401, 'Incorrect email/username or password.');
    }
    q('DELETE FROM login_attempts WHERE identifier = ?', [$ident]);
    if (password_is_hashed($user['password']) && password_needs_rehash($user['password'], defined('PASSWORD_ARGON2ID') ? PASSWORD_ARGON2ID : PASSWORD_DEFAULT)) {
        q('UPDATE users SET password = ? WHERE id = ?', [hash_password($password), $user['id']]);
    }
    session_regenerate_id(true);
    $_SESSION['uid'] = (int) $user['id'];
    $_SESSION['csrf'] = bin2hex(random_bytes(32));
    q('UPDATE users SET last_login_at = ? WHERE id = ?', [now_utc(), $user['id']]);
    $user['last_login_at'] = now_utc();
    return ['user' => public_user($user), 'csrf' => $_SESSION['csrf']];
});

route('POST', '/auth/logout', function () {
    session_boot();
    $_SESSION = [];
    session_regenerate_id(true);
    $_SESSION['csrf'] = bin2hex(random_bytes(32));
    $_SESSION['last_seen'] = time();
    return ['ok' => true, 'csrf' => $_SESSION['csrf']];
});
