<?php
declare(strict_types=1);

/**
 * Core helpers: environment, database, routing, JSON responses, validation.
 * All timestamps are stored and returned in UTC.
 */

const API_ROOT = __DIR__ . '/..';
const PROJECT_ROOT = API_ROOT . '/..';

date_default_timezone_set('UTC');

// ───────── Environment ─────────
function env(string $key, ?string $default = null): ?string
{
    static $vars = null;
    if ($vars === null) {
        $vars = [];
        $file = API_ROOT . '/.env';
        if (is_readable($file)) {
            foreach (file($file, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
                $line = trim($line);
                if ($line === '' || $line[0] === '#' || !str_contains($line, '=')) {
                    continue;
                }
                [$k, $v] = explode('=', $line, 2);
                $vars[trim($k)] = trim($v, " \t\"'");
            }
        }
    }
    if (array_key_exists($key, $vars)) {
        return $vars[$key];
    }
    $fromOs = getenv($key);
    return $fromOs === false ? $default : $fromOs;
}

// ───────── Database ─────────
function db(bool $withDatabase = true): PDO
{
    static $pool = [];
    $k = $withDatabase ? 'db' : 'server';
    if (!isset($pool[$k])) {
        $dsn = sprintf(
            'mysql:host=%s;port=%s;%scharset=utf8mb4',
            env('DB_HOST', '127.0.0.1'),
            env('DB_PORT', '3306'),
            $withDatabase ? 'dbname=' . env('DB_NAME', 'tarini') . ';' : ''
        );
        $pdo = new PDO($dsn, env('DB_USER', 'root'), env('DB_PASS', ''), [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        ]);
        $pdo->exec("SET time_zone = '+00:00'");
        $pool[$k] = $pdo;
    }
    return $pool[$k];
}

function q(string $sql, array $params = []): PDOStatement
{
    $st = db()->prepare($sql);
    $st->execute($params);
    return $st;
}

// ───────── Time ─────────
function now_utc(): string
{
    return gmdate('Y-m-d H:i:s');
}

function iso(?string $utc): ?string
{
    return $utc === null ? null : str_replace(' ', 'T', $utc) . 'Z';
}

// ───────── Responses ─────────
final class ApiError extends Exception
{
    public function __construct(public int $status, string $message, public array $fields = [], public string $errorCode = '')
    {
        parent::__construct($message);
    }
}

function fail(int $status, string $message, array $fields = [], string $code = ''): never
{
    throw new ApiError($status, $message, $fields, $code);
}

function respond(mixed $data, int $status = 200): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
    exit;
}

function input(): array
{
    $raw = file_get_contents('php://input');
    if ($raw === '' || $raw === false) {
        return [];
    }
    $data = json_decode($raw, true);
    if (!is_array($data)) {
        fail(400, 'The request body must be valid JSON.');
    }
    return $data;
}

function upload_url(?string $path): ?string
{
    if ($path === null || $path === '') {
        return null;
    }
    return rtrim((string) env('UPLOADS_URL', '/uploads'), '/') . '/' . ltrim($path, '/');
}

// ───────── Router ─────────
/** @var array<int, array{string,string,callable,?string}> */
$GLOBALS['routes'] = [];

/** $auth: null = public, 'user' = any signed-in user, 'admin' = administrators only */
function route(string $method, string $pattern, callable $handler, ?string $auth = null): void
{
    $regex = preg_replace('#\{(\w+):([^}]+)\}#', '(?P<$1>$2)', $pattern);
    $regex = preg_replace('#\{(\w+)\}#', '(?P<$1>[^/]+)', (string) $regex);
    $GLOBALS['routes'][] = [$method, '#^' . $regex . '$#', $handler, $auth];
}

function dispatch(string $method, string $path): never
{
    $allowed = [];
    foreach ($GLOBALS['routes'] as [$m, $regex, $handler, $auth]) {
        if (!preg_match($regex, $path, $match)) {
            continue;
        }
        if ($m !== $method) {
            $allowed[] = $m;
            continue;
        }
        $params = array_filter($match, 'is_string', ARRAY_FILTER_USE_KEY);
        if ($auth !== null) {
            require_auth($auth);
            if (!in_array($method, ['GET', 'HEAD'], true)) {
                csrf_check();
            }
        } elseif (!in_array($method, ['GET', 'HEAD'], true) && str_starts_with($path, '/auth/')) {
            csrf_check();
        }
        respond($handler($params));
    }
    if ($allowed) {
        header('Allow: ' . implode(', ', array_unique($allowed)));
        fail(405, 'Method not allowed.');
    }
    fail(404, 'Endpoint not found.');
}

// ───────── Validation ─────────
final class Validator
{
    public array $errors = [];

    public function __construct(private array $in)
    {
    }

    public function string(string $k, bool $required = false, int $max = 255, bool $multiline = false): ?string
    {
        $v = $this->in[$k] ?? null;
        if ($v !== null && !is_string($v)) {
            $this->errors[$k] = 'Must be text.';
            return null;
        }
        if ($v !== null) {
            $v = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u', '', $v) ?? '';
            $v = $multiline ? trim(str_replace("\r\n", "\n", $v)) : trim((string) preg_replace('/\s+/u', ' ', $v));
        }
        if ($v === null || $v === '') {
            if ($required) {
                $this->errors[$k] = 'This field is required.';
            }
            return null;
        }
        if (mb_strlen($v) > $max) {
            $this->errors[$k] = "Must be at most {$max} characters.";
            return null;
        }
        return $v;
    }

