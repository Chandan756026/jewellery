<?php
declare(strict_types=1);

/** Collections: public read API (published only) and admin CRUD. */

function collection_gallery(array $ids): array
{
    if (!$ids) {
        return [];
    }
    $in = implode(',', array_fill(0, count($ids), '?'));
    $out = [];
    foreach (q("SELECT collection_id, path FROM collection_images WHERE collection_id IN ($in) ORDER BY sort_order, id", $ids)->fetchAll() as $r) {
        $out[(int) $r['collection_id']][] = $r['path'];
    }
    return $out;
}

function collection_lines(?string $details): array
{
    return $details === null || $details === '' ? [] : array_values(array_filter(array_map('trim', explode("\n", $details)), 'strlen'));
}

function collection_public(array $r, array $gallery): array
{
    return [
        'id' => (int) $r['id'],
        'slug' => $r['slug'],
        'name' => $r['name'],
        'kind' => $r['kind'],
        'tagline' => $r['tagline'],
        'description' => $r['description'],
        'details' => collection_lines($r['details']),
        'price_text' => $r['price_text'],
        'cover_image' => upload_url($r['cover_image']),
        'gallery' => array_map('upload_url', $gallery),
        'is_featured' => (bool) $r['is_featured'],
        'display_order' => (int) $r['display_order'],
        'updated_at' => iso($r['updated_at']),
    ];
}

function collection_admin(array $r, array $gallery): array
{
    return [
        'id' => (int) $r['id'],
        'name' => $r['name'],
        'slug' => $r['slug'],
        'kind' => $r['kind'],
        'tagline' => $r['tagline'],
        'description' => $r['description'],
        'details' => $r['details'],
        'price_text' => $r['price_text'],
        'cover_image' => $r['cover_image'],
        'cover_url' => upload_url($r['cover_image']),
        'gallery' => array_map(fn ($p) => ['path' => $p, 'url' => upload_url($p)], $gallery),
        'display_order' => (int) $r['display_order'],
        'is_featured' => (bool) $r['is_featured'],
        'status' => $r['status'],
        'published_at' => iso($r['published_at']),
        'created_at' => iso($r['created_at']),
        'updated_at' => iso($r['updated_at']),
    ];
}

function collection_find(int $id): array
{
    $r = q('SELECT * FROM collections WHERE id = ?', [$id])->fetch();
    if (!$r) {
        fail(404, 'Collection not found.');
    }
    return $r;
}

function unique_collection_slug(string $slug, ?int $ignoreId = null): string
{
    $candidate = $slug;
    $n = 1;
    while (q('SELECT 1 FROM collections WHERE slug = ? AND id <> ?', [$candidate, $ignoreId ?? 0])->fetchColumn() !== false) {
        $n++;
        $candidate = substr($slug, 0, 130) . '-' . $n;
    }
    return $candidate;
}

/** Validates a full collection payload. $id is set when updating. */
function collection_validate(array $in, ?int $id): array
{
    $v = new Validator($in);
    $d = [];
    $d['name'] = $v->string('name', true, 120);
    $rawSlug = $v->string('slug', false, 140);
    if ($rawSlug !== null && !preg_match('/^[a-z0-9]+(-[a-z0-9]+)*$/', $rawSlug)) {
        $v->errors['slug'] = 'Use lowercase letters, numbers and single hyphens only.';
    }
    $d['kind'] = $v->string('kind', false, 60);
    $d['tagline'] = $v->string('tagline', false, 200);
    $d['description'] = $v->string('description', false, 2000, true);
    $d['details'] = $v->string('details', false, 1500, true);
    $d['price_text'] = $v->string('price_text', false, 60);
    $d['cover_image'] = $v->imagePath('cover_image');
    $d['display_order'] = $v->int('display_order', 0, 100000, 0);
    $d['is_featured'] = $v->bool('is_featured');
    $d['status'] = $v->enum('status', ['draft', 'published'], 'draft');

    $gallery = $in['gallery'] ?? [];
    $paths = [];
    if (!is_array($gallery) || count($gallery) > 12) {
        $v->errors['gallery'] = 'Add up to 12 gallery images.';
    } else {
        foreach ($gallery as $i => $g) {
            $gv = new Validator(['g' => is_array($g) ? ($g['path'] ?? null) : $g]);
            $path = $gv->imagePath('g');
            if ($path === null) {
                $v->errors['gallery'] = 'One of the gallery images is not valid.';
                break;
            }
            $paths[] = $path;
        }
    }
    if ($d['status'] === 'published' && $d['cover_image'] === null && !isset($v->errors['cover_image'])) {
        $v->errors['cover_image'] = 'A cover image is required to publish.';
    }
    $v->fail();

    $slug = $rawSlug ?? slugify((string) $d['name']);
    if ($rawSlug !== null && q('SELECT 1 FROM collections WHERE slug = ? AND id <> ?', [$slug, $id ?? 0])->fetchColumn() !== false) {
        fail(422, 'Please correct the highlighted fields.', ['slug' => 'This URL slug is already used by another collection.']);
    }
    $d['slug'] = $rawSlug !== null ? $slug : unique_collection_slug($slug, $id);
    return [$d, $paths];
}

