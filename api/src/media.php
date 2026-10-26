<?php
declare(strict_types=1);

/** Image uploads and the media library. Files are stored on disk; only their paths live in the database. */

const UPLOAD_FOLDERS = ['collections', 'offers', 'general'];
const UPLOAD_MIMES = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp'];

function uploads_dir(): string
{
    $dir = env('UPLOADS_DIR');
    return rtrim($dir ?: PROJECT_ROOT . '/uploads', '/\\');
}

function max_upload_bytes(): int
{
    return (int) env('MAX_UPLOAD_MB', '5') * 1024 * 1024;
}

function media_public(array $m): array
{
    return [
        'id' => (int) $m['id'],
        'path' => $m['path'],
        'url' => upload_url($m['path']),
        'name' => $m['original_name'],
        'mime' => $m['mime'],
        'size' => (int) $m['size_bytes'],
        'width' => (int) $m['width'],
        'height' => (int) $m['height'],
        'created_at' => iso($m['created_at']),
    ];
}

/** Re-encodes the image with GD (strips metadata and any embedded payload). Returns false if GD cannot. */
function reencode_image(string $tmp, string $mime, string $dest, int $maxSide = 2400): bool
{
    if (!function_exists('imagecreatefromstring')) {
        return false;
    }
    $src = @imagecreatefromstring((string) file_get_contents($tmp));
    if (!$src) {
        return false;
    }
    $w = imagesx($src);
    $h = imagesy($src);
    $scale = min(1, $maxSide / max($w, $h));
    $nw = max(1, (int) round($w * $scale));
    $nh = max(1, (int) round($h * $scale));
    $img = imagecreatetruecolor($nw, $nh);
    if ($mime !== 'image/jpeg') {
        imagealphablending($img, false);
        imagesavealpha($img, true);
        imagefill($img, 0, 0, imagecolorallocatealpha($img, 0, 0, 0, 127));
    }
    imagecopyresampled($img, $src, 0, 0, 0, 0, $nw, $nh, $w, $h);
    $ok = match ($mime) {
        'image/jpeg' => imagejpeg($img, $dest, 88),
        'image/png' => imagepng($img, $dest, 6),
        'image/webp' => function_exists('imagewebp') && imagewebp($img, $dest, 88),
        default => false,
    };
    imagedestroy($src);
    imagedestroy($img);
    return (bool) $ok;
}

function store_upload(array $file, string $folder, ?int $userId): array
{
    if (!in_array($folder, UPLOAD_FOLDERS, true)) {
        fail(422, 'Unknown upload folder.');
    }
    $err = $file['error'] ?? UPLOAD_ERR_NO_FILE;
    if ($err !== UPLOAD_ERR_OK) {
        $msg = match ($err) {
            UPLOAD_ERR_INI_SIZE, UPLOAD_ERR_FORM_SIZE => 'The image is larger than the server allows.',
            UPLOAD_ERR_NO_FILE => 'Choose an image to upload.',
            default => 'The upload failed. Please try again.',
        };
        fail(422, $msg, ['file' => $msg]);
    }
    $tmp = (string) $file['tmp_name'];
    if (!is_uploaded_file($tmp)) {
        fail(400, 'Invalid upload.');
    }
    $max = max_upload_bytes();
    if ((int) $file['size'] > $max) {
        $msg = 'The image must be smaller than ' . intdiv($max, 1048576) . ' MB.';
        fail(422, $msg, ['file' => $msg]);
    }
    $mime = (new finfo(FILEINFO_MIME_TYPE))->file($tmp);
    $info = @getimagesize($tmp);
    if (!isset(UPLOAD_MIMES[$mime]) || !$info || $info['mime'] !== $mime) {
        $msg = 'Only JPG, PNG and WebP images are allowed.';
        fail(422, $msg, ['file' => $msg]);
    }
    [$w, $h] = $info;
    if ($w < 200 || $h < 200 || $w > 10000 || $h > 10000) {
        $msg = 'The image must be between 200 and 10,000 pixels on each side.';
        fail(422, $msg, ['file' => $msg]);
    }

    $ext = UPLOAD_MIMES[$mime];
    $name = bin2hex(random_bytes(16)) . '.' . $ext; // never reuse the client's file name
    $dir = uploads_dir() . '/' . $folder;
    if (!is_dir($dir) && !mkdir($dir, 0755, true) && !is_dir($dir)) {
        fail(500, 'The upload folder is not writable.');
    }
    $dest = $dir . '/' . $name;
    if (!reencode_image($tmp, $mime, $dest)) {
        if (!move_uploaded_file($tmp, $dest)) {
            fail(500, 'The image could not be saved.');
        }
    }
    @chmod($dest, 0644);
    [$w, $h] = getimagesize($dest) ?: [$w, $h];
    $path = $folder . '/' . $name;
    $original = mb_substr(preg_replace('/[^\p{L}\p{N}\s._-]/u', '', (string) ($file['name'] ?? 'image')) ?? 'image', 0, 200);
    q(
        'INSERT INTO media (path, original_name, mime, size_bytes, width, height, uploaded_by, created_at) VALUES (?,?,?,?,?,?,?,?)',
        [$path, $original ?: 'image', $mime, (int) filesize($dest), $w, $h, $userId, now_utc()]
    );
    return media_public(q('SELECT * FROM media WHERE path = ?', [$path])->fetch());
}

function media_usage(string $path): array
{
    $uses = [];
    foreach (q('SELECT name FROM collections WHERE cover_image = ?', [$path])->fetchAll() as $r) {
        $uses[] = 'Collection cover: ' . $r['name'];
    }
    foreach (q('SELECT c.name FROM collection_images i JOIN collections c ON c.id = i.collection_id WHERE i.path = ?', [$path])->fetchAll() as $r) {
        $uses[] = 'Collection gallery: ' . $r['name'];
    }
    foreach (q('SELECT title FROM offers WHERE image = ? OR mobile_image = ?', [$path, $path])->fetchAll() as $r) {
        $uses[] = 'Offer: ' . $r['title'];
    }
    return $uses;
}

route('POST', '/admin/media', function () {
    $user = require_auth('user');
    if (empty($_FILES['file'])) {
        fail(422, 'Choose an image to upload.', ['file' => 'Choose an image to upload.']);
    }
    $folder = is_string($_POST['folder'] ?? null) ? $_POST['folder'] : 'general';
    respond(['data' => store_upload($_FILES['file'], $folder, (int) $user['id'])], 201);
}, 'user');

route('GET', '/admin/media', function () {
    [$page, $per, $offset] = paging();
    $total = (int) q('SELECT COUNT(*) FROM media')->fetchColumn();
    $rows = db()->query(sprintf('SELECT * FROM media ORDER BY id DESC LIMIT %d OFFSET %d', $per, $offset))->fetchAll();
    return ['data' => array_map('media_public', $rows), 'meta' => page_meta($page, $per, $total)];
}, 'user');

route('DELETE', '/admin/media/{id:\d+}', function (array $p) {
    $m = q('SELECT * FROM media WHERE id = ?', [(int) $p['id']])->fetch();
    if (!$m) {
        fail(404, 'Image not found.');
    }
    $uses = media_usage($m['path']);
    if ($uses) {
        fail(409, 'This image is still in use: ' . implode('; ', array_slice($uses, 0, 3)) . '.');
    }
    $file = uploads_dir() . '/' . $m['path'];
    if (is_file($file)) {
        @unlink($file);
    }
    q('DELETE FROM media WHERE id = ?', [(int) $m['id']]);
    return ['ok' => true];
}, 'user');