    public function enum(string $k, array $values, string $default): string
    {
        $v = $this->in[$k] ?? $default;
        if (!is_string($v) || !in_array($v, $values, true)) {
            $this->errors[$k] = 'Must be one of: ' . implode(', ', $values) . '.';
            return $default;
        }
        return $v;
    }

    public function int(string $k, int $min, int $max, int $default = 0): int
    {
        $v = $this->in[$k] ?? $default;
        if ($v === '' || $v === null) {
            return $default;
        }
        if (!is_int($v) && !(is_string($v) && preg_match('/^-?\d+$/', $v))) {
            $this->errors[$k] = 'Must be a whole number.';
            return $default;
        }
        $v = (int) $v;
        if ($v < $min || $v > $max) {
            $this->errors[$k] = "Must be between {$min} and {$max}.";
            return $default;
        }
        return $v;
    }

    public function bool(string $k, bool $default = false): bool
    {
        $v = $this->in[$k] ?? $default;
        if (is_bool($v)) {
            return $v;
        }
        if (in_array($v, [0, 1, '0', '1', 'true', 'false'], true)) {
            return $v === 1 || $v === '1' || $v === 'true';
        }
        $this->errors[$k] = 'Must be true or false.';
        return $default;
    }

    public function decimal(string $k, float $min, float $max): ?string
    {
        $v = $this->in[$k] ?? null;
        if ($v === null || $v === '') {
            return null;
        }
        if (!is_numeric($v) || (float) $v < $min || (float) $v > $max) {
            $this->errors[$k] = "Must be a number between {$min} and {$max}.";
            return null;
        }
        return number_format((float) $v, 2, '.', '');
    }

    /** Parses an ISO-8601 date/time and returns it as UTC "Y-m-d H:i:s". */
    public function datetime(string $k, bool $required = false): ?string
    {
        $v = $this->string($k, $required, 40);
        if ($v === null) {
            return null;
        }
        try {
            $d = new DateTimeImmutable($v);
        } catch (Throwable) {
            $this->errors[$k] = 'Enter a valid date and time.';
            return null;
        }
        $y = (int) $d->format('Y');
        if ($y < 2000 || $y > 2100) {
            $this->errors[$k] = 'Enter a date between 2000 and 2100.';
            return null;
        }
        return $d->setTimezone(new DateTimeZone('UTC'))->format('Y-m-d H:i:s');
    }

    /** Only http(s) URLs, site-relative paths, #anchors, mailto: and tel: are allowed (never javascript:). */
    public function url(string $k, int $max = 500): ?string
    {
        $v = $this->string($k, false, $max);
        if ($v === null) {
            return null;
        }
        $ok = false;
        if (preg_match('#^https?://#i', $v)) {
            $ok = filter_var($v, FILTER_VALIDATE_URL) !== false;
        } elseif (preg_match('#^/(?!/)[^\s]*$#', $v) || preg_match('/^#[\w\-\/]*$/', $v)) {
            $ok = true;
        } elseif (preg_match('/^mailto:[^\s@]+@[^\s@]+$/i', $v) || preg_match('/^tel:[+\d\s\-()]{5,30}$/i', $v)) {
            $ok = true;
        }
        if (!$ok) {
            $this->errors[$k] = 'Enter a web address (https://…), a page path (/…), an #anchor, mailto: or tel: link.';
            return null;
        }
        return $v;
    }

    /** A stored upload path such as "offers/abc….webp". Must exist in the media table. */
    public function imagePath(string $k): ?string
    {
        $v = $this->string($k, false, 190);
        if ($v === null) {
            return null;
        }
        if (!preg_match('#^(collections|offers|general|seed)/[A-Za-z0-9_\-]+\.(jpg|png|webp)$#', $v)
            || q('SELECT 1 FROM media WHERE path = ?', [$v])->fetchColumn() === false) {
            $this->errors[$k] = 'Choose an image that was uploaded through the media library.';
            return null;
        }
        return $v;
    }

    public function fail(string $message = 'Please correct the highlighted fields.'): void
    {
        if ($this->errors) {
            fail(422, $message, $this->errors);
        }
    }
}

function slugify(string $text): string
{
    $text = strtolower(trim($text));
    if (function_exists('iconv')) {
        $t = @iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $text);
        if ($t !== false) {
            $text = strtolower($t);
        }
    }
    $text = trim((string) preg_replace('/[^a-z0-9]+/', '-', $text), '-');
    return substr($text !== '' ? $text : 'item', 0, 120);
}

function paging(): array
{
    $page = max(1, (int) ($_GET['page'] ?? 1));
    $per = min(50, max(1, (int) ($_GET['per_page'] ?? 10)));
    return [$page, $per, ($page - 1) * $per];
}

function page_meta(int $page, int $per, int $total): array
{
    return ['page' => $page, 'per_page' => $per, 'total' => $total, 'pages' => max(1, (int) ceil($total / $per))];
}