function collection_save_gallery(int $id, array $paths): void
{
    q('DELETE FROM collection_images WHERE collection_id = ?', [$id]);
    foreach ($paths as $i => $p) {
        q('INSERT INTO collection_images (collection_id, path, sort_order) VALUES (?,?,?)', [$id, $p, $i]);
    }
}

function collection_resequence(): void
{
    $ids = q('SELECT id FROM collections ORDER BY display_order, id')->fetchAll(PDO::FETCH_COLUMN);
    foreach ($ids as $i => $cid) {
        q('UPDATE collections SET display_order = ? WHERE id = ?', [$i + 1, $cid]);
    }
}

// ───────── Public API ─────────
route('GET', '/collections', function () {
    $rows = q("SELECT * FROM collections WHERE status = 'published' ORDER BY display_order, id")->fetchAll();
    $gal = collection_gallery(array_map(fn ($r) => (int) $r['id'], $rows));
    return ['data' => array_map(fn ($r) => collection_public($r, $gal[(int) $r['id']] ?? []), $rows)];
});

route('GET', '/collections/{slug:[a-z0-9\-]+}', function (array $p) {
    $r = q("SELECT * FROM collections WHERE slug = ? AND status = 'published'", [$p['slug']])->fetch();
    if (!$r) {
        fail(404, 'Collection not found.');
    }
    $gal = collection_gallery([(int) $r['id']]);
    return ['data' => collection_public($r, $gal[(int) $r['id']] ?? [])];
});

// ───────── Admin API ─────────
route('GET', '/admin/collections', function () {
    [$page, $per, $offset] = paging();
    $where = ['1=1'];
    $args = [];
    $search = trim((string) ($_GET['search'] ?? ''));
    if ($search !== '') {
        $like = '%' . addcslashes($search, '%_\\') . '%';
        $where[] = '(name LIKE ? OR slug LIKE ? OR tagline LIKE ?)';
        array_push($args, $like, $like, $like);
    }
    $status = $_GET['status'] ?? '';
    if (in_array($status, ['draft', 'published'], true)) {
        $where[] = 'status = ?';
        $args[] = $status;
    }
    $cond = implode(' AND ', $where);
    $total = (int) q("SELECT COUNT(*) FROM collections WHERE $cond", $args)->fetchColumn();
    $rows = q("SELECT * FROM collections WHERE $cond ORDER BY display_order, id LIMIT $per OFFSET $offset", $args)->fetchAll();
    $gal = collection_gallery(array_map(fn ($r) => (int) $r['id'], $rows));
    return [
        'data' => array_map(fn ($r) => collection_admin($r, $gal[(int) $r['id']] ?? []), $rows),
        'meta' => page_meta($page, $per, $total),
    ];
}, 'user');

route('GET', '/admin/collections/{id:\d+}', function (array $p) {
    $r = collection_find((int) $p['id']);
    $gal = collection_gallery([(int) $r['id']]);
    return ['data' => collection_admin($r, $gal[(int) $r['id']] ?? [])];
}, 'user');

