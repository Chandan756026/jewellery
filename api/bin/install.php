<?php
declare(strict_types=1);

/**
 * Creates the database (if missing), applies migrations and seeds the existing collections.
 * Safe to run more than once.   Usage:  php api/bin/install.php
 */

if (PHP_SAPI !== 'cli') {
    exit('Run this script from the command line.');
}

require __DIR__ . '/../src/core.php';
require __DIR__ . '/../src/media.php';

$dbName = (string) env('DB_NAME', 'tarini');
if (!preg_match('/^[A-Za-z0-9_]+$/', $dbName)) {
    exit("Invalid DB_NAME in api/.env\n");
}

try {
    db(false)->exec("CREATE DATABASE IF NOT EXISTS `$dbName` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
    echo "Database `$dbName` ready.\n";
    $pdo = db();
} catch (PDOException $e) {
    exit("Could not connect to MySQL: " . $e->getMessage() . "\nCheck api/.env and that MySQL is running in XAMPP.\n");
}

$pdo->exec('CREATE TABLE IF NOT EXISTS schema_migrations (name VARCHAR(100) PRIMARY KEY, applied_at DATETIME NOT NULL) ENGINE=InnoDB');
$files = glob(__DIR__ . '/../migrations/*.sql') ?: [];
sort($files);
foreach ($files as $file) {
    $name = basename($file);
    if (q('SELECT 1 FROM schema_migrations WHERE name = ?', [$name])->fetchColumn() !== false) {
        continue;
    }
    foreach (array_filter(array_map('trim', explode(";\n", (string) file_get_contents($file)))) as $stmt) {
        $pdo->exec($stmt);
    }
    q('INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)', [$name, now_utc()]);
    echo "Applied migration $name\n";
}

// Default settings
foreach (['popups_enabled' => '1'] as $k => $v) {
    q('INSERT IGNORE INTO settings (setting_key, setting_value, updated_at) VALUES (?,?,?)', [$k, $v, now_utc()]);
}

// Seed the collections that already existed on the website (only into an empty table)
if ((int) q('SELECT COUNT(*) FROM collections')->fetchColumn() === 0) {
    $seed = json_decode((string) file_get_contents(__DIR__ . '/../seed/collections.json'), true) ?: [];
    $dir = uploads_dir() . '/collections';
    if (!is_dir($dir)) {
        mkdir($dir, 0755, true);
    }
    foreach ($seed as $i => $c) {
        $src = __DIR__ . '/../seed/images/' . $c['image'];
        $path = 'collections/seed-' . $c['slug'] . '.webp';
        copy($src, uploads_dir() . '/' . $path);
        [$w, $h] = getimagesize($src);
        $now = now_utc();
        q('INSERT IGNORE INTO media (path, original_name, mime, size_bytes, width, height, uploaded_by, created_at) VALUES (?,?,?,?,?,?,NULL,?)',
            [$path, $c['image'], 'image/webp', (int) filesize($src), $w, $h, $now]);
        q('INSERT INTO collections (name, slug, tagline, kind, description, details, price_text, cover_image, display_order, is_featured, status, published_at, created_at, updated_at)
           VALUES (?,?,?,?,?,?,NULL,?,?,0,\'published\',?,?,?)',
            [$c['name'], $c['slug'], $c['tagline'], $c['kind'], $c['description'], $c['details'], $path, $i + 1, $now, $now, $now]);
        echo "Seeded collection: {$c['name']}\n";
    }
}

echo "\nDone. Next: create the first administrator:\n  php api/bin/create-admin.php you@example.com \"Your Name\"\n";
