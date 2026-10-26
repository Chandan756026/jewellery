<?php
declare(strict_types=1);

/** Front controller: every /api/* request is routed through this file. */

require __DIR__ . '/src/core.php';
require __DIR__ . '/src/auth.php';
require __DIR__ . '/src/media.php';
require __DIR__ . '/src/collections.php';
require __DIR__ . '/src/offers.php';
require __DIR__ . '/src/admin.php';

$debug = env('APP_DEBUG', '0') === '1';
ini_set('display_errors', '0');
error_reporting(E_ALL);

header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: DENY');
header('Referrer-Policy: same-origin');
header('Cache-Control: no-store');

try {
    $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
    if ($method === 'HEAD') {
        $method = 'GET';
    }
    $base = rtrim(str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'])), '/');
    $path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
    if ($base !== '' && str_starts_with($path, $base)) {
        $path = substr($path, strlen($base));
    }
    $path = '/' . trim(preg_replace('#^/index\.php#', '', $path), '/');
    dispatch($method, $path === '' ? '/' : $path);
} catch (ApiError $e) {
    $body = ['error' => ['message' => $e->getMessage()]];
    if ($e->fields) {
        $body['error']['fields'] = $e->fields;
    }
    if ($e->errorCode !== '') {
        $body['error']['code'] = $e->errorCode;
    }
    respond($body, $e->status);
} catch (Throwable $e) {
    error_log('[tarini-api] ' . $e::class . ': ' . $e->getMessage() . ' @ ' . $e->getFile() . ':' . $e->getLine());
    $msg = 'Something went wrong on the server.';
    if ($e instanceof PDOException) {
        $msg = 'The database is not available. Check the API configuration (api/.env) and that MySQL is running.';
    }
    respond(['error' => ['message' => $debug ? $e->getMessage() : $msg]], 500);
}
