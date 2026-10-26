<?php
declare(strict_types=1);

/**
 * Exports the PUBLISHED content of the database as static files so the site can be hosted without PHP/MySQL (e.g. on Vercel):
 *   public/data/collections.json, offers.json, settings.json   (same shape as the live API responses)
 *   public/uploads/...                                         (only the images those records use)
 * Drafts and admin-only data are never exported. Run:  php api/bin/export-static.php   (or: npm run export:static)
 */

if (PHP_SAPI !== 'cli') {
    exit('Run this script from the command line.');
}

require __DIR__ . '/../src/core.php';
require __DIR__ . '/../src/auth.php';
require __DIR__ . '/../src/media.php';
require __DIR__ . '/../src/collections.php';
require __DIR__ . '/../src/offers.php';
require __DIR__ . '/../src/admin.php';

$public = PROJECT_ROOT . '/public';
$dataDir = $public . '/data';
$uploadsOut = $public . '/uploads';
foreach ([$dataDir, $uploadsOut] as $d) {
    if (!is_dir($d) && !mkdir($d, 0755, true) && !is_dir($d)) {
        exit("Cannot create $d\n");
    }
}

$used = [];
$write = function (string $file, array $payload) use ($dataDir): void {
    file_put_contents($dataDir . '/' . $file, json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT) . "\n");
};

// Collections (published only)
$rows = q("SELECT * FROM collections WHERE status = 'published' ORDER BY display_order, id")->fetchAll();
$gallery = collection_gallery(array_map(fn ($r) => (int) $r['id'], $rows));
$collections = [];
foreach ($rows as $r) {
    $g = $gallery[(int) $r['id']] ?? [];
    $collections[] = collection_public($r, $g);
    $used = array_merge($used, array_filter([$r['cover_image']]), $g);
}
$write('collections.json', ['data' => $collections]);

// Offers: published and not yet expired (scheduled ones included; the browser checks the start/end time itself)
$now = now_utc();
$offers = q("SELECT * FROM offers WHERE status = 'published' AND (ends_at IS NULL OR ends_at > ?) ORDER BY display_priority DESC, starts_at DESC, id DESC LIMIT 12", [$now])->fetchAll();
foreach ($offers as $o) {
    $used = array_merge($used, array_filter([$o['image'], $o['mobile_image']]));
}
$write('offers.json', [
    'data' => array_map('offer_public', $offers),
    'popups_enabled' => setting('popups_enabled', '1') === '1',
]);

// Settings
$write('settings.json', ['data' => settings_public()]);

// Images: copy the ones in use, remove stale copies
$used = array_values(array_unique($used));
foreach ($used as $path) {
    $src = uploads_dir() . '/' . $path;
    $dst = $uploadsOut . '/' . $path;
    if (!is_file($src)) {
        echo "WARNING: missing file for $path\n";
        continue;
    }
    if (!is_dir(dirname($dst))) {
        mkdir(dirname($dst), 0755, true);
    }
    copy($src, $dst);
}
$keep = array_flip(array_map(fn ($p) => str_replace('\\', '/', $p), $used));
$it = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($uploadsOut, FilesystemIterator::SKIP_DOTS));
foreach ($it as $f) {
    $rel = ltrim(str_replace('\\', '/', substr($f->getPathname(), strlen($uploadsOut))), '/');
    if ($f->isFile() && !isset($keep[$rel])) {
        unlink($f->getPathname());
    }
}

printf("Exported %d collection(s), %d offer(s), %d image(s) to public/.\n", count($collections), count($offers), count($used));