route('POST', '/admin/collections', function () {
    [$d, $paths] = collection_validate(input(), null);
    $now = now_utc();
    $pdo = db();
    $pdo->beginTransaction();
    try {
        if ($d['display_order'] === 0) {
            $d['display_order'] = (int) q('SELECT COALESCE(MAX(display_order), 0) + 1 FROM collections')->fetchColumn();
        }
        q(
            'INSERT INTO collections (name, slug, tagline, kind, description, details, price_text, cover_image, display_order, is_featured, status, published_at, created_at, updated_at)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
            [$d['name'], $d['slug'], $d['tagline'], $d['kind'], $d['description'], $d['details'], $d['price_text'], $d['cover_image'],
             $d['display_order'], (int) $d['is_featured'], $d['status'], $d['status'] === 'published' ? $now : null, $now, $now]
        );
        $id = (int) $pdo->lastInsertId();
        collection_save_gallery($id, $paths);
        $pdo->commit();
    } catch (Throwable $e) {
        $pdo->rollBack();
        throw $e;
    }
    $r = collection_find($id);
    respond(['data' => collection_admin($r, collection_gallery([$id])[$id] ?? [])], 201);
}, 'user');

route('PATCH', '/admin/collections/{id:\d+}', function (array $p) {
    $id = (int) $p['id'];
    $cur = collection_find($id);
    $curGal = collection_gallery([$id])[$id] ?? [];
    $merged = array_merge([
        'name' => $cur['name'], 'slug' => $cur['slug'], 'kind' => $cur['kind'], 'tagline' => $cur['tagline'],
        'description' => $cur['description'], 'details' => $cur['details'], 'price_text' => $cur['price_text'],
        'cover_image' => $cur['cover_image'], 'display_order' => (int) $cur['display_order'],
        'is_featured' => (bool) $cur['is_featured'], 'status' => $cur['status'], 'gallery' => $curGal,
    ], input());
    [$d, $paths] = collection_validate($merged, $id);
    $publishedAt = $cur['published_at'];
    if ($d['status'] === 'published' && $cur['status'] !== 'published') {
        $publishedAt = now_utc();
    } elseif ($d['status'] === 'draft') {
        $publishedAt = null;
    }
    $pdo = db();
    $pdo->beginTransaction();
    try {
        q(
            'UPDATE collections SET name=?, slug=?, tagline=?, kind=?, description=?, details=?, price_text=?, cover_image=?, display_order=?, is_featured=?, status=?, published_at=?, updated_at=? WHERE id=?',
            [$d['name'], $d['slug'], $d['tagline'], $d['kind'], $d['description'], $d['details'], $d['price_text'], $d['cover_image'],
             $d['display_order'], (int) $d['is_featured'], $d['status'], $publishedAt, now_utc(), $id]
        );
        collection_save_gallery($id, $paths);
        $pdo->commit();
    } catch (Throwable $e) {
        $pdo->rollBack();
        throw $e;
    }
    $r = collection_find($id);
    return ['data' => collection_admin($r, collection_gallery([$id])[$id] ?? [])];
}, 'user');

route('POST', '/admin/collections/{id:\d+}/move', function (array $p) {
    $id = (int) $p['id'];
    collection_find($id);
    $dir = input()['direction'] ?? '';
    if (!in_array($dir, ['up', 'down'], true)) {
        fail(422, 'Direction must be "up" or "down".');
    }
    $pdo = db();
    $pdo->beginTransaction();
    try {
        collection_resequence();
        $order = (int) q('SELECT display_order FROM collections WHERE id = ?', [$id])->fetchColumn();
        $target = $dir === 'up' ? $order - 1 : $order + 1;
        $other = q('SELECT id FROM collections WHERE display_order = ?', [$target])->fetchColumn();
        if ($other !== false) {
            q('UPDATE collections SET display_order = ? WHERE id = ?', [$target, $id]);
            q('UPDATE collections SET display_order = ? WHERE id = ?', [$order, $other]);
        }
        $pdo->commit();
    } catch (Throwable $e) {
        $pdo->rollBack();
        throw $e;
    }
    return ['ok' => true];
}, 'user');

route('DELETE', '/admin/collections/{id:\d+}', function (array $p) {
    collection_find((int) $p['id']);
    q('DELETE FROM collections WHERE id = ?', [(int) $p['id']]);
    collection_resequence();
    return ['ok' => true];
}, 'user');
